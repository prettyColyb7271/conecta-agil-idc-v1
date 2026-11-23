import crypto from "node:crypto";
import { getDatabase, migrateDatabase } from "./sqlite-runtime";

const TEST_PASSWORD = "ConectaLocal-2026!";

const requirementCatalog = [
  ["R01", "R", "Formato de solicitud para interconexión", "ESPECIFICACION §4.1, línea 56"],
  ["R02", "R", "Croquis", "ESPECIFICACION §4.1, línea 56"],
  ["R03", "R", "Diagrama unifilar", "ESPECIFICACION §4.1, línea 56"],
  ["R04", "R", "Fichas técnicas de paneles e inversor", "ESPECIFICACION §4.1, línea 56"],
  ["R05", "R", "Certificados UL de paneles e inversor", "ESPECIFICACION §4.1, línea 56"],
  ["R06", "R", "Identificación oficial vigente del propietario", "ESPECIFICACION §4.1, línea 56"],
  ["R07", "R", "Carta poder con INE", "ESPECIFICACION §4.1, línea 56"],
  ["R08", "R", "Constancia de situación fiscal", "ESPECIFICACION §4.1, línea 56"],
  ["R09", "R", "Recibo del último corte", "ESPECIFICACION §4.1, línea 56"],
  ["R10", "R", "Fotos del sistema funcionando", "ESPECIFICACION §4.1, línea 56"],
  ["R11", "R", "Dictamen de verificación UVIE", "ESPECIFICACION §4.1, línea 56"],
  ["U01", "U", "Resolutivo de CFE (y ficha y comprobante de aportación, si aplica)", "ESPECIFICACION §4.2, línea 76"],
  ["U02", "U", "Dictamen de verificación UVIE", "ESPECIFICACION §4.2, línea 76"],
  ["U03", "U", "RFC del cliente", "ESPECIFICACION §4.2, línea 76"],
  ["U04", "U", "Documentos de quien contrata la UIIE (persona moral: acta, poder, INE del representante)", "ESPECIFICACION §4.2, línea 76"],
  ["U05", "U", "Acta constitutiva o poder legal del servicio", "ESPECIFICACION §4.2, línea 76"],
  ["U06", "U", "Identificación del representante legal", "ESPECIFICACION §4.2, línea 76"],
  ["U07", "U", "Identificación de quien atiende la visita", "ESPECIFICACION §4.2, línea 76"],
  ["U08", "U", "Identificación de dos testigos", "ESPECIFICACION §4.2, línea 76"],
  ["U09", "U", "Memoria técnica (Acuerdo A/054/2024, cap. 9, secc. III, trigésima quinta)", "ESPECIFICACION §4.2, línea 76"],
  ["U10", "U", "Diagrama unifilar (misma referencia, fracc. VII)", "ESPECIFICACION §4.2, línea 76"],
  ["U11", "U", "Domicilio del servicio (recibo CFE)", "ESPECIFICACION §4.2, línea 76"],
  ["U12", "U", "Responsable de recibir el certificado por parte del cliente (nombre, correo, teléfono)", "ESPECIFICACION §4.2, línea 76"],
  ["U13", "U", "Responsable de recibir el certificado por parte de CFE (Enlace Empresarial)", "ESPECIFICACION §4.2, línea 76"],
  ["U14", "U", "Fotografías de medidor y sellos de CFE", "ESPECIFICACION §4.2, línea 76"],
  ["U15", "U", "Carta poder simple para la UIIE", "ESPECIFICACION §4.2, línea 76"],
  ["U16", "U", "Carta poder para interconexión", "ESPECIFICACION §4.2, línea 76"],
  ["U17", "U", "Datos generales del servicio (número, tarifa, titular)", "ESPECIFICACION §4.2, línea 76"],
] as const;

