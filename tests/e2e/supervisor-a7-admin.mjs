import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = 3208;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a7-admin-"));
const demoDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a7-demo-"));
const databasePath = path.join(dataDir, "conecta-agil.sqlite");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const password = "ConectaLocal-2026!";
const sentinel = "A7_PRIVATE_SENTINEL";
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  MFA_ENCRYPTION_KEY_ANTERIOR: "",
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
let serverLog = "";

const ok = (name, condition, detail = "") => {
  if (condition) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    failures.push(name);
    console.log("  ❌", name, detail);
  }
};

class Session {
  cookies = {};

  async request(method, route, body) {
    const headers = {};
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
  post(route, body) { return this.request("POST", route, body); }
}

function runTsx(script) {
  execFileSync(process.execPath, [tsx, script], { cwd: root, env, stdio: "ignore" });
}

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of secret.replaceAll("=", "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Secreto TOTP ficticio inválido.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function insertAuditFixtures() {
  const database = new DatabaseSync(databasePath);
  try {
    const ids = database.prepare(`
      SELECT
        (SELECT id FROM users WHERE email = 'seguridad.demo@example.invalid') AS actor_id,
        (SELECT id FROM users WHERE email = 'cliente.demo@example.invalid') AS client_id,
        (SELECT id FROM users WHERE email = 'coordinador.demo@example.invalid') AS manager_id,
        (SELECT id FROM expedientes WHERE folio = 'IDC-DEMO-0001') AS expediente_id
    `).get();
    if (!ids.actor_id || !ids.client_id || !ids.manager_id || !ids.expediente_id) throw new Error("No se encontraron los datos ficticios de A7.");
    const expediente = database.prepare("SELECT data_json FROM expedientes WHERE id = ?").get(ids.expediente_id);
    const data = JSON.parse(expediente.data_json);
    data.solicitante.nombre_razon_social = "A7_CLIENT_NAME_SENTINEL";
    data.solicitante.rfc = "A7_RFC_SENTINEL";
    database.prepare("UPDATE expedientes SET data_json = ? WHERE id = ?").run(JSON.stringify(data), ids.expediente_id);
    const requirementId = database.prepare("SELECT id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = 'R06'").get(ids.expediente_id)?.id;
    if (!requirementId) throw new Error("No se encontró el requisito de documento ficticio.");
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    database.prepare(`
      INSERT INTO documents (id, expediente_id, requirement_id, document_type, source, sensitivity, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'identificacion', 'cliente', 'sensible', 'cargado', ?, ?, ?)
    `).run(documentId, ids.expediente_id, requirementId, ids.client_id, createdAt, createdAt);
    database.prepare(`
      INSERT INTO document_versions (id, document_id, version_number, storage_key, original_filename, mime_type, size_bytes, sha256, author_id, origin, created_at)
      VALUES (?, ?, 1, ?, ?, 'application/pdf', 1, ?, ?, 'carga', ?)
    `).run(versionId, documentId, "private/a7-test.pdf", "A7_FILENAME_SENTINEL.pdf", "A7_HASH_SENTINEL", ids.client_id, createdAt);
    database.prepare("UPDATE expediente_requirements SET document_id = ?, version_id = ?, status = 'cargado' WHERE id = ?").run(documentId, versionId, requirementId);
    database.prepare(`
      INSERT INTO observations (id, expediente_id, requirement_id, document_version_id, author_id, visibility, body, created_at)
      VALUES (?, ?, ?, ?, ?, 'interno_idc', ?, ?)
    `).run(crypto.randomUUID(), ids.expediente_id, requirementId, versionId, ids.manager_id, "A7_OBSERVATION_SENTINEL", createdAt);

    const insert = database.prepare(`
      INSERT INTO audit_events (id, actor_id, actor_role, event_type, entity_type, entity_id, metadata_json, created_at)
      VALUES (?, ?, 'admin_seguridad', ?, 'user', ?, ?, ?)
    `);
    const now = new Date();
    const fixtureDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0));
    for (let index = 0; index < 57; index += 1) {
      fixtureDate.setUTCSeconds(fixtureDate.getUTCSeconds() + 1);
      insert.run(
        crypto.randomUUID(),
        ids.actor_id,
        "a7_fixture",
        sentinel,
        JSON.stringify({ mfa: true, requested: false, token: sentinel, hash: "A7_HASH_SENTINEL", ip: "192.0.2.10", nested: { document: sentinel } }),
        fixtureDate.toISOString(),
      );
    }
    insert.run(
      crypto.randomUUID(),
      ids.actor_id,
      "login_ok",
      sentinel,
      JSON.stringify({ mfa: true, token: sentinel, hash: "A7_HASH_SENTINEL", ip: "192.0.2.10" }),
      fixtureDate.toISOString(),
    );
  } finally {
    database.close();
  }
}

