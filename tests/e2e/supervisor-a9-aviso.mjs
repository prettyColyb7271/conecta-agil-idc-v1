import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(process.argv[2] ?? process.cwd());
const port = 3209;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a9-aviso-"));
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const avisoVersion = "0.1-borrador";
const password = "ConectaLocal-2026!";
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
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
let pass = 0;
let fail = 0;
const failures = [];
let server;
let serverError;
let serverExit;
let db;

function ok(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log("  ✅", name);
  } else {
    fail += 1;
    failures.push(name);
    console.log("  ❌", name, detail);
  }
}

function must(name, response, expected) {
  ok(name, response.status === expected, response.json?.error);
  if (response.status !== expected) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json;
}

function runTsx(script) {
  execFileSync(process.execPath, [tsx, script], { cwd: root, env, stdio: "ignore" });
}

class Session {
  cookies = {};
  async request(method, url, body) {
    const headers = { origin: base };
    const cookie = Object.entries(this.cookies).map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.cookie = cookie;
    if (body) headers["content-type"] = "application/json";
    const response = await fetch(`${base}${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair.indexOf("=");
      if (pair.slice(index + 1)) this.cookies[pair.slice(0, index)] = pair.slice(index + 1);
      else delete this.cookies[pair.slice(0, index)];
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Respuesta no JSON: HTTP ${response.status}`); }
    return { status: response.status, json };
  }
  get(url) { return this.request("GET", url); }
  post(url, body) { return this.request("POST", url, body); }
  cookieHeader() {
    return Object.entries(this.cookies).map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

try {
  runTsx("scripts/db-migrate.ts");
  runTsx("scripts/db-seed.ts");
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: root,
    env,
    stdio: "ignore",
  });
  server.once("error", (error) => { serverError = error; });
  server.once("exit", (code, signal) => { serverExit = code === 0 ? "exitó antes de responder" : `código ${code ?? signal}`; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; }
    } catch {}
    if (serverError || serverExit) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error(`No inició el servidor aislado de A9${serverError ? `: ${serverError.message}` : serverExit ? `: ${serverExit}` : "."}`);

  const privacyPage = await fetch(`${base}/privacidad`);
  const privacyHtml = await privacyPage.text();
  ok("/privacidad es pública, muestra la versión y el aviso preliminar",
    privacyPage.status === 200 && privacyHtml.includes(avisoVersion) &&
    privacyHtml.includes("Versión preliminar en revisión por IDC. No usar con clientes reales todavía."));
  ok("los marcadores de confirmación se conservan y resaltan en amarillo",
    privacyHtml.includes("[CONFIRMAR: razón social completa de IDC Sistemas Eléctricos]") &&
    privacyHtml.includes("bg-yellow-200"));

  const registrationPage = await fetch(`${base}/registro`);
  const registrationHtml = await registrationPage.text();
  ok("el registro muestra aceptación obligatoria y enlace al aviso",
    registrationPage.status === 200 && registrationHtml.includes("Leí el aviso de privacidad") &&
    registrationHtml.includes('name="privacyAccepted"') && registrationHtml.includes("required") &&
    registrationHtml.includes('href="/privacidad"'));
  const request = (email, acceptance = {}) => fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ email, displayName: "Cliente A9 Ficticio", password, ...acceptance }),
  });
  const missingRegistration = await request("a9-sin-aviso@example.invalid");
  ok("registro API rechaza una solicitud sin aceptación", missingRegistration.status === 400);
  const acceptedRegistration = await request("a9-con-aviso@example.invalid", { privacyAccepted: true, privacyVersion: avisoVersion });
  const acceptedBody = await acceptedRegistration.json();
  db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  db.exec("PRAGMA busy_timeout = 5000;");
  const savedVersion = db.prepare("SELECT privacy_notice_version FROM account_requests WHERE email = ?").get("a9-con-aviso@example.invalid");
  ok("registro API guarda la versión aceptada", acceptedRegistration.status === 201 &&
    acceptedBody.message && savedVersion?.privacy_notice_version === avisoVersion);
  db.close();
  db = null;

  const client = new Session();
  const manager = new Session();
  must("login ficticio de cliente", await client.post("/api/auth/login", { email: "cliente.demo@example.invalid", password }), 200);
  must("login ficticio de gestor", await manager.post("/api/auth/login", { email: "coordinador.demo@example.invalid", password }), 200);
  const list = must("consultar expedientes para fixture", await manager.get("/api/expedientes"), 200);
  const sample = list.expedientes[0];
  const owner = list.options.responsables.find((item) => item.email === "coordinador.demo@example.invalid");
  if (!sample || !owner) throw new Error("La semilla A9 no tiene el cliente o responsable esperado.");
  const created = must("crear expediente A9", await manager.post("/api/expedientes", {
    clienteId: sample.cliente_id,
    tramite: "interconexion_fv_mt",
    nivelTension: "MT",
    habilitado: true,
    responsableId: owner.id,
  }), 201).expediente;
  const endpoint = `/api/expedientes/${created.id}`;
  const portal = await fetch(`${base}/portal`, { headers: { cookie: client.cookieHeader() } });
  const portalHtml = await portal.text();
  ok("el portal no permite aceptar sin marcar la casilla",
    portal.status === 200 && portalHtml.includes("Leí y acepto el aviso de privacidad") &&
    /<button[^>]*disabled[^>]*>Aceptar<\/button>/.test(portalHtml));
  ok("la API de expedientes rechaza aceptación sin versión",
    (await client.post(`${endpoint}/privacy`, {})).status === 400);
  ok("la API de expedientes rechaza una versión anterior",
    (await client.post(`${endpoint}/privacy`, { version: "0.0-anterior" })).status === 400);
  ok("G0 sigue bloqueado hasta la aceptación", (await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G0" })).status === 409);
  must("aceptar la versión vigente", await client.post(`${endpoint}/privacy`, { version: avisoVersion }), 200);
  must("cerrar G0 tras la aceptación", await manager.post(`${endpoint}/gates`, { action: "close", gateCode: "G0" }), 200);
  db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  db.exec("PRAGMA busy_timeout = 5000;");
  const before = db.prepare("SELECT gate_code, status FROM gates WHERE expediente_id = ? ORDER BY gate_code").all(created.id);
  db.prepare("UPDATE expedientes SET privacy_accepted_version = '0.0-anterior' WHERE id = ?").run(created.id);
  db.close();
  db = null;
  const changedPortal = await fetch(`${base}/portal`, { headers: { cookie: client.cookieHeader() } });
  const changedHtml = await changedPortal.text();
  db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  db.exec("PRAGMA busy_timeout = 5000;");
  const after = db.prepare("SELECT gate_code, status FROM gates WHERE expediente_id = ? ORDER BY gate_code").all(created.id);
  ok("al detectar una versión anterior vuelve a pedir aceptación sin cambiar los Gates",
    changedPortal.status === 200 && changedHtml.includes("Hay una nueva versión del aviso de privacidad") &&
    JSON.stringify(before) === JSON.stringify(after) && after.find((gate) => gate.gate_code === "G0")?.status === "cerrado");
  db.close();
  db = null;
} catch (error) {
  console.error("Error en supervisor-a9-aviso:", error instanceof Error ? error.message : "fallo desconocido");
  fail += 1;
  failures.push("ejecución completa de A9");
} finally {
  db?.close();
  if (server && !server.killed) {
    server.kill();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {
    console.error("No se pudo limpiar la base temporal de A9.");
    fail += 1;
    failures.push("limpieza de datos temporales");
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(` - ${failures.join("\n - ")}`);
  if (fail) process.exitCode = 1;
}