const users = [
  ["cliente.demo@example.invalid", "Cliente Demo Ficticio", "cliente"],
  ["gestor.demo@example.invalid", "Gestor CFE Demo Ficticio", "gestor_tramites_cfe"],
  ["coordinador.demo@example.invalid", "Coordinador Demo Ficticio", "coordinador_idc"],
  ["seguridad.demo@example.invalid", "Seguridad Demo Ficticio", "admin_seguridad"],
] as const;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function seedDatabase(): { users: number; requirements: number; expedientes: number; gates: number } {
  migrateDatabase();
  const database = getDatabase();
  const now = new Date().toISOString();
  const userIds = new Map<string, string>();
  const findUser = database.prepare("SELECT id FROM users WHERE email = ?");
  const insertUser = database.prepare(
    "INSERT INTO users (id, email, display_name, role, status, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, 'activo', ?, ?, ?)",
  );

  for (const [email, displayName, role] of users) {
    const existing = findUser.get(email);
    const id = existing ? String(existing.id) : crypto.randomUUID();
    if (!existing) insertUser.run(id, email, displayName, role, hashPassword(TEST_PASSWORD), now, now);
    userIds.set(role, id);
  }

  const catalogInsert = database.prepare(
    "INSERT OR IGNORE INTO requirement_catalog (code, group_code, name, source_ref, required, created_at) VALUES (?, ?, ?, ?, 1, ?)",
  );
  for (const [code, groupCode, name, sourceRef] of requirementCatalog) {
    catalogInsert.run(code, groupCode, name, sourceRef, now);
  }

  const clienteId = userIds.get("cliente");
  const gestorId = userIds.get("gestor_tramites_cfe");
  const coordinadorId = userIds.get("coordinador_idc");
  if (!clienteId || !gestorId || !coordinadorId) throw new Error("No se pudieron sembrar los usuarios de prueba.");

  const existingExpediente = database.prepare("SELECT id FROM expedientes WHERE folio = ?").get("IDC-DEMO-0001");
  const expedienteId = existingExpediente ? String(existingExpediente.id) : crypto.randomUUID();
  if (!existingExpediente) {
    database.prepare(
      "INSERT INTO expedientes (id, folio, tramite, nivel_tension, habilitado, cliente_id, gestor_id, coordinador_id, status, data_json, created_at, updated_at) VALUES (?, ?, ?, 'MT', 1, ?, ?, ?, 'activo', ?, ?, ?)",
    ).run(
      expedienteId,
      "IDC-DEMO-0001",
      "Interconexión de central fotovoltaica en media tensión",
      clienteId,
      gestorId,
      coordinadorId,
      JSON.stringify({
        ficticio: true,
        solicitante: { tipo_persona: "moral", nombre_razon_social: "Empresa Solar Ficticia S.A. de C.V.", rfc: "XAXX010101000", telefono: "555-000-0000", domicilio: "Calle Ficticia 123" },
        central: { tecnologia: "solar", capacidad_bruta_kw: 187.5, nivel_tension: "13 kV" },
      }),
      now,
      now,
    );
  }

  const assignmentExists = database.prepare(
    "SELECT id FROM expediente_assignments WHERE expediente_id = ? AND user_id = ? AND assignment_type = ?",
  ).get(expedienteId, gestorId, "gestor_tramites_cfe");
  if (!assignmentExists) {
    database.prepare(
      "INSERT INTO expediente_assignments (id, expediente_id, user_id, assignment_type, assigned_by, starts_at, created_at) VALUES (?, ?, ?, 'gestor_tramites_cfe', ?, ?, ?)",
    ).run(crypto.randomUUID(), expedienteId, gestorId, coordinadorId, now, now);
  }

  const requirementInsert = database.prepare(
    "INSERT OR IGNORE INTO expediente_requirements (id, expediente_id, requirement_code, status, updated_at) VALUES (?, ?, ?, 'requerido', ?)",
  );
  for (const [code] of requirementCatalog) {
    requirementInsert.run(crypto.randomUUID(), expedienteId, code, now);
  }

  const gateInsert = database.prepare(
    "INSERT OR IGNORE INTO gates (id, expediente_id, gate_code, status, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (let index = 0; index <= 7; index += 1) {
    gateInsert.run(crypto.randomUUID(), expedienteId, `G${index}`, index === 0 ? "abierto" : "bloqueado", now);
  }

  return {
    users: Number(database.prepare("SELECT COUNT(*) AS count FROM users").get()?.count ?? 0),
    requirements: Number(database.prepare("SELECT COUNT(*) AS count FROM requirement_catalog").get()?.count ?? 0),
    expedientes: Number(database.prepare("SELECT COUNT(*) AS count FROM expedientes").get()?.count ?? 0),
    gates: Number(database.prepare("SELECT COUNT(*) AS count FROM gates WHERE expediente_id = ?").get(expedienteId)?.count ?? 0),
  };
}

export { TEST_PASSWORD };
