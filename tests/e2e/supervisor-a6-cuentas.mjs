import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(process.argv[2] ?? process.cwd());
const port = 3212;
const base = `http://localhost:${port}`;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a6-cuentas-"));
const dataDir = path.join(tempRoot, "demo-data");
const snapshotsDir = path.join(tempRoot, "demo-data-snapshots");
const localAppData = path.join(tempRoot, "localappdata");
const realDataDir = path.join(localAppData, "ConectaAgil");
const oneDriveDataDir = path.join(os.tmpdir(), "OneDrive", `conecta-a6-${process.pid}`);
const databasePath = path.join(dataDir, "conecta-agil.sqlite");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCALAPPDATA: localAppData,
  LOCAL_DATA_DIR: dataDir,
  PUBLIC_BASE_URL: base,
  MFA_ENCRYPTION_KEY: "a6".repeat(32),
  MFA_ENCRYPTION_KEY_ANTERIOR: "",
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
const accountEmails = [
  "cliente.demo@example.invalid",
  "coordinador.demo@example.invalid",
  "idc2.demo@example.invalid",
  "seguridad.demo@example.invalid",
];
const passwords = new Map([
  [accountEmails[0], "Cliente-A6-Nueva!2026"],
  [accountEmails[1], "GestorUno-A6-Nueva!2026"],
  [accountEmails[2], "GestorDos-A6-Nueva!2026"],
  [accountEmails[3], "Admin-A6-Nueva!2026"],
]);
let pass = 0;
let fail = 0;
const failures = [];
let server;
let setupRequestIp = 0;

function ok(name, condition, detail = "") {
  if (condition) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    failures.push(name);
    console.log("  ❌", name, detail);
  }
}

function runTsx(script, args = [], overrides = {}) {
  return spawnSync(process.execPath, [tsx, script, ...args], {
    cwd: root,
    env: { ...env, ...overrides },
    encoding: "utf8",
    timeout: 60_000,
  });
}

function database(read) {
  const db = new DatabaseSync(databasePath);
  try {
    return read(db);
  } finally {
    db.close();
  }
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function parseLinks(directory = dataDir) {
  const content = fs.readFileSync(path.join(directory, "CUENTAS_DEMO.local.md"), "utf8");
  return [...content.matchAll(/^\- \*\*(.+?)\*\* \((.+?)\) — vence .+?: \[Definir contraseña\]\((https?:\/\/[^)]+)\)$/gm)]
    .map((match) => ({ role: match[1], email: match[2], url: match[3] }));
}

function outputIsPrivate(result) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return !/https?:\/\//i.test(output) && !/\b(?:token|contraseña|password)\b/i.test(output) &&
    !/\b[A-Za-z0-9_-]{40,}\b/.test(output);
}

class Session {
  cookies = {};
  async request(method, route, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (Object.keys(this.cookies).length) {
      headers.cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    }
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
    let json;
    try { json = await response.json(); } catch {}
    return { status: response.status, json };
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

async function totpAfter(secret, usedStep) {
  while (Math.floor(Date.now() / 30_000) <= usedStep) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return totp(secret);
}

async function startServer() {
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", port], {
    cwd: root,
    env,
    stdio: "ignore",
  });
  let error;
  server.on("error", (cause) => { error = cause; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !error && server.exitCode === null && server.signalCode === null) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  server.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3_000);
    server.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  server = null;
}

async function setupPassword(url, email) {
  const token = new URL(url).searchParams.get("token");
  const session = new Session();
  setupRequestIp++;
  return session.post("/api/auth/setup-password", { token, newPassword: passwords.get(email) }, {
    "x-forwarded-for": `198.51.100.${setupRequestIp}`,
  });
}

