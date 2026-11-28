import "server-only";

import { ROLE_LABEL, type Role } from "@/data/mock";
import { getDatabase } from "@/lib/db/sqlite";

export type AdminDashboardData = {
  example: boolean;
  roles: Array<{ role: Role; label: string; count: number }>;
  statuses: Array<{ status: "activo" | "bloqueado" | "pendiente"; label: string; count: number }>;
  pendingPasswords: number;
  pendingRegistrations: number;
  mfa: {
    enabled: number;
    requiredRoles: Array<{ role: Role; label: string }>;
    missingRequired: Array<{ name: string; role: string }>;
  };
  activity: {
    loginsOk: number;
    loginsFailed: number;
    blocks: number;
    mfaFailed: number;
    mfaDecryptFailed: number;
    passwordLinks: number;
  };
  integrations: { pending: number; sent: number; failed: number; transport: "file" | "api" };
  alerts: { blockedResponsibles: string[]; failedOutbox: number };
};

const ROLES = Object.keys(ROLE_LABEL) as Role[];
const DASHBOARD_ROLES = ROLES.filter((role) => role !== "gestor_tramites_cfe");
const STATUS_LABELS = {
  activo: "Activas",
  bloqueado: "Bloqueadas",
  pendiente: "Pendientes",
} as const;

function requiredRoles(): Role[] {
  const configured = (process.env.MFA_REQUIRED_ROLES ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is Role => ROLES.includes(role as Role));
  return [...new Set<Role>(["admin_seguridad", ...configured])];
}

