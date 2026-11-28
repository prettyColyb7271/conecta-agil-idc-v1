import crypto from "node:crypto";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = 3207;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-mfa-rotacion-"));
const databasePath = path.join(dataDir, "conecta-agil.sqlite");
const oldKey = "11".repeat(32);
const newKey = "22".repeat(32);
const wrongOldKey = "33".repeat(32);
const wrongCurrentKey = "44".repeat(32);
const password = "ConectaLocal-2026!";
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: oldKey,
  MFA_ENCRYPTION_KEY_ANTERIOR: "",
  MFA_REQUIRED_ROLES: "admin_seguridad",
  EMAIL_TRANSPORT: "file",
  EMAIL_FROM: "Conecta Agil <no-reply@example.invalid>",
  RESEND_API_KEY: "",
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: "",
  ZOHO_REFRESH_TOKEN: "",
};
let pass = 0;
let fail = 0;
const failures = [];
let server;
let serverLog = "";
let userId;
let totpSecret;
let backupCodes = [];

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
    const headers = { origin: base };
    if (Object.keys(this.cookies).length) {
      headers.cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    }
    if (body !== undefined) headers["content-type"] = "application/json";
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
    return { status: response.status, text, json };
  }

  get(route) { return this.request("GET", route); }
  post(route, body) { return this.request("POST", route, body); }
}

function runTsx(script) {
  execFileSync(process.execPath, [tsx, script], { cwd: root, env, stdio: "ignore" });
}

function readMfaState() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const mfa = database.prepare(`
      SELECT secret_ciphertext, secret_iv, secret_auth_tag, last_used_step, updated_at
      FROM user_mfa WHERE user_id = ?
    `).get(userId);
    const backups = database.prepare(`
      SELECT id, code_hash, used_at, created_at FROM mfa_backup_codes
      WHERE user_id = ? ORDER BY id
    `).all(userId);
    return { mfa, backups };
  } finally {
    database.close();
  }
}

function listBackups() {
  const directory = path.join(dataDir, "respaldos");
  return fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => /^antes-rotacion-mfa-.+\.sqlite$/.test(name))
    : [];
}

