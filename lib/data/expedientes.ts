import "server-only";

import crypto from "node:crypto";
import { getDatabase } from "@/lib/db/sqlite";
import { auditEvent, withTransaction, type AuthUser } from "@/lib/auth";

export type ScopeUser = Pick<AuthUser, "id" | "role">;
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const ALLOWED_TRAMITES = ["interconexion_fv_mt", "aprobacion_proyecto_mt", "contratacion_medidor"] as const;

export type ExpedienteInput = {
  clienteId: string;
  tramite: string;
  nivelTension: "BT" | "MT";
  habilitado: boolean;
  responsableId?: string;
};

export type ExpedienteData = {
  solicitante?: {
    tipo_persona?: "fisica" | "moral";
    nombre_razon_social?: string;
    rfc?: string;
    domicilio?: Record<string, string>;
    telefono?: string;
    correo?: string;
  };
  contacto?: { nombre?: string; puesto?: string; domicilio?: Record<string, string>; telefono?: string; correo?: string };
  servicio_actual?: { rpu?: string; nivel_tension_suministro?: string; tarifa?: string };
  central?: {
    tecnologia?: string;
    capacidad_bruta_kw?: number;
    capacidad_incrementar_kw?: number | null;
    generacion_mensual_kwh?: number;
    unidades?: number;
    utm?: Array<{ x: number; y: number }>;
    modalidad?: string;
    fecha_estimada_operacion?: string;
  };
  representacion?: { apoderado_id?: string; testigos?: string[] };
};

export type ExpedienteView = {
  id: string;
  folio: string;
  tramite: string;
  nivel_tension: "BT" | "MT";
  habilitado: number;
  cliente_id: string;
  cliente_nombre: string;
  gestor_id: string | null;
  gestor_nombre: string | null;
  coordinador_id: string | null;
  status: string;
  data_json: string;
  created_at: string;
  updated_at: string;
  gates: Array<{ gate_code: string; status: string }>;
  requirements: Array<{ requirement_code: string; name: string; status: string }>;
  assignments: Array<{ user_id: string; display_name: string; assignment_type: string; starts_at: string; ends_at: string | null }>;
};

function assertCanRead(user: ScopeUser): void {
  if (user.role === "admin_seguridad") throw new Error("FORBIDDEN");
  if (!["cliente", "coordinador_idc"].includes(user.role)) throw new Error("FORBIDDEN");
}

function visibleWhere(user: ScopeUser): { sql: string; params: string[] } {
  assertCanRead(user);
  if (user.role === "coordinador_idc") return { sql: "1 = 1", params: [] };
  if (user.role === "cliente") return { sql: "e.cliente_id = ?", params: [user.id] };
  throw new Error("FORBIDDEN");
}

function rowsFor(user: ScopeUser, id?: string) {
  const scope = visibleWhere(user);
  const condition = id ? `${scope.sql} AND e.id = ?` : scope.sql;
  const params = id ? [...scope.params, id] : scope.params;
  return getDatabase().prepare(`
    SELECT e.*, cu.display_name AS cliente_nombre, gu.display_name AS gestor_nombre
    FROM expedientes e
    JOIN users cu ON cu.id = e.cliente_id
    LEFT JOIN users gu ON gu.id = e.gestor_id
    WHERE ${condition}
    ORDER BY e.created_at DESC
  `).all(...params).map((row) => ({ ...(row as ExpedienteView) })) as ExpedienteView[];
}

function enrich(row: ExpedienteView): ExpedienteView {
  const database = getDatabase();
  const gates = database.prepare("SELECT gate_code, status FROM gates WHERE expediente_id = ? ORDER BY gate_code").all(row.id) as ExpedienteView["gates"];
  const requirements = database.prepare(`
    SELECT er.requirement_code, rc.name, er.status
    FROM expediente_requirements er JOIN requirement_catalog rc ON rc.code = er.requirement_code
    WHERE er.expediente_id = ? ORDER BY er.requirement_code
  `).all(row.id) as ExpedienteView["requirements"];
  const assignments = database.prepare(`
    SELECT ea.user_id, u.display_name, ea.assignment_type, ea.starts_at, ea.ends_at
    FROM expediente_assignments ea JOIN users u ON u.id = ea.user_id
    WHERE ea.expediente_id = ? ORDER BY ea.starts_at
  `).all(row.id) as ExpedienteView["assignments"];
  return { ...row, gates: gates.map((item) => ({ ...item })), requirements: requirements.map((item) => ({ ...item })), assignments: assignments.map((item) => ({ ...item })) };
}

