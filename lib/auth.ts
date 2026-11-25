import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAppMode } from "@/lib/adapters/config";
import { getDatabase } from "@/lib/db/sqlite";
import type { Role } from "@/data/mock";

export const SESSION_COOKIE = "conecta-session";
export const ROLE_COOKIE = "conecta-role";
export const MUST_CHANGE_COOKIE = "conecta-must-change";
export const MFA_CHALLENGE_COOKIE = "conecta-mfa-challenge";
export const SESSION_HOURS = 8;
export const PASSWORD_SETUP_TOKEN_HOURS = 24;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  status: "pendiente" | "activo" | "bloqueado";
  sessionId: string;
  mustChangePassword: boolean;
};

const roleHome: Record<Role, string> = {
  cliente: "/portal",
  coordinador_idc: "/gestor",
  gestor_tramites_cfe: "/gestor",
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

  function mfaEncryptionKey(): Buffer {
    const raw = process.env.MFA_ENCRYPTION_KEY?.trim() ?? "";
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("MFA_ENCRYPTION_KEY debe representar exactamente 32 bytes.");
    return key;
  }

  function base32Encode(value: Buffer): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let buffer = 0;
    let output = "";
    for (const byte of value) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(buffer >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
    return output;
  }

  function base32Decode(value: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let buffer = 0;
    const bytes: number[] = [];
    for (const char of value.replaceAll("=", "").toUpperCase()) {
      const index = alphabet.indexOf(char);
      if (index < 0) throw new Error("Secreto TOTP inválido.");
      buffer = (buffer << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((buffer >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }

  function encryptMfaSecret(secret: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", mfaEncryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  function decryptMfaSecret(row: { secret_ciphertext: string; secret_iv: string; secret_auth_tag: string }): string {
    const decipher = crypto.createDecipheriv("aes-256-gcm", mfaEncryptionKey(), Buffer.from(row.secret_iv, "base64"));
    decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(row.secret_ciphertext, "base64")), decipher.final()]).toString("utf8");
  }

  export function generateTotpSecret(): string {
    return base32Encode(crypto.randomBytes(20));
  }

  export function totpCode(secret: string, step = Math.floor(Date.now() / 30000)): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return value.toString().padStart(6, "0");
  }

  export function verifyTotpCode(secret: string, code: string, lastUsedStep: number | null): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const current = Math.floor(Date.now() / 30000);
    for (const step of [current - 1, current, current + 1]) {
      if (step !== lastUsedStep && crypto.timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
    }
    return null;
  }

  export function mfaEnabled(userId: string): boolean {
    return Boolean(getDatabase().prepare("SELECT 1 FROM user_mfa WHERE user_id = ? AND enabled_at IS NOT NULL").get(userId));
  }

  export function mfaRequiredForRole(role: Role): boolean {
    if (role === "admin_seguridad") return true;
    const configured = (process.env.MFA_REQUIRED_ROLES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return configured.includes(role);
  }

  export function mfaRequiredResponse(user: AuthUser | null): NextResponse | null {
    return user && mfaRequiredForRole(user.role) && !mfaEnabled(user.id)
      ? NextResponse.json({ error: "Debes vincular MFA antes de continuar.", mfaRequired: true }, { status: 403 })
      : null;
  }

  export function beginMfaSetup(userId: string): { secret: string; otpauthUri: string } {
    const user = getDatabase().prepare("SELECT email FROM users WHERE id = ?").get(userId) as { email: string } | undefined;
    if (!user) throw new Error("USER_NOT_FOUND");
    const secret = generateTotpSecret();
    const encrypted = encryptMfaSecret(secret);
    const now = new Date().toISOString();
    getDatabase().prepare(`
      INSERT INTO user_mfa (user_id, secret_ciphertext, secret_iv, secret_auth_tag, enabled_at, last_used_step, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext = excluded.secret_ciphertext, secret_iv = excluded.secret_iv, secret_auth_tag = excluded.secret_auth_tag, enabled_at = NULL, last_used_step = NULL, updated_at = excluded.updated_at
    `).run(userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now, now);
    const label = encodeURIComponent(`IDC:${user.email}`);
    return { secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=Conecta%20Agil%20IDC&algorithm=SHA1&digits=6&period=30` };
  }

  export function confirmMfaSetup(userId: string, code: string): string[] {
    const row = getDatabase().prepare("SELECT secret_ciphertext, secret_iv, secret_auth_tag FROM user_mfa WHERE user_id = ?").get(userId) as { secret_ciphertext: string; secret_iv: string; secret_auth_tag: string } | undefined;
    if (!row) throw new Error("MFA_NOT_STARTED");
    const secret = decryptMfaSecret(row);
    const step = verifyTotpCode(secret, code, null);
    if (step === null) throw new Error("MFA_INVALID_CODE");
    const database = getDatabase();
    const now = new Date().toISOString();
    const codes = Array.from({ length: 10 }, () => crypto.randomBytes(6).toString("hex"));
    withTransaction(() => {
      database.prepare("UPDATE user_mfa SET enabled_at = ?, last_used_step = ?, updated_at = ? WHERE user_id = ?").run(now, step, now, userId);
      database.prepare("DELETE FROM mfa_backup_codes WHERE user_id = ?").run(userId);
      for (const codeValue of codes) database.prepare("INSERT INTO mfa_backup_codes (id, user_id, code_hash, created_at) VALUES (?, ?, ?, ?)").run(crypto.randomUUID(), userId, hashToken(codeValue), now);
    });
    return codes;
  }

  export function verifyUserMfa(userId: string, code: string): "totp" | "backup" | null {
    const row = getDatabase().prepare("SELECT secret_ciphertext, secret_iv, secret_auth_tag, last_used_step FROM user_mfa WHERE user_id = ? AND enabled_at IS NOT NULL").get(userId) as { secret_ciphertext: string; secret_iv: string; secret_auth_tag: string; last_used_step: number | null } | undefined;
    if (!row) return null;
    const secret = decryptMfaSecret(row);
    const step = verifyTotpCode(secret, code, row.last_used_step);
    if (step !== null) {
      getDatabase().prepare("UPDATE user_mfa SET last_used_step = ?, updated_at = ? WHERE user_id = ?").run(step, new Date().toISOString(), userId);
      return "totp";
    }

    const backup = getDatabase().prepare("SELECT id FROM mfa_backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL").get(userId, hashToken(code)) as { id: string } | undefined;
    if (!backup) return null;
    getDatabase().prepare("UPDATE mfa_backup_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").run(new Date().toISOString(), backup.id);
    return "backup";
  }

  export function createMfaChallenge(userId: string): { token: string; expiresAt: string } {
    const token = crypto.randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const database = getDatabase();
    database.prepare("DELETE FROM mfa_login_challenges WHERE user_id = ? OR expires_at <= ?").run(userId, now.toISOString());
    database.prepare("INSERT INTO mfa_login_challenges (id, user_id, token_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)").run(crypto.randomUUID(), userId, hashToken(token), expiresAt, now.toISOString());
    return { token, expiresAt };
  }

  export function consumeMfaChallenge(token: string): { userId: string } | null {
    const row = getDatabase().prepare("SELECT id, user_id, expires_at, attempts FROM mfa_login_challenges WHERE token_hash = ?").get(hashToken(token)) as { id: string; user_id: string; expires_at: string; attempts: number } | undefined;
    if (!row || Date.parse(row.expires_at) <= Date.now() || row.attempts >= 5) return null;
    getDatabase().prepare("UPDATE mfa_login_challenges SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return { userId: row.user_id };
  }

  export function deleteMfaChallenge(token: string): void {
    getDatabase().prepare("DELETE FROM mfa_login_challenges WHERE token_hash = ?").run(hashToken(token));
  }

export function disableUserMfa(userId: string): void {
  const database = getDatabase();
  database.prepare("DELETE FROM mfa_backup_codes WHERE user_id = ?").run(userId);
  database.prepare("DELETE FROM user_mfa WHERE user_id = ?").run(userId);
}

export function generateTemporaryPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function passwordChangeRequired(user: AuthUser | null): NextResponse | null {
  return user?.mustChangePassword
    ? NextResponse.json({ error: "Debes cambiar tu contraseña" }, { status: 403 })
    : null;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createPasswordSetupToken(userId: string, createdBy: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_SETUP_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
  const database = getDatabase();
  database.prepare("UPDATE password_setup_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(now.toISOString(), userId);
  database.prepare(
    "INSERT INTO password_setup_tokens (id, user_id, token_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(crypto.randomUUID(), userId, hashToken(token), expiresAt, createdBy, now.toISOString());
  return { token, expiresAt };
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
  expedienteId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const database = getDatabase();
  database.prepare(
    "INSERT INTO audit_events (id, actor_id, actor_role, event_type, entity_type, entity_id, expediente_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    crypto.randomUUID(),
    input.actorId ?? null,
    input.actorRole ?? null,
    input.eventType,
    input.entityType,
    input.entityId ?? null,
    input.expedienteId ?? null,
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
           u.id, u.email, u.display_name, u.role, u.status, u.must_change_password
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = ?
  `).get(hashToken(token)) as {
    session_id: string; expires_at: string; revoked_at: string | null;
    id: string; email: string; display_name: string; role: Role;
    status: AuthUser["status"];
    must_change_password: number;
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
    mustChangePassword: row.must_change_password === 1,
  };
}

export async function requireRole(role: Role, options: { allowPasswordChange?: boolean; allowMfaSetup?: boolean } = {}): Promise<AuthUser | null> {
  const user = await getCurrentUser();
  if (getAppMode() === "demo") return null;
  if (!user) redirect("/api/auth/clear?next=/");
  if (user.mustChangePassword && !options.allowPasswordChange) redirect("/cambiar-contrasena");
  if (user.role !== role) redirect(roleHome[user.role]);
  if (!options.allowMfaSetup && mfaRequiredForRole(user.role) && !mfaEnabled(user.id)) redirect("/seguridad");
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