function runRotation(previousKey, currentKey) {
  return spawnSync(process.execPath, [tsx, "scripts/mfa-rotate-key.ts"], {
    cwd: root,
    env: {
      ...env,
      MFA_ENCRYPTION_KEY_ANTERIOR: previousKey,
      MFA_ENCRYPTION_KEY: currentKey,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

async function startServer(key) {
  const serverEnv = { ...env, MFA_ENCRYPTION_KEY: key, MFA_ENCRYPTION_KEY_ANTERIOR: "" };
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
  throw new Error("No inició el servidor temporal de la prueba MFA.");
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

function b32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Secreto TOTP ficticio inválido.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, step = Math.floor(Date.now() / 30_000) + 1) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", b32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function login(email, userPassword = password) {
  const session = new Session();
  return session.post("/api/auth/login", { email, password: userPassword }).then((response) => ({ session, response }));
}

try {
  const generated = spawnSync(process.execPath, [tsx, "scripts/mfa-new-key.ts"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15_000,
  });
  const generatedLines = generated.stdout?.trim().split(/\r?\n/) ?? [];
  const generatedKey = generatedLines[0] ?? "";
  ok("mfa:nueva-clave imprime una sola clave hexadecimal de 32 bytes",
    generated.status === 0 && generatedLines.length === 1 && generated.stderr === "" && /^[0-9a-f]{64}$/.test(generatedKey));

  runTsx("scripts/db-migrate.ts");
  runTsx("scripts/db-seed.ts");
  await startServer(oldKey);

  const managerLogin = await login("seguridad.demo@example.invalid");
  const manager = managerLogin.session;
  ok("el admin ficticio inicia sesión antes de vincular MFA", managerLogin.response.status === 200);
  const begin = await manager.post("/api/auth/mfa", { action: "begin" });
  totpSecret = begin.json?.secret;
  ok("el admin ficticio inicia la configuración MFA", begin.status === 200 && typeof totpSecret === "string");
  const confirmed = await manager.post("/api/auth/mfa", { action: "confirm", code: totp(totpSecret, Math.floor(Date.now() / 30_000)) });
  backupCodes = confirmed.json?.backupCodes ?? [];
  ok("el admin ficticio vincula MFA y recibe códigos de respaldo", confirmed.status === 200 && backupCodes.length === 10);

  const lookup = new DatabaseSync(databasePath, { readOnly: true });
  userId = lookup.prepare("SELECT id FROM users WHERE email = ?").get("seguridad.demo@example.invalid")?.id;
  lookup.close();
  if (!userId) throw new Error("No se encontró el usuario ficticio con MFA.");
  const before = readMfaState();
  const beforeBackups = listBackups();
  await stopServer();

  const wrongPreviousResult = runRotation(wrongOldKey, newKey);
  const afterWrongPrevious = readMfaState();
  const wrongPreviousOutput = `${wrongPreviousResult.stdout ?? ""}${wrongPreviousResult.stderr ?? ""}`;
  const wrongPreviousBackups = listBackups();
  ok("clave anterior equivocada falla, conserva filas y deja respaldo",
    wrongPreviousResult.status !== 0 &&
    JSON.stringify(afterWrongPrevious) === JSON.stringify(before) &&
    wrongPreviousBackups.length === beforeBackups.length + 1 &&
    ![oldKey, newKey, wrongOldKey].some((key) => wrongPreviousOutput.includes(key)));

  const rotationResult = runRotation(oldKey, newKey);
  const afterRotation = readMfaState();
  const rotationOutput = `${rotationResult.stdout ?? ""}${rotationResult.stderr ?? ""}`;
  const newBackups = listBackups();
  const rowChanged = afterRotation.mfa?.secret_ciphertext !== before.mfa?.secret_ciphertext &&
    afterRotation.mfa?.secret_iv !== before.mfa?.secret_iv &&
    afterRotation.mfa?.secret_auth_tag !== before.mfa?.secret_auth_tag;
  ok("rotación re-cifra una fila, preserva last_used_step y códigos de respaldo",
    rotationResult.status === 0 &&
    rotationResult.stdout?.trim() === "1 secretos MFA re-cifrados" &&
    rowChanged &&
    afterRotation.mfa?.last_used_step === before.mfa?.last_used_step &&
    afterRotation.mfa?.updated_at === before.mfa?.updated_at &&
    JSON.stringify(afterRotation.backups) === JSON.stringify(before.backups) &&
    newBackups.length === beforeBackups.length + 2);
  ok("la salida de rotación no revela ninguna clave",
    ![oldKey, newKey, wrongOldKey, wrongCurrentKey].some((key) => rotationOutput.includes(key)));

  await startServer(newKey);
  const rotatedLogin = await login("seguridad.demo@example.invalid");
  const rotatedChallenge = rotatedLogin.response.json?.mfaRequired === true;
  const rotatedTotp = await rotatedLogin.session.post("/api/auth/mfa/verify", { code: totp(totpSecret) });
  ok("el mismo TOTP sigue validando después de re-cifrar", rotatedChallenge && rotatedTotp.status === 200);
  await stopServer();

  await startServer(wrongCurrentKey);
  const wrongKeyLogin = await login("seguridad.demo@example.invalid");
  const wrongTotp = await wrongKeyLogin.session.post("/api/auth/mfa/verify", { code: totp(totpSecret) });
  const backupLogin = await wrongKeyLogin.session.post("/api/auth/mfa/verify", { code: backupCodes[0] });
  const auditDatabase = new DatabaseSync(databasePath, { readOnly: true });
  const decryptAudit = auditDatabase.prepare(`
    SELECT event_type, metadata_json FROM audit_events
    WHERE event_type = 'mfa_descifrado_fallido' AND entity_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(userId);
  auditDatabase.close();
  ok("clave actual equivocada rechaza TOTP pero admite código de respaldo con auditoría",
    wrongKeyLogin.response.json?.mfaRequired === true &&
    wrongTotp.status === 401 &&
    backupLogin.status === 200 &&
    decryptAudit?.event_type === "mfa_descifrado_fallido" &&
    decryptAudit.metadata_json === "{}");
  ok("los valores sintéticos no aparecen en los logs de la app",
    ![oldKey, newKey, wrongOldKey, wrongCurrentKey, totpSecret, ...backupCodes]
      .some((value) => value && serverLog.includes(value)));
} catch (error) {
  console.error("Error en supervisor-mfa-rotacion:", error instanceof Error ? error.message : "fallo desconocido");
  process.exitCode = 1;
} finally {
  await stopServer();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    console.error("No se pudo limpiar la base temporal de la prueba MFA.");
    process.exitCode = 1;
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