export function listExpedientes(user: ScopeUser): ExpedienteView[] {
  return rowsFor(user).map(enrich);
}

export function getExpediente(user: ScopeUser, id: string): ExpedienteView | null {
  const row = rowsFor(user, id)[0];
  return row ? enrich(row) : null;
}

export function listActiveClients(user: ScopeUser) {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
  return getDatabase().prepare("SELECT id, display_name, email FROM users WHERE role = 'cliente' AND status = 'activo' ORDER BY display_name").all();
}

export function listActiveResponsables(user: ScopeUser) {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
  return getDatabase().prepare("SELECT id, display_name, email FROM users WHERE role = 'coordinador_idc' AND status = 'activo' ORDER BY email").all();
}

export type GestorPending = {
  kind: "requisito" | "sin_responsable" | "observado" | "listo_g1";
  expedienteId: string;
  folio: string;
  requirementCode?: string;
  label: string;
};

export function listGestorPendientes(user: ScopeUser, scope: "mine" | "all" = "all"): GestorPending[] {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
  const database = getDatabase();
  const assignmentFilter = scope === "mine" ? "AND e.gestor_id = ?" : "";
  const params = scope === "mine" ? [user.id] : [];
  const pending: GestorPending[] = [];
  const loaded = database.prepare(`
    SELECT e.id AS expediente_id, e.folio, er.requirement_code
    FROM expedientes e JOIN expediente_requirements er ON er.expediente_id = e.id
    WHERE er.status IN ('cargado', 'en_revision_idc') ${assignmentFilter}
    ORDER BY e.folio, er.requirement_code
  `).all(...params) as Array<{ expediente_id: string; folio: string; requirement_code: string }>;
  for (const item of loaded) pending.push({ kind: "requisito", expedienteId: item.expediente_id, folio: item.folio, requirementCode: item.requirement_code, label: `${item.requirement_code} está cargado y requiere revisión IDC.` });
  const unassigned = database.prepare(`
    SELECT e.id AS expediente_id, e.folio
    FROM expedientes e
    WHERE NOT EXISTS (
      SELECT 1 FROM expediente_assignments ea JOIN users u ON u.id = ea.user_id
      WHERE ea.expediente_id = e.id AND ea.assignment_type = 'coordinador_idc' AND ea.ends_at IS NULL AND u.status = 'activo'
    ) ${assignmentFilter}
    ORDER BY e.folio
  `).all(...params) as Array<{ expediente_id: string; folio: string }>;
  for (const item of unassigned) pending.push({ kind: "sin_responsable", expedienteId: item.expediente_id, folio: item.folio, label: "Expediente sin responsable IDC activo." });
  const observed = database.prepare(`
    SELECT e.id AS expediente_id, e.folio, er.requirement_code
    FROM expedientes e JOIN expediente_requirements er ON er.expediente_id = e.id
    WHERE er.status = 'observado' ${assignmentFilter}
    ORDER BY e.folio, er.requirement_code
  `).all(...params) as Array<{ expediente_id: string; folio: string; requirement_code: string }>;
  for (const item of observed) pending.push({ kind: "observado", expedienteId: item.expediente_id, folio: item.folio, requirementCode: item.requirement_code, label: `${item.requirement_code} está observado y espera al cliente.` });
  const ready = database.prepare(`
    SELECT e.id AS expediente_id, e.folio
    FROM expedientes e
    WHERE ${scope === "mine" ? "e.gestor_id = ? AND" : ""} (
      SELECT COUNT(*) FROM expediente_requirements er WHERE er.expediente_id = e.id AND er.requirement_code BETWEEN 'R01' AND 'R11'
        AND er.status IN ('validado_idc', 'no_aplica_justificado')
    ) = 11
    ORDER BY e.folio
  `).all(...params) as Array<{ expediente_id: string; folio: string }>;
  for (const item of ready) pending.push({ kind: "listo_g1", expedienteId: item.expediente_id, folio: item.folio, label: "Listo para cerrar G1." });
  return pending;
}

