import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, getCurrentUser, hashPassword, MUST_CHANGE_COOKIE, verifyPassword, withTransaction } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";
    if (newPassword.length < 12) return NextResponse.json({ error: "La nueva contraseña debe tener al menos 12 caracteres." }, { status: 400 });
    const row = getDatabase().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string } | undefined;
    if (!row || !verifyPassword(currentPassword, row.password_hash)) return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 });
    if (verifyPassword(newPassword, row.password_hash)) return NextResponse.json({ error: "La nueva contraseña debe ser distinta a la actual." }, { status: 400 });
    const database = getDatabase();
    const now = new Date().toISOString();
    withTransaction(() => {
      database.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?").run(hashPassword(newPassword), now, user.id);
      database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL").run(now, user.id, user.sessionId);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "cambio_contrasena", entityType: "user", entityId: user.id });
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(MUST_CHANGE_COOKIE);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible cambiar la contraseña." }, { status: 500 });
  }
}
