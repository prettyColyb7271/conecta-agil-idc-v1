import "server-only";

import crypto from "node:crypto";
import { getDatabase } from "@/lib/db/sqlite";
import { auditEvent, withTransaction, type AuthUser } from "@/lib/auth";
import { getExpediente } from "@/lib/data/expedientes";

export class GateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateValidationError";
  }
}

export class GateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateConflictError";
  }
}

const GATES = ["G0", "G1", "G2", "G3", "G4", "G5", "G6", "G7"] as const;
type GateCode = typeof GATES[number];
const EVENT_TYPES = ["firma_presencial", "ingreso_acuse", "resolucion_cfe", "contrato", "uiie", "medidor", "cierre"] as const;
type ExternalEventType = typeof EVENT_TYPES[number];

function assertIdc(user: AuthUser): void {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
}

function assertExpediente(user: AuthUser, id: string): void {
  if (!getExpediente(user, id)) throw new Error("NOT_FOUND");
}

function gateRows(id: string) {
  return getDatabase().prepare(`
    SELECT gate_code, status, document_id, closed_by, closed_at, reopened_at, reopen_reason
    FROM gates WHERE expediente_id = ? ORDER BY gate_code
  `).all(id);
}

function requireGateEvidence(id: string, type: ExternalEventType): void {
  const event = getDatabase().prepare("SELECT id FROM external_events WHERE expediente_id = ? AND event_type = ? ORDER BY event_date DESC LIMIT 1").get(id, type);
  if (!event) throw new GateConflictError(`Falta la evidencia externa requerida: ${type}.`);
}

