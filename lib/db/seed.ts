import crypto from "node:crypto";
import { getDatabase, migrateDatabase } from "./sqlite-runtime";

const TEST_PASSWORD = "ConectaLocal-2026!";

const requirementCatalog = [
  ["R01", "R", "Formato de solicitud para interconexión", "ESPECIFICACION §4.1, línea 60", "generado", "IDC/Cliente", "F-01", "solicitante o representante legal", 0, null, null, "Secciones I–VII completas; RPU; capacidad en kW; coordenadas UTM; firma"],
  ["R02", "R", "Croquis", "ESPECIFICACION §4.1, línea 60", "carga", "IDC", null, null, 0, null, null, "Legible; ubicación del inmueble y del sistema"],
  ["R03", "R", "Diagrama unifilar", "ESPECIFICACION §4.1, línea 60", "carga", "IDC", null, "Ingeniero responsable [CONFIRMAR]", 0, null, null, "Versión; coincide con la memoria"],
  ["R04", "R", "Fichas técnicas de paneles e inversor", "ESPECIFICACION §4.1, línea 60", "carga", "IDC", null, null, 0, null, null, "Modelo igual al de la memoria y la solicitud"],
  ["R05", "R", "Certificados UL de paneles e inversor", "ESPECIFICACION §4.1, línea 60", "carga", "IDC", null, null, 0, null, null, "Vigencia; ¿se acepta CSA que avala normas UL? [CONFIRMAR]"],
  ["R06", "R", "Identificación oficial vigente del propietario", "ESPECIFICACION §4.1, línea 60", "carga_sensible", "Cliente", null, null, 1, null, null, "Vigente; a nombre del titular"],
  ["R07", "R", "Carta poder con INE", "ESPECIFICACION §4.1, línea 60", "generado", "Cliente", "F-02", "otorga, acepta y 2 testigos", 1, null, null, "Firmas completas; vigencia de las INE"],
  ["R08", "R", "Constancia de situación fiscal", "ESPECIFICACION §4.1, línea 60", "carga_sensible", "Cliente", null, null, 1, null, null, "Actualizada; RFC igual al del titular"],
  ["R09", "R", "Recibo del último corte", "ESPECIFICACION §4.1, línea 60", "carga", "Cliente", null, null, 0, null, null, "Último periodo; RPU igual al de la solicitud"],
  ["R10", "R", "Fotos del sistema funcionando", "ESPECIFICACION §4.1, línea 60", "carga_multiple", "IDC", null, null, 0, null, null, "Módulos, inversor y tablero"],
  ["R11", "R", "Dictamen de verificación UVIE", "ESPECIFICACION §4.1, línea 60", "externo", "IDC", null, "UVIE", 0, null, null, "Previo al ingreso; NOM-001-SEDE-2012"],
  ["U01", "U", "Resolutivo de CFE (y ficha y comprobante de aportación, si aplica)", "ESPECIFICACION §4.2, línea 80", "externo", "Cliente/IDC", null, null, 0, "G4", null, "Oficio de G4"],
  ["U02", "U", "Dictamen de verificación UVIE", "ESPECIFICACION §4.2, línea 80", "externo", "IDC", null, null, 0, "R11", null, "R11"],
  ["U03", "U", "RFC del cliente", "ESPECIFICACION §4.2, línea 80", "carga", "Cliente", null, null, 1, "R08", null, "R08"],
  ["U04", "U", "Documentos de quien contrata la UIIE (persona moral: acta, poder, INE del representante)", "ESPECIFICACION §4.2, línea 80", "carga", "Cliente", null, null, 1, null, "persona moral", "Condicional por tipo de persona"],
  ["U05", "U", "Acta constitutiva o poder legal del servicio", "ESPECIFICACION §4.2, línea 80", "carga", "Cliente", null, null, 1, null, "persona moral", "Condicional"],
  ["U06", "U", "Identificación del representante legal", "ESPECIFICACION §4.2, línea 80", "carga", "Cliente", null, null, 1, "R06", null, "R06 si es la misma persona"],
  ["U07", "U", "Identificación de quien atiende la visita", "ESPECIFICACION §4.2, línea 80", "carga", "Cliente", null, null, 1, null, null, "Identificación vigente"],
  ["U08", "U", "Identificación de dos testigos", "ESPECIFICACION §4.2, línea 80", "carga", "Cliente", null, null, 1, "R07", null, "Testigos de R07 si son los mismos"],
  ["U09", "U", "Memoria técnica (Acuerdo A/054/2024, cap. 9, secc. III, trigésima quinta)", "ESPECIFICACION §4.2, línea 80", "generado", "IDC", "F-05", null, 0, null, null, "Memoria del expediente"],
  ["U10", "U", "Diagrama unifilar (misma referencia, fracc. VII)", "ESPECIFICACION §4.2, línea 80", "carga", "IDC", null, null, 0, "R03", null, "R03"],
  ["U11", "U", "Domicilio del servicio (recibo CFE)", "ESPECIFICACION §4.2, línea 80", "carga", "Cliente", null, null, 0, "R09", null, "R09"],
  ["U12", "U", "Responsable de recibir el certificado por parte del cliente (nombre, correo, teléfono)", "ESPECIFICACION §4.2, línea 80", "dato_estructurado", "Cliente", "F-04", null, 0, null, null, "Nombre, correo y teléfono"],
  ["U13", "U", "Responsable de recibir el certificado por parte de CFE (Enlace Empresarial)", "ESPECIFICACION §4.2, línea 80", "dato_estructurado", "Cliente/IDC", "F-04", null, 0, null, null, "Enlace Empresarial"],
  ["U14", "U", "Fotografías de medidor y sellos de CFE", "ESPECIFICACION §4.2, línea 80", "carga_multiple", "IDC", null, null, 0, null, null, "Medidor y sellos de CFE"],
  ["U15", "U", "Carta poder simple para la UIIE", "ESPECIFICACION §4.2, línea 80", "generado", "Cliente", "F-03", null, 1, null, null, "Firma del propietario o gestor con poder"],
  ["U16", "U", "Carta poder para interconexión", "ESPECIFICACION §4.2, línea 80", "generado", "Cliente", "F-02", null, 1, "R07", null, "R07"],
  ["U17", "U", "Datos generales del servicio (número, tarifa, titular)", "ESPECIFICACION §4.2, línea 80", "dato_estructurado", "Cliente", "F-04", null, 0, null, null, "Número, tarifa y titular"],
] as const;