const sectionFields: Record<string, readonly string[]> = {
  solicitante: ["tipo_persona", "nombre_razon_social", "rfc", "domicilio", "telefono", "correo"],
  servicio_actual: ["rpu", "nivel_tension_suministro", "tarifa"],
  central: ["tecnologia", "capacidad_bruta_kw", "capacidad_incrementar_kw", "generacion_mensual_kwh", "unidades", "utm", "modalidad", "fecha_estimada_operacion"],
  contacto: ["nombre", "puesto", "domicilio", "telefono", "correo"],
  representacion: ["apoderado_id", "testigos"],
};
const addressFields = ["calle", "num_exterior", "num_interior", "colonia", "cp", "municipio", "estado"] as const;

function assertText(value: unknown, field: string): void {
  if (typeof value !== "string") throw new ValidationError(`${field} debe ser texto.`);
  if (value.length > 300) throw new ValidationError(`${field} no puede exceder 300 caracteres.`);
}

function validateData(data: ExpedienteData): void {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ValidationError("Los datos del expediente deben ser un objeto.");
  const sections = data as Record<string, unknown>;
  for (const section of Object.keys(sections)) {
    if (!sectionFields[section]) throw new ValidationError(`Sección no permitida: ${section}.`);
    const value = sections[section];
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError(`${section} debe ser un objeto.`);
    for (const field of Object.keys(value)) {
      if (!sectionFields[section].includes(field)) throw new ValidationError(`Campo no permitido: ${section}.${field}.`);
      const fieldValue = (value as Record<string, unknown>)[field];
      if (field === "domicilio") {
        if (!fieldValue || typeof fieldValue !== "object" || Array.isArray(fieldValue)) throw new ValidationError(`${section}.domicilio debe ser un objeto.`);
        for (const addressField of Object.keys(fieldValue)) {
          if (!addressFields.includes(addressField as typeof addressFields[number])) throw new ValidationError(`Campo no permitido: ${section}.domicilio.${addressField}.`);
          assertText((fieldValue as Record<string, unknown>)[addressField], `${section}.domicilio.${addressField}`);
        }
      } else if (field === "utm" || field === "testigos") {
        if (!Array.isArray(fieldValue)) throw new ValidationError(`${section}.${field} debe ser una lista.`);
        if (field === "testigos" && fieldValue.some((item) => typeof item !== "string")) throw new ValidationError("representacion.testigos debe contener texto.");
        if (field === "testigos") fieldValue.forEach((item, index) => assertText(item, `representacion.testigos[${index}]`));
      } else if (typeof fieldValue === "string") {
        assertText(fieldValue, `${section}.${field}`);
      }
    }
  }
  const errors: string[] = [];
  const person = data.solicitante;
  const service = data.servicio_actual;
  const central = data.central;
  if (!person?.tipo_persona || !person.nombre_razon_social?.trim() || !person.rfc?.trim()) errors.push("tipo_persona, nombre_razon_social y RFC son requeridos.");
  if (!person?.rfc || !/^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(person.rfc.toUpperCase())) errors.push("RFC inválido: debe tener 12 o 13 caracteres.");
  if (!service?.rpu?.trim()) errors.push("RPU es requerido.");
  else if (!/^\d+$/.test(service.rpu)) errors.push("RPU inválido: debe ser numérico.");
  if (central?.capacidad_bruta_kw === undefined || !Number.isFinite(central.capacidad_bruta_kw) || central.capacidad_bruta_kw <= 0) errors.push("La capacidad_bruta_kw debe ser mayor que cero.");
  if (errors.length) throw new ValidationError(errors.join(" "));
}

