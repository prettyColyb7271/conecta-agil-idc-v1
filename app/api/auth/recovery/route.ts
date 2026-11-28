import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { maskEmail } from "@/lib/audit-privacy";
import { assertSameOrigin, auditEvent, createPasswordSetupToken, getCurrentUser, hashPassword, passwordChangeRequired, withTransaction } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

type RecoveryStatus = "pendiente" | "atendida";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(actor);
  if (passwordResponse) return passwordResponse;
  if (!actor || !["admin_seguridad", "coordinador_idc"].includes(actor.role)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const requestedStatus = new URL(request.url).searchParams.get("status");
  if (requestedStatus && requestedStatus !== "pendiente" && requestedStatus !== "atendida") {
    return NextResponse.json({ error: "El estado de recuperación no es válido." }, { status: 400 });
  }
  const status: RecoveryStatus = requestedStatus === "atendida" ? "atendida" : "pendiente";
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT r.id, r.email, r.status, r.requested_at, r.handled_at,
           u.role AS account_role, u.status AS account_status,
           EXISTS (
             SELECT 1 FROM audit_events a
             WHERE a.event_type = 'recuperacion_descartada'
               AND a.entity_type = 'password_recovery_request'
               AND a.entity_id = r.id
           ) AS discarded
    FROM password_recovery_requests r
    LEFT JOIN users u ON lower(u.email) = lower(r.email)
    WHERE r.status = ?
    ORDER BY COALESCE(r.handled_at, r.requested_at) DESC, r.id
  `).all(status) as Array<{
    id: string;
    email: string;
    status: RecoveryStatus;
    requested_at: string;
    handled_at: string | null;
    account_role: string | null;
    account_status: string | null;
    discarded: number;
  }>;
  const summary = database.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pendiente' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'atendida' AND julianday(handled_at) >= julianday('now', '-7 days') THEN 1 ELSE 0 END) AS handled_7d,
      AVG(CASE WHEN status = 'atendida' AND julianday(handled_at) >= julianday('now', '-7 days')
        THEN (julianday(handled_at) - julianday(requested_at)) * 1440 END) AS average_minutes
    FROM password_recovery_requests
  `).get() as { pending: number | null; handled_7d: number | null; average_minutes: number | null };
  return NextResponse.json({
    requests: rows.map((row) => ({
      id: row.id,
      email: maskEmail(row.email) ?? "Correo no disponible",
      status: row.status,
      requestedAt: row.requested_at,
      handledAt: row.handled_at,
      accountExists: row.account_role !== null,
      role: row.account_role,
      accountStatus: row.account_status,
      discarded: row.discarded === 1,
    })),
    summary: {
      pending: Number(summary.pending ?? 0),
      handled7d: Number(summary.handled_7d ?? 0),
      averageMinutes: summary.average_minutes === null ? null : Number(summary.average_minutes),
    },
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{
      action?: "request" | "generate" | "unblock" | "revoke" | "dismiss";
      email?: string;
      userId?: string;
      requestId?: string;
      reason?: string;
    }>(request);
    const database = getDatabase();
    const actor = await getCurrentUser();
    if (body.action === "request" || !body.action) {
      const email = body.email?.trim().toLowerCase() ?? "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Si la cuenta existe, recibirá instrucciones por un medio verificado." }, { status: 200 });
      database.prepare("INSERT INTO password_recovery_requests (id, email, requested_at) VALUES (?, ?, ?)").run(crypto.randomUUID(), email, new Date().toISOString());
      auditEvent({ eventType: "recuperacion_solicitada", entityType: "auth", metadata: { requested: true } });
      return NextResponse.json({ message: "Si la cuenta existe, un Gestor IDC o el administrador entregará un enlace por un medio verificado." });
    }
    const passwordResponse = passwordChangeRequired(actor);
    if (passwordResponse) return passwordResponse;
    if (!actor || !["admin_seguridad", "coordinador_idc"].includes(actor.role)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    if (!["generate", "unblock", "revoke", "dismiss"].includes(body.action ?? "")) {
      return NextResponse.json({ error: "La acción de recuperación no es válida." }, { status: 400 });
    }
    if (!body.requestId && !(body.action === "generate" && body.userId)) return NextResponse.json({ error: "La solicitud de recuperación es obligatoria." }, { status: 400 });
    const recovery = body.requestId
      ? database.prepare("SELECT id, email, status FROM password_recovery_requests WHERE id = ?").get(body.requestId) as { id: string; email: string; status: RecoveryStatus } | undefined
      : undefined;
    if (body.requestId && !recovery) return NextResponse.json({ error: "La solicitud no existe." }, { status: 404 });
    if (recovery && recovery.status !== "pendiente") return NextResponse.json({ error: "La solicitud ya fue atendida." }, { status: 409 });

    if (body.action === "dismiss") {
      const reason = body.reason?.trim() ?? "";
      if ([...reason].length < 5 || [...reason].length > 200) {
        return NextResponse.json({ error: "El motivo debe tener entre 5 y 200 caracteres." }, { status: 400 });
      }
      if (!recovery) return NextResponse.json({ error: "La solicitud de recuperación es obligatoria." }, { status: 400 });
      const now = new Date().toISOString();
      withTransaction(() => {
        const updated = database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'pendiente'").run(actor.id, now, recovery.id);
        if (Number(updated.changes) !== 1) throw new Error("RECOVERY_ALREADY_HANDLED");
        auditEvent({
          actorId: actor.id,
          actorRole: actor.role,
          eventType: "recuperacion_descartada",
          entityType: "password_recovery_request",
          entityId: recovery.id,
          metadata: { reason },
        });
      });
      return NextResponse.json({ status: "atendida", discarded: true });
    }

    const target = recovery
      ? database.prepare("SELECT id, email, role, status FROM users WHERE lower(email) = lower(?) ORDER BY CASE role WHEN 'cliente' THEN 0 ELSE 1 END LIMIT 1").get(recovery.email) as { id: string; email: string; role: string; status: string } | undefined
      : database.prepare("SELECT id, email, role, status FROM users WHERE id = ?").get(body.userId) as { id: string; email: string; role: string; status: string } | undefined;
    if (!target || target.role === "admin_seguridad" || (actor.role === "coordinador_idc" && target.role !== "cliente")) {
      return NextResponse.json({ error: "La cuenta no está disponible para esta solicitud." }, { status: 404 });
    }

    const now = new Date().toISOString();
    if (body.action === "generate") {
      if (target.role !== "cliente") return NextResponse.json({ error: "La recuperación por enlace solo está disponible para clientes." }, { status: 400 });
      let setup: ReturnType<typeof createPasswordSetupToken> | undefined;
      withTransaction(() => {
        database.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").run(hashPassword(crypto.randomBytes(32).toString("base64url")), now, target.id);
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        if (recovery) {
          const updated = database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'pendiente'").run(actor.id, now, recovery.id);
          if (Number(updated.changes) !== 1) throw new Error("RECOVERY_ALREADY_HANDLED");
        } else {
          database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_by = ?, handled_at = ? WHERE email = ? AND status = 'pendiente'").run(actor.id, now, target.email);
        }
        setup = createPasswordSetupToken(target.id, actor.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "recuperacion_cliente_generada", entityType: "user", entityId: target.id });
        if (recovery) {
          auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "recuperacion_solicitud_atendida", entityType: "password_recovery_request", entityId: recovery.id });
        }
      });
      if (!setup) throw new Error("No se pudo crear el enlace de recuperación.");
      return NextResponse.json({ setupUrl: new URL(`/definir-contrasena?token=${encodeURIComponent(setup.token)}`, request.url).toString(), expiresAt: setup.expiresAt });
    }

    if (!recovery) return NextResponse.json({ error: "La solicitud de recuperación es obligatoria." }, { status: 400 });
    withTransaction(() => {
      if (body.action === "unblock") {
        if (target.status !== "bloqueado") throw new Error("ACCOUNT_NOT_BLOCKED");
        database.prepare("UPDATE users SET status = 'activo', updated_at = ? WHERE id = ?").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "desbloqueo", entityType: "user", entityId: target.id });
      } else if (body.action === "revoke") {
        database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "revocacion_sesiones", entityType: "user", entityId: target.id });
      } else {
        return;
      }
      const updated = database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'pendiente'").run(actor.id, now, recovery.id);
      if (Number(updated.changes) !== 1) throw new Error("RECOVERY_ALREADY_HANDLED");
      auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "recuperacion_solicitud_atendida", entityType: "password_recovery_request", entityId: recovery.id });
    });
    return NextResponse.json({ status: "atendida" });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "ACCOUNT_NOT_BLOCKED") return NextResponse.json({ error: "La cuenta no está bloqueada." }, { status: 409 });
    if (error instanceof Error && error.message === "RECOVERY_ALREADY_HANDLED") return NextResponse.json({ error: "La solicitud ya fue atendida." }, { status: 409 });
    return NextResponse.json({ error: "No fue posible gestionar la recuperación." }, { status: 500 });
  }
}
