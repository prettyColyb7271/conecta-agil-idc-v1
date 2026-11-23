import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, getCurrentUser, withTransaction } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const users = getDatabase().prepare(
    "SELECT id, email, display_name, role, status, created_at, last_login_at FROM users WHERE role != 'admin_seguridad' ORDER BY created_at",
  ).all();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || actor.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ userId?: string; action?: "block" | "unblock" | "revoke" }>(request);
    if (!body.userId || !body.action) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    const database = getDatabase();
    const target = database.prepare("SELECT id, role, status FROM users WHERE id = ? AND role != 'admin_seguridad'").get(body.userId) as { id: string; role: string; status: string } | undefined;
    if (!target) return NextResponse.json({ error: "Usuario no disponible." }, { status: 404 });
    withTransaction(() => {
      const now = new Date().toISOString();
      if (body.action === "block") {
        database.prepare("UPDATE users SET status = 'bloqueado', updated_at = ? WHERE id = ?").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "bloqueo", entityType: "user", entityId: target.id });
      } else if (body.action === "unblock") {
        database.prepare("UPDATE users SET status = 'activo', updated_at = ? WHERE id = ?").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "desbloqueo", entityType: "user", entityId: target.id });
      } else {
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "revocacion_sesiones", entityType: "user", entityId: target.id });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible actualizar la cuenta." }, { status: 500 });
  }
}