export function updateExpedienteData(user: ScopeUser, id: string, data: ExpedienteData) {
  if (user.role !== "cliente") throw new Error("FORBIDDEN");
  const current = getExpediente(user, id);
  if (!current) throw new Error("NOT_FOUND");
  const gate = getDatabase().prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G1'").get(id) as { status: string } | undefined;
  if (gate?.status === "cerrado") throw new Error("LOCKED");
  validateData(data);
  const before = JSON.parse(current.data_json) as Record<string, unknown>;
  const changedFields = Object.keys(data).filter((key) => JSON.stringify(before[key]) !== JSON.stringify((data as Record<string, unknown>)[key]));
  const now = new Date().toISOString();
  getDatabase().prepare("UPDATE expedientes SET data_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), now, id);
  if (JSON.stringify(before.central) !== JSON.stringify(data.central)) {
    const generated = getDatabase().prepare(`
      SELECT er.id, er.document_id FROM expediente_requirements er
      JOIN documents d ON d.id = er.document_id
      WHERE er.expediente_id = ? AND er.requirement_code = 'R01' AND d.source = 'generado'
    `).get(id) as { id: string; document_id: string } | undefined;
    if (generated) {
      getDatabase().prepare("UPDATE expediente_requirements SET status = 'invalidado_por_cambio', updated_at = ? WHERE id = ?").run(now, generated.id);
      getDatabase().prepare("UPDATE documents SET status = 'invalidado_por_cambio', updated_at = ? WHERE id = ?").run(now, generated.document_id);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "invalidacion_formato_por_cambio", entityType: "document", entityId: generated.document_id, expedienteId: id, metadata: { requirement_code: "R01", reason: "cambio_datos_materiales" } });
    }
  }
  auditEvent({ actorId: user.id, actorRole: user.role, eventType: "captura_datos", entityType: "expediente", entityId: id, expedienteId: id, metadata: { changed_fields: changedFields } });
  return getExpediente(user, id);
}

export function createExpediente(user: ScopeUser, input: ExpedienteInput) {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
  if (!ALLOWED_TRAMITES.includes(input.tramite as typeof ALLOWED_TRAMITES[number])) throw new ValidationError("Trámite no permitido.");
  if (input.nivelTension !== "BT" && input.nivelTension !== "MT") throw new ValidationError("nivelTension debe ser BT o MT.");
  const database = getDatabase();
  const now = new Date().toISOString();
  return withTransaction(() => {
    const client = database.prepare("SELECT id, display_name FROM users WHERE id = ? AND role = 'cliente' AND status = 'activo'").get(input.clienteId) as { id: string; display_name: string } | undefined;
    if (!client) throw new Error("CLIENT_NOT_FOUND");
    if (input.responsableId) {
      const responsable = database.prepare("SELECT id FROM users WHERE id = ? AND role = 'coordinador_idc' AND status = 'activo'").get(input.responsableId);
      if (!responsable) throw new Error("RESPONSABLE_NOT_FOUND");
    }
    const year = new Date().getUTCFullYear();
    const last = database.prepare("SELECT COALESCE(MAX(CAST(substr(folio, 10) AS INTEGER)), 0) AS sequence FROM expedientes WHERE folio LIKE ?").get(`IDC-${year}-%`) as { sequence: number };
    const id = crypto.randomUUID();
    const folio = `IDC-${year}-${String(Number(last.sequence) + 1).padStart(4, "0")}`;
    const responsibleId = input.responsableId ?? user.id;
    database.prepare(`
      INSERT INTO expedientes (id, folio, tramite, nivel_tension, habilitado, cliente_id, gestor_id, coordinador_id, status, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'borrador', '{}', ?, ?)
    `).run(id, folio, input.tramite, input.nivelTension, input.habilitado ? 1 : 0, input.clienteId, responsibleId, user.id, now, now);
    database.prepare("INSERT INTO expediente_assignments (id, expediente_id, user_id, assignment_type, assigned_by, starts_at, created_at) VALUES (?, ?, ?, 'cliente', ?, ?, ?)").run(crypto.randomUUID(), id, input.clienteId, user.id, now, now);
    database.prepare("INSERT INTO expediente_assignments (id, expediente_id, user_id, assignment_type, assigned_by, starts_at, created_at) VALUES (?, ?, ?, 'coordinador_idc', ?, ?, ?)").run(crypto.randomUUID(), id, responsibleId, user.id, now, now);
    const requirements = database.prepare("SELECT code FROM requirement_catalog WHERE group_code = 'R' ORDER BY code").all() as Array<{ code: string }>;
    const insertRequirement = database.prepare("INSERT INTO expediente_requirements (id, expediente_id, requirement_code, status, updated_at) VALUES (?, ?, ?, 'requerido', ?)");
    for (const requirement of requirements) insertRequirement.run(crypto.randomUUID(), id, requirement.code, now);
    const insertGate = database.prepare("INSERT INTO gates (id, expediente_id, gate_code, status, created_at) VALUES (?, ?, ?, ?, ?)");
    for (let index = 0; index <= 7; index += 1) insertGate.run(crypto.randomUUID(), id, `G${index}`, index === 0 ? "abierto" : "bloqueado", now);
    database.prepare("INSERT INTO notifications (id, user_id, expediente_id, type, priority, title, body, created_at) VALUES (?, ?, ?, 'expediente_creado', 'normal', ?, ?, ?)").run(crypto.randomUUID(), input.clienteId, id, "Expediente creado", `Tu expediente ${folio} fue creado por IDC.`, now);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "alta_expediente", entityType: "expediente", entityId: id, expedienteId: id, metadata: { folio, cliente_id: input.clienteId, tramite: input.tramite, nivel_tension: input.nivelTension } });
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "asignacion_responsable_idc", entityType: "expediente_assignment", entityId: id, expedienteId: id, metadata: { responsable_id: responsibleId } });
    return getExpediente(user, id);
  });
}

