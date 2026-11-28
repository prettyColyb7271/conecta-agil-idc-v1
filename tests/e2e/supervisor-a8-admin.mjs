import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";

const root = path.resolve(process.argv[2] ?? process.cwd());
const port = 3210;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a8-admin-"));
const password = "ConectaLocal-2026!";
const clientEmail = "cliente.demo@example.invalid";
const secretSentinels = [
  "a8".repeat(32),
  "A8_RESEND_SECRET_SENTINEL",
  "A8_ZOHO_CLIENT_SECRET_SENTINEL",
  "A8_ZOHO_REFRESH_TOKEN_SENTINEL",
];
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: secretSentinels[0],
  MFA_REQUIRED_ROLES: "admin_seguridad",
  EMAIL_TRANSPORT: "file",
  EMAIL_FROM: "Conecta Agil <no-reply@example.invalid>",
  RESEND_API_KEY: secretSentinels[1],
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: secretSentinels[2],
  ZOHO_REFRESH_TOKEN: secretSentinels[3],
  ZOHO_PORTAL_ID: "",
  ZOHO_PROJECT_ID: "",
  ZOHO_DC: "com",
};
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
let pass = 0;
let fail = 0;
const failures = [];
let server;
let database;
let browser;
let context;
let page;
const captureDir = path.join(root, "docs", "reportes", "img");

const ok = (name, condition, detail = "") => {
  if (condition) { pass++; console.log("  ✅", name); }
  else { fail++; failures.push(name); console.log("  ❌", name, detail); }
};

