import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2] ?? process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-8d-"));
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
  MFA_REQUIRED_ROLES: "admin_seguridad",
  PUBLIC_BASE_URL: "https://publico.example.invalid",
  ALLOWED_ORIGINS: "https://tunel.example.invalid, https://equipo.example.invalid",
};
const password = "ConectaLocal-2026!";
let server;
let db;
let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  passed++;
  console.log(`  ✅ ${name}`);
};

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((part) => parseInt(part, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = crypto.createHmac("sha1", key).update(counter).digest();
  return String((hash.readUInt32BE(hash.at(-1) & 15) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

try {
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "0.0.0.0", () => {
      const selected = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(selected));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const localOrigin = `http://localhost:${port}`;
  for (const script of ["scripts/db-migrate.ts", "scripts/db-seed.ts"]) {
    execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), script], { cwd: root, env, stdio: "inherit" });
  }
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "0.0.0.0"], { cwd: root, env, stdio: "inherit" });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`El servidor aislado terminó: ${server.exitCode}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("El servidor aislado no respondió.");

  function loginWith(headers) {
    return new Promise((resolve, reject) => {
      const request = http.request(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
      }, (response) => {
        response.resume();
        response.on("end", () => resolve({ status: response.statusCode }));
      });
      request.on("error", reject);
      request.end(JSON.stringify({ email: "cliente.demo@example.invalid", password }));
    });
  }
  const localhostLogin = await loginWith({ host: `localhost:${port}`, origin: localOrigin });
  check(`localhost con Host coincidente (HTTP ${localhostLogin.status})`, localhostLogin.status === 200);
  check("127.0.0.1 con Host coincidente", (await loginWith({ origin: base })).status === 200);
  check("origen de request.url", (await loginWith({ origin: `http://0.0.0.0:${port}` })).status === 200);
  check("origen de PUBLIC_BASE_URL", (await loginWith({ origin: "https://publico.example.invalid" })).status === 200);
  check("primer origen permitido", (await loginWith({ origin: "https://tunel.example.invalid" })).status === 200);
  check("segundo origen permitido", (await loginWith({ origin: "https://equipo.example.invalid" })).status === 200);
  check("origen ajeno rechazado", (await loginWith({ origin: "http://evil.example" })).status === 403);
  check("sin Origin rechazado", (await loginWith({})).status === 403);
  check("Host no coincidente rechazado", (await loginWith({ origin: localOrigin })).status === 403);
  check("protocolo distinto rechazado", (await loginWith({ origin: `https://127.0.0.1:${port}` })).status === 403);
  check("puerto distinto rechazado", (await loginWith({ origin: `http://127.0.0.1:${port === 65535 ? port - 1 : port + 1}` })).status === 403);
  check("X-Forwarded-Host ajeno rechazado", (await loginWith({ origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" })).status === 403);
  check("X-Forwarded-Host permitido no amplía la lista", (await loginWith({ origin: "https://tunel.example.invalid", "x-forwarded-host": "tunel.example.invalid" })).status === 200);
  check("Origin con ruta rechazado", (await loginWith({ origin: "https://tunel.example.invalid/otro" })).status === 403);

  class Session {
    jar = new Map();
    async request(method, route, body) {
      const headers = { origin: base };
      if (this.jar.size) headers.cookie = [...this.jar].map(([key, value]) => `${key}=${value}`).join("; ");
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const i = pair.indexOf("=");
        if (pair.slice(i + 1)) this.jar.set(pair.slice(0, i), pair.slice(i + 1));
        else this.jar.delete(pair.slice(0, i));
      }
      const text = await response.text();
      return { status: response.status, location: response.headers.get("location"), json: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : null };
    }
    get(route) { return this.request("GET", route); }
    post(route, body) { return this.request("POST", route, body); }
    login(email, pass = password) { return this.post("/api/auth/login", { email, password: pass }); }
    async enroll() {
      const begin = await this.post("/api/auth/mfa", { action: "begin" });
      assert.equal(begin.status, 200);
      const confirmed = await this.post("/api/auth/mfa", { action: "confirm", code: totp(begin.json.secret) });
      assert.equal(confirmed.status, 200);
      return confirmed.json.backupCodes;
    }
  }

  const admin = new Session();
  assert.equal((await admin.login("seguridad.demo@example.invalid")).status, 200);
  for (const route of ["/admin", "/admin/usuarios", "/admin/accesos", "/admin/no-existe"]) {
    const response = await admin.get(route);
    check(`${route} redirige sin MFA`, response.status === 307 && response.location === "/seguridad");
  }
  await admin.enroll();
  check("admin con MFA accede a /admin/usuarios", (await admin.get("/admin/usuarios")).status === 200);

  const manager = new Session();
  assert.equal((await manager.login("coordinador.demo@example.invalid")).status, 200);
  const managerBackups = await manager.enroll();
  const managerLogin = new Session();
  const challenge = await managerLogin.login("coordinador.demo@example.invalid");
  check("MFA opcional vinculado exige desafío sin sesión", challenge.json?.mfaRequired === true && !managerLogin.jar.has("conecta-session"));
  check("código MFA incorrecto no crea sesión", (await managerLogin.post("/api/auth/mfa/verify", { code: "incorrecto" })).status === 401 && !managerLogin.jar.has("conecta-session"));
  check("código de respaldo completa MFA opcional", (await managerLogin.post("/api/auth/mfa/verify", { code: managerBackups[0] })).status === 200 && managerLogin.jar.has("conecta-session"));
  const users = (await admin.get("/api/admin/users")).json.users;
  const managerId = users.find((user) => user.email === "coordinador.demo@example.invalid").id;
  for (const reason of ["", "  abc  ", "    ", "🔥🔥"]) {
    check("motivo vacío o corto rechazado", (await admin.post("/api/admin/users", { action: "disable_mfa", userId: managerId, reason })).status === 400);
  }
  check("motivo de cinco caracteres aceptado", (await admin.post("/api/admin/users", { action: "disable_mfa", userId: managerId, reason: "  cinco  " })).status === 200);
  db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  const audit = db.prepare("SELECT metadata_json FROM audit_events WHERE event_type = 'mfa_desvinculado_admin' AND entity_id = ? ORDER BY created_at DESC LIMIT 1").get(managerId);
  check("motivo recortado en bitácora", JSON.parse(audit.metadata_json).reason === "cinco");

  const managerAgain = new Session();
  assert.equal((await managerAgain.login("coordinador.demo@example.invalid")).status, 200);
  const clientId = users.find((user) => user.email === "cliente.demo@example.invalid").id;
  const generate = async () => {
    const response = await managerAgain.post("/api/auth/recovery", { action: "generate", userId: clientId });
    assert.equal(response.status, 200);
    return new URL(response.json.setupUrl).searchParams.get("token");
  };
  const expired = await generate();
  db.prepare("UPDATE password_setup_tokens SET expires_at = ? WHERE token_hash = ?").run("2000-01-01T00:00:00.000Z", crypto.createHash("sha256").update(expired).digest("hex"));
  check("recuperación de cliente vencida rechazada", (await new Session().post("/api/auth/setup-password", { token: expired, newPassword: "NuevaClave-2026!" })).status === 400);
  const valid = await generate();
  check("recuperación de cliente vigente aceptada", (await new Session().post("/api/auth/setup-password", { token: valid, newPassword: "NuevaClave-2026!" })).status === 200);
  check("recuperación de cliente de un solo uso", (await new Session().post("/api/auth/setup-password", { token: valid, newPassword: "OtraClave-2026!" })).status === 400);
  check("cliente entra con contraseña nueva", (await new Session().login("cliente.demo@example.invalid", "NuevaClave-2026!")).status === 200);
  const setupAudit = db.prepare("SELECT actor_role FROM audit_events WHERE event_type = 'definicion_contrasena_enlace' AND entity_id = ? ORDER BY created_at DESC LIMIT 1").get(clientId);
  check("bitácora conserva el rol real del cliente", setupAudit?.actor_role === "cliente");
  const adminId = db.prepare("SELECT id FROM users WHERE email = ?").get("seguridad.demo@example.invalid").id;
  const forbiddenToken = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO password_setup_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(
    crypto.randomUUID(), adminId, crypto.createHash("sha256").update(forbiddenToken).digest("hex"),
    new Date(Date.now() + 60_000).toISOString(), new Date().toISOString(),
  );
  check("token de rol no permitido rechazado", (await new Session().post("/api/auth/setup-password", { token: forbiddenToken, newPassword: "OtraClave-2026!" })).status === 400);
  const client = new Session();
  assert.equal((await client.login("cliente.demo@example.invalid", "NuevaClave-2026!")).status, 200);
  const clientBackups = await client.enroll();
  const clientLogin = new Session();
  const clientChallenge = await clientLogin.login("cliente.demo@example.invalid", "NuevaClave-2026!");
  check("cliente con MFA también recibe desafío sin sesión", clientChallenge.json?.mfaRequired === true && !clientLogin.jar.has("conecta-session"));
  check("cliente puede completar MFA opcional", (await clientLogin.post("/api/auth/mfa/verify", { code: clientBackups[0] })).status === 200 && clientLogin.jar.has("conecta-session"));
  console.log(`RESULTADO 8d: ${passed} ✅ / 0 ❌`);
} finally {
  db?.close();
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}