export function assignResponsable(user: ScopeUser, id: string, responsableId: string) {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
  const database = getDatabase();
  const now = new Date().toISOString();
  return withTransaction(() => {
    const expediente = database.prepare("SELECT id, folio, gestor_id FROM expedientes WHERE id = ?").get(id) as { id: string; folio: string; gestor_id: string | null } | undefined;
    const responsable = database.prepare("SELECT id, display_name FROM users WHERE id = ? AND role = 'coordinador_idc' AND status = 'activo'").get(responsableId) as { id: string; display_name: string } | undefined;
    if (!expediente) throw new Error("NOT_FOUND");
    if (!responsable) throw new Error("RESPONSABLE_NOT_FOUND");
    if (expediente.gestor_id === responsableId) return getExpediente(user, id);
    database.prepare("UPDATE expediente_assignments SET ends_at = ? WHERE expediente_id = ? AND assignment_type = 'coordinador_idc' AND ends_at IS NULL").run(now, id);
    database.prepare("INSERT INTO expediente_assignments (id, expediente_id, user_id, assignment_type, assigned_by, starts_at, created_at) VALUES (?, ?, ?, 'coordinador_idc', ?, ?, ?)").run(crypto.randomUUID(), id, responsableId, user.id, now, now);
    database.prepare("UPDATE expedientes SET gestor_id = ?, updated_at = ? WHERE id = ?").run(responsableId, now, id);
    database.prepare("INSERT INTO notifications (id, user_id, expediente_id, type, priority, title, body, created_at) VALUES (?, ?, ?, 'expediente_asignado', 'normal', 'Nuevo responsable IDC', ?, ?)").run(crypto.randomUUID(), responsableId, id, `Se te asignó como responsable el expediente ${expediente.folio}.`, now);
    if (expediente.gestor_id) database.prepare("INSERT INTO notifications (id, user_id, expediente_id, type, priority, title, body, created_at) VALUES (?, ?, ?, 'expediente_reasignado', 'normal', 'Responsable reasignado', ?, ?)").run(crypto.randomUUID(), expediente.gestor_id, id, `El expediente ${expediente.folio} fue reasignado.`, now);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "reasignacion_responsable_idc", entityType: "expediente_assignment", entityId: id, expedienteId: id, metadata: { responsable_anterior_id: expediente.gestor_id, responsable_nuevo_id: responsableId } });
    return getExpediente(user, id);
  });
}
