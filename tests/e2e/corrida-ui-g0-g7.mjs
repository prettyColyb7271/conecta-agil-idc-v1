import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";

const root = path.resolve(process.argv[2] ?? process.cwd());
const port = 3203;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a5-flow-"));
const dataDirSnapshots = `${dataDir}-snapshots`;
const demoDocsDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a5-docs-"));
const screenshotDir = path.resolve(process.env.CAPTURAS_DIR?.trim() || path.join(root, "docs", "reporte", "capturas"));
const demoPassword = "ConectaLocal-2026!";
const privacyVersion = "0.1-borrador";
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  DEMO_DOCS_DIR: demoDocsDir,
  MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  MFA_REQUIRED_ROLES: "admin_seguridad",
  EMAIL_TRANSPORT: "file",
  EMAIL_FROM: "Conecta Agil <no-reply@example.invalid>",
  RESEND_API_KEY: "",
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: "",
  ZOHO_REFRESH_TOKEN: "",
  ZOHO_PORTAL_ID: "",
  ZOHO_PROJECT_ID: "",
  ZOHO_DC: "com",
};
let pass = 0, fail = 0;
const failures = [];
function ok(name, value, detail = "") {
  if (value) { pass++; console.log("  ✅", name); }
  else { fail++; failures.push(name); console.log("  ❌", name, detail); }
}
function must(name, response, expected) {
  ok(name, response.status === expected, response.json?.error);
  if (response.status !== expected) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json;
}
class Session {
  cookies = {};
  browserSession = null;
  async request(method, url, body) {
    const headers = { origin: base };
    const cookie = Object.entries(this.cookies).map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.cookie = cookie;
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetch(base + url, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair.indexOf("=");
      if (pair.slice(index + 1)) this.cookies[pair.slice(0, index)] = pair.slice(index + 1);
      else delete this.cookies[pair.slice(0, index)];
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Respuesta no JSON: HTTP ${response.status}`); }
    if (method === "POST" && ["/api/auth/login", "/api/auth/mfa/verify"].includes(url) && json.name && json.role) {
      this.browserSession = { name: json.name, role: json.role };
    }
    return { status: response.status, json };
  }
  get(url) { return this.request("GET", url); }
  post(url, body) { return this.request("POST", url, body); }
  patch(url, body) { return this.request("PATCH", url, body); }
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

const pdf = (name) => new Blob([`%PDF-1.4\n% ${name}\n%%EOF\n`], { type: "application/pdf" });
function form(fields, name, subgate) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  const fixture = fields.requirementCode
    ? `${fields.requirementCode}.pdf`
    : fields.eventType
      ? `evento-${fields.eventType}.pdf`
      : null;
  const contents = fixture ? fs.readFileSync(path.join(demoDocsDir, fixture)) : pdf(name);
  data.set("file", new Blob([contents], { type: "application/pdf" }), `${name}.pdf`);
  if (subgate) data.set("subgateFile", subgate, "subgate.pdf");
  return data;
}
const labels = {
  ingreso_acuse: "Acuse de CFE", resolucion_cfe: "Oficio resolutivo", contrato: "Contrato",
  uiie: "Visita UIIE", certificado_uiie: "Certificado UIIE", medidor: "Medidor",
  interconexion: "Interconexión", alta_comercial: "Alta comercial",
};

let server;
let browser;
let captureCount = 0;

async function captureScreenshot(session, route, filename, options = {}) {
  if (process.env.CAPTURAS !== "1") return;
  const context = await browser.newContext({
    viewport: options.mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript((dark) => {
    localStorage.setItem("conecta-prefs", JSON.stringify({ dark, lang: "es" }));
  }, options.dark === true);
  if (session?.browserSession) {
    await context.addInitScript((value) => {
      localStorage.setItem("conecta-session", JSON.stringify(value));
    }, session.browserSession);
  }
  if (session) {
    await context.addCookies(Object.entries(session.cookies).map(([name, value]) => ({ name, value, url: base })));
  }
  const page = await context.newPage();
  try {
    const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    if (!response?.ok()) throw new Error(`Captura ${filename}: ${route} respondió HTTP ${response?.status() ?? "sin respuesta"}.`);
    if (session?.browserSession) {
      await page.locator("aside").getByText(session.browserSession.name, { exact: true }).waitFor({ state: "visible", timeout: 5000 });
    }
    if (options.openPreferences) {
      await page.getByRole("button", { name: "Configuración" }).click();
      await page.waitForTimeout(100);
    }
    if (options.selectFolio) {
      const expedienteSelect = page.locator("select").first();
      const value = await expedienteSelect.locator("option").evaluateAll((items, folio) => {
        return items.find((item) => item.textContent?.startsWith(`${folio} ·`))?.value ?? null;
      }, options.selectFolio);
      if (!value) throw new Error(`Captura ${filename}: no se encontró el expediente ${options.selectFolio}.`);
      if (await expedienteSelect.inputValue() !== value) await expedienteSelect.selectOption(value);
      await page.waitForTimeout(500);
    }
    if (options.selectGate) {
      const gateNumber = Number(options.selectGate.slice(1)) + 1;
      const gatePanel = page.locator('section[aria-label="Gates del expediente"]');
      try {
        await gatePanel.waitFor({ state: "visible", timeout: 5000 });
      } catch {
        throw new Error(`Captura ${filename}: no se cargó el panel de Gates.`);
      }
      await gatePanel.getByText(`Gate ${gateNumber}`, { exact: true }).click();
      await page.waitForTimeout(150);
    }
    if (options.scrollToText) {
      const target = page.getByText(options.scrollToText, { exact: true }).first();
      if (await target.count() === 0) throw new Error(`Captura ${filename}: no se encontró "${options.scrollToText}".`);
      await target.scrollIntoViewIfNeeded();
    }
    const headerParagraphs = page.locator("header p");
    if (await headerParagraphs.count() > 1) await headerParagraphs.nth(1).evaluate((element) => element.remove());
    const visibleText = await page.locator("body").innerText();
    const html = await page.content();
    for (const requiredText of options.requiredText ?? []) {
      if (!visibleText.includes(requiredText)) throw new Error(`Captura ${filename}: falta "${requiredText}".`);
    }
    if (options.forbiddenText && visibleText.includes(options.forbiddenText)) {
      throw new Error(`Captura ${filename}: contiene el texto prohibido "${options.forbiddenText}".`);
    }
    const forbidden = [
      demoPassword,
      env.MFA_ENCRYPTION_KEY,
      env.ZOHO_CLIENT_SECRET,
      env.ZOHO_REFRESH_TOKEN,
      env.RESEND_API_KEY,
    ].filter(Boolean);
    if (forbidden.some((value) => visibleText.includes(value) || html.includes(value))) {
      throw new Error(`Captura ${filename}: se detectó una credencial en la página.`);
    }
    if (options.noQr) {
      const visibleQr = await page.locator('svg[title*="QR"], svg[aria-label*="QR"], img[src^="data:image"], canvas').count();
      if (visibleQr !== 0 || /otpauth:/i.test(html)) throw new Error(`Captura ${filename}: la pantalla no debe incluir QR ni URI MFA.`);
    }
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, filename);
    if (options.screenshotHeading) {
      const heading = page.getByRole("heading", { name: options.screenshotHeading, exact: true });
      await heading.locator("xpath=..").screenshot({ path: screenshotPath });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }
    captureCount++;
    ok(`captura ${filename}`, fs.statSync(path.join(screenshotDir, filename)).size > 0);
  } finally {
    await context.close();
  }
}

async function capturePublicScreens() {
  if (process.env.CAPTURAS !== "1") return;
  await captureScreenshot(null, "/", "01-inicio-sesion.png");
  await captureScreenshot(null, "/", "02-preferencias-modo-oscuro.png", { dark: true, openPreferences: true });
  await captureScreenshot(null, "/registro", "03-solicitud-registro.png");
}
try {
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [tsx, "scripts/demo-seed.ts"], { cwd: root, env, stdio: "pipe" });
  execFileSync(process.execPath, [tsx, "scripts/demo-docs.ts"], { cwd: root, env, stdio: "pipe" });
  const password = demoPassword;
  let serverOutput = "";
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr?.on("data", (chunk) => { serverOutput += chunk.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error(`No inició el servidor aislado de A5.${serverOutput ? ` ${serverOutput.slice(-2000)}` : ""}`);
  if (process.env.CAPTURAS === "1") {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    await capturePublicScreens();
  }
  const cliente = new Session(), gestor = new Session(), otro = new Session();
  for (const [session, email] of [[cliente, "cliente.demo@example.invalid"], [gestor, "coordinador.demo@example.invalid"], [otro, "idc2.demo@example.invalid"]]) {
    must(`login ficticio ${email}`, await session.post("/api/auth/login", { email, password }), 200);
  }
  await captureScreenshot(cliente, "/portal", "05-portal-privacidad-captura.png");
  const list = must("consultar expedientes", await gestor.get("/api/expedientes"), 200);
  const sample = list.expedientes[0];
  const owner = list.options.responsables.find((item) => item.email === "coordinador.demo@example.invalid");
  if (!sample || !owner) throw new Error("La semilla no tiene el cliente o responsable esperado.");
  const expediente = must("crear expediente ficticio principal", await gestor.post("/api/expedientes", { clienteId: sample.cliente_id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true, responsableId: owner.id }), 201).expediente;
  const E = `/api/expedientes/${expediente.id}`;
  must("completar captura ficticia principal", await cliente.patch(E, { data: JSON.parse(sample.data_json) }), 200);
  const close = (session, endpoint, gateCode) => session.post(`${endpoint}/gates`, { action: "close", gateCode });
  const evidence = (endpoint, type, extra = {}, subgate) => gestor.post(`${endpoint}/documents`, form({ eventType: type, eventDate: "2026-11-27", description: labels[type], ...extra }, type, subgate));

  async function prepararG3(endpoint, snapshotName) {
    must("cliente acepta privacidad", await cliente.post(`${endpoint}/privacy`, { version: privacyVersion }), 200);
    must("cerrar G0", await close(gestor, endpoint, "G0"), 200);
    if (snapshotName) execFileSync(process.execPath, [tsx, "scripts/demo-snapshot.ts", "save", snapshotName], { cwd: root, env, stdio: "pipe" });
    const current = must("consultar captura", await cliente.get(endpoint), 200).expediente;
    const data = JSON.parse(current.data_json);
    data.contacto = { nombre: "Contacto ficticio", correo: "contacto@example.invalid", telefono: "5550000000" };
    data.representacion = { ...(data.representacion ?? {}), enlace_cfe: "Enlace ficticio", enlace_cfe_correo: "enlace@example.invalid" };
    must("completar datos ficticios", await cliente.patch(endpoint, { data }), 200);
    const review = must("consultar requisitos R", await gestor.get(`${endpoint}/requirements/R01`), 200);
    for (const item of review.requirements.filter((r) => /^R0[1-9]$/.test(r.requirement_code))) {
      const uploader = /Cliente/.test(item.integra) && !/IDC\//.test(item.integra) ? cliente : gestor;
      must(`subir ${item.requirement_code}`, await uploader.post(`${endpoint}/documents`, form({ requirementCode: item.requirement_code }, item.requirement_code)), 201);
      must(`validar ${item.requirement_code}`, await otro.post(`${endpoint}/requirements/${item.requirement_code}`, { action: "validate" }), 200);
    }
    must("cerrar G1", await close(gestor, endpoint, "G1"), 200);
    for (const [formatCode, requirementCode] of [["F-01", "R01"], ["F-02", "R07"]]) {
      const generated = must(`generar ${formatCode}`, await gestor.post(`${endpoint}/formats`, { action: "generate", formatCode }), 201).format;
      must(`marcar ${formatCode} para firma`, await gestor.post(`${endpoint}/formats`, { action: "print", formatCode, versionId: generated.versionId }), 201);
      const scan = must(`subir escaneo ${requirementCode}`, await gestor.post(`${endpoint}/documents`, form({ requirementCode, sourceVersionId: generated.versionId }, requirementCode)), 201).document;
      must(`verificar escaneo ${requirementCode}`, await otro.post(`${endpoint}/requirements/${requirementCode}`, { action: "verify_scan", versionId: scan.versionId }), 200);
    }
    const lugar = "Oficina ficticia";
    const firmantes = ["Solicitante: Persona A", "Otorgante: Persona B", "Apoderado: Persona C", "Testigo 1: Persona D", "Testigo 2: Persona E"];
    const description = "Firma presencial";
    const full = `${description} · Lugar: ${lugar} · Firmantes: ${firmantes.join(", ")}`;
    const firma = must("subir firma presencial", await gestor.post(`${endpoint}/documents`, form({ eventType: "firma_presencial", eventDate: "2026-11-27", description: full }, "firma")), 201).document;
    must("completar firma presencial", await gestor.post(`${endpoint}/gates`, { action: "event", eventType: "firma_presencial", eventDate: "2026-11-27", description, lugar, firmantes, documentId: firma.documentId }), 201);
    must("cerrar G2", await close(gestor, endpoint, "G2"), 200);
  }
  await prepararG3(E, "antes-gate-2");
  await captureScreenshot(gestor, "/gestor", "12-revision-flujo-firma.png", { selectFolio: expediente.folio, selectGate: "G2", scrollToText: "Firma presencial y escaneos" });
  await captureScreenshot(cliente, "/portal/formatos", "08-formatos-cfe-vista-previa.png");
  execFileSync(process.execPath, [tsx, "scripts/demo-snapshot.ts", "save", "antes-gate-4"], { cwd: root, env, stdio: "pipe" });
  const early = await evidence(E, "ingreso_acuse", { medio: "ventanilla", solicitudNumero: "SOL-001" });
  ok("acuse sin R10 y R11 → 409", early.status === 409 && /R10/.test(early.json.error) && /R11/.test(early.json.error), early.json.error);
  for (const code of ["R10", "R11"]) {
    must(`subir ${code}`, await gestor.post(`${E}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code}`, await otro.post(`${E}/requirements/${code}`, { action: "validate" }), 200);
  }
  const acuse = must("registrar acuse", await evidence(E, "ingreso_acuse", { medio: "ventanilla", solicitudNumero: "SOL-001" }), 201).document;
  await captureScreenshot(gestor, "/gestor", "13-revision-acuse-cfe.png", { selectFolio: expediente.folio, selectGate: "G3", scrollToText: "Gates del trámite · haz clic en uno para ver qué exige" });
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const workflows = db.prepare("SELECT workflow_status FROM expediente_requirements WHERE expediente_id = ? AND requirement_code IN ('R01', 'R07')").all(expediente.id);
  const acuseStatus = db.prepare("SELECT status FROM documents WHERE id = ?").get(acuse.documentId);
  ok("la carga única actualiza el estado de ingreso con acuse", workflows.length === 2 && workflows.every((row) => row.workflow_status === "ingresado_con_acuse") && acuseStatus?.status === "ingresado_con_acuse");
  db.close();
  must("cerrar G3", await close(gestor, E, "G3"), 200);
  const badSubgate = await evidence(E, "resolucion_cfe", { resultado: "condicionado", vigenciaMeses: "2", subgateRequerido: "true" }, new Blob(["no es PDF"], { type: "application/pdf" }));
  ok("subgate inválido rechazado", badSubgate.status === 400, badSubgate.json.error);
  must("registrar oficio condicionado con subgate", await evidence(E, "resolucion_cfe", { resultado: "condicionado", vigenciaMeses: "2", subgateRequerido: "true" }, pdf("subgate ficticio")), 201);
  const resolution = (await gestor.get(E)).json.expediente.external_events.find((item) => item.event_type === "resolucion_cfe");
  ok("oficio conserva resultado, fecha límite y documento de subgate", resolution?.resultado === "condicionado" && resolution.vence_at?.startsWith("2027-01-27") && !!resolution.subgate_document_id);
  must("cerrar G4", await close(gestor, E, "G4"), 200);
  await captureScreenshot(cliente, "/portal", "07-portal-avance-gate-5.png");
  await captureScreenshot(gestor, "/gestor", "14-revision-oficio-vigencia.png", { selectFolio: expediente.folio, selectGate: "G4", scrollToText: "Revisión del expediente" });
  must("registrar contrato", await evidence(E, "contrato"), 201);
  must("cerrar G5", await close(gestor, E, "G5"), 200);
  for (const code of ["U12", "U13", "U17"]) must(`validar ${code}`, await otro.post(`${E}/requirements/${code}`, { action: "validate" }), 200);
  for (const [code, uploader] of [["U04", cliente], ["U05", cliente], ["U06", cliente], ["U07", cliente], ["U09", gestor], ["U14", gestor], ["U15", cliente]]) {
    must(`subir ${code}`, await uploader.post(`${E}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code}`, await otro.post(`${E}/requirements/${code}`, { action: "validate" }), 200);
  }
  for (const tipo of ["uiie", "certificado_uiie"]) must(`registrar ${tipo}`, await evidence(E, tipo), 201);
  must("cerrar G6", await close(gestor, E, "G6"), 200);
  await captureScreenshot(gestor, "/gestor", "15-revision-inspeccion-uiie.png", { selectFolio: expediente.folio, selectGate: "G6", scrollToText: "Gates del trámite · haz clic en uno para ver qué exige" });
  for (const tipo of ["medidor", "interconexion", "alta_comercial"]) must(`registrar ${tipo}`, await evidence(E, tipo), 201);
  must("registrar cierre", await gestor.post(`${E}/gates`, { action: "event", eventType: "cierre", description: "Cierre revisado" }), 201);
  const own = await close(gestor, E, "G7");
  ok("responsable no cierra G7 → 409", own.status === 409 && /distinto del responsable/.test(own.json.error), own.json.error);
  must("otro gestor cierra G7", await close(otro, E, "G7"), 200);
  const final = must("consultar expediente cerrado", await gestor.get(E), 200).expediente;
  await captureScreenshot(gestor, "/gestor", "16-revision-cierre-gate-8.png", { selectFolio: expediente.folio, selectGate: "G7", scrollToText: "Gates del trámite · haz clic en uno para ver qué exige" });
  ok("expediente cerrado", final.status === "cerrado" && final.gates.every((gate) => gate.status === "cerrado"));
  for (const type of ["firma_presencial", ...Object.keys(labels), "cierre"]) ok(`un solo evento ${type}`, final.external_events.filter((event) => event.event_type === type).length === 1);

  const newExp = must("crear expediente ficticio de reproceso", await gestor.post("/api/expedientes", { clienteId: expediente.cliente_id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true, responsableId: owner.id }), 201).expediente;
  const R = `/api/expedientes/${newExp.id}`;
  must("copiar captura ficticia al reproceso", await cliente.patch(R, { data: JSON.parse(final.data_json) }), 200);
  await prepararG3(R);
  for (const code of ["R10", "R11"]) {
    must(`subir ${code} del reproceso`, await gestor.post(`${R}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code} del reproceso`, await otro.post(`${R}/requirements/${code}`, { action: "validate" }), 200);
  }
  must("registrar acuse antes del reproceso", await evidence(R, "ingreso_acuse", { medio: "portal", solicitudNumero: "SOL-REPROCESO" }), 201);
  execFileSync(process.execPath, [tsx, "scripts/demo-snapshot.ts", "save", "antes-reproceso"], { cwd: root, env, stdio: "pipe" });
  const action = { action: "event", eventType: "cfe_incompleto", description: "Faltan datos informados por CFE" };
  ok("reproceso sin códigos → 400", (await gestor.post(`${R}/gates`, action)).status === 400);
  ok("reproceso sin feedback → 400", (await gestor.post(`${R}/gates`, { ...action, requirementCodes: ["R09"], feedback: {} })).status === 400);
  ok("reproceso rechaza códigos inválidos y duplicados", (await gestor.post(`${R}/gates`, { ...action, requirementCodes: ["U01"], feedback: { U01: "No válido" } })).status === 400 && (await gestor.post(`${R}/gates`, { ...action, requirementCodes: ["R09", "R09"], feedback: { R09: "Duplicado" } })).status === 400);
  must("registrar CFE incompleto", await gestor.post(`${R}/gates`, { ...action, requirementCodes: ["R09", "R03"], feedback: { R09: "Actualizar recibo", R03: "Corregir unifilar" }, internalNotes: { R03: "Nota interna confidencial" } }), 201);
  const reproceso = must("consultar reproceso", await gestor.get(R), 200).expediente;
  await captureScreenshot(cliente, "/portal/formatos", "06-portal-documentos-observacion.png");
  await captureScreenshot(gestor, "/gestor", "11-revision-validacion-requisitos.png", { selectFolio: newExp.folio, selectGate: "G1", scrollToText: "Revisión del expediente" });
  await captureScreenshot(gestor, "/gestor", "22-reproceso-cfe-semaforo.png", { selectFolio: newExp.folio, selectGate: "G1", scrollToText: "Reproceso CFE" });
  await captureScreenshot(cliente, "/portal/formatos", "22b-reproceso-cfe-cliente.png", {
    scrollToText: "Actualizar recibo",
    requiredText: ["Actualizar recibo", "🔴 Observado", "Le toca a"],
    forbiddenText: "Nota interna",
  });
  ok("reproceso reabre G1 y bloquea G2–G7", reproceso.gates.find((gate) => gate.gate_code === "G1")?.status === "abierto" && reproceso.gates.filter((gate) => gate.gate_code >= "G2").every((gate) => gate.status === "bloqueado"));
  ok("solo R09 y R03 quedan observados", reproceso.requirements.filter((item) => /^R\d{2}$/.test(item.requirement_code)).length === 11 && reproceso.requirements.filter((item) => item.status === "observado").map((item) => item.requirement_code).join(",") === "R03,R09");
  ok("R01 y R07 conservan firmas y R02 su validación", ["R01", "R07"].every((code) => reproceso.requirements.find((item) => item.requirement_code === code)?.status === "escaneo_verificado_idc") && reproceso.requirements.find((item) => item.requirement_code === "R02")?.status === "validado_idc");
  const pendientes = (await gestor.get("/api/gestor/pendientes")).json.pendientes.filter((item) => item.expedienteId === newExp.id);
  ok("pendientes respetan quién integra cada documento", pendientes.find((item) => item.requirementCode === "R03")?.label.includes("espera a IDC") && pendientes.find((item) => item.requirementCode === "R09")?.label.includes("espera al cliente"));
  const clientReview = must("cliente consulta motivo del reproceso", await cliente.get(`${R}/requirements/R01`), 200).requirements;
  ok("feedback visible y nota interna oculta en API", clientReview.find((item) => item.requirement_code === "R09")?.observations.some((observation) => observation.body === "Actualizar recibo") && !JSON.stringify(clientReview).includes("Nota interna confidencial"));
  const clientCookies = Object.entries(cliente.cookies).map(([name, value]) => `${name}=${value}`).join("; ");
  const page = await fetch(`${base}/portal/formatos`, { headers: { cookie: clientCookies } });
  const html = await page.text();
  ok("portal muestra feedback y responsable IDC sin nota interna", page.ok && html.includes("Actualizar recibo") && html.includes("Lo corrige IDC") && !html.includes("Nota interna confidencial"));
  const allRequirementsPanel = html.match(/<details\b[^>]*data-testid="reproceso-documentos-completos"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
  const requirementRows = [...allRequirementsPanel.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].slice(1);
  const requirementCodes = requirementRows.map(([, row]) => row.replace(/<!--.*?-->/gs, "").replace(/<[^>]+>/g, " ").match(/\bR\d{2}\b/)?.[0]);
  ok("portal despliega R01–R11 en 11 filas y en orden", page.ok && requirementRows.length === 11 && requirementCodes.join(",") === "R01,R02,R03,R04,R05,R06,R07,R08,R09,R10,R11");
  ok("nota interna ausente en el panel completo del cliente", page.ok && Boolean(allRequirementsPanel) && !allRequirementsPanel.includes("Nota interna confidencial"));
  ok("cliente no puede subir R03", (await cliente.post(`${R}/documents`, form({ requirementCode: "R03" }, "R03"))).status === 403);
  const mailFiles = fs.readdirSync(path.join(dataDir, "outbox"));
  const mails = mailFiles.map((name) => JSON.parse(fs.readFileSync(path.join(dataDir, "outbox", name), "utf8")));
  const mail = mails.find((item) => item.subject === "CFE pidió correcciones en tu expediente");
  ok("correo genérico sin detalles de observaciones", !!mail && mail.text.includes(newExp.folio) && !JSON.stringify(mail).includes("Actualizar recibo") && !JSON.stringify(mail).includes("Nota interna confidencial"));
  const reprocesoDb = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const stale = reprocesoDb.prepare("SELECT COUNT(*) AS n FROM expediente_requirements WHERE expediente_id = ? AND requirement_code IN ('R03', 'R09') AND (validated_by IS NOT NULL OR validated_at IS NOT NULL OR workflow_status IS NOT NULL)").get(newExp.id);
  const reset = reprocesoDb.prepare("SELECT reinicio_at FROM external_events WHERE expediente_id = ? AND event_type = 'cfe_incompleto'").get(newExp.id);
  ok("reproceso limpia la validación previa y registra el reinicio", stale.n === 0 && !!reset?.reinicio_at);
  reprocesoDb.close();
  ok("un solo evento de reproceso", reproceso.external_events.filter((event) => event.event_type === "cfe_incompleto").length === 1);
  must("cliente sube R09", await cliente.post(`${R}/documents`, form({ requirementCode: "R09" }, "R09-nuevo")), 201);
  ok("R09 en revisión IDC", (await cliente.get(`${R}/requirements/R01`)).json.requirements.find((item) => item.requirement_code === "R09")?.status === "cargado");
  ok("portal muestra revisión IDC", (await (await fetch(`${base}/portal/formatos`, { headers: { cookie: clientCookies } })).text()).includes("🟡 En revisión IDC"));
  must("otro gestor valida R09", await otro.post(`${R}/requirements/R09`, { action: "validate" }), 200);
  ok("R09 validado", (await cliente.get(`${R}/requirements/R01`)).json.requirements.find((item) => item.requirement_code === "R09")?.status === "validado_idc");
  ok("portal muestra validado", (await (await fetch(`${base}/portal/formatos`, { headers: { cookie: clientCookies } })).text()).includes("🟢 Validado"));
  must("gestor sube R03", await gestor.post(`${R}/documents`, form({ requirementCode: "R03" }, "R03-nuevo")), 201);
  must("otro gestor valida R03", await otro.post(`${R}/requirements/R03`, { action: "validate" }), 200);
  must("volver a cerrar G1 conservando firmas", await close(gestor, R, "G1"), 200);
  must("volver a cerrar G2 sin firmar", await close(gestor, R, "G2"), 200);
  const oldAcuse = await close(gestor, R, "G3");
  ok("G3 rechaza acuse anterior al reinicio", oldAcuse.status === 409 && /acuse/.test(oldAcuse.json.error), oldAcuse.json.error);
  must("registrar acuse nuevo", await evidence(R, "ingreso_acuse", { medio: "portal", solicitudNumero: "SOL-NUEVO" }), 201);
  must("cerrar G3 con acuse nuevo", await close(gestor, R, "G3"), 200);
  must("reprocesar R01", await gestor.post(`${R}/gates`, { ...action, requirementCodes: ["R01"], feedback: { R01: "Corregir solicitud" } }), 201);
  ok("R01 pierde la verificación", (await gestor.get(R)).json.expediente.requirements.find((item) => item.requirement_code === "R01")?.status === "observado");
  must("subir corrección R01", await gestor.post(`${R}/documents`, form({ requirementCode: "R01" }, "R01-corregido")), 201);
  must("validar corrección R01", await otro.post(`${R}/requirements/R01`, { action: "validate" }), 200);
  must("cerrar G1 tras corrección R01", await close(gestor, R, "G1"), 200);
  const regenerated = must("regenerar F-01", await gestor.post(`${R}/formats`, { action: "generate", formatCode: "F-01" }), 201).format;
  must("marcar F-01 para nueva firma", await gestor.post(`${R}/formats`, { action: "print", formatCode: "F-01", versionId: regenerated.versionId }), 201);
  const newScan = must("subir nuevo escaneo R01", await gestor.post(`${R}/documents`, form({ requirementCode: "R01", sourceVersionId: regenerated.versionId }, "R01-firmado")), 201).document;
  must("verificar nuevo escaneo R01", await otro.post(`${R}/requirements/R01`, { action: "verify_scan", versionId: newScan.versionId }), 200);
  const oldSignature = await close(gestor, R, "G2");
  ok("firma presencial anterior no cierra G2 tras reprocesar R01", oldSignature.status === 409 && /firma presencial/.test(oldSignature.json.error), oldSignature.json.error);
  must("registrar nueva firma presencial", await gestor.post(`${R}/documents`, form({ eventType: "firma_presencial", eventDate: "2026-11-27", description: "Firma presencial · Lugar: Oficina ficticia · Firmantes: Solicitante: Persona A, Otorgante: Persona B, Apoderado: Persona C, Testigo 1: Persona D, Testigo 2: Persona E" }, "firma-nueva")), 201);
  must("cerrar G2 con nueva firma", await close(gestor, R, "G2"), 200);

  const replacement = must("crear expediente ficticio para oficio no favorable", await gestor.post("/api/expedientes", { clienteId: expediente.cliente_id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true, responsableId: owner.id }), 201).expediente;
  const O = `/api/expedientes/${replacement.id}`;
  must("copiar captura ficticia al expediente de oficio", await cliente.patch(O, { data: JSON.parse(final.data_json) }), 200);
  await prepararG3(O);
  for (const code of ["R10", "R11"]) {
    must(`subir ${code} del oficio`, await gestor.post(`${O}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code} del oficio`, await otro.post(`${O}/requirements/${code}`, { action: "validate" }), 200);
  }
  must("registrar acuse del oficio", await evidence(O, "ingreso_acuse", { medio: "portal", solicitudNumero: "SOL-OFICIO" }), 201);
  must("cerrar G3 del oficio", await close(gestor, O, "G3"), 200);
  must("registrar oficio no favorable", await evidence(O, "resolucion_cfe", { resultado: "no_favorable", vigenciaMeses: "2" }), 201);
  const noFavorable = await close(gestor, O, "G4");
  ok("oficio no favorable impide cerrar G4", noFavorable.status === 409 && /no favorable/.test(noFavorable.json.error), noFavorable.json.error);
  const favorable = must("registrar otro oficio de la misma fecha", await evidence(O, "resolucion_cfe", { resultado: "favorable", vigenciaMeses: "2" }), 201).document;
  must("el último oficio permite cerrar G4", await close(gestor, O, "G4"), 200);
  must("registrar contrato del oficio", await evidence(O, "contrato"), 201);
  must("cerrar G5 del oficio", await close(gestor, O, "G5"), 200);
  const updated = (await gestor.get(O)).json.expediente.external_events.filter((event) => event.event_type === "resolucion_cfe");
  const reused = (await gestor.get(`${O}/requirements/U01`)).json.requirements.find((item) => item.requirement_code === "U01");
  ok("cada oficio es un evento y se reutiliza el último", updated.length === 2 && updated.at(-1)?.document_id === favorable.documentId && reused?.document_id === favorable.documentId, `eventos=${updated.length}; último=${updated.at(-1)?.document_id}; esperado=${favorable.documentId}; reutilizado=${reused?.document_id}`);
  await captureScreenshot(gestor, "/gestor", "09-gestor-inicio-indicadores.png");
  await captureScreenshot(gestor, "/gestor/proyectos", "10-proyectos-alta-asignacion.png");
  await captureScreenshot(cliente, "/portal", "20-portal-cliente-movil.png", { mobile: true });

  if (process.env.CAPTURAS === "1") {
    const admin = new Session();
    must("login ficticio admin para capturas", await admin.post("/api/auth/login", {
      email: "seguridad.demo@example.invalid",
      password,
    }), 200);
    const setup = must("iniciar MFA ficticio para capturas", await admin.post("/api/auth/mfa", { action: "begin" }), 200);
    must("activar MFA ficticio para capturas", await admin.post("/api/auth/mfa", { action: "confirm", code: totp(setup.secret) }), 200);
    await captureScreenshot(admin, "/seguridad", "04-seguridad-mfa-sin-qr.png", { noQr: true });
    await captureScreenshot(admin, "/admin/usuarios", "17-admin-cuentas.png");
    await captureScreenshot(admin, "/admin/accesos", "18-admin-bitacora.png");
    await captureScreenshot(admin, "/admin/integraciones", "19-admin-integraciones-zoho.png", { screenshotHeading: "Así se vería en Zoho Projects" });
    await captureScreenshot(admin, "/admin", "21-admin-inicio-seguridad.png");
    ok("npm run capturas produce las 23 imágenes solicitadas", captureCount === 23, `capturas=${captureCount}`);
  }
} finally {
  await browser?.close();
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 800));
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(dataDirSnapshots, { recursive: true, force: true });
  fs.rmSync(demoDocsDir, { recursive: true, force: true });
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
