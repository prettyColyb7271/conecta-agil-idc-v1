import "server-only";

import crypto from "node:crypto";
import { getDatabase } from "@/lib/db/sqlite";

export type ZohoSubtask = {
  code: string;
  label: string;
  status: string;
  date: string | null;
};

export type ZohoGateTask = {
  gate: number;
  label: string;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  responsible: string;
  subtasks: ZohoSubtask[];
};

export type ZohoSnapshot = {
  version: 1;
  eventType: string;
  folio: string;
  createdAt: string;
  responsible: string;
  tasks: ZohoGateTask[];
};

export type OutboxStatus = "pendiente" | "enviando" | "enviado" | "fallido";

export type OutboxEntry = {
  id: string;
  eventType: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
  snapshot: ZohoSnapshot;
  retryable: boolean;
  consolidatedAt: string | null;
};

export type ZohoProjectPreview = {
  folio: string;
  responsible: string;
  tasks: ZohoGateTask[];
};

const EVENT_GATES: Record<string, number> = {
  firma_presencial: 3,
  ingreso_acuse: 4,
  cfe_incompleto: 2,
  resolucion_cfe: 5,
  contrato: 6,
  uiie: 7,
  visita_uiie: 7,
  certificado_uiie: 7,
  medidor: 8,
  interconexion: 8,
  alta_comercial: 8,
  cierre: 8,
};

const EVENT_LABELS: Record<string, string> = {
  firma_presencial: "Firma presencial",
  ingreso_acuse: "Acuse CFE",
  cfe_incompleto: "Reproceso CFE",
  resolucion_cfe: "Oficio resolutivo CFE",
  contrato: "Contrato",
  uiie: "Visita UIIE",
  visita_uiie: "Visita UIIE",
  certificado_uiie: "Certificado UIIE",
  medidor: "Medidor",
  interconexion: "Interconexión",
  alta_comercial: "Alta comercial",
  cierre: "Cierre",
};

const OUTBOX_EVENTS = new Set([
  "alta_expediente",
  "reasignacion_responsable",
  "responsable_bloqueado",
  "documento_cargado",
  "escaneo_verificado",
  "requisito_validado",
  "requisito_observado",
  "requisito_no_aplica",
  "cierre_gate",
  "cierre_expediente",
  "reapertura_gate",
  "oficio_resolutivo_registrado",
]);

function safeDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function safeResponsible(value: unknown): string {
  return typeof value === "string" && value.length <= 120 ? value : "Sin responsable asignado";
}

function requirementStatus(status: string): string {
  if (status === "validado_idc" || status === "escaneo_verificado_idc") return "Validado";
  if (status === "observado") return "Observado";
  if (status === "no_aplica_justificado") return "No aplica";
  if (status === "escaneo_recibido") return "En revisión IDC";
  return "Pendiente";
}

function taskStatus(status: string): string {
  if (status === "cerrado") return "Cerrado";
  if (status === "abierto") return "En proceso";
  return "Pendiente";
}

function requirementGate(code: string): number {
  if (code.startsWith("U")) return 7;
  const number = Number(code.slice(1));
  return number >= 10 ? 3 : 2;
}

function buildSnapshot(expedienteId: string, eventType: string, createdAt: string): ZohoSnapshot {
  const database = getDatabase();
  const expediente = database.prepare(`
    SELECT e.folio, u.display_name, u.status AS responsible_status
    FROM expedientes e
    LEFT JOIN users u ON u.id = e.gestor_id
    WHERE e.id = ?
  `).get(expedienteId) as { folio: string; display_name: string | null; responsible_status: string | null } | undefined;
  if (!expediente) throw new Error("No se encontró el expediente para crear la notificación de Zoho.");

  const responsible = expediente.display_name
    ? `${expediente.display_name}${expediente.responsible_status === "bloqueado" ? " (bloqueado)" : ""}`
    : "Sin responsable asignado";
  const gates = database.prepare(`
    SELECT gate_code, status, created_at, closed_at
    FROM gates WHERE expediente_id = ? ORDER BY gate_code
  `).all(expedienteId) as Array<{ gate_code: string; status: string; created_at: string; closed_at: string | null }>;
  const requirements = database.prepare(`
    SELECT requirement_code, status, updated_at
    FROM expediente_requirements WHERE expediente_id = ?
    ORDER BY requirement_code
  `).all(expedienteId) as Array<{ requirement_code: string; status: string; updated_at: string }>;
  const events = database.prepare(`
    SELECT event_type, event_date, created_at
    FROM external_events WHERE expediente_id = ?
    ORDER BY created_at, rowid
  `).all(expedienteId) as Array<{ event_type: string; event_date: string; created_at: string }>;

  const tasks = Array.from({ length: 8 }, (_, index): ZohoGateTask => {
    const gateNumber = index + 1;
    const gate = gates.find((item) => item.gate_code === `G${index}`);
    const subtasks: ZohoSubtask[] = requirements
      .filter((item) => requirementGate(item.requirement_code) === gateNumber)
      .map((item) => ({
        code: item.requirement_code,
        label: item.requirement_code,
        status: requirementStatus(item.status),
        date: item.updated_at || null,
      }));

    for (const event of events) {
      if (EVENT_GATES[event.event_type] !== gateNumber) continue;
      subtasks.push({
        code: event.event_type,
        label: EVENT_LABELS[event.event_type] ?? "Evento externo",
        status: "Registrado",
        date: event.event_date || event.created_at || null,
      });
    }

    return {
      gate: gateNumber,
      label: `Gate ${gateNumber}`,
      status: gate ? taskStatus(gate.status) : "Pendiente",
      openedAt: gate?.created_at ?? null,
      closedAt: gate?.closed_at ?? null,
      responsible,
      subtasks,
    };
  });

  return { version: 1, eventType, folio: expediente.folio, createdAt, responsible, tasks };
}

