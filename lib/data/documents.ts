import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { getAdapters } from "@/lib/adapters";
import { getDatabase } from "@/lib/db/sqlite";
import { auditEvent, withTransaction, type AuthUser } from "@/lib/auth";
import { getExpediente, type ScopeUser } from "@/lib/data/expedientes";
import { esPostInstalacion } from "@/lib/etapas";

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}
export class DocumentTooLargeError extends DocumentValidationError {}
export class DocumentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentConflictError";
  }
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const allowedTypes = new Map([
  ["application/pdf", { extension: "pdf", magic: (bytes: Buffer) => bytes.subarray(0, 5).toString() === "%PDF-" }],
  ["image/png", { extension: "png", magic: (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ["image/jpeg", { extension: "jpg", magic: (bytes: Buffer) => bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) }],
]);
const externalEventTypes = new Set(["firma_presencial", "ingreso_acuse", "resolucion_cfe", "contrato", "uiie", "certificado_uiie", "medidor", "interconexion", "alta_comercial"]);

type RequirementRow = { id: string; status: string; document_id: string | null; version_id: string | null; observed_reason: string | null; requirement_code: string; name: string; tipo: string; integra: string; sensible: number; validaciones: string; reutiliza_code?: string | null };
type DocumentRow = { id: string; requirement_id: string; status: string };

function assertVisible(user: ScopeUser, expedienteId: string): NonNullable<ReturnType<typeof getExpediente>> {
  const expediente = getExpediente(user, expedienteId);
  if (!expediente) throw new Error("NOT_FOUND");
  return expediente;
}

function isIdc(user: ScopeUser): boolean {
  return user.role === "coordinador_idc";
}

function assertOpenExpediente(expedienteId: string): void {
  const row = getDatabase().prepare("SELECT status FROM expedientes WHERE id = ?").get(expedienteId) as { status: string } | undefined;
  if (row?.status === "cerrado") throw new DocumentConflictError("El expediente está cerrado.");
}

function assertStructuredRequirement(dataJson: string, code: string): void {
  const data = JSON.parse(dataJson) as Record<string, Record<string, string> | undefined>;
  const contact = data.contacto ?? {};
  const representation = data.representacion ?? {};
  const service = data.servicio_actual ?? {};
  const applicant = data.solicitante ?? {};
  const complete = code === "U12"
    ? contact.nombre && contact.correo && contact.telefono
    : code === "U13"
      ? representation.enlace_cfe && representation.enlace_cfe_correo
      : code === "U17"
        ? service.rpu && service.tarifa && applicant.nombre_razon_social
        : true;
  if (!complete) throw new DocumentConflictError(`Faltan datos estructurados para ${code}.`);
}

function saneFilename(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 160);
  return clean || "documento";
}

function notifyClient(expedienteId: string, title: string, body: string): void {
  const database = getDatabase();
  const expediente = database.prepare("SELECT cliente_id FROM expedientes WHERE id = ?").get(expedienteId) as { cliente_id: string } | undefined;
  if (expediente) database.prepare("INSERT INTO notifications (id, user_id, expediente_id, type, priority, title, body, created_at) VALUES (?, ?, ?, ?, 'normal', ?, ?, ?)").run(crypto.randomUUID(), expediente.cliente_id, expedienteId, "documento", title, body, new Date().toISOString());
}

function notifyIdc(expedienteId: string, title: string, body: string): void {
  const database = getDatabase();
  const now = new Date().toISOString();
  const assignment = database.prepare("SELECT gestor_id FROM expedientes WHERE id = ?").get(expedienteId) as { gestor_id: string | null } | undefined;
  const idc = assignment?.gestor_id
    ? database.prepare("SELECT id FROM users WHERE id = ? AND role = 'coordinador_idc' AND status = 'activo'").all(assignment.gestor_id) as Array<{ id: string }>
    : database.prepare("SELECT id FROM users WHERE role = 'coordinador_idc' AND status = 'activo'").all() as Array<{ id: string }>;
  const insert = database.prepare("INSERT INTO notifications (id, user_id, expediente_id, type, priority, title, body, created_at) VALUES (?, ?, ?, 'documento', 'normal', ?, ?, ?)");
  for (const user of idc) insert.run(crypto.randomUUID(), user.id, expedienteId, title, body, now);
}

export async function uploadDocument(user: AuthUser, expedienteId: string, requirementCode: string, file: File, sourceVersionId?: string) {
  const expediente = assertVisible(user, expedienteId);
  assertOpenExpediente(expedienteId);
  if (user.role === "cliente") {
    const catalog = getDatabase().prepare("SELECT integra FROM requirement_catalog WHERE code = ?").get(requirementCode) as { integra: string } | undefined;
    if (!catalog || !["Cliente", "Cliente/IDC", "IDC/Cliente"].includes(catalog.integra)) throw new Error("FORBIDDEN");
  } else if (!isIdc(user)) throw new Error("FORBIDDEN");
  const gate = getDatabase().prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G1'").get(expedienteId) as { status: string } | undefined;
  const g6 = getDatabase().prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G6'").get(expedienteId) as { status: string } | undefined;
  const g3 = getDatabase().prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G3'").get(expedienteId) as { status: string } | undefined;
  const isSignedScan = Boolean(sourceVersionId);
  // Fotos y dictamen UVIE (R10-R11) se cargan después de la cita de firma, hasta el ingreso a CFE (G3).
  const postInstalacionAbierto = esPostInstalacion(requirementCode) && g3?.status !== "cerrado";
  if (gate?.status === "cerrado" && !isSignedScan && !postInstalacionAbierto && !(requirementCode.startsWith("U") && g6?.status === "abierto")) throw new Error("LOCKED");
  if (isSignedScan && !isIdc(user)) throw new Error("FORBIDDEN");
  const definition = allowedTypes.get(file.type);
  if (!definition) throw new DocumentValidationError("Solo se permiten archivos PDF, JPG o PNG.");
  if (file.size > MAX_FILE_BYTES) throw new DocumentTooLargeError("El archivo excede 20 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!definition.magic(bytes)) throw new DocumentValidationError("El contenido no coincide con un PDF, JPG o PNG válido.");
  const database = getDatabase();
  const requirement = database.prepare(`
    SELECT er.id, er.status, er.document_id, er.version_id, rc.code AS requirement_code, rc.name, rc.tipo, rc.integra, rc.sensible, rc.validaciones
    FROM expediente_requirements er JOIN requirement_catalog rc ON rc.code = er.requirement_code
    WHERE er.expediente_id = ? AND rc.code = ?
  `).get(expedienteId, requirementCode) as RequirementRow | undefined;
  if (!requirement) throw new Error("NOT_FOUND");
  const sourceVersion = sourceVersionId
    ? database.prepare("SELECT id, sha256, document_id FROM document_versions WHERE id = ?").get(sourceVersionId) as { id: string; sha256: string; document_id: string } | undefined
    : undefined;
  if (sourceVersionId && (!sourceVersion || sourceVersion.document_id !== requirement.document_id)) throw new DocumentValidationError("La versión de borrador no pertenece al requisito.");
  if (sourceVersionId && requirement.status !== "pendiente_firma_presencial") throw new DocumentConflictError("El formato no está listo para recibir un escaneo firmado.");
  const document = requirement.document_id
    ? database.prepare("SELECT id, requirement_id, status FROM documents WHERE id = ?").get(requirement.document_id) as DocumentRow | undefined
    : undefined;
  const versionNumber = document ? Number((database.prepare("SELECT COALESCE(MAX(version_number), 0) AS n FROM document_versions WHERE document_id = ?").get(document.id) as { n: number }).n) + 1 : 1;
  const documentId = document?.id ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const storageKey = `${documentId}/${versionId}.${definition.extension}`;
  const adapters = await getAdapters();
  const stored = await adapters.storage.put(bytes, { storageKey, filename: saneFilename(file.name), mimeType: file.type });
  const now = new Date().toISOString();
  try {
    withTransaction(() => {
      if (!document) database.prepare("INSERT INTO documents (id, expediente_id, requirement_id, document_type, source, sensitivity, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'cargado', ?, ?, ?)").run(documentId, expedienteId, requirement.id, requirementCode, isIdc(user) ? "idc" : "cliente", requirement.sensible ? "sensible" : "normal", user.id, now, now);
      else database.prepare("UPDATE documents SET status = ?, updated_at = ? WHERE id = ?").run(sourceVersion ? "escaneo_recibido" : "cargado", now, documentId);
      database.prepare("INSERT INTO document_versions (id, document_id, version_number, storage_key, original_filename, mime_type, size_bytes, sha256, author_id, origin, change_reason, source_version_id, derived_from_version_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'carga', ?, ?, ?, ?)").run(versionId, documentId, versionNumber, stored.storageKey, stored.filename, stored.mimeType, stored.sizeBytes, stored.sha256, user.id, sourceVersion ? "escaneo_firmado" : (requirement.status === "validado_idc" ? "invalidado_por_cambio" : null), sourceVersion?.id ?? null, sourceVersion?.id ?? null, now);
      database.prepare("UPDATE expediente_requirements SET status = ?, document_id = ?, version_id = ?, observed_reason = NULL, updated_at = ? WHERE id = ?").run(sourceVersion ? "escaneo_recibido" : "cargado", documentId, versionId, now, requirement.id);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "carga_documento", entityType: "document_version", entityId: versionId, expedienteId, metadata: { requirement_code: requirementCode, sha256: stored.sha256, size_bytes: stored.sizeBytes } });
      notifyIdc(expedienteId, "Documento recibido", `${requirementCode} fue cargado en ${expediente.folio}.`);
    });
  } catch (error) {
    await adapters.storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
  return { documentId, versionId, versionNumber, sha256: stored.sha256, sizeBytes: stored.sizeBytes, status: sourceVersion ? "escaneo_recibido" : "cargado" };
}

export async function uploadExternalEvidence(user: AuthUser, expedienteId: string, eventType: string, file: File, event: { eventDate?: string; description: string; medio?: string; solicitudNumero?: string; vigenciaMeses?: number; venceAt?: string; resultado?: "favorable" | "condicionado" | "no_favorable"; subgateRequerido?: boolean }) {
  if (!isIdc(user)) throw new Error("FORBIDDEN");
  const expediente = assertVisible(user, expedienteId);
  assertOpenExpediente(expedienteId);
  if (!externalEventTypes.has(eventType)) throw new DocumentValidationError("Tipo de evidencia externa inválido.");
  if (!event.description?.trim()) throw new DocumentValidationError("La descripción es obligatoria.");
  if (eventType === "ingreso_acuse" && (!event.medio || !["ventanilla", "portal"].includes(event.medio) || !event.solicitudNumero)) throw new DocumentValidationError("El acuse requiere medio y número de solicitud CFE.");
  if (eventType === "resolucion_cfe" && ((!event.venceAt && !event.vigenciaMeses) || !event.resultado)) throw new DocumentValidationError("El oficio resolutivo requiere vigencia y resultado.");
  const definition = allowedTypes.get(file.type);
  if (!definition) throw new DocumentValidationError("Solo se permiten archivos PDF, JPG o PNG.");
  if (file.size > MAX_FILE_BYTES) throw new DocumentTooLargeError("El archivo excede 20 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!definition.magic(bytes)) throw new DocumentValidationError("El contenido no coincide con un PDF, JPG o PNG válido.");
  const database = getDatabase();
  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const storageKey = `${documentId}/${versionId}.${definition.extension}`;
  const adapters = await getAdapters();
  const stored = await adapters.storage.put(bytes, { storageKey, filename: saneFilename(file.name), mimeType: file.type });
  const now = new Date().toISOString();
  const eventDate = event.eventDate ?? now;
  const expiresAt = event.venceAt ?? (event.vigenciaMeses && eventType === "resolucion_cfe" ? new Date(new Date(eventDate).getTime() + event.vigenciaMeses * 30 * 86400000).toISOString() : null);
  let eventId = "";
  try {
    withTransaction(() => {
      database.prepare("INSERT INTO documents (id, expediente_id, requirement_id, document_type, source, sensitivity, status, created_by, created_at, updated_at) VALUES (?, ?, NULL, ?, 'externo', 'normal', 'cargado', ?, ?, ?)").run(documentId, expedienteId, `evidencia:${eventType}`, user.id, now, now);
      database.prepare("INSERT INTO document_versions (id, document_id, version_number, storage_key, original_filename, mime_type, size_bytes, sha256, author_id, origin, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 'carga', ?)").run(versionId, documentId, stored.storageKey, stored.filename, stored.mimeType, stored.sizeBytes, stored.sha256, user.id, now);
      eventId = crypto.randomUUID();
      database.prepare("INSERT INTO external_events (id, expediente_id, event_type, event_date, description, document_id, created_by, created_at, medio, solicitud_numero, vigencia_meses, vence_at, resultado, subgate_requerido, reinicio_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(eventId, expedienteId, eventType, eventDate, event.description.trim(), documentId, user.id, now, event.medio ?? null, event.solicitudNumero ?? null, event.vigenciaMeses ?? null, expiresAt, event.resultado ?? null, event.subgateRequerido ? 1 : 0, null);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "evidencia_externa_registrada", entityType: "external_event", entityId: eventId, expedienteId, metadata: { event_type: eventType, document_id: documentId, sha256: stored.sha256 } });
    });
  } catch (error) {
    await adapters.storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
  return { documentId, versionId, eventId, eventType, eventDate, sha256: stored.sha256, sizeBytes: stored.sizeBytes, folio: expediente.folio };
}

export function verifyScannedDocument(user: AuthUser, expedienteId: string, requirementCode: string, versionId: string) {
  if (!isIdc(user)) throw new Error("FORBIDDEN");
  assertVisible(user, expedienteId);
  const database = getDatabase();
  const row = database.prepare(`
    SELECT er.id AS requirement_id, er.status, dv.id, dv.author_id, dv.source_version_id, d.id AS document_id
    FROM expediente_requirements er JOIN document_versions dv ON dv.id = er.version_id
    JOIN documents d ON d.id = dv.document_id
    WHERE er.expediente_id = ? AND er.requirement_code = ? AND dv.id = ?
  `).get(expedienteId, requirementCode, versionId) as { requirement_id: string; status: string; id: string; author_id: string; source_version_id: string | null; document_id: string } | undefined;
  if (!row) throw new Error("NOT_FOUND");
  if (row.status !== "escaneo_recibido" || !row.source_version_id) throw new DocumentConflictError("No hay un escaneo firmado pendiente de verificación.");
  if (row.author_id === user.id) throw new DocumentConflictError("No puedes verificar un escaneo que tú mismo subiste.");
  const now = new Date().toISOString();
  withTransaction(() => {
    database.prepare("UPDATE expediente_requirements SET status = 'escaneo_verificado_idc', updated_at = ? WHERE id = ?").run(now, row.requirement_id);
    database.prepare("UPDATE documents SET status = 'escaneo_verificado_idc', updated_at = ? WHERE id = ?").run(now, row.document_id);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "verificacion_escaneo", entityType: "document_version", entityId: versionId, expedienteId, metadata: { requirement_code: requirementCode, source_version_id: row.source_version_id } });
  });
  return { status: "escaneo_verificado_idc", versionId };
}

export async function downloadDocument(user: AuthUser, documentId: string, versionId?: string) {
  const database = getDatabase();
  const document = database.prepare("SELECT id, expediente_id, requirement_id FROM documents WHERE id = ?").get(documentId) as { id: string; expediente_id: string; requirement_id: string } | undefined;
  if (!document) throw new Error("NOT_FOUND");
  const expediente = assertVisible(user, document.expediente_id);
  if (!isIdc(user) && versionId) throw new Error("FORBIDDEN");
  const version = database.prepare("SELECT * FROM document_versions WHERE document_id = ? AND (? IS NULL OR id = ?) ORDER BY version_number DESC LIMIT 1").get(documentId, versionId ?? null, versionId ?? null) as { id: string; storage_key: string; original_filename: string; mime_type: string; size_bytes: number; sha256: string } | undefined;
  if (!version) throw new Error("NOT_FOUND");
  const adapters = await getAdapters();
  const file = await fs.readFile(await adapters.storage.getPath(version.storage_key));
  auditEvent({ actorId: user.id, actorRole: user.role, eventType: "descarga_documento", entityType: "document_version", entityId: version.id, expedienteId: expediente.id, metadata: { sha256: version.sha256, size_bytes: version.size_bytes } });
  return { file, filename: saneFilename(version.original_filename), mimeType: version.mime_type, sha256: version.sha256 };
}

export function listRequirementReview(user: AuthUser, expedienteId: string) {
  assertVisible(user, expedienteId);
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT er.id, er.requirement_code, er.status, er.document_id, er.version_id, er.observed_reason,
           rc.name, rc.tipo, rc.integra, rc.sensible, rc.validaciones, rc.reutiliza_code
    FROM expediente_requirements er JOIN requirement_catalog rc ON rc.code = er.requirement_code
    WHERE er.expediente_id = ? AND (er.requirement_code LIKE 'R%' OR er.requirement_code LIKE 'U%') ORDER BY er.requirement_code
  `).all(expedienteId) as RequirementRow[];
  return rows.map((row) => ({
    ...row,
    observed_reason: isIdc(user) ? row.observed_reason : null,
    versions: row.document_id ? database.prepare("SELECT id, version_number, original_filename, size_bytes, sha256, change_reason, created_at FROM document_versions WHERE document_id = ? ORDER BY version_number DESC").all(row.document_id) : [],
    observations: database.prepare("SELECT id, visibility, body, created_at FROM observations WHERE requirement_id = ? AND (visibility = 'cliente' OR ? = 1) ORDER BY created_at DESC").all(row.id, isIdc(user) ? 1 : 0) as Array<{ id: string; visibility: "cliente" | "interno_idc"; body: string; created_at: string }>,
  }));
}

export function reviewRequirement(user: AuthUser, expedienteId: string, requirementCode: string, action: "validate" | "observe" | "not_applicable", reason?: string, visibility: "cliente" | "interno_idc" = "cliente") {
  if (!isIdc(user)) throw new Error("FORBIDDEN");
  const expediente = assertVisible(user, expedienteId);
  if ((action !== "validate" && !reason?.trim()) || (action === "not_applicable" && !reason?.trim())) throw new DocumentValidationError("El motivo es obligatorio.");
  if (visibility !== "cliente" && visibility !== "interno_idc") throw new DocumentValidationError("Visibilidad inválida.");
  const database = getDatabase();
  assertOpenExpediente(expedienteId);
  const gate = database.prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G1'").get(expedienteId) as { status: string } | undefined;
  const g6 = database.prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G6'").get(expedienteId) as { status: string } | undefined;
  const g3 = database.prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G3'").get(expedienteId) as { status: string } | undefined;
  const postInstalacionAbierto = esPostInstalacion(requirementCode) && g3?.status !== "cerrado";
  if (requirementCode.startsWith("R") && gate?.status === "cerrado" && !postInstalacionAbierto) throw new DocumentConflictError("La revisión está bloqueada porque G1 está cerrado.");
  if (requirementCode.startsWith("U") && g6?.status !== "abierto") throw new DocumentConflictError("La revisión UIIE solo está disponible con G6 abierto.");
  const requirement = database.prepare("SELECT er.id, er.status, er.version_id, dv.author_id FROM expediente_requirements er LEFT JOIN document_versions dv ON dv.id = er.version_id WHERE er.expediente_id = ? AND er.requirement_code = ?").get(expedienteId, requirementCode) as { id: string; status: string; version_id: string | null; author_id: string | null } | undefined;
  if (!requirement) throw new Error("NOT_FOUND");
  if (action === "validate" && ["U12", "U13", "U17"].includes(requirementCode)) {
    const row = database.prepare("SELECT data_json FROM expedientes WHERE id = ?").get(expedienteId) as { data_json: string };
    assertStructuredRequirement(row.data_json, requirementCode);
  }
  if (action === "validate" && !requirement.version_id && !["U12", "U13", "U17"].includes(requirementCode)) throw new DocumentConflictError("No hay documento cargado para validar.");
  if (action === "validate" && requirement.author_id === user.id) throw new DocumentConflictError("No puedes validar un documento que tú mismo subiste.");
  const internalNote = action === "observe" && visibility === "interno_idc";
  const status = internalNote ? requirement.status : action === "validate" ? "validado_idc" : action === "observe" ? "observado" : "no_aplica_justificado";
  // node:sqlite no acepta undefined como parámetro; validar no lleva motivo.
  const visibleReason = visibility === "cliente" ? reason ?? null : null;
  const now = new Date().toISOString();
  withTransaction(() => {
    database.prepare("UPDATE expediente_requirements SET status = ?, observed_reason = ?, validated_by = ?, validated_at = ?, updated_at = ? WHERE id = ?").run(status, visibleReason, action === "validate" ? user.id : null, action === "validate" ? now : null, now, requirement.id);
    if (action !== "validate") database.prepare("INSERT INTO observations (id, expediente_id, requirement_id, author_id, visibility, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), expedienteId, requirement.id, user.id, visibility, reason, now);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: action === "validate" ? "validacion_requisito" : action === "observe" ? "observacion_requisito" : "no_aplica_requisito", entityType: "expediente_requirement", entityId: requirement.id, expedienteId, metadata: { requirement_code: requirementCode, visibility } });
    if (visibility === "cliente") notifyClient(expedienteId, action === "validate" ? "Requisito validado" : "Requisito observado", `${requirementCode} fue actualizado en ${expediente.folio}.`);
  });
  return { status };
}
