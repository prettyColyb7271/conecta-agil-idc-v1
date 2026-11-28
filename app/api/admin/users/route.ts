import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, createPasswordSetupToken, disableUserMfa, getCurrentUser, hashPassword, mfaRequiredResponse, passwordChangeRequired, withTransaction } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { maskContactEmail, maskContactPhone, maskSurname } from "@/lib/audit-privacy";
import { readJson, RequestInputError } from "@/lib/http";
import { enqueueZohoOutbox } from "@/lib/zoho/outbox";
import { scheduleZohoDelivery } from "@/lib/zoho/adapter";

export async function GET() {
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const mfaResponse = mfaRequiredResponse(user);
  if (mfaResponse) return mfaResponse;
  const users = getDatabase().prepare(
    `SELECT u.id, u.email, u.display_name, u.apellidos, u.telefono_contacto, u.role, u.status, u.created_at, u.last_login_at,
            u.must_change_password,
            CASE WHEN u.role = 'coordinador_idc' THEN (
              SELECT COUNT(*) FROM expediente_assignments ea
              JOIN expedientes e ON e.id = ea.expediente_id
              WHERE ea.user_id = u.id AND ea.assignment_type = 'coordinador_idc' AND ea.ends_at IS NULL
                AND e.status IN ('borrador', 'activo', 'observado')
            ) ELSE 0             END AS responsible_count,
            CASE WHEN u.id = ? THEN 1 ELSE 0 END AS is_self,
            EXISTS (SELECT 1 FROM user_mfa m WHERE m.user_id = u.id AND m.enabled_at IS NOT NULL) AS mfa_enabled
     FROM users u ORDER BY u.created_at`,
  ).all(user.id) as Array<{
    id: string; email: string; display_name: string; apellidos: string | null; telefono_contacto: string | null;
    role: string; status: string; created_at: string; last_login_at: string | null; must_change_password: number;
    responsible_count: number; is_self: number; mfa_enabled: number;
  }>;
  const requiredRoles = ["admin_seguridad", ...(process.env.MFA_REQUIRED_ROLES ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role) => ["cliente", "coordinador_idc", "gestor_tramites_cfe"].includes(role))];
  const placeholders = requiredRoles.map(() => "?").join(", ");
  const summary = getDatabase().prepare(`
    SELECT
      SUM(CASE WHEN status = 'activo' THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN status = 'bloqueado' THEN 1 ELSE 0 END) AS blocked,
      SUM(CASE WHEN role IN (${placeholders}) AND NOT EXISTS (
        SELECT 1 FROM user_mfa m WHERE m.user_id = users.id AND m.enabled_at IS NOT NULL
      ) THEN 1 ELSE 0 END) AS mfa_pending
    FROM users
  `).get(...requiredRoles) as { active: number | null; blocked: number | null; mfa_pending: number | null };
  return NextResponse.json({
    users: users.map((account) => ({
      ...account,
      email: maskContactEmail(account.email) ?? "Correo no disponible",
      apellidos: maskSurname(account.apellidos),
      telefono_contacto: maskContactPhone(account.telefono_contacto),
      is_self: account.is_self === 1,
    })),
    summary: {
      active: Number(summary.active ?? 0),
      blocked: Number(summary.blocked ?? 0),
      mfaPending: Number(summary.mfa_pending ?? 0),
    },
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(actor);
    if (passwordResponse) return passwordResponse;
    if (!actor || actor.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const mfaResponse = mfaRequiredResponse(actor);
    if (mfaResponse) return mfaResponse;
    const body = await readJson<{ userId?: string; action?: "block" | "unblock" | "revoke" | "create_gestor" | "reset_password" | "reset_client_password" | "disable_mfa" | "deactivate" | "reactivate"; email?: string; displayName?: string; apellidos?: string; reason?: string; reassignToId?: string }>(request);
    const database = getDatabase();
    if (body.action === "create_gestor") {
      const email = body.email?.trim().toLowerCase();
      const displayName = body.displayName?.trim();
      const apellidos = body.apellidos?.trim() || null;
      if (!email || !displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Nombre y correo válido son requeridos." }, { status: 400 });
      }
      if (database.prepare("SELECT id FROM users WHERE email = ?").get(email)) return NextResponse.json({ error: "No fue posible crear el Gestor IDC." }, { status: 409 });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      withTransaction(() => {
        database.prepare("INSERT INTO users (id, email, display_name, apellidos, role, status, password_hash, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 'coordinador_idc', 'activo', ?, 1, ?, ?)").run(id, email, displayName, apellidos, hashPassword(crypto.randomBytes(32).toString("base64url")), now, now);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "alta_gestor_idc", entityType: "user", entityId: id, metadata: { email } });
      });
      const setup = createPasswordSetupToken(id, actor.id);
      return NextResponse.json({ user: { id, email: maskContactEmail(email), display_name: displayName, role: "coordinador_idc", status: "activo" }, setupUrl: new URL(`/definir-contrasena?token=${encodeURIComponent(setup.token)}`, request.url).toString(), expiresAt: setup.expiresAt }, { status: 201 });
    }
    if (!body.userId || !body.action) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    if (!["block", "unblock", "revoke", "reset_password", "reset_client_password", "disable_mfa", "deactivate", "reactivate"].includes(body.action)) {
      return NextResponse.json({ error: "La acción de cuenta no es válida." }, { status: 400 });
    }
    const statusAction = body.action === "deactivate" || body.action === "reactivate";
    const target = statusAction
      ? database.prepare("SELECT id, role, status FROM users WHERE id = ?").get(body.userId) as { id: string; role: string; status: string } | undefined
      : database.prepare("SELECT id, role, status FROM users WHERE id = ? AND role != 'admin_seguridad'").get(body.userId) as { id: string; role: string; status: string } | undefined;
    if (!target) return NextResponse.json({ error: "Usuario no disponible." }, { status: 404 });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.action === "disable_mfa" && [...reason].length < 5) {
      return NextResponse.json({ error: "El motivo debe tener al menos 5 caracteres." }, { status: 400 });
    }
    if (body.action === "deactivate" && [...reason].length < 5) {
      return NextResponse.json({ error: "El motivo debe tener al menos 5 caracteres." }, { status: 400 });
    }
    if (body.action === "deactivate" && target.id === actor.id) {
      return NextResponse.json({ error: "No puedes dar de baja tu propia cuenta." }, { status: 409 });
    }
    if (body.action === "deactivate" && target.role === "admin_seguridad" && target.status === "activo") {
      const activeAdmins = Number((database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin_seguridad' AND status = 'activo'").get() as { count: number }).count);
      if (activeAdmins <= 1) return NextResponse.json({ error: "No se puede dar de baja al último administrador activo." }, { status: 409 });
    }
    if (body.action === "reactivate" && target.status !== "baja") {
      return NextResponse.json({ error: "La cuenta no está dada de baja." }, { status: 409 });
    }
    if (body.action === "deactivate" && target.status === "baja") {
      return NextResponse.json({ error: "La cuenta ya está dada de baja." }, { status: 409 });
    }
    if (body.action === "deactivate" && target.role === "coordinador_idc") {
      const activeCount = Number((database.prepare(`
        SELECT COUNT(*) AS count FROM expediente_assignments ea
        JOIN expedientes e ON e.id = ea.expediente_id
        WHERE ea.user_id = ? AND ea.assignment_type = 'coordinador_idc'
          AND ea.ends_at IS NULL AND e.status IN ('borrador', 'activo', 'observado')
      `).get(target.id) as { count: number }).count);
      if (activeCount > 0) {
        const newManager = body.reassignToId
          ? database.prepare("SELECT id FROM users WHERE id = ? AND role = 'coordinador_idc' AND status = 'activo' AND id != ?").get(body.reassignToId, target.id)
          : undefined;
        if (!newManager) return NextResponse.json({ error: "Reasigna los expedientes activos a otro Gestor IDC antes de dar de baja esta cuenta.", activeExpedientes: activeCount }, { status: 409 });
      }
    }
    let returnValue: { ok: boolean; setupUrl?: string; expiresAt?: string; unassignedCount?: number } | undefined;
    const outboxIds: string[] = [];
    withTransaction(() => {
      const now = new Date().toISOString();
      if (body.action === "deactivate") {
        if (target.role === "coordinador_idc") {
          const affected = database.prepare(`
            SELECT e.id, e.folio FROM expediente_assignments ea
            JOIN expedientes e ON e.id = ea.expediente_id
            WHERE ea.user_id = ? AND ea.assignment_type = 'coordinador_idc'
              AND ea.ends_at IS NULL AND e.status IN ('borrador', 'activo', 'observado')
          `).all(target.id) as Array<{ id: string; folio: string }>;
          if (affected.length && !body.reassignToId) throw new Error("ACTIVE_ASSIGNMENTS_REQUIRE_REASSIGNMENT");
          if (affected.length) {
            const newManager = database.prepare("SELECT id FROM users WHERE id = ? AND role = 'coordinador_idc' AND status = 'activo' AND id != ?").get(body.reassignToId, target.id) as { id: string } | undefined;
            if (!newManager) throw new Error("RESPONSABLE_NOT_FOUND");
            for (const expediente of affected) {
              database.prepare("UPDATE expediente_assignments SET ends_at = ? WHERE expediente_id = ? AND assignment_type = 'coordinador_idc' AND ends_at IS NULL").run(now, expediente.id);
              database.prepare("INSERT INTO expediente_assignments (id, expediente_id, user_id, assignment_type, assigned_by, starts_at, created_at) VALUES (?, ?, ?, 'coordinador_idc', ?, ?, ?)").run(crypto.randomUUID(), expediente.id, newManager.id, actor.id, now, now);
              database.prepare("UPDATE expedientes SET gestor_id = ?, updated_at = ? WHERE id = ?").run(newManager.id, now, expediente.id);
              database.prepare("INSERT INTO notifications (id, user_id, expediente_id, type, priority, title, body, created_at) VALUES (?, ?, ?, 'expediente_asignado', 'normal', 'Nuevo responsable IDC', ?, ?)").run(crypto.randomUUID(), newManager.id, expediente.id, `Se te reasignó el expediente ${expediente.folio}.`, now);
              outboxIds.push(enqueueZohoOutbox(expediente.id, "reasignacion_responsable", now));
              auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "reasignacion_responsable_idc", entityType: "expediente_assignment", entityId: expediente.id, expedienteId: expediente.id, metadata: { responsable_anterior_id: target.id, responsable_nuevo_id: newManager.id } });
            }
          }
        }
        database.prepare("UPDATE users SET status = 'baja', updated_at = ? WHERE id = ?").run(now, target.id);
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        database.prepare("UPDATE password_recovery_codes SET status = 'reemplazado' WHERE user_id = ? AND status = 'activo'").run(target.id);
        database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_by = ?, handled_at = ? WHERE lower(email) = lower((SELECT email FROM users WHERE id = ?)) AND status = 'pendiente'").run(actor.id, now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "baja_cuenta", entityType: "user", entityId: target.id, metadata: { reason } });
        returnValue = { ok: true };
      } else if (body.action === "reactivate") {
        database.prepare("UPDATE users SET status = 'activo', updated_at = ? WHERE id = ?").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "reactivacion_cuenta", entityType: "user", entityId: target.id });
        returnValue = { ok: true };
      } else if (body.action === "block") {
        database.prepare("UPDATE users SET status = 'bloqueado', updated_at = ? WHERE id = ?").run(now, target.id);
        if (target.role === "coordinador_idc") {
          const affected = database.prepare(`
            SELECT e.id, e.folio FROM expedientes e
            JOIN expediente_assignments ea ON ea.expediente_id = e.id
            WHERE ea.user_id = ? AND ea.assignment_type = 'coordinador_idc' AND ea.ends_at IS NULL
          `).all(target.id) as Array<{ id: string; folio: string }>;
          for (const expediente of affected) outboxIds.push(enqueueZohoOutbox(expediente.id, "responsable_bloqueado", now));
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
        database.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").run(hashPassword(crypto.randomBytes(32).toString("base64url")), now, target.id);
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "reset_contrasena", entityType: "user", entityId: target.id });
        const setup = createPasswordSetupToken(target.id, actor.id);
        returnValue = { ok: true, setupUrl: new URL(`/definir-contrasena?token=${encodeURIComponent(setup.token)}`, request.url).toString(), expiresAt: setup.expiresAt };
      } else if (body.action === "reset_client_password") {
        if (target.role !== "cliente") throw new Error("USER_NOT_CLIENT");
        database.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").run(hashPassword(crypto.randomBytes(32).toString("base64url")), now, target.id);
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "recuperacion_cliente_generada", entityType: "user", entityId: target.id });
        const setup = createPasswordSetupToken(target.id, actor.id);
        returnValue = { ok: true, setupUrl: new URL(`/definir-contrasena?token=${encodeURIComponent(setup.token)}`, request.url).toString(), expiresAt: setup.expiresAt };
      } else if (body.action === "disable_mfa") {
        disableUserMfa(target.id);
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "mfa_desvinculado_admin", entityType: "user_mfa", entityId: target.id, metadata: { reason } });
        returnValue = { ok: true };
      } else {
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "revocacion_sesiones", entityType: "user", entityId: target.id });
      }
    });
    for (const id of outboxIds) scheduleZohoDelivery(id);
    return NextResponse.json(returnValue ?? { ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "ACTIVE_ASSIGNMENTS_REQUIRE_REASSIGNMENT") {
      return NextResponse.json({ error: "Reasigna los expedientes activos a otro Gestor IDC antes de dar de baja esta cuenta." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "RESPONSABLE_NOT_FOUND") {
      return NextResponse.json({ error: "El Gestor IDC de destino no existe o no está activo." }, { status: 400 });
    }
    return NextResponse.json({ error: "No fue posible actualizar la cuenta." }, { status: 500 });
  }
}
