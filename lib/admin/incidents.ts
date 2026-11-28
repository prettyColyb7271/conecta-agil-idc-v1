import "server-only";

import type { Role } from "@/data/mock";
import { eventLabel } from "@/lib/admin/access-log";
import { maskEmail, truncateIp } from "@/lib/audit-privacy";
import { formatoFechaHora } from "@/lib/fechas";
import { getDatabase } from "@/lib/db/sqlite";

const WINDOW_MS = 15 * 60 * 1000;
const LOGIN_THRESHOLD = 5;
const MFA_THRESHOLD = 3;
const EVENT_TYPES = ["login_fallido", "login_bloqueado", "mfa_fallido", "mfa_descifrado_fallido"];

type AuditSource = {
  id: string;
  actor_id: string | null;
  actor_role: Role | null;
  event_type: string;
  entity_id: string | null;
  metadata_json: string;
  created_at: string;
  actor_email: string | null;
  actor_status: "activo" | "bloqueado" | "pendiente" | null;
};

type SafeEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  account: string | null;
  userId: string | null;
  userStatus: "activo" | "bloqueado" | "pendiente" | null;
  ip: string | null;
};

export type IncidentAlert = {
  id: string;
  category: "login_account" | "login_ip" | "login_bloqueado" | "mfa_account" | "mfa_descifrado";
  title: string;
  subject: string;
  detectedAt: string;
  detectedLabel: string;
  eventCount: number;
  eventsTruncated: boolean;
  eventIds: string[];
  events: Array<{ id: string; label: string; date: string }>;
  userId: string | null;
  userStatus: "activo" | "bloqueado" | "pendiente" | null;
};

export type IncidentsDashboard = {
  alerts: IncidentAlert[];
  alerts24h: number;
  alerts7d: number;
  blockedAccounts: number;
};

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function getEvents(): SafeEvent[] {
  const database = getDatabase();
  const users = database.prepare("SELECT id, email, status FROM users").all() as Array<{
    id: string;
    email: string;
    status: "activo" | "bloqueado" | "pendiente";
  }>;
  const accountIdsByMaskedEmail = new Map<string, string | null>();
  const statusById = new Map(users.map((user) => [user.id, user.status]));
  for (const user of users) {
    const masked = maskEmail(user.email);
    if (!masked) continue;
    accountIdsByMaskedEmail.set(masked, accountIdsByMaskedEmail.has(masked) ? null : user.id);
  }

  const rows = database.prepare(`
    SELECT a.id, a.actor_id, a.actor_role, a.event_type, a.entity_id, a.metadata_json, a.created_at,
           u.email AS actor_email, u.status AS actor_status
    FROM audit_events a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.event_type IN (${EVENT_TYPES.map(() => "?").join(", ")})
      AND julianday(a.created_at) >= julianday('now', '-7 days')
    ORDER BY a.created_at ASC, a.id ASC
  `).all(...EVENT_TYPES) as AuditSource[];

  return rows.map((row) => {
    const metadata = parseMetadata(row.metadata_json);
    const emailValue = typeof metadata.email === "string" ? metadata.email : row.actor_email;
    const account = maskEmail(emailValue);
    const ip = truncateIp(typeof metadata.ip === "string" ? metadata.ip : null);
    const mappedId = account ? accountIdsByMaskedEmail.get(account) ?? null : null;
    const userId = row.actor_id ?? mappedId;
    return {
      id: row.id,
      eventType: row.event_type,
      createdAt: row.created_at,
      account,
      userId,
      userStatus: userId ? statusById.get(userId) ?? null : row.actor_status,
      ip,
    };
  });
}

