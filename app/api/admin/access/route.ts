import { NextResponse } from "next/server";
import { getAppMode } from "@/lib/adapters/config";
import { eventLabel, sanitizeAuditMetadata, type SafeMetadataItem } from "@/lib/admin/access-log";
import { maskEmail } from "@/lib/audit-privacy";
import { getCurrentUser, mfaRequiredResponse, passwordChangeRequired } from "@/lib/auth";
import { formatoFechaHora, inicioDiaHermosillo } from "@/lib/fechas";
import { getDatabase } from "@/lib/db/sqlite";
import { ROLE_LABEL, type Role } from "@/data/mock";

const PAGE_SIZE = 50;

type AuditRow = {
  id: string;
  created_at: string;
  display_name: string | null;
  actor_role: Role | null;
  event_type: string;
  entity_type: string;
  metadata_json: string;
  folio: string | null;
};

function attemptedEmail(metadataJson: string): string | null {
  try {
    const metadata: unknown = JSON.parse(metadataJson);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const email = (metadata as Record<string, unknown>).email;
    return typeof email === "string" ? maskEmail(email) : null;
  } catch {
    return null;
  }
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function safeEntityLabel(entity: string): string {
  const labels: Record<string, string> = {
    auth: "Autenticación",
    expediente: "Expediente",
    gate: "Gate",
    user: "Cuenta",
    user_mfa: "MFA",
  };
  return labels[entity] ?? "Otro";
}

function shapeRow(row: AuditRow, folioFilter: boolean) {
  const maskedEmail = attemptedEmail(row.metadata_json);
  const unrecognizedAccount = row.event_type === "login_fallido" && !row.display_name && maskedEmail !== null;
  return {
    id: row.id,
    createdAt: formatoFechaHora(row.created_at),
    user: folioFilter
      ? row.actor_role && row.actor_role in ROLE_LABEL ? ROLE_LABEL[row.actor_role] : "Sistema"
      : row.display_name ?? maskedEmail ?? "Sistema",
    role: row.actor_role && row.actor_role in ROLE_LABEL ? ROLE_LABEL[row.actor_role] : "Sistema",
    event: unrecognizedAccount ? "Cuenta inexistente" : eventLabel(row.event_type),
    eventType: row.event_type,
    entity: safeEntityLabel(row.entity_type),
    metadata: sanitizeAuditMetadata(row.metadata_json),
    ...(folioFilter ? { folio: row.folio } : {}),
  };
}

function buildWhere(params: URLSearchParams) {
  const conditions = ["1 = 1"];
  const values: string[] = [];
  const from = params.get("from")?.trim() ?? "";
  const to = params.get("to")?.trim() ?? "";
  const userId = params.get("userId")?.trim() ?? "";
  const eventType = params.get("eventType")?.trim() ?? "";
  const folio = params.get("folio")?.trim() ?? "";
  const rawEventIds = params.get("eventIds")?.trim() ?? "";
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    return { error: "Usa fechas válidas en formato AAAA-MM-DD." as const };
  }
  if (from && to && from > to) return { error: "La fecha inicial no puede ser posterior a la fecha final." as const };
  if (folio && (folio.length > 64 || !/^[A-Za-z0-9._-]+$/.test(folio))) {
    return { error: "El folio no tiene un formato válido." as const };
  }
  if (rawEventIds) {
    const eventIds = rawEventIds.split(",");
    if (eventIds.length > 100 || eventIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      return { error: "El filtro de eventos no es válido." as const };
    }
    conditions.push(`a.id IN (${eventIds.map(() => "?").join(", ")})`);
    values.push(...eventIds);
  }
  if (from) { conditions.push("a.created_at >= ?"); values.push(inicioDiaHermosillo(from)); }
  if (to) {
    const exclusiveEnd = new Date(`${to}T00:00:00.000Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    conditions.push("a.created_at < ?");
    values.push(inicioDiaHermosillo(exclusiveEnd.toISOString().slice(0, 10)));
  }
  if (userId) { conditions.push("a.actor_id = ?"); values.push(userId); }
  if (eventType) { conditions.push("a.event_type = ?"); values.push(eventType); }
  if (folio) { conditions.push("e.folio = ?"); values.push(folio); }
  return { where: conditions.join(" AND "), values };
}

export async function GET(request: Request) {
  if (getAppMode() === "demo") {
    return NextResponse.json({ error: "La bitácora con datos locales no está disponible en modo demo." }, { status: 404 });
  }
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const mfaResponse = mfaRequiredResponse(user);
  if (mfaResponse) return mfaResponse;

  const params = new URL(request.url).searchParams;
  const folioFilter = Boolean(params.get("folio")?.trim());
  const filter = buildWhere(params);
  if ("error" in filter) return NextResponse.json({ error: filter.error }, { status: 400 });
  const database = getDatabase();
  const count = database.prepare(`
    SELECT COUNT(*) AS total
    FROM audit_events a
    LEFT JOIN expedientes e ON e.id = a.expediente_id
    WHERE ${filter.where}
  `).get(...filter.values) as { total: number };
  const total = Number(count.total);
  if (params.get("format") === "csv") {
    const rows = database.prepare(`
      SELECT a.id, a.created_at, u.display_name, a.actor_role, a.event_type, a.entity_type, a.metadata_json, e.folio
      FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
      LEFT JOIN expedientes e ON e.id = a.expediente_id
      WHERE ${filter.where}
      ORDER BY a.created_at DESC, a.id DESC
    `).all(...filter.values) as AuditRow[];
    const headers = ["fecha_hora", "usuario", "rol", "evento", "entidad"];
    if (folioFilter) headers.push("folio");
    headers.push("metadatos_permitidos");
    const lines = [
      headers.map(csvCell).join(","),
      ...rows.map((row) => {
        const shaped = shapeRow(row, folioFilter);
        const metadata = shaped.metadata.map((item: SafeMetadataItem) => `${item.label}: ${item.value}`).join("; ");
        return [shaped.createdAt, shaped.user, shaped.role, shaped.event, shaped.entity, folioFilter ? row.folio : "", metadata].map(csvCell).join(",");
      }),
    ];
    return new Response(lines.join("\r\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="auditoria.csv"',
        "x-content-type-options": "nosniff",
      },
    });
  }

  const parsedPage = Number(params.get("page") ?? "1");
  if (!Number.isSafeInteger(parsedPage) || parsedPage < 1) {
    return NextResponse.json({ error: "El número de página no es válido." }, { status: 400 });
  }
  const pages = Math.ceil(total / PAGE_SIZE);
  const page = Math.min(parsedPage, Math.max(1, pages));
  const rows = database.prepare(`
    SELECT a.id, a.created_at, u.display_name, a.actor_role, a.event_type, a.entity_type, a.metadata_json, e.folio
    FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
    LEFT JOIN expedientes e ON e.id = a.expediente_id
    WHERE ${filter.where}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ? OFFSET ?
  `).all(...filter.values, PAGE_SIZE, (page - 1) * PAGE_SIZE) as AuditRow[];
  const users = folioFilter ? [] : database.prepare(`
      SELECT DISTINCT u.id, u.display_name, u.role
      FROM audit_events a JOIN users u ON u.id = a.actor_id
      ORDER BY u.display_name
    `).all() as Array<{ id: string; display_name: string; role: Role }>;
  const eventTypes = database.prepare("SELECT DISTINCT event_type FROM audit_events ORDER BY event_type").all() as Array<{ event_type: string }>;
  return NextResponse.json({
    events: rows.map((row) => shapeRow(row, folioFilter)),
    users: users.map((entry) => ({ id: entry.id, label: `${entry.display_name} · ${ROLE_LABEL[entry.role]}` })),
    eventTypes: eventTypes.map((entry) => ({ value: entry.event_type, label: eventLabel(entry.event_type) })),
    page,
    pages,
    total,
  });
}
