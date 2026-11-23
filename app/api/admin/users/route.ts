import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, generateTemporaryPassword, getCurrentUser, hashPassword, passwordChangeRequired, withTransaction } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const users = getDatabase().prepare(
    `SELECT u.id, u.email, u.display_name, u.role, u.status, u.created_at, u.last_login_at,
            u.must_change_password,
            CASE WHEN u.role = 'coordinador_idc' THEN (
              SELECT COUNT(*) FROM expediente_assignments ea
              JOIN expedientes e ON e.id = ea.expediente_id
              WHERE ea.user_id = u.id AND ea.assignment_type = 'coordinador_idc' AND ea.ends_at IS NULL
            ) ELSE 0 END AS responsible_count
     FROM users u WHERE u.role != 'admin_seguridad' ORDER BY u.created_at`,
  ).all();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(actor);
    if (passwordResponse) return passwordResponse;
    if (!actor || actor.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ userId?: string; action?: "block" | "unblock" | "revoke" | "create_gestor" | "reset_password"; email?: string; displayName?: string }>(request);
    const database = getDatabase();
    if (body.action === "create_gestor") {
      const email = body.email?.trim().toLowerCase();
      const displayName = body.displayName?.trim();
      if (!email || !displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Nombre y correo válido son requeridos." }, { status: 400 });
      }
      if (database.prepare("SELECT id FROM users WHERE email = ?").get(email)) return NextResponse.json({ error: "No fue posible crear el Gestor IDC." }, { status: 409 });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const temporaryPassword = generateTemporaryPassword();
      withTransaction(() => {
        database.prepare("INSERT INTO users (id, email, display_name, role, status, password_hash, must_change_password, created_at, updated_at) VALUES (?, ?, ?, 'coordinador_idc', 'activo', ?, 1, ?, ?)").run(id, email, displayName, hashPassword(temporaryPassword), now, now);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "alta_gestor_idc", entityType: "user", entityId: id, metadata: { email } });
      });
      return NextResponse.json({ user: { id, email, display_name: displayName, role: "coordinador_idc", status: "activo" }, temporaryPassword }, { status: 201 });
    }
    if (!body.userId || !body.action) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    const target = database.prepare("SELECT id, role, status FROM users WHERE id = ? AND role != 'admin_seguridad'").get(body.userId) as { id: string; role: string; status: string } | undefined;
    if (!target) return NextResponse.json({ error: "Usuario no disponible." }, { status: 404 });
    let returnValue: { ok: boolean; temporaryPassword?: string; unassignedCount?: number } | undefined;
    withTransaction(() => {
      const now = new Date().toISOString();
      if (body.action === "block") {
        database.prepare("UPDATE users SET status = 'bloqueado', updated_at = ? WHERE id = ?").run(now, target.id);
        if (target.role === "coordinador_idc") {
          const affected = database.prepare(`
            SELECT e.id, e.folio FROM expedientes e
            JOIN expediente_assignments ea ON ea.expediente_id = e.id
            WHERE ea.user_id = ? AND ea.assignment_type = 'coordinador_idc' AND ea.ends_at IS NULL
          `).all(target.id) as Array<{ id: string; folio: string }>;
          const activeManagers = database.prepare("SELECT id FROM users WHERE role = 'coordinador_idc' AND status = 'activo' AND id != ?").all(target.id) as Array<{ id: string }>;
          for (const manager of activeManagers) {
            database.prepare("INSERT INTO notifications (id, user_id, type, priority, title, body, created_at) VALUES (?, ?, 'responsable_bloqueado', 'alta', 'Reasignación necesaria', ?, ?)").run(crypto.randomUUID(), manager.id, `El Gestor IDC bloqueado dejó ${affected.length} expediente(s) sin responsable activo. Revisa y reasigna.`, now);
          }
          auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "bloqueo", entityType: "user", entityId: target.id, metadata: { expedientes_sin_responsable_activo: affected.length } });
          returnValue = { ok: true, unassignedCount: affected.length };
        }
        if (target.role !== "coordinador_idc") auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "bloqueo", entityType: "user", entityId: target.id });
      } else if (body.action === "unblock") {
        database.prepare("UPDATE users SET status = 'activo', updated_at = ? WHERE id = ?").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "desbloqueo", entityType: "user", entityId: target.id });
      } else if (body.action === "reset_password") {
        if (target.role !== "coordinador_idc") throw new Error("USER_NOT_MANAGER");
        const temporaryPassword = generateTemporaryPassword();
        database.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").run(hashPassword(temporaryPassword), now, target.id);
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "reset_contrasena", entityType: "user", entityId: target.id });
        returnValue = { ok: true, temporaryPassword };
      } else {
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "revocacion_sesiones", entityType: "user", entityId: target.id });
      }
    });
    return NextResponse.json(returnValue ?? { ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible actualizar la cuenta." }, { status: 500 });
  }
}