async function startServer(serverEnv = env) {
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: root,
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && server.exitCode === null && server.signalCode === null) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("No inició el servidor temporal de A7.");
}

async function stopServer() {
  if (!server) return;
  const current = server;
  if (current.exitCode === null && current.signalCode === null) {
    current.kill();
    await new Promise((resolve) => {
      current.once("exit", resolve);
      setTimeout(resolve, 5_000).unref();
    });
  }
  server = undefined;
}

function buildDemoMode(demoEnv) {
  execFileSync(process.execPath, [tsx, "scripts/write-build-mode.ts"], { cwd: root, env: demoEnv, stdio: "ignore" });
  execFileSync(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
    cwd: root,
    env: demoEnv,
    stdio: "ignore",
  });
}

async function login(email) {
  const session = new Session();
  const response = await session.post("/api/auth/login", { email, password });
  return { session, response };
}

try {
  runTsx("scripts/db-migrate.ts");
  runTsx("scripts/db-seed.ts");
  await startServer();

  const adminLogin = await login("seguridad.demo@example.invalid");
  ok("admin ficticio inicia sesión", adminLogin.response.status === 200);
  if (adminLogin.response.status !== 200) throw new Error("No se pudo iniciar sesión como admin.");
  const begin = await adminLogin.session.post("/api/auth/mfa", { action: "begin" });
  const secret = begin.json?.secret;
  const confirm = await adminLogin.session.post("/api/auth/mfa", { action: "confirm", code: totp(secret) });
  ok("admin ficticio habilita MFA para las rutas protegidas", begin.status === 200 && confirm.status === 200);
  if (confirm.status !== 200) throw new Error("No se pudo habilitar MFA en el fixture temporal.");

  const firstManager = await adminLogin.session.post("/api/admin/users", {
    action: "create_gestor",
    displayName: "Gestor A7 Ficticio Uno",
    email: "a7-gestor-uno@example.invalid",
  });
  const secondManager = await adminLogin.session.post("/api/admin/users", {
    action: "create_gestor",
    displayName: "Gestor A7 Ficticio Dos",
    email: "a7-gestor-dos@example.invalid",
  });
  const blockManager = await adminLogin.session.post("/api/admin/users", {
    action: "block",
    userId: secondManager.json?.user?.id,
  });
  ok("crea dos gestores y bloquea uno para comprobar conteos reales", firstManager.status === 201 && secondManager.status === 201 && blockManager.status === 200);
  if (blockManager.status !== 200) throw new Error("No se pudo preparar el fixture de cuentas.");
  insertAuditFixtures();

  const dashboard = await adminLogin.session.get("/admin");
  const dashboardCounts = new DatabaseSync(databasePath, { readOnly: true });
  let actualManagerCount;
  let actualBlockedCount;
  let actualPasswordChangeCount;
  try {
    actualManagerCount = dashboardCounts.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'coordinador_idc'").get()?.count;
    actualBlockedCount = dashboardCounts.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'bloqueado'").get()?.count;
    actualPasswordChangeCount = dashboardCounts.prepare("SELECT COUNT(*) AS count FROM users WHERE must_change_password = 1").get()?.count;
  } finally { dashboardCounts.close(); }
  ok("Inicio muestra conteos reales de roles y bloqueos coincidentes con la BD",
    dashboard.status === 200 &&
    dashboard.text.includes("Totales por rol") &&
    dashboard.text.includes("Administración de seguridad") &&
    dashboard.text.includes(`>Gestor IDC</span><strong>${actualManagerCount}</strong>`) &&
    dashboard.text.includes(`>Bloqueadas</span><strong>${actualBlockedCount}</strong>`) &&
    dashboard.text.includes(`Pendientes de contraseña`) &&
    dashboard.text.includes(`>${actualPasswordChangeCount}</p>`));
  const accountsPage = await adminLogin.session.get("/admin/usuarios");
  ok("Cuentas local carga desde la API y no contiene nombres de data/mock.ts", accountsPage.status === 200 && accountsPage.text.includes("Cargando cuentas") && !accountsPage.text.includes("Prudencio Villa Buenaventura") && !accountsPage.text.includes("Gestor IDC Demo"));
  const accessPage = await adminLogin.session.get("/admin/accesos");
  const integrationsPage = await adminLogin.session.get("/admin/integraciones");
  const securityPage = await adminLogin.session.get("/seguridad");
  ok("las cinco pantallas administrativas responden 200 al admin autenticado con MFA",
    [dashboard, accountsPage, accessPage, integrationsPage, securityPage].every((response) => response.status === 200) &&
    accessPage.text.includes("Bitácora de accesos") &&
    securityPage.text.includes("No proyectes esta pantalla"));
  ok("Integraciones local carga outbox sin iniciar envíos Zoho", integrationsPage.status === 200 && integrationsPage.text.includes("Así se vería en Zoho Projects") && integrationsPage.text.includes("La sincronización es de un solo sentido"));

  const accessPageOne = await adminLogin.session.get("/api/admin/access?eventType=a7_fixture&page=1");
  const accessPageTwo = await adminLogin.session.get("/api/admin/access?eventType=a7_fixture&page=2");
  ok("la bitácora pagina 50 filas y conserva el total filtrado", accessPageOne.status === 200 && accessPageOne.json?.events.length === 50 && accessPageOne.json?.total === 57 && accessPageOne.json?.pages === 2);
  ok("la segunda página contiene el resto sin duplicar registros", accessPageTwo.status === 200 && accessPageTwo.json?.events.length === 7 && accessPageTwo.json?.page === 2);

  const adminId = new DatabaseSync(databasePath, { readOnly: true });
  let adminUserId;
  try { adminUserId = adminId.prepare("SELECT id FROM users WHERE email = ?").get("seguridad.demo@example.invalid")?.id; } finally { adminId.close(); }
  const filtered = await adminLogin.session.get(`/api/admin/access?eventType=a7_fixture&userId=${encodeURIComponent(adminUserId)}&from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`);
  ok("filtros por usuario, tipo y rango de fechas limitan los resultados", filtered.status === 200 && filtered.json?.total === 57);
  const spanishEvent = await adminLogin.session.get("/api/admin/access?eventType=login_ok");
  ok("Accesos entrega fecha dd/mm/aaaa hh:mm y etiqueta en español con código interno para tooltip",
    spanishEvent.status === 200 &&
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(spanishEvent.json?.events[0]?.createdAt ?? "") &&
    spanishEvent.json?.events[0]?.event === "Inicio de sesión" &&
    spanishEvent.json?.events[0]?.eventType === "login_ok");
  const invalidDate = await adminLogin.session.get("/api/admin/access?from=2026-02-30");
  ok("rechaza fechas inválidas en filtros", invalidDate.status === 400);

  const safeRow = accessPageOne.json?.events[0];
  const serializedLog = JSON.stringify(accessPageOne.json);
  ok("metadata_json pasa por allowlist y no expone token, hash, IP, correo ni contenido", Array.isArray(safeRow?.metadata) && safeRow.metadata.some((item) => item.label === "MFA" && item.value === "Sí") && !serializedLog.includes(sentinel) && !serializedLog.includes("A7_HASH_SENTINEL") && !serializedLog.includes("192.0.2.10") && !serializedLog.includes("metadata_json") && !serializedLog.includes("email"));
  const csv = await adminLogin.session.get("/api/admin/access?eventType=a7_fixture&format=csv");
  ok("CSV exporta metadatos sanitizados y no incluye tokens, hashes, correos ni valores arbitrarios", csv.status === 200 && csv.text.includes("metadatos_permitidos") && csv.text.includes("MFA: Sí") && !csv.text.includes(sentinel) && !csv.text.includes("A7_HASH_SENTINEL") && !csv.text.includes("192.0.2.10") && !csv.text.includes("seguridad.demo@example.invalid"));

  const privateContent = ["A7_CLIENT_NAME_SENTINEL", "A7_RFC_SENTINEL", "A7_FILENAME_SENTINEL", "A7_OBSERVATION_SENTINEL"];
  const adminPageBodies = await Promise.all([dashboard, accountsPage, accessPage, integrationsPage, securityPage].map((response) => response.text));
  const accountsApi = await adminLogin.session.get("/api/admin/users");
  const integrationsApi = await adminLogin.session.get("/api/admin/integraciones");
  ok("Integraciones API consulta el transporte file con la outbox aislada", integrationsApi.status === 200 && integrationsApi.json?.transport === "file" && Array.isArray(integrationsApi.json?.entries));
  const privacyBodies = [...adminPageBodies, JSON.stringify(accessPageOne.json), JSON.stringify(accountsApi.json), JSON.stringify(integrationsApi.json)];
  ok("ninguna pantalla admin filtra nombre de cliente, RFC, archivo ni observación interna", privateContent.every((value) => privacyBodies.every((body) => !body.includes(value))));

  for (const email of ["cliente.demo@example.invalid", "coordinador.demo@example.invalid"]) {
    const { session, response } = await login(email);
    const usersApi = await session.get("/api/admin/users");
    const accessApi = await session.get("/api/admin/access");
    const integrationsApi = await session.get("/api/admin/integraciones");
    ok(`${email.startsWith("cliente") ? "cliente" : "gestor"} recibe 403 en APIs admin`, response.status === 200 && usersApi.status === 403 && accessApi.status === 403 && integrationsApi.status === 403);
    const adminPage = await session.get("/admin");
    const expectedHome = email.startsWith("cliente") ? "/portal" : "/gestor";
    ok(`${email.startsWith("cliente") ? "cliente" : "gestor"} no accede al tablero y vuelve a su perfil`,
      adminPage.status === 307 && new URL(adminPage.headers.get("location") ?? "/", base).pathname === expectedHome);
  }

  await stopServer();
  const demoEnv = {
    ...env,
    APP_MODE: "demo",
    NEXT_PUBLIC_MODO: "demo",
    LOCAL_DATA_DIR: demoDir,
  };
  buildDemoMode(demoEnv);
  await startServer(demoEnv);
  const demoPaths = ["/admin", "/admin/usuarios", "/admin/accesos", "/admin/integraciones", "/seguridad"];
  const demoPages = await Promise.all(demoPaths.map((route) => fetch(`${base}${route}`)));
  ok("las cinco pantallas administrativas en demo responden sin SQLite", demoPages.every((response) => response.status === 200));
  const demoBodies = await Promise.all(demoPages.map((response) => response.text()));
  ok("las cinco pantallas demo identifican los datos de ejemplo", demoBodies.every((body) => body.includes("Ejemplo")));
  const demoAccessApi = await fetch(`${base}/api/admin/access`);
  ok("el endpoint de bitácora no abre datos locales en modo demo", demoAccessApi.status === 404 && !fs.existsSync(path.join(demoDir, "conecta-agil.sqlite")));
  ok("el panel demo de Zoho no genera outbox ni llama al transporte externo", !fs.existsSync(path.join(demoDir, "conecta-agil.sqlite")) && !serverLog.includes("api.zoho.com"));
} catch (error) {
  console.error("Error en supervisor-a7-admin:", error instanceof Error ? error.message : "fallo desconocido");
  if (serverLog) console.error(serverLog.slice(-2000));
  process.exitCode = 1;
} finally {
  await stopServer();
  for (const directory of [dataDir, demoDir]) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      console.error("No se pudieron eliminar los datos temporales de A7.");
      process.exitCode = 1;
    }
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
