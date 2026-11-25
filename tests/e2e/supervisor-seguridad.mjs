import crypto from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3199";
const password = "ConectaLocal-2026!";
const checks = [];

function ok(name, value, detail = "") {
  checks.push({ name, value });
  console.log(`  ${value ? "✅" : "❌"} ${name}${value ? "" : ` ${detail}`}`);
}

function client() {
  let cookie = "";
  return {
    async request(path, options = {}) {
      const headers = { origin: BASE, ...(options.headers ?? {}) };
      if (cookie) headers.cookie = cookie;
      const response = await fetch(`${BASE}${path}`, { ...options, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      let json = null;
      try { json = await response.json(); } catch {}
      return { response, json };
    },
    post(path, body) {
      return this.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    },
  };
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let buffer = 0;
  const bytes = [];
  for (const char of value.replaceAll("=", "").toUpperCase()) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const admin = client();
let result = await admin.post("/api/auth/login", { email: "seguridad.demo@example.invalid", password });
ok("admin inicia sesión sin MFA y queda habilitado para vincularlo", result.response.ok, JSON.stringify(result.json));
result = await admin.post("/api/auth/mfa", { action: "begin" });
const setup = result.json;
ok("inicia vinculación MFA", result.response.ok && Boolean(setup?.secret), JSON.stringify(result.json));
result = await admin.post("/api/auth/mfa", { action: "confirm", code: setup?.secret ? totp(setup.secret) : "000000" });
ok("código TOTP válido activa MFA", result.response.ok && result.json?.enabled === true && result.json?.backupCodes?.length === 10, JSON.stringify(result.json));
const backup = result.json?.backupCodes?.[0];

const secondLogin = client();
result = await secondLogin.post("/api/auth/login", { email: "seguridad.demo@example.invalid", password });
ok("login con MFA devuelve desafío sin crear sesión", result.response.ok && result.json?.mfaRequired === true, JSON.stringify(result.json));
result = await secondLogin.post("/api/auth/mfa/verify", { code: "000000" });
ok("código MFA inválido devuelve 401", result.response.status === 401, JSON.stringify(result.json));
result = await secondLogin.post("/api/auth/mfa/verify", { code: backup });
ok("código de respaldo válido completa login", result.response.ok && result.json?.role === "admin_seguridad", JSON.stringify(result.json));
result = await secondLogin.post("/api/auth/mfa/verify", { code: backup });
ok("código de respaldo usado no se puede reutilizar", result.response.status === 401, JSON.stringify(result.json));

const cliente = client();
await cliente.post("/api/auth/login", { email: "cliente.demo@example.invalid", password });
result = await cliente.post("/api/auth/recovery", { action: "request", email: "cliente.demo@example.invalid" });
ok("cliente puede solicitar recuperación con respuesta genérica", result.response.ok && result.json?.message, JSON.stringify(result.json));

result = await secondLogin.request("/api/admin/access?failed=1");
ok("admin consulta bitácora filtrada", result.response.ok && Array.isArray(result.json?.events), JSON.stringify(result.json));
result = await secondLogin.request("/api/admin/access?format=csv");
ok("admin exporta bitácora CSV", result.response.ok && (result.response.headers.get("content-type") ?? "").includes("text/csv"), "content-type incorrecto");

const failed = checks.filter((check) => !check.value);
console.log(`SEGURIDAD: ${checks.length - failed.length} ✅ / ${failed.length} ❌`);
process.exitCode = failed.length ? 1 : 0;
