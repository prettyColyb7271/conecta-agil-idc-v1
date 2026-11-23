import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, hashPassword, hashToken, withTransaction } from "@/lib/auth";
import { getDatabase as databaseForAuth } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

const GENERIC_ERROR = "El enlace no es válido, expiró o ya fue utilizado.";
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function rateLimited(request: Request): boolean {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (rateLimited(request)) return NextResponse.json({ error: GENERIC_ERROR }, { status: 429 });
    const body = await readJson<{ token?: string; newPassword?: string }>(request);
    const token = body.token ?? "";
    const newPassword = body.newPassword ?? "";
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token) || newPassword.length < 12) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }
    const database = databaseForAuth();
    const now = new Date();
    const nowIso = now.toISOString();
    withTransaction(() => {
      const row = database.prepare(
        `SELECT id, user_id, expires_at, used_at FROM password_setup_tokens
         WHERE token_hash = ?`,
      ).get(hashToken(token)) as { id: string; user_id: string; expires_at: string; used_at: string | null } | undefined;
      if (!row || row.used_at || Date.parse(row.expires_at) <= now.getTime()) throw new Error("INVALID_SETUP_TOKEN");
      const user = database.prepare("SELECT id FROM users WHERE id = ? AND role = 'coordinador_idc' AND status = 'activo'").get(row.user_id);
      if (!user) throw new Error("INVALID_SETUP_TOKEN");
      database.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ? AND role = 'coordinador_idc' AND status = 'activo'").run(hashPassword(newPassword), nowIso, row.user_id);
      database.prepare("UPDATE password_setup_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").run(nowIso, row.id);
      database.prepare("UPDATE password_setup_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(nowIso, row.user_id);
      database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(nowIso, row.user_id);
      auditEvent({ actorId: row.user_id, actorRole: "coordinador_idc", eventType: "definicion_contrasena_enlace", entityType: "user", entityId: row.user_id });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
}
