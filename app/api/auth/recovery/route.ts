import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { maskContactEmail, maskContactPhone, maskSurname, truncateIp } from "@/lib/audit-privacy";
import { assertSameOrigin, auditEvent, createPasswordSetupToken, getCurrentUser, hashPassword, hashToken, passwordChangeRequired, withTransaction } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

type RecoveryStatus = "pendiente" | "atendida";
const PUBLIC_RECOVERY_MESSAGE = "Si la cuenta existe, un Gestor IDC o el administrador entregará un enlace por un medio verificado.";
const RECOVERY_WINDOW_MS = 60 * 60 * 1000;
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function consumeRecoveryLimits(email: string | null, ip: string): "email" | "ip" | null {
  const database = getDatabase();
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / RECOVERY_WINDOW_MS) * RECOVERY_WINDOW_MS).toISOString();
  let limitedBy: "email" | "ip" | null = null;
  withTransaction(() => {
    database.prepare("DELETE FROM recovery_rate_limits WHERE window_start < ?").run(new Date(now - 2 * RECOVERY_WINDOW_MS).toISOString());
    const increment = (scope: "email" | "ip", value: string) => {
      database.prepare(`
        INSERT INTO recovery_rate_limits (id, scope, key_hash, window_start, attempts)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(scope, key_hash, window_start) DO UPDATE SET attempts = attempts + 1
      `).run(crypto.randomUUID(), scope, hashToken(`${scope}:${value}`), windowStart);
      return Number((database.prepare("SELECT attempts FROM recovery_rate_limits WHERE scope = ? AND key_hash = ? AND window_start = ?")
        .get(scope, hashToken(`${scope}:${value}`), windowStart) as { attempts: number }).attempts);
    };
    const emailAttempts = email ? increment("email", email) : 0;
    const ipAttempts = increment("ip", ip);
    if (emailAttempts > 3) limitedBy = "email";
    else if (ipAttempts > 10) limitedBy = "ip";
  });
  return limitedBy;
}

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
    SELECT r.id, r.email, r.status, r.requested_at, r.handled_at, r.account_exists,
           u.id AS account_user_id, u.display_name AS account_name, u.apellidos AS account_surname,
           u.telefono_contacto AS account_phone,
           u.role AS account_role, u.status AS account_status,
           EXISTS (
             SELECT 1 FROM audit_events a
             WHERE a.event_type = 'recuperacion_descartada'
               AND a.entity_type = 'password_recovery_request'
               AND a.entity_id = r.id
           ) AS discarded
    FROM password_recovery_requests r
    LEFT JOIN users u ON r.account_exists = 1 AND lower(u.email) = lower(r.email)
    WHERE r.status = ?
      AND (? != 'coordinador_idc' OR u.role = 'cliente')
    ORDER BY COALESCE(r.handled_at, r.requested_at) DESC, r.id
  `).all(status, actor.role) as Array<{
    id: string;
    email: string;
    status: RecoveryStatus;
    requested_at: string;
    handled_at: string | null;
    account_exists: number;
    account_role: string | null;
    account_status: string | null;
    account_user_id: string | null;
    account_name: string | null;
    account_surname: string | null;
    account_phone: string | null;
    discarded: number;
  }>;
  const summary = database.prepare(`
    SELECT
      SUM(CASE WHEN r.status = 'pendiente' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN r.status = 'atendida' AND julianday(r.handled_at) >= julianday('now', '-7 days') THEN 1 ELSE 0 END) AS handled_7d,
      AVG(CASE WHEN r.status = 'atendida' AND julianday(r.handled_at) >= julianday('now', '-7 days')
        THEN (julianday(r.handled_at) - julianday(r.requested_at)) * 1440 END) AS average_minutes
    FROM password_recovery_requests r
    LEFT JOIN users u ON r.account_exists = 1 AND lower(u.email) = lower(r.email)
    WHERE (? != 'coordinador_idc' OR u.role = 'cliente')
  `).get(actor.role) as { pending: number | null; handled_7d: number | null; average_minutes: number | null };
  return NextResponse.json({
    requests: rows.map((row) => ({
      id: row.id,
      email: maskContactEmail(row.email) ?? "Correo no disponible",
      status: row.status,
      requestedAt: row.requested_at,
      handledAt: row.handled_at,
      accountExists: row.account_exists === 1 && row.account_role !== null,
      role: row.account_role,
      accountStatus: row.account_status,
      discarded: row.discarded === 1,
      isSelf: row.account_user_id === actor.id,
      contact: actor.role === "admin_seguridad" && row.account_user_id ? {
        userId: row.account_user_id,
        name: row.account_name,
        apellidos: maskSurname(row.account_surname),
        telefono: maskContactPhone(row.account_phone),
      } : null,
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
      action?: "request" | "generate" | "generate_code" | "unblock" | "revoke" | "dismiss";
      email?: string;
      website?: string;
      userId?: string;
      requestId?: string;
      reason?: string;
    }>(request);
    const database = getDatabase();
    const actor = await getCurrentUser();
    if (body.action === "request" || !body.action) {
      if (typeof body.website === "string" && body.website.trim()) {
        return NextResponse.json({ message: PUBLIC_RECOVERY_MESSAGE });
      }
      const email = body.email?.trim().toLowerCase() ?? "";
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const ip = truncateIp(request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip")) ?? "local";
      const limitedBy = consumeRecoveryLimits(validEmail ? email : null, ip);
      if (limitedBy) {
        auditEvent({ eventType: "recuperacion_limitada", entityType: "auth", metadata: { limit: limitedBy } });
        return NextResponse.json({ message: PUBLIC_RECOVERY_MESSAGE });
      }
      if (!validEmail) return NextResponse.json({ message: PUBLIC_RECOVERY_MESSAGE });

      const user = database.prepare("SELECT id, role FROM users WHERE lower(email) = lower(?)").get(email) as { id: string; role: string } | undefined;
      const requestId = crypto.randomUUID();
      const now = new Date().toISOString();
      withTransaction(() => {
        database.prepare("INSERT INTO password_recovery_requests (id, email, status, requested_at, account_exists) VALUES (?, ?, 'pendiente', ?, ?)").run(requestId, email, now, user ? 1 : 0);
        if (user) {
          const admins = database.prepare("SELECT id FROM users WHERE role = 'admin_seguridad' AND status = 'activo'").all() as Array<{ id: string }>;
          for (const admin of admins) {
            database.prepare("INSERT INTO notifications (id, user_id, type, priority, title, body, created_at) VALUES (?, ?, 'recuperacion_solicitada', 'normal', 'Solicitud de recuperación', 'Una cuenta solicitó recuperar el acceso. Revisa Recuperación.', ?)").run(crypto.randomUUID(), admin.id, now);
          }
          if (user.role === "cliente") {
            const managers = database.prepare(`
              SELECT DISTINCT u.id FROM users u
              JOIN expediente_assignments ea ON ea.user_id = u.id
                AND ea.assignment_type = 'coordinador_idc' AND ea.ends_at IS NULL
              JOIN expedientes e ON e.id = ea.expediente_id AND e.cliente_id = ?
              WHERE u.role = 'coordinador_idc' AND u.status = 'activo'
                AND e.status IN ('borrador', 'activo', 'observado')
            `).all(user.id) as Array<{ id: string }>;
            for (const manager of managers) {
              database.prepare("INSERT INTO notifications (id, user_id, type, priority, title, body, created_at) VALUES (?, ?, 'recuperacion_cliente', 'normal', 'Recuperación de acceso', 'Un cliente asignado solicitó recuperar el acceso. Revisa Usuarios.', ?)").run(crypto.randomUUID(), manager.id, now);
            }
          }
        }
        auditEvent({ eventType: "recuperacion_solicitada", entityType: "password_recovery_request", entityId: requestId, metadata: { requested: true } });
      });
      return NextResponse.json({ message: PUBLIC_RECOVERY_MESSAGE });
    }
    const passwordResponse = passwordChangeRequired(actor);
    if (passwordResponse) return passwordResponse;
    if (!actor || !["admin_seguridad", "coordinador_idc"].includes(actor.role)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    if (!["generate", "generate_code", "unblock", "revoke", "dismiss"].includes(body.action ?? "")) {
      return NextResponse.json({ error: "La acción de recuperación no es válida." }, { status: 400 });
    }
    if (!body.requestId && !(body.action === "generate" && body.userId)) return NextResponse.json({ error: "La solicitud de recuperación es obligatoria." }, { status: 400 });
    const recovery = body.requestId
      ? database.prepare("SELECT id, email, status, account_exists FROM password_recovery_requests WHERE id = ?").get(body.requestId) as { id: string; email: string; status: RecoveryStatus; account_exists: number } | undefined
      : undefined;
    if (body.requestId && !recovery) return NextResponse.json({ error: "La solicitud no existe." }, { status: 404 });
    if (recovery && recovery.status !== "pendiente") return NextResponse.json({ error: "La solicitud ya fue atendida." }, { status: 409 });
    const target = recovery?.account_exists
      ? database.prepare("SELECT id, email, role, status FROM users WHERE lower(email) = lower(?) ORDER BY CASE role WHEN 'cliente' THEN 0 WHEN 'coordinador_idc' THEN 1 ELSE 2 END LIMIT 1").get(recovery.email) as { id: string; email: string; role: string; status: string } | undefined
      : database.prepare("SELECT id, email, role, status FROM users WHERE id = ?").get(body.userId) as { id: string; email: string; role: string; status: string } | undefined;
    if (recovery && ((actor.role === "coordinador_idc" && target?.role !== "cliente") || (actor.role === "admin_seguridad" && target?.id === actor.id))) {
      return NextResponse.json({ error: "La solicitud no está disponible." }, { status: 404 });
    }

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

    if (!target || (actor.role === "coordinador_idc" && target.role !== "cliente") || (actor.role === "admin_seguridad" && target.id === actor.id)) {
      return NextResponse.json({ error: "La cuenta no está disponible para esta solicitud." }, { status: 404 });
    }
    if (body.action === "generate" && target.role === "admin_seguridad") {
      return NextResponse.json({ error: "La recuperación por enlace no está disponible para administradores." }, { status: 400 });
    }

    const now = new Date().toISOString();
    if (body.action === "generate_code") {
      if (!recovery || !["cliente", "coordinador_idc"].includes(target.role) || !["activo", "bloqueado"].includes(target.status)) {
        return NextResponse.json({ error: "No se puede generar un código para esta solicitud." }, { status: 400 });
      }
      const code = Array.from({ length: 8 }, () => RECOVERY_CODE_ALPHABET[crypto.randomInt(RECOVERY_CODE_ALPHABET.length)]).join("");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const codeId = crypto.randomUUID();
      withTransaction(() => {
        database.prepare("UPDATE password_recovery_codes SET status = 'reemplazado' WHERE request_id = ? AND status = 'activo'").run(recovery.id);
        database.prepare("INSERT INTO password_recovery_codes (id, request_id, user_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(codeId, recovery.id, target.id, hashToken(code), expiresAt, now);
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "recuperacion_codigo_generado", entityType: "password_recovery_code", entityId: codeId });
      });
      return NextResponse.json({ code, expiresAt });
    }
    if (body.action === "generate") {
      if (target.role !== "cliente" && target.role !== "coordinador_idc") return NextResponse.json({ error: "La recuperación por enlace no está disponible para esta cuenta." }, { status: 400 });
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
        auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: target.role === "cliente" ? "recuperacion_cliente_generada" : "reset_contrasena", entityType: "user", entityId: target.id });
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
