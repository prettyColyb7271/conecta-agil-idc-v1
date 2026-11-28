import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, hashPassword, hashToken, withTransaction } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

const GENERIC_ERROR = "El código no es válido, expiró o ya se utilizó.";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ email?: string; code?: string; newPassword?: string }>(request);
    const email = body.email?.trim().toLowerCase() ?? "";
    const code = body.code?.trim().toUpperCase() ?? "";
    const newPassword = body.newPassword ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[A-HJ-NP-Z2-9]{8}$/.test(code) || newPassword.length < 12) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }
    const database = getDatabase();
    const now = new Date();
    const nowIso = now.toISOString();
    const codeHash = hashToken(code);
    const result: { status: "used" | "invalid" } = { status: "invalid" };
    withTransaction(() => {
      const candidate = database.prepare(`
        SELECT c.id, c.request_id, c.user_id, c.code_hash, c.expires_at, c.attempts,
               u.role, u.status AS account_status
        FROM password_recovery_codes c
        JOIN password_recovery_requests r ON r.id = c.request_id
        JOIN users u ON u.id = c.user_id
        WHERE lower(r.email) = lower(?) AND r.status = 'pendiente' AND c.status = 'activo'
        ORDER BY c.created_at DESC LIMIT 1
      `).get(email) as {
        id: string; request_id: string; user_id: string; code_hash: string; expires_at: string;
        attempts: number; role: string; account_status: string;
      } | undefined;
      if (!candidate) return;
      if (Date.parse(candidate.expires_at) <= now.getTime()) {
        database.prepare("UPDATE password_recovery_codes SET status = 'vencido' WHERE id = ? AND status = 'activo'").run(candidate.id);
        auditEvent({ eventType: "recuperacion_codigo_vencido", entityType: "password_recovery_code", entityId: candidate.id });
        return;
      }
      if (candidate.attempts >= 5) {
        database.prepare("UPDATE password_recovery_codes SET status = 'agotado', attempts = 6 WHERE id = ? AND status = 'activo'").run(candidate.id);
        database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_at = ? WHERE id = ? AND status = 'pendiente'").run(nowIso, candidate.request_id);
        auditEvent({ eventType: "recuperacion_codigo_agotado", entityType: "password_recovery_code", entityId: candidate.id });
        return;
      }
      const expected = Buffer.from(candidate.code_hash, "hex");
      const actual = Buffer.from(codeHash, "hex");
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        database.prepare("UPDATE password_recovery_codes SET attempts = attempts + 1 WHERE id = ? AND status = 'activo'").run(candidate.id);
        return;
      }
      if (!["cliente", "coordinador_idc"].includes(candidate.role) || !["activo", "bloqueado"].includes(candidate.account_status)) return;
      database.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?")
        .run(hashPassword(newPassword), nowIso, candidate.user_id);
      database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(nowIso, candidate.user_id);
      database.prepare("UPDATE password_recovery_codes SET status = 'usado', used_at = ? WHERE id = ? AND status = 'activo'").run(nowIso, candidate.id);
      database.prepare("UPDATE password_recovery_codes SET status = 'reemplazado' WHERE request_id = ? AND id != ? AND status = 'activo'").run(candidate.request_id, candidate.id);
      database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'pendiente'")
        .run(candidate.user_id, nowIso, candidate.request_id);
      auditEvent({ actorId: candidate.user_id, actorRole: candidate.role, eventType: "recuperacion_codigo_usado", entityType: "password_recovery_code", entityId: candidate.id });
      result.status = "used";
    });
    return result.status === "used"
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    console.error("Error al validar el código de recuperación.", error);
    return NextResponse.json({ error: "No fue posible procesar el código de recuperación." }, { status: 500 });
  }
}
