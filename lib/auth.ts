import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAppMode } from "@/lib/adapters/config";
import { getDatabase } from "@/lib/db/sqlite";
import type { Role } from "@/data/mock";

export const SESSION_COOKIE = "conecta-session";
export const ROLE_COOKIE = "conecta-role";
export const SESSION_HOURS = 8;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: "pendiente" | "activo" | "bloqueado";
  sessionId: string;
};

const roleHome: Record<Role, string> = {
  cliente: "/portal",
  coordinador_idc: "/gestor",
  gestor_tramites_cfe: "/gestor-cfe",
  admin_seguridad: "/admin",
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, saltHex, hashHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Response(JSON.stringify({ error: "Solicitud no autorizada." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
}

export function auditEvent(input: {
  actorId?: string | null;
  actorRole?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const database = getDatabase();
  database.prepare(
    "INSERT INTO audit_events (id, actor_id, actor_role, event_type, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    crypto.randomUUID(),
    input.actorId ?? null,
    input.actorRole ?? null,
    input.eventType,
    input.entityType,
    input.entityId ?? null,
    JSON.stringify(input.metadata ?? {}),
    new Date().toISOString(),
  );
}

export function withTransaction<T>(work: () => T): T {
  const database = getDatabase();
  database.exec("BEGIN");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  if (getAppMode() !== "local") return null;
  const row = getDatabase().prepare(`
    SELECT s.id AS session_id, s.expires_at, s.revoked_at,
           u.id, u.email, u.display_name, u.role, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = ?
  `).get(hashToken(token)) as {
    session_id: string; expires_at: string; revoked_at: string | null;
    id: string; email: string; display_name: string; role: Role;
    status: AuthUser["status"];
  } | undefined;
  if (!row || row.revoked_at || row.status !== "activo" || Date.parse(row.expires_at) <= Date.now()) return null;
  getDatabase().prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), row.session_id);
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    sessionId: row.session_id,
  };
}

export async function requireRole(role: Role): Promise<AuthUser | null> {
  const user = await getCurrentUser();
  if (getAppMode() === "demo") return null;
  if (!user) redirect("/");
  if (user.role !== role) redirect(roleHome[user.role]);
  return user;
}

export function createSession(userId: string): { token: string; sessionId: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  getDatabase().prepare(
    "INSERT INTO sessions (id, user_id, session_token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(sessionId, userId, hashToken(token), expiresAt, now.toISOString(), now.toISOString());
  return { token, sessionId, expiresAt };
}

export function sessionCookieOptions(expiresAt: string, request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = forwardedProto ? forwardedProto === "https" : new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    expires: new Date(expiresAt),
  };
}

export function revokeSessionByToken(token: string): string | null {
  const session = getDatabase().prepare("SELECT id, user_id FROM sessions WHERE session_token_hash = ?").get(hashToken(token)) as { id: string; user_id: string } | undefined;
  if (!session) return null;
  getDatabase().prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(), session.id);
  return session.user_id;
}