function validateClose(id: string, gate: GateCode): void {
  const database = getDatabase();
  const requirements = (codes: string[]) => {
    const placeholders = codes.map(() => "?").join(",");
    const rows = database.prepare(`SELECT requirement_code, status, version_id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code IN (${placeholders})`).all(id, ...codes) as Array<{ requirement_code: string; status: string; version_id: string | null }>;
    const missing = codes.filter((code) => {
      const row = rows.find((item) => item.requirement_code === code);
      return !row || !["validado_idc", "no_aplica_justificado"].includes(row.status);
    });
    if (missing.length) throw new GateConflictError(`No se puede cerrar ${gate}; faltan requisitos: ${missing.join(", ")}.`);
  };
  if (gate === "G0") {
    const row = database.prepare("SELECT cliente_id, gestor_id, tramite, nivel_tension, privacy_accepted_at FROM expedientes WHERE id = ?").get(id) as { cliente_id?: string; gestor_id?: string; tramite?: string; nivel_tension?: string; privacy_accepted_at?: string | null } | undefined;
    if (!row?.cliente_id || !row.gestor_id || !row.tramite || !row.nivel_tension) throw new GateConflictError("G0 requiere expediente, cliente, responsable, trámite y nivel de tensión.");
    if (!row.privacy_accepted_at) throw new GateConflictError("G0 requiere la aceptación del aviso de privacidad por el cliente.");
  } else if (gate === "G1") {
    requirements(Array.from({ length: 11 }, (_, index) => `R${String(index + 1).padStart(2, "0")}`));
    const r11 = database.prepare("SELECT version_id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = 'R11'").get(id) as { version_id: string | null } | undefined;
    if (!r11?.version_id) throw new GateConflictError("G1 requiere el dictamen UVIE cargado.");
  } else if (gate === "G2") {
    for (const code of ["R01", "R07"]) {
      const row = database.prepare("SELECT status FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = ?").get(id, code) as { status: string } | undefined;
      if (!row || row.status !== "escaneo_verificado_idc") throw new GateConflictError(`G2 requiere el escaneo verificado de ${code}.`);
    }
    requireGateEvidence(id, "firma_presencial");
  } else if (gate === "G3") {
    requireGateEvidence(id, "ingreso_acuse");
  } else if (gate === "G4") {
    requireGateEvidence(id, "resolucion_cfe");
  } else if (gate === "G5") {
    requireGateEvidence(id, "contrato");
  } else if (gate === "G6") {
    requirements(Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`));
    requireGateEvidence(id, "uiie");
  } else if (gate === "G7") {
    requireGateEvidence(id, "medidor");
    requireGateEvidence(id, "cierre");
  }
}

function assertPreviousClosed(id: string, gate: GateCode): void {
  const index = GATES.indexOf(gate);
  if (index === 0) return;
  const previous = getDatabase().prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = ?").get(id, GATES[index - 1]) as { status: string } | undefined;
  if (previous?.status !== "cerrado") throw new GateConflictError(`Debe cerrarse ${GATES[index - 1]} antes de ${gate}.`);
}

export function listGates(user: AuthUser, expedienteId: string) {
  assertExpediente(user, expedienteId);
  return gateRows(expedienteId);
}

export function addExternalEvent(user: AuthUser, expedienteId: string, input: { eventType: ExternalEventType; eventDate?: string; description: string; documentId?: string }) {
  assertIdc(user);
  assertExpediente(user, expedienteId);
  if (!EVENT_TYPES.includes(input.eventType)) throw new GateValidationError("Tipo de evidencia externa inválido.");
  if (!input.description?.trim()) throw new GateValidationError("La descripción es obligatoria.");
  if (["firma_presencial", "ingreso_acuse", "resolucion_cfe", "contrato", "uiie", "medidor"].includes(input.eventType) && !input.documentId) {
    throw new GateValidationError("Esta evidencia requiere un documento escaneado.");
  }
  if (input.documentId) {
    const document = getDatabase().prepare("SELECT id, expediente_id FROM documents WHERE id = ?").get(input.documentId) as { id: string; expediente_id: string } | undefined;
    if (!document || document.expediente_id !== expedienteId) throw new GateValidationError("El documento de evidencia no pertenece al expediente.");
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  getDatabase().prepare("INSERT INTO external_events (id, expediente_id, event_type, event_date, description, document_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, expedienteId, input.eventType, input.eventDate ?? now, input.description.trim(), input.documentId ?? null, user.id, now);
  auditEvent({ actorId: user.id, actorRole: user.role, eventType: "evidencia_externa_registrada", entityType: "external_event", entityId: id, expedienteId, metadata: { event_type: input.eventType, document_id: input.documentId ?? null } });
  return { id, eventType: input.eventType };
}

export function transitionGate(user: AuthUser, expedienteId: string, gateCode: string, action: "close" | "reopen", reason?: string, requirementCodes: string[] = []) {
  assertIdc(user);
  assertExpediente(user, expedienteId);
  if (!GATES.includes(gateCode as GateCode)) throw new GateValidationError("Gate inválido.");
  const gate = gateCode as GateCode;
  const database = getDatabase();
  const current = database.prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = ?").get(expedienteId, gate) as { status: string } | undefined;
  if (!current) throw new Error("NOT_FOUND");
  if (action === "close") {
    if (current.status === "cerrado") throw new GateConflictError("El gate ya está cerrado.");
    assertPreviousClosed(expedienteId, gate);
    validateClose(expedienteId, gate);
    const now = new Date().toISOString();
    withTransaction(() => {
      database.prepare("UPDATE gates SET status = 'cerrado', closed_by = ?, closed_at = ?, reopened_at = NULL, reopen_reason = NULL WHERE expediente_id = ? AND gate_code = ?").run(user.id, now, expedienteId, gate);
      database.prepare("UPDATE gates SET status = 'abierto' WHERE expediente_id = ? AND gate_code = ? AND status = 'bloqueado'").run(expedienteId, GATES[GATES.indexOf(gate) + 1] ?? "");
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "cierre_gate", entityType: "gate", entityId: gate, expedienteId, metadata: { gate_code: gate } });
    });
  } else {
    if (!reason?.trim()) throw new GateValidationError("El motivo de reapertura es obligatorio.");
    if (current.status !== "cerrado") throw new GateConflictError("El gate no está cerrado.");
    if (gate === "G1" && requirementCodes.length === 0) throw new GateValidationError("Indica qué requisitos regresan a observación al reabrir G1.");
    const now = new Date().toISOString();
    withTransaction(() => {
      database.prepare("UPDATE gates SET status = 'abierto', reopened_at = ?, reopen_reason = ?, closed_by = NULL, closed_at = NULL WHERE expediente_id = ? AND gate_code = ?").run(now, reason.trim(), expedienteId, gate);
      database.prepare("UPDATE gates SET status = 'bloqueado' WHERE expediente_id = ? AND gate_code > ?").run(expedienteId, gate);
      if (gate === "G1") {
        const update = database.prepare("UPDATE expediente_requirements SET status = 'observado', observed_reason = ?, updated_at = ? WHERE expediente_id = ? AND requirement_code = ?");
        for (const code of requirementCodes) update.run(reason.trim(), now, expedienteId, code);
      }
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "reapertura_gate", entityType: "gate", entityId: gate, expedienteId, metadata: { gate_code: gate, reason: reason.trim() } });
    });
  }
  return gateRows(expedienteId);
}
