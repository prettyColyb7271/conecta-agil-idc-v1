import "server-only";

import crypto from "node:crypto";
import { getDatabase } from "@/lib/db/sqlite";
import { auditEvent, withTransaction, type AuthUser } from "@/lib/auth";
import { getExpediente } from "@/lib/data/expedientes";
import { REQUISITOS_POST_INSTALACION, REQUISITOS_PRE_FIRMA } from "@/lib/etapas";

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
const EVENT_TYPES = ["firma_presencial", "ingreso_acuse", "cfe_incompleto", "resolucion_cfe", "contrato", "uiie", "visita_uiie", "certificado_uiie", "medidor", "interconexion", "alta_comercial", "cierre"] as const;
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
  `).all(id).map((row) => {
    const item = row as { gate_code: string; status: string };
    if (item.gate_code !== "G4") return row;
    const event = getDatabase().prepare("SELECT vence_at, resultado FROM external_events WHERE expediente_id = ? AND event_type = 'resolucion_cfe' ORDER BY event_date DESC, created_at DESC, rowid DESC LIMIT 1").get(id) as { vence_at: string | null; resultado: string | null } | undefined;
    if (!event?.vence_at || event.resultado === "no_favorable") return { ...row as object, alert: null };
    const days = Math.ceil((Date.parse(event.vence_at) - Date.now()) / 86400000);
    return { ...row as object, alert: { level: days < 0 ? "roja" : days <= 10 ? "ambar" : null, days, vence_at: event.vence_at } };
  });
}

function requireGateEvidence(id: string, type: ExternalEventType): void {
  const event = getDatabase().prepare("SELECT id FROM external_events WHERE expediente_id = ? AND event_type = ? ORDER BY event_date DESC LIMIT 1").get(id, type);
  if (!event) throw new GateConflictError(`Falta la evidencia externa requerida: ${type}.`);
}

export function assertRequisitosIngreso(id: string): void {
  const rows = getDatabase().prepare("SELECT requirement_code, status FROM expediente_requirements WHERE expediente_id = ? AND requirement_code IN ('R10', 'R11')").all(id) as Array<{ requirement_code: string; status: string }>;
  const missing = REQUISITOS_POST_INSTALACION.filter((code) => !rows.some((row) => row.requirement_code === code && row.status === "validado_idc"));
  if (missing.length) throw new GateConflictError(`Antes de registrar el ingreso a CFE deben validarse: ${missing.join(", ")}.`);
}

export function marcarIngresoConAcuse(expedienteId: string, documentId: string | undefined, now: string): void {
  getDatabase().prepare("UPDATE expediente_requirements SET workflow_status = 'ingresado_con_acuse', updated_at = ? WHERE expediente_id = ? AND requirement_code IN ('R01', 'R07')").run(now, expedienteId);
  if (documentId) getDatabase().prepare("UPDATE documents SET status = 'ingresado_con_acuse', updated_at = ? WHERE id = ?").run(now, documentId);
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
    // Listo para la cita única de firma: no espera la instalación ni el dictamen UVIE.
    requirements([...REQUISITOS_PRE_FIRMA]);
  } else if (gate === "G2") {
    for (const code of ["R01", "R07"]) {
      const row = database.prepare("SELECT status FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = ?").get(id, code) as { status: string } | undefined;
      if (!row || row.status !== "escaneo_verificado_idc") throw new GateConflictError(`G2 requiere el escaneo verificado de ${code}.`);
    }
    requireGateEvidence(id, "firma_presencial");
  } else if (gate === "G3") {
    // Fotos del sistema funcionando y dictamen UVIE son requisito para ingresar a CFE.
    requirements([...REQUISITOS_POST_INSTALACION]);
    const r11 = database.prepare("SELECT version_id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = 'R11'").get(id) as { version_id: string | null } | undefined;
    if (!r11?.version_id) throw new GateConflictError("G3 requiere el dictamen UVIE cargado.");
    const event = getDatabase().prepare("SELECT medio, solicitud_numero FROM external_events WHERE expediente_id = ? AND event_type = 'ingreso_acuse' ORDER BY event_date DESC LIMIT 1").get(id) as { medio: string | null; solicitud_numero: string | null } | undefined;
    requireGateEvidence(id, "ingreso_acuse");
    if (!event?.medio || !event.solicitud_numero) throw new GateConflictError("G3 requiere medio y número de solicitud CFE.");
  } else if (gate === "G4") {
    requireGateEvidence(id, "resolucion_cfe");
    const event = getDatabase().prepare("SELECT vence_at, resultado, subgate_requerido, subgate_document_id FROM external_events WHERE expediente_id = ? AND event_type = 'resolucion_cfe' ORDER BY event_date DESC, created_at DESC, rowid DESC LIMIT 1").get(id) as { vence_at: string | null; resultado: string | null; subgate_requerido: number; subgate_document_id: string | null } | undefined;
    if (!event?.vence_at || !event.resultado) throw new GateConflictError("G4 requiere vigencia y resultado del oficio resolutivo.");
    if (event.resultado === "no_favorable") throw new GateConflictError("Un oficio no favorable no permite cerrar G4.");
    if (event.subgate_requerido && !event.subgate_document_id) throw new GateConflictError("G4 requiere la evidencia del estudio o aportación indicado por CFE.");
  } else if (gate === "G5") {
    requireGateEvidence(id, "contrato");
  } else if (gate === "G6") {
    requirements(Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`));
    requireGateEvidence(id, "uiie");
    requireGateEvidence(id, "certificado_uiie");
  } else if (gate === "G7") {
    requireGateEvidence(id, "medidor");
    requireGateEvidence(id, "interconexion");
    requireGateEvidence(id, "alta_comercial");
    requireGateEvidence(id, "cierre");
  }
}

