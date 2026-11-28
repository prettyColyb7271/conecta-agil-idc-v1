import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = 3205;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a4-"));
const migrationDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a4-migration-"));
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  EMAIL_TRANSPORT: "file",
  ZOHO_TRANSPORT: "file",
};
let pass = 0;
let fail = 0;
const failures = [];
const ok = (name, condition, detail = "") => {
  if (condition) { pass++; console.log("  ✅", name); }
  else { fail++; failures.push(name); console.log("  ❌", name, detail); }
};

class Session {
  cookies = {};
  async request(method, route, body) {
    const headers = {};
    if (Object.keys(this.cookies).length) headers.cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    if (body !== undefined) headers.origin = base;
    if (body !== undefined && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetch(`${base}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      redirect: "manual",
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const content = pair.slice(index + 1);
      if (content) this.cookies[key] = content;
      else delete this.cookies[key];
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    return { status: response.status, text, json };
  }
  get(route) { return this.request("GET", route); }
  post(route, body) { return this.request("POST", route, body); }
  patch(route, body) { return this.request("PATCH", route, body); }
}

function must(name, response, expected) {
  ok(name, response.status === expected, response.json?.error ?? response.text.slice(0, 100));
  if (response.status !== expected) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json;
}

const pdf = (name) => new Blob([`%PDF-1.4\n% ${name}\n%%EOF\n`], { type: "application/pdf" });
function form(fields, filename) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("file", pdf(filename), filename);
  return data;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of value) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

function rowsForExpediente(expedienteId) {
  const database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  try {
    return database.prepare(`
      SELECT id, event_type, payload_json, status, attempts, last_error, last_attempt_at, zoho_id, created_at
      FROM outbox WHERE expediente_id = ? ORDER BY created_at, rowid
    `).all(expedienteId);
  } finally {
    database.close();
  }
}

function getOutboxRow(id) {
  const database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  try {
    return database.prepare("SELECT * FROM outbox WHERE id = ?").get(id);
  } finally {
    database.close();
  }
}

async function waitFor(predicate, message, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

async function waitForExpedienteSent(expedienteId) {
  await waitFor(() => {
    const rows = rowsForExpediente(expedienteId);
    return rows.length > 0 && rows.every((row) => row.status === "enviado");
  }, `Los envíos de ${expedienteId} no terminaron.`);
}

function login(email, password) {
  const session = new Session();
  return session.post("/api/auth/login", { email, password }).then((response) => {
    must(`login ficticio ${email}`, response, 200);
    return session;
  });
}

async function createExpediente(manager, clientId, responsableId) {
  const result = must("crear expediente ficticio", await manager.post("/api/expedientes", {
    clienteId: clientId,
    tramite: "interconexion_fv_mt",
    nivelTension: "MT",
    habilitado: true,
    responsableId,
  }), 201);
  return result.expediente;
}

async function fillInitialRequirements({ manager, other, client, endpoint, sourceData }) {
  must("aceptar aviso de privacidad", await client.post(`${endpoint}/privacy`, { version: "aviso-privacidad-v1" }), 200);
  must("cerrar Gate 1", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G0" }), 200);
  const data = JSON.parse(sourceData);
  data.contacto = { nombre: "Contacto A4 Ficticio", correo: "contacto.a4@example.invalid", telefono: "5550000000" };
  data.representacion = { ...(data.representacion ?? {}), enlace_cfe: "Enlace A4 Ficticio", enlace_cfe_correo: "enlace.a4@example.invalid" };
  must("completar captura ficticia", await client.patch(endpoint, { data }), 200);
  const requirements = must("consultar requisitos iniciales", await manager.get(`${endpoint}/requirements/R01`), 200).requirements;
  for (const item of requirements.filter((row) => /^R0[1-9]$/.test(row.requirement_code))) {
    const uploader = /Cliente/.test(item.integra) && !/IDC\//.test(item.integra) ? client : manager;
    const filename = item.requirement_code === "R06" ? "INE_A4_CONFIDENTIAL.pdf" : item.requirement_code === "R08" ? "RFC_FILENAME_SECRET_A4.pdf" : `${item.requirement_code}_FILENAME_SECRET_A4.pdf`;
    must(`cargar ${item.requirement_code}`, await uploader.post(`${endpoint}/documents`, form({ requirementCode: item.requirement_code }, filename)), 201);
    must(`validar ${item.requirement_code}`, await other.post(`${endpoint}/requirements/${item.requirement_code}`, { action: "validate" }), 200);
  }
}

async function prepareSignature({ manager, other, endpoint }) {
  must("cerrar Gate 2", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G1" }), 200);
  for (const [formatCode, requirementCode] of [["F-01", "R01"], ["F-02", "R07"]]) {
    const generated = must(`generar ${formatCode}`, await manager.post(`${endpoint}/formats`, { action: "generate", formatCode }), 201).format;
    must(`imprimir ${formatCode}`, await manager.post(`${endpoint}/formats`, { action: "print", formatCode, versionId: generated.versionId }), 201);
    const scan = must(`cargar escaneo ${requirementCode}`, await manager.post(`${endpoint}/documents`, form({ requirementCode, sourceVersionId: generated.versionId }, `${requirementCode}_SIGNATURE_SCAN_A4.pdf`)), 201).document;
    must(`verificar escaneo ${requirementCode}`, await other.post(`${endpoint}/requirements/${requirementCode}`, { action: "verify_scan", versionId: scan.versionId }), 200);
  }
  const signature = must("cargar firma presencial", await manager.post(`${endpoint}/documents`, form({
    eventType: "firma_presencial",
    eventDate: "2026-11-27",
    description: "Firma presencial de muestra",
  }, "FIRMA_FILENAME_SECRET_A4.pdf")), 201).document;
  must("registrar firma presencial", await manager.post(`${endpoint}/gates`, {
    action: "event",
    eventType: "firma_presencial",
    eventDate: "2026-11-27",
    description: "Firma presencial",
    lugar: "Oficina ficticia",
    firmantes: ["Persona A", "Persona B"],
    documentId: signature.documentId,
  }), 201);
  must("cerrar Gate 3", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G2" }), 200);
}

async function prepareAcuse({ manager, other, endpoint }) {
  for (const code of ["R10", "R11"]) {
    must(`cargar ${code}`, await manager.post(`${endpoint}/documents`, form({ requirementCode: code }, `${code}_FILENAME_SECRET_A4.pdf`)), 201);
    must(`validar ${code}`, await other.post(`${endpoint}/requirements/${code}`, { action: "validate" }), 200);
  }
  must("registrar acuse CFE", await manager.post(`${endpoint}/documents`, form({
    eventType: "ingreso_acuse",
    eventDate: "2026-11-27",
    description: "Acuse de prueba A4",
    medio: "ventanilla",
    solicitudNumero: "SOL-A4-001",
  }, "ACUSE_FILENAME_SECRET_A4.pdf")), 201);
}

async function runFullGateFlow({ manager, other, client, endpoint }) {
  await prepareSignature({ manager, other, endpoint });
  await prepareAcuse({ manager, other, endpoint });
  must("cerrar Gate 4", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G3" }), 200);
  must("registrar oficio CFE", await manager.post(`${endpoint}/documents`, form({
    eventType: "resolucion_cfe",
    eventDate: "2026-11-27",
    description: "Oficio de prueba A4",
    resultado: "favorable",
    vigenciaMeses: "2",
  }, "OFICIO_FILENAME_SECRET_A4.pdf")), 201);
  must("cerrar Gate 5", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G4" }), 200);
  must("registrar contrato", await manager.post(`${endpoint}/documents`, form({
    eventType: "contrato",
    eventDate: "2026-11-27",
    description: "Contrato de prueba A4",
  }, "CONTRATO_FILENAME_SECRET_A4.pdf")), 201);
  must("cerrar Gate 6", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G5" }), 200);
  for (const code of ["U12", "U13", "U17"]) must(`validar dato estructurado ${code}`, await other.post(`${endpoint}/requirements/${code}`, { action: "validate" }), 200);
  for (const [code, uploader] of [["U04", client], ["U05", client], ["U06", client], ["U07", client], ["U09", manager], ["U14", manager], ["U15", client]]) {
    must(`cargar ${code}`, await uploader.post(`${endpoint}/documents`, form({ requirementCode: code }, `${code}_FILENAME_SECRET_A4.pdf`)), 201);
    must(`validar ${code}`, await other.post(`${endpoint}/requirements/${code}`, { action: "validate" }), 200);
  }
  for (const eventType of ["uiie", "certificado_uiie"]) {
    must(`registrar ${eventType}`, await manager.post(`${endpoint}/documents`, form({
      eventType,
      eventDate: "2026-11-27",
      description: `${eventType} de prueba`,
    }, `${eventType}_FILENAME_SECRET_A4.pdf`)), 201);
  }
  must("cerrar Gate 7", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G6" }), 200);
  for (const eventType of ["medidor", "interconexion", "alta_comercial"]) {
    must(`registrar ${eventType}`, await manager.post(`${endpoint}/documents`, form({
      eventType,
      eventDate: "2026-11-27",
      description: `${eventType} de prueba`,
    }, `${eventType}_FILENAME_SECRET_A4.pdf`)), 201);
  }
  must("registrar evento de cierre", await manager.post(`${endpoint}/gates`, {
    action: "event", eventType: "cierre", description: "Cierre revisado",
  }), 201);
  must("cerrar Gate 8 con segundo gestor", await other.post(`${endpoint}/gates`, { action: "close", gateCode: "G7" }), 200);
}

let server;
let database;
try {
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "ignore" });
  const seeded = JSON.parse(execFileSync(process.execPath, [tsx, "scripts/db-seed.ts"], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], { cwd: root, env, stdio: "ignore" });
  await waitFor(async () => (await fetch(`${base}/api/health`).then((response) => response.ok).catch(() => false)), "No inició el servidor aislado A4.");
  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  ok("schemaVersion 9 activo en health", health.schemaVersion === 9, String(health.schemaVersion));

  const client = await login("cliente.demo@example.invalid", seeded.password);
  const manager = await login("coordinador.demo@example.invalid", seeded.password);
  const other = await login("idc2.demo@example.invalid", seeded.password);
  const list = must("consultar expediente semilla", await manager.get("/api/expedientes"), 200);
  const sample = list.expedientes[0];
  const responsable = list.options.responsables.find((item) => item.email === "coordinador.demo@example.invalid");
  if (!sample || !responsable) throw new Error("Faltan los datos de prueba para crear un expediente.");
  const mainExpediente = await createExpediente(manager, sample.cliente_id, responsable.id);
  const mainEndpoint = `/api/expedientes/${mainExpediente.id}`;
  await fillInitialRequirements({ manager, other, client, endpoint: mainEndpoint, sourceData: sample.data_json });
  await runFullGateFlow({ manager, other, client, endpoint: mainEndpoint });
  await waitForExpedienteSent(mainExpediente.id);

  let mainRows = rowsForExpediente(mainExpediente.id);
  const mainFiles = mainRows.map((row) => {
    const safeCreated = row.created_at.replaceAll(/[^0-9A-Za-z._-]/g, "_");
    const file = path.join(dataDir, "zoho-outbox", `${safeCreated}-${row.id}.json`);
    return { row, file, json: JSON.parse(fs.readFileSync(file, "utf8")) };
  });
  const finalSnapshot = JSON.parse(mainRows.at(-1).payload_json);
  ok("G0→G7 genera 8 tareas Gate 1–Gate 8 y cada envío queda como JSON", mainRows.length > 20 && mainFiles.every(({ row, file, json }) => row.status === "enviado" && row.zoho_id === `file:${row.id}` && fs.existsSync(file) && json.payload.tasks.length === 8));
  ok("el snapshot final muestra los ocho Gates cerrados y subtareas", finalSnapshot.tasks.map((task) => task.label).join(",") === "Gate 1,Gate 2,Gate 3,Gate 4,Gate 5,Gate 6,Gate 7,Gate 8" &&
    finalSnapshot.tasks.every((task) => task.status === "Cerrado" && Array.isArray(task.subtasks)) &&
    finalSnapshot.tasks[7].subtasks.some((task) => task.label === "Cierre"));

  const clientOutbox = JSON.stringify(mainFiles.map(({ json }) => json));
  const forbidden = ["XAXX010101000", "INE_A4_CONFIDENTIAL", "RFC_FILENAME_SECRET_A4", "FILENAME_SECRET_A4", "RETROALIMENTACION_PRIVADA_A4", "NOTA_INTERNA_PRIVADA_A4"];
  ok("el payload no incluye RFC, INE, nombres de archivo ni observaciones", forbidden.every((value) => !clientOutbox.includes(value)));

  const reprocess = await createExpediente(manager, sample.cliente_id, responsable.id);
  const reprocessEndpoint = `/api/expedientes/${reprocess.id}`;
  await fillInitialRequirements({ manager, other, client, endpoint: reprocessEndpoint, sourceData: sample.data_json });
  must("cerrar Gate 2 previo al reproceso", await manager.post(`${reprocessEndpoint}/gates`, { action: "close", gateCode: "G1" }), 200);
  const beforeInvalid = rowsForExpediente(reprocess.id).length;
  const invalid = await manager.post(`${reprocessEndpoint}/gates`, { action: "event", eventType: "cfe_incompleto", description: "Reproceso inválido" });
  ok("evento inválido no crea fila de outbox", invalid.status === 400 && rowsForExpediente(reprocess.id).length === beforeInvalid);
  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  database.prepare("CREATE TRIGGER fail_a4_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'fallo transaccional de prueba'); END;").run();
  database.close();
  database = null;
  const failedEvent = await manager.post(`${reprocessEndpoint}/gates`, {
    action: "event",
    eventType: "cfe_incompleto",
    description: "Fallo de outbox de prueba",
    requirementCodes: ["R03"],
    feedback: { R03: "Retroalimentación temporal" },
  });
  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const eventCountAfterFailure = Number(database.prepare("SELECT COUNT(*) AS count FROM external_events WHERE expediente_id = ? AND event_type = 'cfe_incompleto'").get(reprocess.id).count);
  const outboxCountAfterFailure = rowsForExpediente(reprocess.id).length;
  const gateAfterFailure = database.prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G1'").get(reprocess.id).status;
  database.close();
  database = null;
  const cleanup = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  cleanup.exec("DROP TRIGGER fail_a4_outbox;");
  cleanup.close();
  ok("si falla la escritura de outbox, se revierte el evento y se conserva Gate 2", failedEvent.status === 500 &&
    eventCountAfterFailure === 0 && outboxCountAfterFailure === beforeInvalid && gateAfterFailure === "cerrado");
  must("registrar reproceso CFE", await manager.post(`${reprocessEndpoint}/gates`, {
    action: "event",
    eventType: "cfe_incompleto",
    description: "Correcciones de muestra",
    requirementCodes: ["R03", "R09"],
    feedback: { R03: "RETROALIMENTACION_PRIVADA_A4", R09: "Retroalimentación de prueba" },
    internalNotes: { R03: "NOTA_INTERNA_PRIVADA_A4" },
  }), 201);
  await waitForExpedienteSent(reprocess.id);
  const reprocessRows = rowsForExpediente(reprocess.id);
  const reprocessRow = reprocessRows.find((row) => row.event_type === "evidencia_cfe_incompleto_registrada");
  if (!reprocessRow) throw new Error("No se encontró el evento de reproceso en la outbox.");
  const reprocessPayload = fs.readFileSync(path.join(dataDir, "zoho-outbox", `${reprocessRow.created_at.replaceAll(/[^0-9A-Za-z._-]/g, "_")}-${reprocessRow.id}.json`), "utf8");
  const reprocessSnapshot = JSON.parse(reprocessRow.payload_json);
  ok("el reproceso abre Gate 2 y no exporta feedback ni notas IDC", reprocessSnapshot.tasks[1].status === "En proceso" &&
    reprocessSnapshot.tasks[1].subtasks.some((task) => task.code === "R03" && task.status === "Observado") &&
    !reprocessPayload.includes("RETROALIMENTACION_PRIVADA_A4") && !reprocessPayload.includes("NOTA_INTERNA_PRIVADA_A4"));

  const admin = await login("seguridad.demo@example.invalid", seeded.password);
  const setup = must("iniciar MFA admin", await admin.post("/api/auth/mfa", { action: "begin" }), 200);
  must("confirmar MFA admin", await admin.post("/api/auth/mfa", { action: "confirm", code: totp(setup.secret) }), 200);
  const adminDashboard = must("admin autorizado consulta outbox", await admin.get("/api/admin/integraciones"), 200);
  ok("admin ve la pantalla Integraciones y la maqueta Zoho", (await admin.get("/admin/integraciones")).text.includes("Así se vería en Zoho Projects") &&
    adminDashboard.projects.some((project) => project.folio === mainExpediente.folio && project.tasks.length === 8));

  const demoDatabase = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const demoExpediente = demoDatabase.prepare("SELECT id FROM expedientes WHERE folio = 'IDC-DEMO-0001'").get();
  demoDatabase.close();
  if (!demoExpediente) throw new Error("No se encontró el expediente demo sembrado.");
  must("registrar evento ficticio en IDC-DEMO-0001", await manager.post(`/api/expedientes/${demoExpediente.id}/gates`, {
    action: "event",
    eventType: "visita_uiie",
    description: "Visita UIIE ficticia para A4e",
  }), 201);
  await waitForExpedienteSent(demoExpediente.id);
  const demoDashboard = must("A4e: GET Integraciones admite el folio de semilla", await admin.get("/api/admin/integraciones"), 200);
  const demoPage = await admin.get("/admin/integraciones");
  ok("A4e: evento en IDC-DEMO-0001 aparece en la maqueta", demoDashboard.projects.some((project) => project.folio === "IDC-DEMO-0001") &&
    demoPage.status === 200 && demoPage.text.includes("IDC-DEMO-0001"));

  const unreadableId = crypto.randomUUID();
  const unreadableCreatedAt = "2026-11-27T12:00:00.000Z";
  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  database.prepare(`
    INSERT INTO outbox (id, event_type, expediente_id, payload_json, status, attempts, last_error, created_at)
    VALUES (?, 'diagnostico_ilegible_privado', ?, ?, 'fallido', 1, ?, ?)
  `).run(unreadableId, mainExpediente.id, "{invalid A4e payload SECRET", "ERROR_PRIVADO_A4E", unreadableCreatedAt);
  database.close();
  database = null;
  const unreadableDashboard = must("A4e: GET Integraciones tolera payload inválido", await admin.get("/api/admin/integraciones"), 200);
  const unreadableEntry = unreadableDashboard.entries.find((entry) => entry.id === unreadableId);
  const unreadablePage = await admin.get("/admin/integraciones");
  const expectedUnreadableDate = "27/11/2026";
  const unreadablePageHasSafeRow = unreadablePage.status === 200 && unreadablePage.text.includes("Registro no legible") &&
    unreadablePage.text.includes("fallido") && unreadablePage.text.includes(expectedUnreadableDate) &&
    !unreadablePage.text.includes("invalid A4e payload SECRET") && !unreadablePage.text.includes("ERROR_PRIVADO_A4E");
  ok("A4e: fila inválida muestra solo estado/fecha, sin payload ni error crudo", unreadableEntry?.snapshot === null &&
    unreadableEntry.status === "fallido" && unreadableEntry.createdAt === unreadableCreatedAt &&
    unreadableEntry.lastError === null && unreadableEntry.retryable === false && unreadablePageHasSafeRow,
  JSON.stringify({
    apiSnapshotNull: unreadableEntry?.snapshot === null,
    status: unreadableEntry?.status,
    createdAt: unreadableEntry?.createdAt,
    lastErrorRedacted: unreadableEntry?.lastError === null,
    retryDisabled: unreadableEntry?.retryable === false,
    pageStatus: unreadablePage.status,
    rowLabelVisible: unreadablePage.text.includes("Registro no legible"),
    rowStatusVisible: unreadablePage.text.includes("fallido"),
    expectedDate: expectedUnreadableDate,
    dateVisible: unreadablePage.text.includes(expectedUnreadableDate),
  }));
  ok("A4e: las otras filas y proyectos siguen visibles", unreadableDashboard.projects.some((project) => project.folio === mainExpediente.folio) &&
    unreadableDashboard.projects.some((project) => project.folio === "IDC-DEMO-0001") &&
    unreadablePage.text.includes(mainExpediente.folio) && unreadablePage.text.includes("IDC-DEMO-0001"));

  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  database.exec("ALTER TABLE outbox RENAME TO outbox_a4e_backup;");
  database.close();
  database = null;
  let unavailablePage;
  try {
    unavailablePage = await admin.get("/admin/integraciones");
  } finally {
    database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
    database.exec("ALTER TABLE outbox_a4e_backup RENAME TO outbox;");
    database.close();
    database = null;
  }
  ok("A4e: si falla el tablero, la página muestra el mensaje claro", unavailablePage.status === 200 &&
    unavailablePage.text.includes("No fue posible consultar las integraciones"));

  ok("gestor y cliente reciben 403 para la outbox", (await manager.get("/api/admin/integraciones")).status === 403 &&
    (await client.get("/api/admin/integraciones")).status === 403);
  const dashboardText = JSON.stringify(adminDashboard);
  ok("la respuesta de administración tampoco incluye datos de documentos ni notas", forbidden.every((value) => !dashboardText.includes(value)));

  const databasePath = path.join(dataDir, "conecta-agil.sqlite");
  const migrationCopy = path.join(migrationDir, "conecta-agil.sqlite");
  database = new DatabaseSync(databasePath);
  database.exec(`VACUUM INTO '${migrationCopy.replaceAll("'", "''")}'`);
  database.close();
  database = null;
  const oldDatabase = new DatabaseSync(migrationCopy);
  const usersBefore = Number(oldDatabase.prepare("SELECT COUNT(*) AS count FROM users").get().count);
  const expedientesBefore = Number(oldDatabase.prepare("SELECT COUNT(*) AS count FROM expedientes").get().count);
  oldDatabase.exec("DROP TABLE outbox; DELETE FROM schema_migrations WHERE filename = '009_outbox.sql';");
  oldDatabase.close();
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env: { ...env, LOCAL_DATA_DIR: migrationDir }, stdio: "ignore" });
  const migratedDatabase = new DatabaseSync(migrationCopy, { readOnly: true });
  const version = migratedDatabase.prepare("SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1").get()?.filename;
  const outboxExists = migratedDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'outbox'").get();
  ok("db:migrate sube a 9 sobre una base existente y conserva sus datos", version === "009_outbox.sql" && Boolean(outboxExists) &&
    Number(migratedDatabase.prepare("SELECT COUNT(*) AS count FROM users").get().count) === usersBefore &&
    Number(migratedDatabase.prepare("SELECT COUNT(*) AS count FROM expedientes").get().count) === expedientesBefore);
  migratedDatabase.close();

  const outboxDirectory = path.join(dataDir, "zoho-outbox");
  const backupDirectory = path.join(dataDir, "zoho-outbox-backup");
  fs.renameSync(outboxDirectory, backupDirectory);
  fs.writeFileSync(outboxDirectory, "bloqueo de prueba", "utf8");
  const failedExpediente = await createExpediente(manager, sample.cliente_id, responsable.id);
  const failedRow = rowsForExpediente(failedExpediente.id)[0];
  if (!failedRow) throw new Error("No se guardó el envío fallido en la outbox.");
  await waitFor(() => getOutboxRow(failedRow.id)?.status === "fallido", "No se marcó fallido el transporte simulado.");
  ok("un fallo del transporte no revierte la creación del expediente", (await manager.get(`/api/expedientes/${failedExpediente.id}`)).status === 200 &&
    getOutboxRow(failedRow.id)?.status === "fallido");
  fs.unlinkSync(outboxDirectory);
  fs.renameSync(backupDirectory, outboxDirectory);
  const retried = must("Reintentar recupera el envío simulado", await admin.post("/api/admin/integraciones", { id: failedRow.id }), 200);
  const sentRow = getOutboxRow(failedRow.id);
  const matchingFiles = fs.readdirSync(outboxDirectory).filter((filename) => filename.endsWith(`-${failedRow.id}.json`));
  ok("el reintento envía una vez y conserva un zoho_id estable", retried.status === "enviado" &&
    sentRow?.status === "enviado" && sentRow.attempts === 2 && sentRow.zoho_id === `file:${failedRow.id}` && matchingFiles.length === 1);
  ok("un envío ya enviado no se duplica al reintentar", (await admin.post("/api/admin/integraciones", { id: failedRow.id })).status === 409 &&
    getOutboxRow(failedRow.id)?.zoho_id === `file:${failedRow.id}` &&
    fs.readdirSync(outboxDirectory).filter((filename) => filename.endsWith(`-${failedRow.id}.json`)).length === 1);
} catch (error) {
  console.error("Error en supervisor-a4:", error);
  process.exitCode = 1;
} finally {
  database?.close();
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const directory of [migrationDir, dataDir]) {
    try { fs.rmSync(directory, { recursive: true, force: true }); }
    catch (error) {
      console.error("No se pudo limpiar el directorio de prueba:", error);
      process.exitCode = 1;
    }
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