try {
  fs.mkdirSync(realDataDir, { recursive: true });
  const protectedReal = runTsx("scripts/cuentas-demo.ts", [], { LOCAL_DATA_DIR: realDataDir });
  const protectedOneDrive = runTsx("scripts/cuentas-demo.ts", [], { LOCAL_DATA_DIR: oneDriveDataDir });
  ok("cuentas:demo rechaza la carpeta real y una ruta dentro de OneDrive",
    protectedReal.status !== 0 && protectedOneDrive.status !== 0 &&
    fs.readdirSync(realDataDir).length === 0 && !fs.existsSync(oneDriveDataDir));
  const aliasToReal = path.join(tempRoot, "alias-to-real-data");
  fs.symlinkSync(realDataDir, aliasToReal, process.platform === "win32" ? "junction" : "dir");
  const protectedAlias = runTsx("scripts/cuentas-demo.ts", [], { LOCAL_DATA_DIR: aliasToReal });
  ok("cuentas:demo también rechaza un alias simbólico a la carpeta real",
    protectedAlias.status !== 0 && fs.readdirSync(realDataDir).length === 0);

  const preconfiguredDir = path.join(tempRoot, "preconfigured-data");
  const preconfiguredSeed = runTsx("scripts/demo-seed.ts", [], { LOCAL_DATA_DIR: preconfiguredDir });
  const preconfiguredPassword = "Gestor2-ya-configurado-A6!2026";
  const preconfiguredHash = (() => {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(preconfiguredPassword, salt, 64);
    return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
  })();
  const preconfiguredDb = new DatabaseSync(path.join(preconfiguredDir, "conecta-agil.sqlite"));
  preconfiguredDb.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE email = ?")
    .run(preconfiguredHash, accountEmails[2]);
  preconfiguredDb.close();
  const preconfiguredRun = runTsx("scripts/cuentas-demo.ts", [], { LOCAL_DATA_DIR: preconfiguredDir });
  const preconfiguredLinks = preconfiguredRun.status === 0 ? parseLinks(preconfiguredDir) : [];
  const preconfiguredState = new DatabaseSync(path.join(preconfiguredDir, "conecta-agil.sqlite"), { readOnly: true });
  const preconfiguredUser = preconfiguredState.prepare("SELECT password_hash, must_change_password FROM users WHERE email = ?").get(accountEmails[2]);
  const preconfiguredTokens = preconfiguredState.prepare("SELECT COUNT(*) AS count FROM password_setup_tokens WHERE user_id = (SELECT id FROM users WHERE email = ?)").get(accountEmails[2]).count;
  preconfiguredState.close();
  ok("el primer uso no reemplaza una contraseña ya definida fuera del flujo de enlaces",
    preconfiguredSeed.status === 0 && preconfiguredRun.status === 0 && outputIsPrivate(preconfiguredRun) &&
    preconfiguredUser?.password_hash === preconfiguredHash && preconfiguredUser?.must_change_password === 0 &&
    preconfiguredTokens === 0 && preconfiguredLinks.length === 3 &&
    !preconfiguredLinks.some((link) => link.email === accountEmails[2]));

  const seeded = runTsx("scripts/demo-seed.ts");
  const seedSummary = seeded.status === 0 ? JSON.parse(seeded.stdout.trim().split(/\r?\n/).at(-1)) : {};
  ok("demo:seed prepara exclusivamente la carpeta aislada",
    seeded.status === 0 && seedSummary.gestores >= 2 && seedSummary.administradores >= 1);

  const seedHashes = database((db) => Object.fromEntries(accountEmails.map((email) => [
    email,
    db.prepare("SELECT password_hash FROM users WHERE email = ?").get(email)?.password_hash,
  ])));
  const firstRun = runTsx("scripts/cuentas-demo.ts");
  const firstLinks = firstRun.status === 0 ? parseLinks() : [];
  const firstHashes = database((db) => db.prepare(
    "SELECT email, token_hash FROM password_setup_tokens JOIN users ON users.id = password_setup_tokens.user_id ORDER BY password_setup_tokens.created_at",
  ).all());
  ok("la consola solo informa la ruta del archivo privado y la salida no contiene enlaces ni secretos",
    firstRun.status === 0 && firstRun.stdout.trim() === `Enlaces escritos en ${path.join(dataDir, "CUENTAS_DEMO.local.md")}` &&
    outputIsPrivate(firstRun));
  ok("los cuatro enlaces de 72 horas quedan fuera del repo y de OneDrive",
    firstLinks.length === 4 && firstLinks.every((link) => accountEmails.includes(link.email) &&
      new URL(link.url).searchParams.get("token")?.length >= 40) &&
      isWithin(dataDir, path.join(dataDir, "CUENTAS_DEMO.local.md")) &&
      !isWithin(root, path.join(dataDir, "CUENTAS_DEMO.local.md")) &&
      !path.join(dataDir, "CUENTAS_DEMO.local.md").split(/[\\/]+/).some((part) => part.toLowerCase() === "onedrive"));
  const databaseAfterFirst = database((db) => db.prepare(
    "SELECT email, must_change_password, password_hash FROM users WHERE email IN (?, ?, ?, ?)",
  ).all(...accountEmails));
  const tokenRowsAfterFirst = database((db) => db.prepare(
    "SELECT user_id, token_hash, expires_at, used_at FROM password_setup_tokens WHERE used_at IS NULL",
  ).all());
  ok("cada cuenta queda con contraseña aleatoria y cambio obligatorio, con token de 72 horas",
    databaseAfterFirst.length === 4 && databaseAfterFirst.every((row) =>
      row.must_change_password === 1 && row.password_hash !== seedHashes[row.email]) &&
      tokenRowsAfterFirst.length === 4 && tokenRowsAfterFirst.every((row) =>
        Math.abs(Date.parse(row.expires_at) - Date.now() - 72 * 60 * 60 * 1000) < 60_000));

  const secondRun = runTsx("scripts/cuentas-demo.ts");
  const links = secondRun.status === 0 ? parseLinks() : [];
  const secondHashes = database((db) => db.prepare(
    "SELECT token_hash FROM password_setup_tokens WHERE used_at IS NULL",
  ).all().map((row) => row.token_hash));
  const firstHashesInvalidated = database((db) => firstHashes.every((row) =>
    Boolean(db.prepare("SELECT used_at FROM password_setup_tokens WHERE token_hash = ?").get(row.token_hash)?.used_at)));
  ok("al reejecutar, los enlaces previos se invalidan y la consola no revela secretos",
    secondRun.status === 0 && outputIsPrivate(secondRun) && firstHashesInvalidated &&
    links.length === 4 && secondHashes.length === 4 && secondHashes.every((hash) =>
      !firstHashes.some((old) => old.token_hash === hash)));

  const registrationSource = fs.readFileSync(path.join(root, "app", "registro", "page.tsx"), "utf8");
  const adminUsersSource = fs.readFileSync(path.join(root, "components", "AdminUsuarios.tsx"), "utf8");
  const revealSource = fs.readFileSync(path.join(root, "components", "ContactRevealGroup.tsx"), "utf8");
  const recoveryUiSource = fs.readFileSync(path.join(root, "components", "RecoveryPanel.tsx"), "utf8");
  ok("la regresión fuerza Zoho/correo a archivo y vacía las credenciales externas",
    env.ZOHO_TRANSPORT === "file" && env.EMAIL_TRANSPORT === "file" &&
    !env.RESEND_API_KEY && !env.ZOHO_CLIENT_SECRET && !env.ZOHO_REFRESH_TOKEN);
  ok("la pantalla demo de registro informa que no envía correo",
    registrationSource.includes("Demo: no se envía correo.") && registrationSource.includes("{!LOCAL_MODE"));
  ok("Cuentas muestra expedientes activos solo para Gestores y oculta Mostrar si no hay dato",
    adminUsersSource.includes('user.role === "coordinador_idc" && ` · Expedientes activos a su cargo: ${user.responsible_count}`') &&
    revealSource.includes("isCaptured(item.masked)") && revealSource.includes("no capturado(?:s)?"));
  ok("Recuperación desactiva enlace y código para una cuenta bloqueada",
    recoveryUiSource.includes("Desbloquea la cuenta antes de entregar el código o el enlace.") &&
    (recoveryUiSource.match(/request\.accountStatus === "bloqueado"/g) ?? []).length >= 3);

  const running = await startServer();
  ok("servidor aislado de A6 disponible", running);
  if (running) {
    const staleResults = await Promise.all(firstLinks.map((link) => setupPassword(link.url, link.email)));
    ok("los cuatro enlaces anteriores fallan después de regenerarlos",
      staleResults.every((result) => result.status === 400));

    const successfulLinks = await Promise.all(links.map((link) => setupPassword(link.url, link.email)));
    const reusedLinks = await Promise.all(links.map((link) => setupPassword(link.url, link.email)));
    ok("cada enlace define la contraseña una sola vez, incluso el de admin",
      successfulLinks.every((result) => result.status === 200) && reusedLinks.every((result) => result.status === 400));

    await stopServer();
    const beforeNoop = database((db) => db.prepare(
      "SELECT email, password_hash, must_change_password FROM users WHERE email IN (?, ?, ?, ?)",
    ).all(...accountEmails));
    const noop = runTsx("scripts/cuentas-demo.ts");
    const noLinks = noop.status === 0 ? parseLinks() : [];
    const afterNoop = database((db) => db.prepare(
      "SELECT email, password_hash, must_change_password FROM users WHERE email IN (?, ?, ?, ?)",
    ).all(...accountEmails));
    ok("reejecutar no altera cuentas que ya definieron contraseña",
      noop.status === 0 && outputIsPrivate(noop) && noLinks.length === 0 &&
      beforeNoop.every((user) => {
        const after = afterNoop.find((item) => item.email === user.email);
        return after?.password_hash === user.password_hash && after?.must_change_password === 0;
      }));

    const managerHashBeforeReset = afterNoop.find((user) => user.email === accountEmails[1])?.password_hash;
    const reset = runTsx("scripts/cuentas-demo.ts", ["--reiniciar", accountEmails[0]]);
    const resetLinks = reset.status === 0 ? parseLinks() : [];
    const clientHashAfterReset = database((db) => db.prepare("SELECT password_hash, must_change_password FROM users WHERE email = ?").get(accountEmails[0]));
    passwords.set(accountEmails[0], "Cliente-A6-Reiniciada!2026");
    ok("--reiniciar reemite un único enlace solo para la cuenta indicada",
      reset.status === 0 && outputIsPrivate(reset) && resetLinks.length === 1 &&
      resetLinks[0].email === accountEmails[0] && clientHashAfterReset?.must_change_password === 1 &&
      clientHashAfterReset?.password_hash !== beforeNoop.find((user) => user.email === accountEmails[0])?.password_hash &&
      managerHashBeforeReset === database((db) => db.prepare("SELECT password_hash FROM users WHERE email = ?").get(accountEmails[1])?.password_hash));

    const restartedForReset = await startServer();
    const resetPassword = restartedForReset ? await setupPassword(resetLinks[0]?.url ?? "", accountEmails[0]) : { status: 0 };
    const resetReplay = restartedForReset ? await setupPassword(resetLinks[0]?.url ?? "", accountEmails[0]) : { status: 0 };
    ok("el enlace reemitido define una contraseña nueva una sola vez",
      restartedForReset && resetPassword.status === 200 && resetReplay.status === 400);

    const manager = new Session();
    const managerLogin = await manager.post("/api/auth/login", {
      email: accountEmails[1],
      password: passwords.get(accountEmails[1]),
    });
    const mfaBefore = await manager.get("/api/auth/mfa");
    const protectedManagerArea = await manager.get("/api/coordinator/requests");
    ok("MFA_REQUIRED_ROLES del proceso obliga al Gestor a vincular MFA sin leer .env.local",
      managerLogin.status === 200 && managerLogin.json?.role === "coordinador_idc" &&
      mfaBefore.status === 200 && mfaBefore.json?.enabled === false &&
      protectedManagerArea.status === 403 && protectedManagerArea.json?.mfaRequired === true);

    const registration = await new Session().post("/api/auth/register", {
      email: "correo.demo.a6@example.invalid",
      password: "Registro-A6-Ficticio!2026",
      displayName: "Registro Demo Ficticio",
      apellidos: "Prueba",
      telefono: "5551234567",
      privacyAccepted: true,
      privacyVersion: "0.1-borrador",
    });
    const outboxDir = path.join(dataDir, "outbox-email");
    const emailFiles = fs.existsSync(outboxDir) ? fs.readdirSync(outboxDir) : [];
    const emailFile = emailFiles.length === 1
      ? JSON.parse(fs.readFileSync(path.join(outboxDir, emailFiles[0]), "utf8"))
      : null;
    ok("el transporte de archivo guarda el correo ficticio en outbox-email sin enviar correo real",
      registration.status === 201 && emailFiles.length === 1 && emailFile?.to === "correo.demo.a6@example.invalid");

    const begin = await manager.post("/api/auth/mfa", { action: "begin" });
    const secret = begin.json?.secret;
    const confirm = secret
      ? await manager.post("/api/auth/mfa", { action: "confirm", code: totp(secret) })
      : { status: 0 };
    const confirmRow = database((db) => db.prepare(
      "SELECT secret_ciphertext, enabled_at FROM user_mfa WHERE user_id = (SELECT id FROM users WHERE email = ?)",
    ).get(accountEmails[1]));
    ok("el Gestor configura OneAuth sin exponer el secreto en la salida",
      begin.status === 200 && typeof secret === "string" && confirm.status === 200 &&
      Boolean(confirmRow?.secret_ciphertext) && Boolean(confirmRow?.enabled_at),
      `begin=${begin.status}, confirm=${confirm.status}, error=${confirm.json?.error ?? ""}`);

    await stopServer();
    const savedPasswordHash = database((db) => db.prepare("SELECT password_hash FROM users WHERE email = ?").get(accountEmails[1]).password_hash);
    const savedMfa = database((db) => db.prepare(
      "SELECT secret_ciphertext, enabled_at, last_used_step FROM user_mfa WHERE user_id = (SELECT id FROM users WHERE email = ?)",
    ).get(accountEmails[1]));
    const saved = runTsx("scripts/demo-snapshot.ts", ["save", "base-cuentas"]);
    const snapshotDir = path.join(snapshotsDir, "base-cuentas");
    ok("snapshot conserva la base/correos ficticios y excluye los enlaces de contraseña",
      saved.status === 0 && fs.existsSync(path.join(snapshotDir, "conecta-agil.sqlite")) &&
      fs.existsSync(path.join(snapshotDir, "outbox-email")) &&
      !fs.existsSync(path.join(snapshotDir, "CUENTAS_DEMO.local.md")));

    const restarted = await startServer();
    ok("servidor aislado reiniciado para probar recuperación bloqueada", restarted);
    if (restarted) {
      const requestId = crypto.randomUUID();
      database((db) => {
        db.prepare("UPDATE users SET status = 'bloqueado' WHERE email = ?").run(accountEmails[0]);
        db.prepare("INSERT INTO password_recovery_requests (id, email, status, requested_at, account_exists) VALUES (?, ?, 'pendiente', ?, 1)")
          .run(requestId, accountEmails[0], new Date().toISOString());
      });
      const blockMessage = "Desbloquea la cuenta antes de entregar el código o el enlace.";
      const linkResult = await manager.post("/api/auth/recovery", { action: "generate", requestId });
      const codeResult = await manager.post("/api/auth/recovery", { action: "generate_code", requestId });
      ok("la API bloquea enlace y código con el mismo 409 para cuentas bloqueadas",
        linkResult.status === 409 && linkResult.json?.error === blockMessage &&
        codeResult.status === 409 && codeResult.json?.error === blockMessage);
    }

    await stopServer();
    database((db) => {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE email = ?")
        .run("scrypt$invalid$invalid", accountEmails[1]);
      db.prepare("DELETE FROM user_mfa WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(accountEmails[1]);
      db.prepare("DELETE FROM mfa_backup_codes WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(accountEmails[1]);
    });
    const restored = runTsx("scripts/demo-snapshot.ts", ["restore", "base-cuentas"]);
    const restoredData = database((db) => ({
      user: db.prepare("SELECT password_hash, must_change_password FROM users WHERE email = ?").get(accountEmails[1]),
      mfa: db.prepare("SELECT secret_ciphertext, enabled_at, last_used_step FROM user_mfa WHERE user_id = (SELECT id FROM users WHERE email = ?)").get(accountEmails[1]),
    }));
    ok("restore conserva la contraseña y el MFA y elimina el archivo temporal de enlaces",
      restored.status === 0 && restoredData.user?.password_hash === savedPasswordHash &&
      restoredData.user?.must_change_password === 0 && restoredData.mfa?.secret_ciphertext === savedMfa?.secret_ciphertext &&
      Boolean(restoredData.mfa?.enabled_at) && !fs.existsSync(path.join(dataDir, "CUENTAS_DEMO.local.md")) &&
      fs.existsSync(outboxDir));

    const restoredServer = await startServer();
    if (restoredServer) {
      const restoredManager = new Session();
      const challenge = await restoredManager.post("/api/auth/login", {
        email: accountEmails[1],
        password: passwords.get(accountEmails[1]),
      });
      const verified = challenge.json?.mfaRequired
        ? await restoredManager.post("/api/auth/mfa/verify", { code: await totpAfter(secret, Number(savedMfa.last_used_step)) })
        : { status: 0 };
      ok("después del restore, la misma contraseña y TOTP válido siguen funcionando",
        challenge.status === 200 && challenge.json?.mfaRequired === true &&
        verified.status === 200 && verified.json?.role === "coordinador_idc",
        `login=${challenge.status}, mfa=${challenge.json?.mfaRequired ?? false}, verify=${verified.status}, error=${verified.json?.error ?? ""}`);
    } else {
      ok("después del restore, la misma contraseña y TOTP válido siguen funcionando", false);
    }
  }
} catch (error) {
  console.error("Falló la prueba aislada de cuentas A6.", error instanceof Error ? error.message : "Error desconocido.");
  fail++;
  failures.push("ejecución completa de cuentas A6");
} finally {
  await stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(` - ${failures.join("\n - ")}`);
  if (fail) process.exitCode = 1;
}