const users = [
  ["cliente.demo@example.invalid", "Cliente Demo Ficticio", "cliente"],
  ["gestor.demo@example.invalid", "Gestor CFE Demo Ficticio", "gestor_tramites_cfe"],
  ["gestor2.demo@example.invalid", "Gestor CFE 2 Demo Ficticio", "gestor_tramites_cfe"],
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
    if (!userIds.has(role)) userIds.set(role, id);
    if (email === "gestor2.demo@example.invalid") userIds.set("gestor_tramites_cfe_2", id);
  }

  const catalogInsert = database.prepare(
    "INSERT OR IGNORE INTO requirement_catalog (code, group_code, name, source_ref, required, created_at, tipo, integra, formato_code, firma_fisica, sensible, reutiliza_code, condicional, validaciones) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const [code, groupCode, name, sourceRef, tipo, integra, formatoCode, firmaFisica, sensible, reutilizaCode, condicional, validaciones] of requirementCatalog) {
    catalogInsert.run(code, groupCode, name, sourceRef, now, tipo, integra, formatoCode, firmaFisica, sensible, reutilizaCode, condicional, validaciones);
  }
  const catalogUpdate = database.prepare(
    "UPDATE requirement_catalog SET tipo = ?, integra = ?, formato_code = ?, firma_fisica = ?, sensible = ?, reutiliza_code = ?, condicional = ?, validaciones = ? WHERE code = ?",
  );
  for (const [code, , , , tipo, integra, formatoCode, firmaFisica, sensible, reutilizaCode, condicional, validaciones] of requirementCatalog) {
    catalogUpdate.run(tipo, integra, formatoCode, firmaFisica, sensible, reutilizaCode, condicional, validaciones, code);
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