function createAlert(
  category: IncidentAlert["category"],
  title: string,
  subject: string,
  events: SafeEvent[],
): IncidentAlert {
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()];
  const userIds = [...new Set(uniqueEvents.map((event) => event.userId).filter((id): id is string => Boolean(id)))];
  const userId = userIds.length === 1 ? userIds[0] : null;
  const matchingUser = userId ? uniqueEvents.find((event) => event.userId === userId) : undefined;
  const detectedAt = uniqueEvents.at(-1)?.createdAt ?? new Date(0).toISOString();
  return {
    id: `${category}-${uniqueEvents[0]?.id ?? "none"}`,
    category,
    title,
    subject,
    detectedAt,
    detectedLabel: formatoFechaHora(detectedAt),
    eventCount: uniqueEvents.length,
    eventsTruncated: uniqueEvents.length > 100,
    eventIds: uniqueEvents.slice(-100).map((event) => event.id),
    events: uniqueEvents.slice(-100).map((event) => ({
      id: event.id,
      label: eventLabel(event.eventType),
      date: formatoFechaHora(event.createdAt),
    })),
    userId,
    userStatus: matchingUser?.userStatus ?? null,
  };
}

function thresholdAlerts(
  events: SafeEvent[],
  eventType: string,
  threshold: number,
  category: "login_account" | "login_ip" | "mfa_account",
  title: string,
  subject: (event: SafeEvent) => string | null,
): IncidentAlert[] {
  const groups = new Map<string, SafeEvent[]>();
  for (const event of events.filter((item) => item.eventType === eventType)) {
    const key = subject(event);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  const alerts: IncidentAlert[] = [];
  for (const [key, group] of groups) {
    let activeWindow: SafeEvent[] = [];
    const records: Array<{ events: SafeEvent[]; eventIds: Set<string>; lastEventAt: number }> = [];
    let currentRecord: (typeof records)[number] | null = null;
    for (const event of group) {
      const timestamp = new Date(event.createdAt).getTime();
      activeWindow = activeWindow.filter((item) => timestamp - new Date(item.createdAt).getTime() <= WINDOW_MS);
      activeWindow.push(event);
      if (activeWindow.length < threshold) continue;

      if (currentRecord && timestamp - currentRecord.lastEventAt <= WINDOW_MS) {
        if (!currentRecord.eventIds.has(event.id)) {
          currentRecord.events.push(event);
          currentRecord.eventIds.add(event.id);
        }
        currentRecord.lastEventAt = timestamp;
      } else {
        const events = [...activeWindow];
        currentRecord = { events, eventIds: new Set(events.map((item) => item.id)), lastEventAt: timestamp };
        records.push(currentRecord);
      }
    }
    const label = category === "login_ip" ? `IP ${key}` : group[0].account ?? "Cuenta identificada";
    alerts.push(...records.map((record) => createAlert(category, title, label, record.events)));
  }
  return alerts;
}

export function getIncidentsDashboard(now = Date.now()): IncidentsDashboard {
  const database = getDatabase();
  const source = getEvents();
  const alerts: IncidentAlert[] = [
    ...thresholdAlerts(
      source,
      "login_fallido",
      LOGIN_THRESHOLD,
      "login_account",
      "Intentos fallidos repetidos para una cuenta",
      (event) => event.userId ?? event.account,
    ),
    ...thresholdAlerts(
      source,
      "login_fallido",
      LOGIN_THRESHOLD,
      "login_ip",
      "Intentos fallidos repetidos desde una IP",
      (event) => event.ip,
    ),
    ...thresholdAlerts(
      source,
      "mfa_fallido",
      MFA_THRESHOLD,
      "mfa_account",
      "Códigos MFA incorrectos repetidos para una cuenta",
      (event) => event.userId ?? event.account,
    ),
    ...source.filter((event) => event.eventType === "login_bloqueado").map((event) =>
      createAlert("login_bloqueado", "Inicio de sesión bloqueado", event.account ?? event.ip ?? "Cuenta no identificada", [event])),
    ...source.filter((event) => event.eventType === "mfa_descifrado_fallido").map((event) =>
      createAlert("mfa_descifrado", "Fallo al descifrar MFA", event.account ?? "Cuenta identificada por el sistema", [event])),
  ].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  const blockedAccounts = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'bloqueado'").get()?.count ?? 0);
  const cutoff24h = now - 24 * 60 * 60 * 1000;
  return {
    alerts: alerts.filter((alert) => new Date(alert.detectedAt).getTime() >= now - 7 * 24 * 60 * 60 * 1000),
    alerts24h: alerts.filter((alert) => new Date(alert.detectedAt).getTime() >= cutoff24h).length,
    alerts7d: alerts.length,
    blockedAccounts,
  };
}