export function getAdminDashboardData(): AdminDashboardData {
  const database = getDatabase();
  const roleCounts = database.prepare("SELECT role, COUNT(*) AS count FROM users GROUP BY role").all() as Array<{ role: Role; count: number }>;
  const statusCounts = database.prepare("SELECT status, COUNT(*) AS count FROM users GROUP BY status").all() as Array<{ status: "activo" | "bloqueado" | "pendiente"; count: number }>;
  const roleMap = new Map(roleCounts.map((row) => [row.role, Number(row.count)]));
  const statusMap = new Map(statusCounts.map((row) => [row.status, Number(row.count)]));
  const pendingPasswords = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE must_change_password = 1").get()?.count ?? 0);
  const pendingRegistrations = Number(database.prepare("SELECT COUNT(*) AS count FROM account_requests WHERE status = 'pendiente'").get()?.count ?? 0);
  const mfaEnabled = Number(database.prepare("SELECT COUNT(*) AS count FROM user_mfa WHERE enabled_at IS NOT NULL").get()?.count ?? 0);
  const required = requiredRoles();
  const placeholders = required.map(() => "?").join(", ");
  const missingRequired = database.prepare(`
    SELECT display_name, role
    FROM users
    WHERE role IN (${placeholders})
      AND NOT EXISTS (
        SELECT 1 FROM user_mfa m
        WHERE m.user_id = users.id AND m.enabled_at IS NOT NULL
      )
    ORDER BY role, display_name
  `).all(...required) as Array<{ display_name: string; role: Role }>;
  const activity = database.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'login_ok' THEN 1 ELSE 0 END) AS logins_ok,
      SUM(CASE WHEN event_type = 'login_fallido' THEN 1 ELSE 0 END) AS logins_failed,
      SUM(CASE WHEN event_type IN ('bloqueo', 'login_bloqueado') THEN 1 ELSE 0 END) AS blocks,
      SUM(CASE WHEN event_type = 'mfa_fallido' THEN 1 ELSE 0 END) AS mfa_failed,
      SUM(CASE WHEN event_type = 'mfa_descifrado_fallido' THEN 1 ELSE 0 END) AS mfa_decrypt_failed,
      SUM(CASE WHEN event_type IN ('alta_gestor_idc', 'reset_contrasena', 'recuperacion_cliente_generada') THEN 1 ELSE 0 END) AS password_links
    FROM audit_events
    WHERE julianday(created_at) >= julianday('now', '-24 hours')
  `).get() as {
    logins_ok: number | null;
    logins_failed: number | null;
    blocks: number | null;
    mfa_failed: number | null;
    mfa_decrypt_failed: number | null;
    password_links: number | null;
  };
  const outboxCounts = database.prepare("SELECT status, COUNT(*) AS count FROM outbox GROUP BY status").all() as Array<{ status: string; count: number }>;
  const outbox = new Map(outboxCounts.map((row) => [row.status, Number(row.count)]));
  const blockedResponsibles = database.prepare(`
    SELECT DISTINCT e.folio
    FROM expediente_assignments ea
    JOIN users u ON u.id = ea.user_id
    JOIN expedientes e ON e.id = ea.expediente_id
    WHERE ea.assignment_type = 'coordinador_idc'
      AND ea.ends_at IS NULL
      AND u.status = 'bloqueado'
    ORDER BY e.folio
    LIMIT 100
  `).all() as Array<{ folio: string }>;

  const configuredTransport = process.env.ZOHO_TRANSPORT?.trim().toLowerCase() || "file";
  if (configuredTransport !== "file" && configuredTransport !== "api") {
    throw new Error("ZOHO_TRANSPORT debe ser file o api.");
  }
  return {
    example: false,
    roles: DASHBOARD_ROLES.map((role) => ({ role, label: ROLE_LABEL[role], count: roleMap.get(role) ?? 0 })),
    statuses: (Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((status) => ({
      status,
      label: STATUS_LABELS[status],
      count: statusMap.get(status) ?? 0,
    })),
    pendingPasswords,
    pendingRegistrations,
    mfa: {
      enabled: mfaEnabled,
      requiredRoles: required.map((role) => ({ role, label: ROLE_LABEL[role] })),
      missingRequired: missingRequired.map((row) => ({ name: row.display_name, role: ROLE_LABEL[row.role] })),
    },
    activity: {
      loginsOk: Number(activity.logins_ok ?? 0),
      loginsFailed: Number(activity.logins_failed ?? 0),
      blocks: Number(activity.blocks ?? 0),
      mfaFailed: Number(activity.mfa_failed ?? 0),
      mfaDecryptFailed: Number(activity.mfa_decrypt_failed ?? 0),
      passwordLinks: Number(activity.password_links ?? 0),
    },
    integrations: {
      pending: outbox.get("pendiente") ?? 0,
      sent: outbox.get("enviado") ?? 0,
      failed: outbox.get("fallido") ?? 0,
      transport: configuredTransport,
    },
    alerts: {
      blockedResponsibles: blockedResponsibles.map((row) => row.folio),
      failedOutbox: outbox.get("fallido") ?? 0,
    },
  };
}

export function getDemoAdminDashboardData(): AdminDashboardData {
  return {
    example: true,
    roles: [
      { role: "admin_seguridad", label: ROLE_LABEL.admin_seguridad, count: 1 },
      { role: "coordinador_idc", label: ROLE_LABEL.coordinador_idc, count: 2 },
      { role: "cliente", label: ROLE_LABEL.cliente, count: 3 },
    ],
    statuses: [
      { status: "activo", label: STATUS_LABELS.activo, count: 5 },
      { status: "bloqueado", label: STATUS_LABELS.bloqueado, count: 1 },
      { status: "pendiente", label: STATUS_LABELS.pendiente, count: 0 },
    ],
    pendingPasswords: 1,
    pendingRegistrations: 1,
    mfa: {
      enabled: 1,
      requiredRoles: [{ role: "admin_seguridad", label: ROLE_LABEL.admin_seguridad }],
      missingRequired: [],
    },
    activity: { loginsOk: 8, loginsFailed: 1, blocks: 1, mfaFailed: 0, mfaDecryptFailed: 0, passwordLinks: 2 },
    integrations: { pending: 1, sent: 4, failed: 0, transport: "file" },
    alerts: { blockedResponsibles: ["IDC-DEMO-0001"], failedOutbox: 0 },
  };
}
