import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";

const root = path.resolve(process.argv[2] ?? process.cwd());
const port = 3211;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a8b-recovery-"));
const password = "ConectaLocal-2026!";
const adminEmail = "seguridad.demo@example.invalid";
const managerEmail = "coordinador.demo@example.invalid";
const clientEmail = "cliente.demo@example.invalid";
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: "a8".repeat(32),
  MFA_REQUIRED_ROLES: "admin_seguridad,coordinador_idc",
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
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const captureDir = path.join(root, "docs", "reportes", "img");
let pass = 0;
let fail = 0;
const failures = [];
let server;
let database;
let browser;
let context;
let page;
let admin;
let manager;
let replacement;
let client;
let clientExpediente;
let managerId;
let replacementId;
let adminId;
let extraAdminId;
let adminTotpSecret;

const ok = (name, condition, detail = "") => {
  if (condition) { pass++; console.log("  ✅", name); }
  else { fail++; failures.push(name); console.log("  ❌", name, detail); }
};

class Session {
  cookies = {};
  async request(method, route, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (Object.keys(this.cookies).length) headers.cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    if (body !== undefined) {
      headers.origin = base;
      headers["content-type"] = "application/json";
    }
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
  post(route, body, headers) { return this.request("POST", route, body, headers); }
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

async function enableMfa(session) {
  const begin = await session.post("/api/auth/mfa", { action: "begin" });
  if (begin.status !== 200 || !begin.json?.secret) throw new Error("No se pudo iniciar el enrolamiento MFA ficticio.");
  const confirmed = await session.post("/api/auth/mfa", { action: "confirm", code: totp(begin.json.secret) });
  if (confirmed.status !== 200) throw new Error("No se pudo confirmar el enrolamiento MFA ficticio.");
  return begin.json.secret;
}

async function totpAfter(secret, usedStep) {
  while (Math.floor(Date.now() / 30_000) <= usedStep) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return totp(secret);
}

async function publicRecovery(email, ip) {
  const anonymous = new Session();
  return anonymous.post("/api/auth/recovery", { action: "request", email }, { "x-forwarded-for": ip });
}

function createUser({ email, displayName, surname = "Pruebas Ficticias", phone = "6621234567", role, status = "activo" }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const seedUser = database.prepare("SELECT password_hash FROM users WHERE email = ?").get(role === "admin_seguridad" ? adminEmail : role === "coordinador_idc" ? managerEmail : clientEmail);
  database.prepare(`
    INSERT INTO users (id, email, display_name, apellidos, telefono_contacto, role, status, password_hash, created_at, updated_at, must_change_password)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(id, email, displayName, surname, phone, role, status, seedUser.password_hash, now, now);
  return id;
}

function auditRows(eventType, entityId) {
  return database.prepare("SELECT metadata_json FROM audit_events WHERE event_type = ? AND entity_id = ? ORDER BY created_at DESC").all(eventType, entityId);
}

try {
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "ignore" });
  execFileSync(process.execPath, [tsx, "scripts/db-seed.ts"], { cwd: root, env, stdio: "ignore" });
  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const seededAdmin = database.prepare("SELECT id FROM users WHERE email = ? AND role = 'admin_seguridad'").get(adminEmail);
  const seededManager = database.prepare("SELECT id FROM users WHERE email = ? AND role = 'coordinador_idc'").get(managerEmail);
  const seededClient = database.prepare("SELECT id, display_name FROM users WHERE email = ? AND role = 'cliente'").get(clientEmail);
  clientExpediente = database.prepare("SELECT id, folio FROM expedientes WHERE cliente_id = ? ORDER BY folio LIMIT 1").get(seededClient?.id);
  if (!seededAdmin || !seededManager || !seededClient || !clientExpediente) throw new Error("Faltan cuentas o expediente ficticio en la semilla.");
  adminId = seededAdmin.id;
  managerId = seededManager.id;
  client = seededClient;
  replacementId = createUser({ email: "gestor.reasignado@example.invalid", displayName: "Gestor Reasignado", role: "coordinador_idc" });
  createUser({ email: "gestor.recuperacion@example.invalid", displayName: "Gestor Recuperación", role: "coordinador_idc" });
  extraAdminId = createUser({ email: "admin.segundo@example.invalid", displayName: "Admin Segundo", role: "admin_seguridad" });
  createUser({ email: "codigo.unico@example.invalid", displayName: "Cliente Código", role: "cliente" });
  createUser({ email: "codigo.vencido@example.invalid", displayName: "Cliente Vencido", role: "cliente" });
  createUser({ email: "codigo.agotado@example.invalid", displayName: "Cliente Agotado", role: "cliente" });
  createUser({ email: "captura.codigo@example.invalid", displayName: "Cliente Captura", role: "cliente" });
  database.prepare("UPDATE users SET apellidos = ?, telefono_contacto = ? WHERE id = ?").run("Apellido Confidencial", "6621234567", client.id);
  database.prepare("UPDATE expedientes SET status = 'activo', gestor_id = ? WHERE id = ?").run(managerId, clientExpediente.id);
  const activeAssignment = database.prepare(`
    SELECT id FROM expediente_assignments
    WHERE expediente_id = ? AND assignment_type = 'coordinador_idc' AND ends_at IS NULL AND user_id = ?
  `).get(clientExpediente.id, managerId);
  if (!activeAssignment) {
    const now = new Date().toISOString();
    database.prepare("UPDATE expediente_assignments SET ends_at = ? WHERE expediente_id = ? AND assignment_type = 'coordinador_idc' AND ends_at IS NULL")
      .run(now, clientExpediente.id);
    database.prepare("INSERT INTO expediente_assignments (id, expediente_id, user_id, assignment_type, assigned_by, starts_at, created_at) VALUES (?, ?, ?, 'coordinador_idc', ?, ?, ?)")
      .run(crypto.randomUUID(), clientExpediente.id, managerId, adminId, now, now);
  }
  database.close();
  database = null;
  fs.mkdirSync(captureDir, { recursive: true });

  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], { cwd: root, env, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("No inició el servidor aislado de A8b.");

  admin = await login(adminEmail);
  manager = await login(managerEmail);
  replacement = await login("gestor.reasignado@example.invalid");
  if (admin.response.status !== 200 || manager.response.status !== 200 || replacement.response.status !== 200) {
    throw new Error(`No iniciaron las cuentas ficticias: admin=${admin.response.status}, gestor=${manager.response.status}, reemplazo=${replacement.response.status}.`);
  }
  adminTotpSecret = await enableMfa(admin.session);
  await enableMfa(replacement.session);
  const managerGate = await manager.session.get("/gestor");
  const managerSecurity = await manager.session.get("/seguridad");
  const managerApiBlocked = await manager.session.get("/api/coordinator/requests");
  await enableMfa(manager.session);
  const managerPageAfterMfa = await manager.session.get("/gestor");
  ok("Gestor IDC con MFA obligatorio pasa por Mi seguridad y luego entra al Gestor",
    (managerGate.status === 307 || managerGate.status === 308) &&
    managerGate.headers.get("location")?.endsWith("/seguridad") &&
    managerSecurity.status === 200 && managerApiBlocked.status === 403 &&
    managerPageAfterMfa.status === 200,
  `gestor=${managerGate.status}, seguridad=${managerSecurity.status}, api=${managerApiBlocked.status}, después=${managerPageAfterMfa.status}`);

  const clientLogin = await login(clientEmail);
  const clientSecurity = await clientLogin.session.get("/seguridad");
  const clientMfaBegin = await clientLogin.session.post("/api/auth/mfa", { action: "begin" });
  const clientSecret = clientMfaBegin.json?.secret ?? "";
  const clientConfirmStep = Math.floor(Date.now() / 30_000);
  const clientMfaConfirm = await clientLogin.session.post("/api/auth/mfa", { action: "confirm", code: totp(clientSecret) });
  const clientDisableCode = await totpAfter(clientSecret, clientConfirmStep);
  const clientMfaDisable = await clientLogin.session.post("/api/auth/mfa", { action: "disable", password, code: clientDisableCode });
  ok("Mi seguridad está disponible para Cliente y permite vincular y desvincular MFA opcional",
    clientLogin.response.status === 200 && clientSecurity.status === 200 &&
    clientMfaBegin.status === 200 && clientMfaConfirm.status === 200 && clientMfaDisable.status === 200,
  `login=${clientLogin.response.status}, seguridad=${clientSecurity.status}, begin=${clientMfaBegin.status}, confirm=${clientMfaConfirm.status}, disable=${clientMfaDisable.status}`);

  database = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const countRecovery = () => Number(database.prepare("SELECT COUNT(*) AS count FROM password_recovery_requests").get().count);
  const beforeHoneypot = countRecovery();
  const registrationHoneypot = await new Session().post("/api/auth/register", {
    email: "trampa.registro@example.invalid", password, displayName: "Trampa", website: "spam",
    privacyAccepted: true, privacyVersion: "0.1-borrador",
  });
  const recoveryHoneypot = await new Session().post("/api/auth/recovery", { action: "request", email: clientEmail, website: "spam" });
  ok("honeypot responde con normalidad y no guarda solicitudes de cuenta ni recuperación",
    registrationHoneypot.status === 201 && recoveryHoneypot.status === 200 && countRecovery() === beforeHoneypot);

  const nonexistentEmail = "no.existe@example.invalid";
  const noticesBefore = Number(database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'recuperacion_cliente'").get(managerId).count);
  const adminNoticesBefore = Number(database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'recuperacion_solicitada'").get(adminId).count);
  const unknown = await publicRecovery(nonexistentEmail, "203.0.1.1");
  const noticesAfterUnknown = Number(database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'recuperacion_cliente'").get(managerId).count);
  const known = await publicRecovery(clientEmail, "203.0.2.1");
  const unknownRow = database.prepare("SELECT id, account_exists FROM password_recovery_requests WHERE email = ?").get(nonexistentEmail);
  const managerNoticeCount = Number(database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'recuperacion_cliente'").get(managerId).count);
  const adminNoticeCount = Number(database.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND type = 'recuperacion_solicitada'").get(adminId).count);
  const notifications = database.prepare("SELECT body FROM notifications WHERE user_id = ? AND type = 'recuperacion_cliente'").all(managerId);
  const adminPending = await admin.session.get("/api/auth/recovery?status=pendiente");
  const managerPending = await manager.session.get("/api/auth/recovery?status=pendiente");
  const knownRequest = database.prepare("SELECT id FROM password_recovery_requests WHERE email = ? ORDER BY requested_at DESC LIMIT 1").get(clientEmail);
  ok("la solicitud avisa al admin y al Gestor responsable, sin filtrar existencia ni correo",
    unknown.status === 200 && known.status === 200 && unknown.text === known.text &&
    unknownRow?.account_exists === 0 && noticesAfterUnknown === noticesBefore &&
    managerNoticeCount > noticesBefore && adminNoticeCount > adminNoticesBefore &&
    notifications.every((item) => !item.body.includes(clientEmail)) &&
    adminPending.json?.requests.some((item) => item.id === knownRequest?.id) &&
    managerPending.json?.requests.some((item) => item.id === knownRequest?.id));

  const recoveryManagerEmail = "gestor.recuperacion@example.invalid";
  const managerRecovery = await publicRecovery(recoveryManagerEmail, "203.0.3.1");
  const adminRecovery = await publicRecovery("admin.segundo@example.invalid", "203.0.4.1");
  const managerRequestId = database.prepare("SELECT id FROM password_recovery_requests WHERE email = ? ORDER BY requested_at DESC LIMIT 1").get(recoveryManagerEmail).id;
  const adminRequestId = database.prepare("SELECT id FROM password_recovery_requests WHERE email = ? ORDER BY requested_at DESC LIMIT 1").get("admin.segundo@example.invalid").id;
  const managerList = await manager.session.get("/api/auth/recovery?status=pendiente");
  const managerDismissManager = await manager.session.post("/api/auth/recovery", { action: "dismiss", requestId: managerRequestId, reason: "No autorizado" });
  const managerDismissAdmin = await manager.session.post("/api/auth/recovery", { action: "dismiss", requestId: adminRequestId, reason: "No autorizado" });
  const adminList = await admin.session.get("/api/auth/recovery?status=pendiente");
  const adminDismissManager = await admin.session.post("/api/auth/recovery", { action: "dismiss", requestId: managerRequestId, reason: "Solicitud verificada" });
  const adminDismissOtherAdmin = await admin.session.post("/api/auth/recovery", { action: "dismiss", requestId: adminRequestId, reason: "Solicitud verificada" });
  ok("el Gestor solo ve solicitudes de clientes y no puede ocultar solicitudes de Gestor/Admin; admin sí",
    managerRecovery.status === 200 && adminRecovery.status === 200 &&
    !managerList.json?.requests.some((item) => [managerRequestId, adminRequestId].includes(item.id)) &&
    managerDismissManager.status === 404 && managerDismissAdmin.status === 404 &&
    adminList.json?.requests.some((item) => item.id === managerRequestId) &&
    adminDismissManager.status === 200 && adminDismissOtherAdmin.status === 200);

  const managerRecoveryAgain = await publicRecovery(recoveryManagerEmail, "203.0.5.1");
  const managerRequestAgain = database.prepare("SELECT id FROM password_recovery_requests WHERE email = ? AND status = 'pendiente' ORDER BY requested_at DESC LIMIT 1").get(recoveryManagerEmail);
  const managerLink = await admin.session.post("/api/auth/recovery", { action: "generate", requestId: managerRequestAgain?.id });
  ok("admin puede generar enlace para Gestor y la solicitud queda atendida", managerRecoveryAgain.status === 200 &&
    managerLink.status === 200 && Boolean(managerLink.json?.setupUrl) &&
    database.prepare("SELECT status FROM password_recovery_requests WHERE id = ?").get(managerRequestAgain?.id)?.status === "atendida");

  const codeRequest = await publicRecovery("codigo.unico@example.invalid", "203.0.10.1");
  const codeRequestId = database.prepare("SELECT id FROM password_recovery_requests WHERE email = ? ORDER BY requested_at DESC LIMIT 1").get("codigo.unico@example.invalid").id;
  const generated = await admin.session.post("/api/auth/recovery", { action: "generate_code", requestId: codeRequestId });
  const codeRow = database.prepare("SELECT code_hash, status FROM password_recovery_codes WHERE request_id = ?").get(codeRequestId);
  const codeUse = await new Session().post("/api/auth/recovery/code", { email: "codigo.unico@example.invalid", code: generated.json?.code, newPassword: "NuevaClaveSegura-2026!" });
  const codeReuse = await new Session().post("/api/auth/recovery/code", { email: "codigo.unico@example.invalid", code: generated.json?.code, newPassword: "OtraClaveSegura-2026!" });
  const codeAudit = database.prepare("SELECT metadata_json FROM audit_events WHERE entity_type = 'password_recovery_code' AND entity_id = ?").all(database.prepare("SELECT id FROM password_recovery_codes WHERE request_id = ?").get(codeRequestId).id);
  ok("código de 8 caracteres usa solo hash, se consume una vez y nunca se audita en claro",
    codeRequest.status === 200 && generated.status === 200 && /^[A-HJ-NP-Z2-9]{8}$/.test(generated.json?.code ?? "") &&
    codeRow?.code_hash !== generated.json?.code && codeUse.status === 200 && codeReuse.status === 400 &&
    codeAudit.every((row) => !row.metadata_json.includes(generated.json.code)));

  const expiredRequest = await publicRecovery("codigo.vencido@example.invalid", "203.0.11.1");
  const expiredRequestId = database.prepare("SELECT id FROM password_recovery_requests WHERE email = ? ORDER BY requested_at DESC LIMIT 1").get("codigo.vencido@example.invalid").id;
  const expiredGenerated = await admin.session.post("/api/auth/recovery", { action: "generate_code", requestId: expiredRequestId });
  database.prepare("UPDATE password_recovery_codes SET expires_at = ? WHERE request_id = ?").run(new Date(Date.now() - 60_000).toISOString(), expiredRequestId);
  const expiredUse = await new Session().post("/api/auth/recovery/code", { email: "codigo.vencido@example.invalid", code: expiredGenerated.json?.code, newPassword: "NuevaClaveSegura-2026!" });
  const expiredAudit = Number(database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'recuperacion_codigo_vencido'").get().count);
  ok("un código vencido falla y deja evento de auditoría", expiredRequest.status === 200 && expiredGenerated.status === 200 && expiredUse.status === 400 && expiredAudit === 1);

  const exhaustedRequest = await publicRecovery("codigo.agotado@example.invalid", "203.0.12.1");
  const exhaustedId = database.prepare("SELECT id FROM password_recovery_requests WHERE email = ? ORDER BY requested_at DESC LIMIT 1").get("codigo.agotado@example.invalid").id;
  const exhaustedCode = await admin.session.post("/api/auth/recovery", { action: "generate_code", requestId: exhaustedId });
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Session().post("/api/auth/recovery/code", { email: "codigo.agotado@example.invalid", code: "ZZZZZZZZ", newPassword: "NuevaClaveSegura-2026!" });
  }
  const exhaustedState = database.prepare("SELECT c.status AS code_status, r.status AS request_status FROM password_recovery_codes c JOIN password_recovery_requests r ON r.id = c.request_id WHERE c.request_id = ?").get(exhaustedId);
  const exhaustedAudit = Number(database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'recuperacion_codigo_agotado'").get().count);
  ok("al sexto intento incorrecto se agota el código y se cierra la solicitud",
    exhaustedRequest.status === 200 && exhaustedCode.status === 200 &&
    exhaustedState?.code_status === "agotado" && exhaustedState?.request_status === "atendida" && exhaustedAudit === 1);

  const rateEmail = "rate.email@example.invalid";
  const emailAttempts = await Promise.all([1, 2, 3, 4].map((index) => publicRecovery(rateEmail, `198.51.100.${index}`)));
  const emailRequestCount = Number(database.prepare("SELECT COUNT(*) AS count FROM password_recovery_requests WHERE email = ?").get(rateEmail).count);
  const ipAttempts = [];
  for (let index = 1; index <= 11; index++) {
    ipAttempts.push(await publicRecovery(`rate.ip.${index}@example.invalid`, "198.51.101.40"));
  }
  const ipRequestCount = Number(database.prepare("SELECT COUNT(*) AS count FROM password_recovery_requests WHERE email LIKE 'rate.ip.%@example.invalid'").get().count);
  const limitedEvents = Number(database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'recuperacion_limitada'").get().count);
  ok("límites de 3 por correo y 10 por IP truncada responden genéricamente y se auditan",
    emailAttempts.every((response) => response.status === 200 && response.text === unknown.text) &&
    emailRequestCount === 3 && ipAttempts.every((response) => response.status === 200 && response.text === unknown.text) &&
    ipRequestCount === 10 && limitedEvents >= 2);

  const oldRecent = database.prepare("SELECT id FROM sessions WHERE user_id = ? AND revoked_at IS NULL").get(adminId);
  database.prepare("UPDATE sessions SET mfa_recent_verified_at = NULL WHERE user_id = ?").run(adminId);
  const revealWithoutMfa = await admin.session.post("/api/admin/users/contact", { userId: client.id, field: "apellidos" });
  const adminLastStep = Number(database.prepare("SELECT last_used_step FROM user_mfa WHERE user_id = ?").get(adminId)?.last_used_step ?? -1);
  const revealCode = await totpAfter(adminTotpSecret, adminLastStep);
  const revealed = await admin.session.post("/api/admin/users/contact", { userId: client.id, field: "apellidos", code: revealCode });
  const revealAudit = auditRows("dato_contacto_revelado", client.id).map((row) => JSON.parse(row.metadata_json));
  const managerReveal = await manager.session.post("/api/admin/users/contact", { userId: client.id, field: "email" });
  ok("revelar contacto exige MFA reciente, devuelve solo el campo pedido y audita sin valor; Gestor recibe 403",
    Boolean(oldRecent) && revealWithoutMfa.status === 428 &&
    revealed.status === 200 && revealed.json?.field === "apellidos" && revealed.json?.value === "Apellido Confidencial" &&
    revealAudit.some((metadata) => metadata.field === "apellidos") &&
    !JSON.stringify(revealAudit).includes("Apellido Confidencial") &&
    managerReveal.status === 403,
  `sin MFA=${revealWithoutMfa.status}, revelar=${revealed.status}, campo=${revealed.json?.field}, Gestor=${managerReveal.status}`);

  const extraAdminLogin = await login("admin.segundo@example.invalid");
  if (extraAdminLogin.response.status !== 200) throw new Error("No inició sesión el admin secundario ficticio.");
  await enableMfa(extraAdminLogin.session);
  const selfDeactivation = await admin.session.post("/api/admin/users", { userId: adminId, action: "deactivate", reason: "Prueba de baja" });
  const otherAdminDeactivation = await admin.session.post("/api/admin/users", { userId: extraAdminId, action: "deactivate", reason: "Prueba de baja" });
  const activeAdminCount = Number(database.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin_seguridad' AND status = 'activo'").get().count);
  ok("no se permite la baja propia y la baja de otro admin conserva un admin activo",
    selfDeactivation.status === 409 && otherAdminDeactivation.status === 200 && activeAdminCount >= 1);

  const coordinatorUsers = await admin.session.get("/api/admin/users");
  const oldManagerAccount = coordinatorUsers.json?.users?.find((user) => user.id === managerId);
  const noReassignment = await admin.session.post("/api/admin/users", { userId: managerId, action: "deactivate", reason: "Prueba de baja" });
  const expedientesApi = await manager.session.get(`/api/expedientes/${clientExpediente.id}`);
  const managerOwnSecurity = await manager.session.get("/seguridad");
  ok("un Gestor con expedientes activos no puede darse de baja sin reasignar y conserva acceso a su seguridad",
    coordinatorUsers.status === 200 && (oldManagerAccount?.responsible_count ?? 0) > 0 &&
    noReassignment.status === 409 && expedientesApi.status === 200 && managerOwnSecurity.status === 200,
  `usuarios=${coordinatorUsers.status}, asignados=${oldManagerAccount?.responsible_count}, baja=${noReassignment.status}, expediente=${expedientesApi.status}, seguridad=${managerOwnSecurity.status}`);

  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await context.addInitScript((value) => localStorage.setItem("conecta-session", JSON.stringify(value)), {
    name: admin.response.json?.name,
    role: admin.response.json?.role,
  });
  await context.addCookies(Object.entries(admin.session.cookies).map(([name, value]) => ({ name, value, url: base })));
  page = await context.newPage();

  const captureRequest = await publicRecovery("captura.codigo@example.invalid", "203.0.20.1");
  await page.goto(`${base}/admin/recuperacion`, { waitUntil: "domcontentloaded" });
  await page.getByText("ca•••@e•••.invalid", { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  const captureRecovery = await admin.session.get("/api/auth/recovery?status=pendiente");
  const captureItem = captureRecovery.json?.requests?.find((item) => item.email === "ca•••@e•••.invalid");
  if (captureRequest.status !== 200) throw new Error("No se generó la solicitud ficticia para la captura.");
  await page.locator("li").filter({ hasText: "ca•••@e•••.invalid" }).getByRole("button", { name: "Generar código" }).click();
  await page.getByText(/Entrega este código una sola vez/).waitFor({ state: "visible", timeout: 5000 });
  await page.screenshot({ path: path.join(captureDir, "a8b-recuperacion-codigo.png") });
  ok("captura ficticia del código de recuperación generada", Boolean(captureItem?.id) && fs.existsSync(path.join(captureDir, "a8b-recuperacion-codigo.png")));

  const accountsPageResponse = await page.goto(`${base}/admin/usuarios`, { waitUntil: "domcontentloaded" });
  await page.getByText(client.display_name, { exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.getByLabel("Buscar por nombre o correo").fill(client.display_name);
  if (await page.getByRole("button", { name: "Mostrar apellidos" }).count() === 0) {
    const text = await page.locator("body").innerText();
    throw new Error(`No aparece el control de revelación: HTTP ${accountsPageResponse?.status()}, nombre=${client.display_name}, URL ${page.url()}, texto ${text.slice(-1200)}`);
  }
  await page.getByRole("button", { name: "Mostrar apellidos" }).first().click();
  if (await page.getByLabel(/Código OneAuth/).count()) {
    const lastRevealStep = Number(database.prepare("SELECT last_used_step FROM user_mfa WHERE user_id = ?").get(adminId)?.last_used_step ?? -1);
    await page.getByLabel(/Código OneAuth/).fill(await totpAfter(adminTotpSecret, lastRevealStep));
    await page.getByRole("button", { name: "Verificar y mostrar" }).click();
  }
  await page.waitForTimeout(500);
  const revealedBody = await page.locator("body").innerText();
  if (!revealedBody.includes("Apellido Confidencial")) {
    throw new Error(`El dato de contacto no apareció en la pantalla: ${revealedBody.slice(-1000)}`);
  }
  await page.screenshot({ path: path.join(captureDir, "a8b-dato-revelado.png") });
  ok("captura ficticia de dato revelado generada", fs.existsSync(path.join(captureDir, "a8b-dato-revelado.png")));

  await page.getByLabel("Buscar por nombre o correo").fill(oldManagerAccount.display_name);
  await page.getByRole("button", { name: "Dar de baja" }).first().click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });
  const select = page.getByRole("dialog").locator("select").first();
  if (await select.count()) await select.selectOption(replacementId);
  await page.getByLabel("Motivo (mínimo 5 caracteres)").fill("Reasignación de prueba");
  await page.screenshot({ path: path.join(captureDir, "a8b-baja-cuenta.png") });
  ok("captura ficticia del modal de baja y reasignación generada", fs.existsSync(path.join(captureDir, "a8b-baja-cuenta.png")));

  const managerDeactivation = await admin.session.post("/api/admin/users", {
    userId: managerId, action: "deactivate", reason: "Baja con reasignación", reassignToId: replacementId,
  });
  const managerAfterDeactivation = database.prepare("SELECT status FROM users WHERE id = ?").get(managerId);
  const assignmentAfter = database.prepare("SELECT user_id FROM expediente_assignments WHERE expediente_id = ? AND assignment_type = 'coordinador_idc' AND ends_at IS NULL").get(clientExpediente.id);
  const inactiveLogin = await login(managerEmail);
  const clientStillExists = database.prepare("SELECT id FROM expedientes WHERE id = ? AND cliente_id = ?").get(clientExpediente.id, client.id);
  const replacementExpediente = await replacement.session.get(`/api/expedientes/${clientExpediente.id}`);
  ok("baja del Gestor reasigna el expediente, revoca el acceso y deja historial visible al nuevo responsable",
    managerDeactivation.status === 200 && managerAfterDeactivation?.status === "baja" &&
    assignmentAfter?.user_id === replacementId && inactiveLogin.response.status !== 200 &&
    clientStillExists && replacementExpediente.status === 200);

  const managerReactivation = await admin.session.post("/api/admin/users", { userId: managerId, action: "reactivate" });
  const reactivatedManager = database.prepare("SELECT status FROM users WHERE id = ?").get(managerId);
  const clientBaja = await admin.session.post("/api/admin/users", { userId: client.id, action: "deactivate", reason: "Cuenta ficticia de prueba" });
  const clientBajaLogin = await login(clientEmail);
  const expedienteAfterClientBaja = await replacement.session.get(`/api/expedientes/${clientExpediente.id}`);
  ok("Reactivar recupera la cuenta; la baja del Cliente bloquea su acceso y conserva visible el expediente para IDC",
    managerReactivation.status === 200 && reactivatedManager?.status === "activo" &&
    clientBaja.status === 200 && database.prepare("SELECT status FROM users WHERE id = ?").get(client.id)?.status === "baja" &&
    clientBajaLogin.response.status !== 200 && expedienteAfterClientBaja.status === 200);

  const adminAccountResponse = await admin.session.get("/api/admin/users");
  ok("las respuestas administrativas no exponen hashes de contraseña, tokens ni contenido documental",
    adminAccountResponse.status === 200 && !/password_hash|passwordHash|setupUrl|token=|document_content|document_text/i.test(adminAccountResponse.text));
} catch (error) {
  console.error("Error en supervisor-a8b-recuperacion:", error instanceof Error ? error.message : "fallo desconocido");
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