class Session {
  cookies = {};
  async request(method, route, body) {
    const headers = {};
    if (Object.keys(this.cookies).length) headers.cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    if (body !== undefined) { headers.origin = base; headers["content-type"] = "application/json"; }
    const response = await fetch(`${base}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
    return { status: response.status, text, json, headers: response.headers };
  }
  get(route) { return this.request("GET", route); }
  post(route, body) { return this.request("POST", route, body); }
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of value) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function login(email) {
  const session = new Session();
  const response = await session.post("/api/auth/login", { email, password });
  return { session, response };
}

try {
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "ignore" });
  execFileSync(process.execPath, [tsx, "scripts/db-seed.ts"], { cwd: root, env, stdio: "ignore" });
  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const existingClient = database.prepare("SELECT id FROM users WHERE email = ? AND role = 'cliente'").get(clientEmail);
  if (!existingClient) throw new Error("No se encontró el cliente ficticio de A8.");
  const client = database.prepare("SELECT id, email, display_name, role, status FROM users WHERE email = ?").get(clientEmail);
  const expediente = database.prepare("SELECT id, folio FROM expedientes WHERE cliente_id = ? ORDER BY folio LIMIT 1").get(existingClient.id);
  database.close();
  database = null;
  if (!client || !expediente) throw new Error("Faltan datos ficticios para las pruebas administrativas de A8.");
  fs.mkdirSync(captureDir, { recursive: true });

  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], { cwd: root, env, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("No inició el servidor aislado de A8.");

  const admin = await login("seguridad.demo@example.invalid");
  if (admin.response.status !== 200) throw new Error(`No inició sesión el admin ficticio: ${admin.response.status}`);
  const begin = await admin.session.post("/api/auth/mfa", { action: "begin" });
  const confirmed = await admin.session.post("/api/auth/mfa", { action: "confirm", code: totp(begin.json?.secret ?? "") });
  if (begin.status !== 200 || confirmed.status !== 200) throw new Error("No se pudo habilitar MFA en el fixture temporal.");
  const manager = await login("coordinador.demo@example.invalid");
  if (manager.response.status !== 200) throw new Error(`No inició sesión el Gestor IDC ficticio: ${manager.response.status}`);
  const clientLogin = await login(clientEmail);
  const newAdminRoutes = ["/admin/recuperacion", "/admin/incidentes", "/admin/configuracion"];
  const managerForbidden = await Promise.all(newAdminRoutes.map((route) => manager.session.get(route)));
  const clientForbidden = await Promise.all(newAdminRoutes.map((route) => clientLogin.session.get(route)));
  ok("Gestor IDC y Cliente reciben 403 en las páginas nuevas", clientLogin.response.status === 200 &&
    managerForbidden.every((response) => response.status === 403) &&
    clientForbidden.every((response) => response.status === 403),
  `login=${clientLogin.response.status}, gestor=${managerForbidden.map((response) => response.status).join("/")}, cliente=${clientForbidden.map((response) => response.status).join("/")}`);

  const anonymous = new Session();
  const requested = await anonymous.post("/api/auth/recovery", { email: clientEmail });
  const pending = await admin.session.get("/api/auth/recovery?status=pendiente");
  const request = pending.json?.requests?.find((item) => item.email === "cl•••@e•••.invalid");
  ok("la solicitud aparece en la API con correo enmascarado y estado de cuenta", requested.status === 200 &&
    pending.status === 200 && request?.accountExists === true && request.role === "cliente" && request.accountStatus === "activo" &&
    !pending.text.includes(clientEmail));
  const invalidAction = await admin.session.post("/api/auth/recovery", { action: "invalid", requestId: request?.id });
  const stillPending = await admin.session.get("/api/auth/recovery?status=pendiente");
  ok("una acción no reconocida no atiende ni consume la solicitud", invalidAction.status === 400 &&
    stillPending.json?.requests.some((item) => item.id === request?.id));

  const home = await admin.session.get("/admin");
  const notifications = await admin.session.get("/api/notifications");
  const homeNoticeVisible = /solicitud(?:es)? de recuperación pendiente(?:s)?/.test(home.text);
  ok("Inicio y campana indican la solicitud pendiente", home.status === 200 &&
    homeNoticeVisible && notifications.status === 200 && notifications.json?.pendingRecoveryCount === 1,
  `home=${home.status}, aviso=${homeNoticeVisible}, notificaciones=${notifications.status}, pendientes=${notifications.json?.pendingRecoveryCount}`);

  const recoveryPage = await admin.session.get("/admin/recuperacion");
  ok("la nueva pantalla de recuperación carga para admin sin contraseñas", recoveryPage.status === 200 &&
    recoveryPage.text.includes("Recuperación de acceso") && !recoveryPage.text.includes(password) &&
    !recoveryPage.text.includes("password_hash"));

  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript((value) => localStorage.setItem("conecta-session", JSON.stringify(value)), {
    name: admin.response.json?.name,
    role: admin.response.json?.role,
  });
  await context.addCookies(Object.entries(admin.session.cookies).map(([name, value]) => ({ name, value, url: base })));
  page = await context.newPage();
  await page.goto(`${base}/admin/recuperacion`, { waitUntil: "domcontentloaded" });
  await page.getByText("cl•••@e•••.invalid", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.screenshot({ path: path.join(captureDir, "a8-recuperacion.png") });
  ok("la solicitud aparece renderizada en la pantalla de recuperación", (await page.locator("body").innerText()).includes("Cuenta existente"));
  await page.getByRole("button", { name: "Generar enlace de un solo uso" }).click();
  await page.getByText(/Enlace de un solo uso, válido durante 24 horas/).waitFor({ state: "visible", timeout: 5000 });
  const setupLink = await page.locator('a[href*="/definir-contrasena?token="]').getAttribute("href");
  ok("el admin entrega un enlace temporal y nunca una contraseña", Boolean(setupLink?.includes("token=")) &&
    !(await page.locator("body").innerText()).includes(password));
  const pendingAfter = await admin.session.get("/api/auth/recovery?status=pendiente");
  const handled = await admin.session.get("/api/auth/recovery?status=atendida");
  const notificationsAfter = await admin.session.get("/api/notifications");
  ok("generar enlace atiende la solicitud y limpia el aviso", pendingAfter.status === 200 &&
    pendingAfter.json?.requests.length === 0 && handled.json?.requests.some((item) => item.id === request.id) &&
    notificationsAfter.json?.pendingRecoveryCount === 0);

  const managerRequest = await anonymous.post("/api/auth/recovery", { email: clientEmail });
  const managerRecovery = await manager.session.get("/api/auth/recovery?status=pendiente");
  const managerUsersPage = await manager.session.get("/gestor/usuarios");
  const managerRecoveryPage = await manager.session.get("/admin/recuperacion");
  ok("Gestor IDC también puede consultar solicitudes de clientes desde Usuarios", managerRequest.status === 200 &&
    managerRecovery.status === 200 && managerRecovery.json?.requests.some((item) => item.email === "cl•••@e•••.invalid") &&
    managerUsersPage.status === 200 && managerUsersPage.text.includes("Solicitudes de recuperación"));
  ok("Gestor IDC recibe 403 en la página de recuperación del admin", managerRecoveryPage.status === 403);

  const accountsApi = await admin.session.get("/api/admin/users");
  await page.goto(`${base}/admin/usuarios`, { waitUntil: "domcontentloaded" });
  await page.getByText("Roles y permisos", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.screenshot({ path: path.join(captureDir, "a8-roles.png") });
  const roleMatrixText = await page.locator("body").innerText();
  ok("Cuentas muestra cifras reales, búsqueda y la matriz de roles de solo lectura", accountsApi.status === 200 &&
    accountsApi.json?.summary?.active > 0 && accountsApi.json?.summary?.blocked >= 0 &&
    accountsApi.json?.summary?.mfaPending === 0 && roleMatrixText.includes("Gestor CFE (inactivo)") &&
    roleMatrixText.includes("no hay interruptores"));
  const search = page.getByLabel("Buscar por nombre o correo");
  await search.fill(client.display_name);
  await page.getByText(client.display_name, { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  ok("la búsqueda de Cuentas encuentra una persona por nombre sin revelar su correo", (await page.locator("body").innerText()).includes("cl•••@e•••.invalid") &&
    !(await page.locator("body").innerText()).includes(clientEmail));

  const configPage = await admin.session.get("/admin/configuracion");
  const configPageText = await configPage.text;
  ok("Configuración muestra estado real sin rutas ni secretos", configPage.status === 200 &&
    configPageText.includes("Carpeta local fuera de OneDrive") &&
    configPageText.includes("Sin respaldos automáticos — ver D2") &&
    !configPageText.includes(dataDir) && secretSentinels.every((secret) => !configPageText.includes(secret)));
  await page.goto(`${base}/admin/configuracion`, { waitUntil: "domcontentloaded" });
  await page.getByText("Configuración sensible:", { exact: false }).waitFor({ state: "visible", timeout: 5000 });
  await page.screenshot({ path: path.join(captureDir, "a8-configuracion.png") });

  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const insertAudit = database.prepare(`
    INSERT INTO audit_events (id, actor_id, actor_role, event_type, entity_type, entity_id, expediente_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const addAudit = ({ eventType, createdAt = new Date().toISOString(), expedienteId = null, metadata = { ip: "203.0.113.x" } }) => {
    insertAudit.run(
      crypto.randomUUID(),
      client.id,
      "cliente",
      eventType,
      eventType === "consulta_detalle_expediente" ? "expediente" : "user",
      eventType === "consulta_detalle_expediente" ? expediente.id : client.id,
      expedienteId,
      JSON.stringify(metadata),
      createdAt,
    );
  };
  for (let index = 0; index < 4; index += 1) {
    addAudit({ eventType: "login_fallido", createdAt: new Date(Date.now() - 60_000 + index * 10_000).toISOString() });
  }
  const fourFailures = await admin.session.get("/api/admin/incidents");
  ok("cuatro logins fallidos no generan alerta por umbral", fourFailures.status === 200 &&
    !fourFailures.json?.alerts.some((alert) => alert.category === "login_account"));
  addAudit({ eventType: "login_fallido", createdAt: new Date(Date.now() - 15_000).toISOString() });
  const fiveFailures = await admin.session.get("/api/admin/incidents");
  const accountAlert = fiveFailures.json?.alerts.find((alert) => alert.category === "login_account");
  const ipAlert = fiveFailures.json?.alerts.find((alert) => alert.category === "login_ip");
  ok("cinco logins fallidos en 15 minutos generan alerta por cuenta", fiveFailures.status === 200 &&
    accountAlert?.eventCount === 5 && accountAlert.subject === "cl***@example.invalid");
  ok("el umbral por IP también genera alerta con la IP truncada", ipAlert?.eventCount === 5 && ipAlert.subject === "IP 203.0.113.x");
  const alertAudit = await admin.session.get(`/api/admin/access?eventIds=${accountAlert?.eventIds.join(",") ?? ""}`);
  ok("cada alerta enlaza a los eventos exactos de Auditoría", alertAudit.status === 200 &&
    alertAudit.json?.total === 5 && alertAudit.json?.events.length === 5);

  await page.goto(`${base}/admin/incidentes`, { waitUntil: "domcontentloaded" });
  await page.getByText("Intentos fallidos repetidos para una cuenta", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.screenshot({ path: path.join(captureDir, "a8-incidentes.png") });
  ok("Seguridad e incidentes muestra la alerta real y acciones disponibles",
    (await page.locator("body").innerText()).includes("Bloquear cuenta") &&
    (await page.locator("body").innerText()).includes("Revocar sesiones"));
  await page.getByRole("button", { name: "Bloquear cuenta" }).first().click();
  await page.getByText("Cuenta bloqueada.", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByRole("button", { name: "Desbloquear cuenta" }).first().click();
  await page.getByText("Cuenta desbloqueada.", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  ok("las acciones rápidas existentes bloquean y desbloquean la cuenta", database.prepare("SELECT status FROM users WHERE id = ?").get(client.id)?.status === "activo");

  for (let index = 0; index < 2; index += 1) {
    addAudit({ eventType: "mfa_fallido", createdAt: new Date(Date.now() - 40_000 + index * 10_000).toISOString() });
  }
  const twoMfaFailures = await admin.session.get("/api/admin/incidents");
  addAudit({ eventType: "mfa_fallido", createdAt: new Date(Date.now() - 10_000).toISOString() });
  const threeMfaFailures = await admin.session.get("/api/admin/incidents");
  ok("tres fallos MFA en 15 minutos generan alerta y dos no", twoMfaFailures.status === 200 &&
    !twoMfaFailures.json?.alerts.some((alert) => alert.category === "mfa_account") &&
    threeMfaFailures.json?.alerts.some((alert) => alert.category === "mfa_account" && alert.eventCount === 3));
  addAudit({ eventType: "login_bloqueado" });
  addAudit({ eventType: "mfa_descifrado_fallido" });
  const singleEventAlerts = await admin.session.get("/api/admin/incidents");
  ok("un login bloqueado y cualquier fallo de descifrado MFA generan alerta", singleEventAlerts.status === 200 &&
    singleEventAlerts.json?.alerts.some((alert) => alert.category === "login_bloqueado") &&
    singleEventAlerts.json?.alerts.some((alert) => alert.category === "mfa_descifrado"));

  addAudit({ eventType: "consulta_detalle_expediente", expedienteId: expediente.id, metadata: { mfa: true } });
  addAudit({ eventType: "consulta_detalle_expediente", metadata: { mfa: false } });
  const folioFilter = await admin.session.get(`/api/admin/access?folio=${encodeURIComponent(expediente.folio)}&eventType=consulta_detalle_expediente`);
  const filteredEvents = folioFilter.json?.events ?? [];
  ok("el filtro por folio muestra solo el evento asociado y oculta los datos del cliente", folioFilter.status === 200 &&
    folioFilter.json?.total === 1 && filteredEvents.length === 1 &&
    filteredEvents[0].folio === expediente.folio && filteredEvents[0].user === "Cliente" &&
    !folioFilter.text.includes(client.email) && !folioFilter.text.includes(client.display_name),
  `status=${folioFilter.status}, total=${folioFilter.json?.total}, events=${filteredEvents.length}, user=${filteredEvents[0]?.user ?? "ninguno"}, names=${folioFilter.text.includes(client.display_name)}, email=${folioFilter.text.includes(client.email)}`);
  if (filteredEvents.length === 1) {
    await page.goto(`${base}/admin/accesos?folio=${encodeURIComponent(expediente.folio)}&eventType=consulta_detalle_expediente`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Ver detalle: Consulta de expediente" }).waitFor({ state: "visible", timeout: 5000 });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Ver detalle: Consulta de expediente" }).click();
    const auditDialog = page.locator('aside[role="dialog"]');
    await auditDialog.waitFor({ state: "visible", timeout: 5000 });
    const auditDetail = await auditDialog.innerText();
    ok("Auditoría abre el detalle lateral con metadatos permitidos sin identidad del cliente",
      auditDetail.includes("Cliente") && auditDetail.includes(expediente.folio) &&
      !auditDetail.includes(client.email) && !auditDetail.includes(client.display_name));
  } else {
    ok("Auditoría abre el detalle lateral con metadatos permitidos sin identidad del cliente", false, "sin evento filtrado para abrir");
  }

  const integrations = await admin.session.get("/admin/integraciones");
  ok("Integraciones presenta CRM y Desk como no configurados sin tokens", integrations.status === 200 &&
    integrations.text.includes("Zoho CRM") && integrations.text.includes("Zoho Desk") &&
    integrations.text.includes("No configurado") && integrations.text.includes("Nunca se exponen tokens"));

  const legacyPages = ["/admin", "/admin/usuarios", "/admin/accesos", "/admin/integraciones", "/seguridad"];
  const legacyResponses = await Promise.all(legacyPages.map((route) => admin.session.get(route)));
  ok("las rutas administrativas anteriores siguen respondiendo para admin",
    legacyResponses.every((response) => response.status === 200));

  const audit = database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'recuperacion_cliente_generada'").get();
  ok("la generación del enlace queda en la bitácora", Number(audit?.count ?? 0) === 1);
} catch (error) {
  console.error("Error en supervisor-a8-admin:", error instanceof Error ? error.message : "fallo desconocido");
  fail++;
} finally {
  database?.close();
  if (browser) await browser.close();
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