function assertPreviousClosed(id: string, gate: GateCode): void {
  const index = GATES.indexOf(gate);
  if (index === 0) return;
  const previous = getDatabase().prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = ?").get(id, GATES[index - 1]) as { status: string } | undefined;
  if (previous?.status !== "cerrado") throw new GateConflictError(`Debe cerrarse ${GATES[index - 1]} antes de ${gate}.`);
}

function initializeUiieRequirements(id: string): void {
  const database = getDatabase();
  const reuse: Record<string, string> = { U01: "G4", U02: "R11", U03: "R08", U08: "R07", U10: "R03", U11: "R09", U16: "R07" };
  const now = new Date().toISOString();
  const expected = Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`);
  const catalog = database.prepare("SELECT code FROM requirement_catalog WHERE group_code = 'U'").all() as Array<{ code: string }>;
  if (expected.some((code) => !catalog.some((item) => item.code === code))) throw new GateConflictError("El catálogo UIIE está incompleto; no se puede abrir G6.");
  const insert = database.prepare("INSERT OR IGNORE INTO expediente_requirements (id, expediente_id, requirement_code, status, updated_at) VALUES (?, ?, ?, 'requerido', ?)");
  for (const code of expected) insert.run(crypto.randomUUID(), id, code, now);
  for (const [target, source] of Object.entries(reuse)) {
    const sourceRow = source === "G4"
      ? database.prepare("SELECT document_id FROM external_events WHERE expediente_id = ? AND event_type = 'resolucion_cfe' ORDER BY event_date DESC, created_at DESC, rowid DESC LIMIT 1").get(id) as { document_id: string | null } | undefined
      : database.prepare("SELECT document_id, version_id, status FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = ?").get(id, source) as { document_id: string | null; version_id: string | null; status: string } | undefined;
    if (!sourceRow) continue;
    const sourceDetails = sourceRow as { document_id: string | null; version_id?: string | null; status?: string };
    const versionId = source === "G4" ? null : sourceDetails.version_id ?? null;
    const sourceStatus = source === "G4" ? null : sourceDetails.status ?? null;
    const status = source === "G4" && sourceRow.document_id
      ? "validado_idc"
      : sourceStatus && ["validado_idc", "escaneo_verificado_idc", "no_aplica_justificado"].includes(sourceStatus) ? "validado_idc" : "requerido";
    database.prepare("UPDATE expediente_requirements SET document_id = ?, version_id = ?, status = ?, updated_at = ? WHERE expediente_id = ? AND requirement_code = ?").run(sourceRow.document_id ?? null, versionId, status, now, id, target);
  }
}

export function listGates(user: AuthUser, expedienteId: string) {
  assertExpediente(user, expedienteId);
  return gateRows(expedienteId);
}

export function addExternalEvent(user: AuthUser, expedienteId: string, input: { eventType: ExternalEventType; eventDate?: string; description: string; documentId?: string; medio?: string; solicitudNumero?: string; vigenciaMeses?: number; venceAt?: string; resultado?: "favorable" | "condicionado" | "no_favorable"; subgateRequerido?: boolean; subgateDocumentId?: string }) {
  assertIdc(user);
  assertExpediente(user, expedienteId);
  const expedienteStatus = getDatabase().prepare("SELECT status FROM expedientes WHERE id = ?").get(expedienteId) as { status: string } | undefined;
  if (expedienteStatus?.status === "cerrado") throw new GateConflictError("El expediente está cerrado.");
  if (!EVENT_TYPES.includes(input.eventType)) throw new GateValidationError("Tipo de evidencia externa inválido.");
  if (!input.description?.trim()) throw new GateValidationError("La descripción es obligatoria.");
  if (["firma_presencial", "ingreso_acuse", "resolucion_cfe", "contrato", "uiie", "certificado_uiie", "medidor", "interconexion", "alta_comercial"].includes(input.eventType) && !input.documentId) {
    throw new GateValidationError("Esta evidencia requiere un documento escaneado.");
  }
  if (input.eventType === "ingreso_acuse") assertRequisitosIngreso(expedienteId);
  if (input.documentId) {
    const document = getDatabase().prepare("SELECT id, expediente_id, source, document_type FROM documents WHERE id = ?").get(input.documentId) as { id: string; expediente_id: string; source: string; document_type: string } | undefined;
    if (!document || document.expediente_id !== expedienteId || document.source !== "externo" || document.document_type !== `evidencia:${input.eventType}`) throw new GateValidationError("El documento de evidencia debe ser externo y corresponder a este evento.");
  }
  if (input.eventType === "ingreso_acuse" && (!input.medio || !["ventanilla", "portal"].includes(input.medio) || !input.solicitudNumero)) throw new GateValidationError("El acuse requiere medio y número de solicitud CFE.");
  if (input.eventType === "resolucion_cfe" && (!input.venceAt && !input.vigenciaMeses || !input.resultado)) throw new GateValidationError("El oficio resolutivo requiere vigencia y resultado.");
  const now = new Date().toISOString();
  const expiresAt = input.venceAt ?? (input.vigenciaMeses && input.eventType === "resolucion_cfe"
    ? new Date(new Date(input.eventDate ?? now).getTime() + input.vigenciaMeses * 30 * 86400000).toISOString()
    : undefined);
  if (input.subgateDocumentId) {
    const subgate = getDatabase().prepare("SELECT expediente_id FROM documents WHERE id = ?").get(input.subgateDocumentId) as { expediente_id: string } | undefined;
    if (!subgate || subgate.expediente_id !== expedienteId) throw new GateValidationError("La evidencia del subgate no pertenece al expediente.");
  }
  const existingSignature = input.eventType === "firma_presencial" && input.documentId
    ? getDatabase().prepare("SELECT id FROM external_events WHERE expediente_id = ? AND event_type = 'firma_presencial' AND document_id = ? ORDER BY created_at DESC LIMIT 1").get(expedienteId, input.documentId) as { id: string } | undefined
    : undefined;
  const id = existingSignature?.id ?? crypto.randomUUID();
  const insertEvent = () => getDatabase().prepare("INSERT INTO external_events (id, expediente_id, event_type, event_date, description, document_id, created_by, created_at, medio, solicitud_numero, vigencia_meses, vence_at, resultado, subgate_requerido, subgate_document_id, reinicio_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, expedienteId, input.eventType, input.eventDate ?? now, input.description.trim(), input.documentId ?? null, user.id, now, input.medio ?? null, input.solicitudNumero ?? null, input.vigenciaMeses ?? null, expiresAt ?? null, input.resultado ?? null, input.subgateRequerido ? 1 : 0, input.subgateDocumentId ?? null, input.eventType === "cfe_incompleto" ? now : null);
  if (input.eventType === "cfe_incompleto") {
    withTransaction(() => {
      insertEvent();
      getDatabase().prepare("UPDATE gates SET status = 'abierto', closed_by = NULL, closed_at = NULL, reopened_at = ?, reopen_reason = ? WHERE expediente_id = ? AND gate_code = 'G1'").run(now, input.description.trim(), expedienteId);
      getDatabase().prepare("UPDATE gates SET status = 'bloqueado' WHERE expediente_id = ? AND gate_code >= 'G2'").run(expedienteId);
      getDatabase().prepare("UPDATE expediente_requirements SET status = 'observado', observed_reason = ?, validated_by = NULL, validated_at = NULL, workflow_status = NULL, updated_at = ? WHERE expediente_id = ? AND requirement_code LIKE 'R%'").run(input.description.trim(), now, expedienteId);
      const requirements = getDatabase().prepare("SELECT id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code LIKE 'R%'").all(expedienteId) as Array<{ id: string }>;
      const observation = getDatabase().prepare("INSERT INTO observations (id, expediente_id, requirement_id, author_id, visibility, body, created_at) VALUES (?, ?, ?, ?, 'cliente', ?, ?)");
      for (const requirement of requirements) observation.run(crypto.randomUUID(), expedienteId, requirement.id, user.id, input.description.trim(), now);
    });
  } else if (existingSignature) {
    getDatabase().prepare("UPDATE external_events SET event_date = ?, description = ? WHERE id = ?").run(input.eventDate ?? now, input.description.trim(), id);
  } else insertEvent();
  if (input.eventType === "ingreso_acuse") {
    marcarIngresoConAcuse(expedienteId, input.documentId, now);
  }
  auditEvent({ actorId: user.id, actorRole: user.role, eventType: existingSignature ? "evidencia_externa_actualizada" : "evidencia_externa_registrada", entityType: "external_event", entityId: id, expedienteId, metadata: { event_type: input.eventType, document_id: input.documentId ?? null } });
  return { id, eventType: input.eventType, reinicioAt: input.eventType === "cfe_incompleto" ? now : undefined };
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
    const expedienteStatus = database.prepare("SELECT status FROM expedientes WHERE id = ?").get(expedienteId) as { status: string } | undefined;
    if (expedienteStatus?.status === "cerrado") throw new GateConflictError("El expediente está cerrado.");
    if (current.status === "cerrado") throw new GateConflictError("El gate ya está cerrado.");
    assertPreviousClosed(expedienteId, gate);
    if (gate === "G7") {
      const owner = database.prepare("SELECT gestor_id FROM expedientes WHERE id = ?").get(expedienteId) as { gestor_id: string | null } | undefined;
      if (owner?.gestor_id === user.id) throw new GateConflictError("El cierre revisado requiere un Gestor IDC distinto del responsable.");
    }
    validateClose(expedienteId, gate);
    const now = new Date().toISOString();
    withTransaction(() => {
      database.prepare("UPDATE gates SET status = 'cerrado', closed_by = ?, closed_at = ?, reopened_at = NULL, reopen_reason = NULL WHERE expediente_id = ? AND gate_code = ?").run(user.id, now, expedienteId, gate);
      database.prepare("UPDATE gates SET status = 'abierto' WHERE expediente_id = ? AND gate_code = ? AND status = 'bloqueado'").run(expedienteId, GATES[GATES.indexOf(gate) + 1] ?? "");
      if (gate === "G5") initializeUiieRequirements(expedienteId);
      if (gate === "G7") database.prepare("UPDATE expedientes SET status = 'cerrado', updated_at = ? WHERE id = ?").run(now, expedienteId);
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
      if (gate === "G7") database.prepare("UPDATE expedientes SET status = 'activo', updated_at = ? WHERE id = ?").run(now, expedienteId);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "reapertura_gate", entityType: "gate", entityId: gate, expedienteId, metadata: { gate_code: gate, reason: reason.trim() } });
    });
  }
  return gateRows(expedienteId);
}