export function enqueueZohoOutbox(expedienteId: string, eventType: string, createdAt = new Date().toISOString()): string {
  const id = crypto.randomUUID();
  const snapshot = buildSnapshot(expedienteId, eventType, createdAt);
  getDatabase().prepare(`
    INSERT INTO outbox (id, event_type, expediente_id, payload_json, status, attempts, created_at)
    VALUES (?, ?, ?, ?, 'pendiente', 0, ?)
  `).run(id, eventType, expedienteId, JSON.stringify(snapshot), createdAt);
  return id;
}

function parseSnapshot(payload: string): ZohoSnapshot {
  const value = JSON.parse(payload) as Partial<ZohoSnapshot>;
  if (value.version !== 1 || typeof value.folio !== "string" || !/^IDC-\d{4}-\d{4}$/.test(value.folio) || !Array.isArray(value.tasks) || value.tasks.length !== 8) {
    throw new Error("El snapshot de Zoho guardado en la outbox no es válido.");
  }
  const eventType = typeof value.eventType === "string" && (OUTBOX_EVENTS.has(value.eventType) || /^evidencia_[a-z_]+_registrada$/.test(value.eventType))
    ? value.eventType
    : "actualizacion_expediente";
  return {
    version: 1,
    eventType,
    folio: value.folio,
    createdAt: safeDate(value.createdAt) ?? "",
    responsible: safeResponsible(value.responsible),
    tasks: value.tasks.map((task, index) => {
      if (!Array.isArray(task.subtasks)) throw new Error("El snapshot de Zoho contiene subtareas inválidas.");
      const taskState = ["Pendiente", "En proceso", "Cerrado"].includes(task.status) ? task.status : "Pendiente";
      return {
        gate: index + 1,
        label: `Gate ${index + 1}`,
        status: taskState,
        openedAt: safeDate(task.openedAt),
        closedAt: safeDate(task.closedAt),
        responsible: safeResponsible(task.responsible),
        subtasks: task.subtasks.map((subtask) => ({
          code: typeof subtask.code === "string" && (/^[RU]\d{2}$/.test(subtask.code) || subtask.code in EVENT_LABELS) ? subtask.code : "evento",
          label: typeof subtask.code === "string" && /^[RU]\d{2}$/.test(subtask.code)
            ? subtask.code
            : typeof subtask.code === "string" ? EVENT_LABELS[subtask.code] ?? "Evento externo" : "Evento externo",
          status: ["Pendiente", "Validado", "Observado", "No aplica", "En revisión IDC", "Registrado"].includes(subtask.status) ? subtask.status : "Pendiente",
          date: safeDate(subtask.date),
        })).slice(0, 100),
      };
    }),
  };
}

type OutboxEntryWithTarget = OutboxEntry & { consolidatedTargetId: string | null };

function consolidationTarget(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { consolidadoEn?: unknown };
    return typeof parsed.consolidadoEn === "string" ? parsed.consolidadoEn : null;
  } catch {
    return null;
  }
}

function canRetry(status: OutboxStatus, createdAt: string, lastAttemptAt: string | null, now: number): boolean {
  if (status === "fallido") return true;
  if (status === "pendiente") return Number.isFinite(Date.parse(createdAt)) && now - Date.parse(createdAt) > 60_000;
  return status === "enviando" && lastAttemptAt !== null &&
    Number.isFinite(Date.parse(lastAttemptAt)) && now - Date.parse(lastAttemptAt) > 120_000;
}

function readEntries(): OutboxEntryWithTarget[] {
  const rows = getDatabase().prepare(`
    SELECT id, event_type, status, attempts, last_error, last_attempt_at, created_at, payload_json, zoho_id
    FROM outbox ORDER BY created_at DESC, rowid DESC LIMIT 200
  `).all() as Array<{
    id: string; event_type: string; status: OutboxStatus; attempts: number;
    last_error: string | null; last_attempt_at: string | null;
    created_at: string; payload_json: string; zoho_id: string | null;
  }>;
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    lastAttemptAt: row.last_attempt_at,
    createdAt: row.created_at,
    snapshot: parseSnapshot(row.payload_json),
    retryable: canRetry(row.status, row.created_at, row.last_attempt_at, now),
    consolidatedAt: null,
    consolidatedTargetId: consolidationTarget(row.zoho_id),
  }));
}

export function getZohoDashboard() {
  const entries = readEntries();
  const publicEntries: OutboxEntry[] = entries.map(({ consolidatedTargetId, ...entry }) => ({
    ...entry,
    consolidatedAt: consolidatedTargetId ? entry.lastAttemptAt : null,
  }));
  const projectsByFolio = new Map<string, ZohoProjectPreview>();
  for (const entry of publicEntries) {
    if (!projectsByFolio.has(entry.snapshot.folio)) {
      projectsByFolio.set(entry.snapshot.folio, {
        folio: entry.snapshot.folio,
        responsible: entry.snapshot.responsible,
        tasks: entry.snapshot.tasks,
      });
    }
  }
  const transport = process.env.ZOHO_TRANSPORT?.trim().toLowerCase() || "file";
  if (transport !== "file" && transport !== "api") throw new Error("ZOHO_TRANSPORT debe ser file o api.");
  return { transport, entries: publicEntries, projects: [...projectsByFolio.values()] };
}
