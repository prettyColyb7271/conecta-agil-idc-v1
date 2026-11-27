// Supervisor: pruebas adversariales de Gestores IDC / contraseña temporal (PASO 5b-2), instancia aislada.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

const root = process.argv[2];
const port = "3197"; const B = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-gest-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir, MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" };
let pass = 0, fail = 0; const fails = []; let serverLog = "";
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ✅", n); } else { fail++; fails.push(n); console.log("  ❌", n, x); } };
const SEED = "ConectaLocal-2026!";
class S { jar = {};
  ck() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, p, json) { const h = { origin: B }; if (this.ck()) h.cookie = this.ck(); if (json !== undefined) h["content-type"] = "application/json";
    const r = await fetch(B + p, { method, headers: h, body: json === undefined ? undefined : JSON.stringify(json), redirect: "manual" });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); const v = kv.slice(i + 1); if (!v) delete this.jar[kv.slice(0, i)]; else this.jar[kv.slice(0, i)] = v; }
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch {} return { status: r.status, loc: r.headers.get("location"), text: t, json: j }; }
  get(p) { return this.req("GET", p); } post(p, b) { return this.req("POST", p, b); }
  login(e, p = SEED) { return this.post("/api/auth/login", { email: e, password: p }); }
}
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0; let buffer = 0; const bytes = [];
  for (const char of secret) { buffer = (buffer << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 255); bits -= 8; } }
  const key = Buffer.from(bytes); const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac("sha1", key).update(counter).digest(); const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
let server;
try {
  for (const c of ["db:migrate", "db:seed"]) execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", npmCmd, "run", "-s", c], { cwd: root, env, stdio: "ignore" });
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", port], { cwd: root, env });
  server.stdout.on("data", (d) => serverLog += d); server.stderr.on("data", (d) => serverLog += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  const adm = new S(); await adm.login("seguridad.demo@example.invalid");
  const setup = await adm.post("/api/auth/mfa", { action: "begin" });
  if (setup.json?.secret) {
    const confirmed = await adm.post("/api/auth/mfa", { action: "confirm", code: totp(setup.json.secret) });
    const authenticated = new S();
    const login = await authenticated.login("seguridad.demo@example.invalid");
    if (login.json?.mfaRequired) await authenticated.post("/api/auth/mfa/verify", { code: confirmed.json?.backupCodes?.[0] });
    Object.assign(adm, authenticated);
  }
  const idc = new S(); await idc.login("coordinador.demo@example.invalid");
  const cli = new S(); await cli.login("cliente.demo@example.invalid");
  const email = "nuevo.gestor@example.invalid";

  console.log("== alta");
  ok("cliente no puede crear gestor → 403", (await cli.post("/api/admin/users", { action: "create_gestor", email: "x1@example.invalid", displayName: "X" })).status === 403);
  ok("Gestor IDC no puede crear gestor → 403", (await idc.post("/api/admin/users", { action: "create_gestor", email: "x2@example.invalid", displayName: "X" })).status === 403);
  const c = await adm.post("/api/admin/users", { action: "create_gestor", email, displayName: "Nuevo Gestor" });
  const setupUrl = c.json?.setupUrl;
  const setupToken = setupUrl && new URL(setupUrl).searchParams.get("token");
  ok("alta → 201 con enlace de un solo uso (sin contraseña)", c.status === 201 && typeof setupUrl === "string" && typeof setupToken === "string" && !/temporaryPassword|password/i.test(JSON.stringify(c.json)), JSON.stringify(c.json));
  const uid = c.json?.user?.id;
  ok("intentar crear admin vía create_gestor con role → sigue siendo coordinador_idc", (await adm.post("/api/admin/users", { action: "create_gestor", email: "x3@example.invalid", displayName: "X", role: "admin_seguridad" })).json?.user?.role !== "admin_seguridad");
  const list = await adm.get("/api/admin/users");
  ok("GET usuarios no expone enlaces ni hashes", !list.text.includes(setupToken) && !/scrypt\$|password_hash|temporaryPassword/.test(list.text));
  ok("GET usuarios no expone data_json/expedientes", !/data_json|IDC-DEMO-0001|XAXX/.test(list.text));

  console.log("== definición por enlace");
  const replacement = await adm.post("/api/admin/users", { action: "reset_password", userId: uid });
  const replacementToken = replacement.json?.setupUrl && new URL(replacement.json.setupUrl).searchParams.get("token");
  ok("generar enlace nuevo invalida el anterior", replacement.status === 200 && replacementToken && (await new S().post("/api/auth/setup-password", { token: setupToken, newPassword: "NuevaSegura-2026!" })).status === 400);
  const g = new S();
  ok("el enlace permite definir una contraseña", (await g.post("/api/auth/setup-password", { token: replacementToken, newPassword: "NuevaSegura-2026!" })).status === 200);
  ok("el enlace ya no puede reutilizarse", (await g.post("/api/auth/setup-password", { token: replacementToken, newPassword: "OtraSegura-2026!" })).status === 400);
  ok("login con contraseña definida → 200", (await g.login(email, "NuevaSegura-2026!")).status === 200);
  ok("página de definición disponible sin sesión", (await g.get(`/definir-contrasena?token=${setupToken}`)).status === 200);
  const cp = (b) => g.post("/api/auth/change-password", b);
  ok("cambio sin actual correcta → 400/401/403", [400, 401, 403].includes((await cp({ currentPassword: "mala-mala-mala", newPassword: "OtraSegura-2026!" })).status));
  ok("cambio <12 → 400", (await cp({ currentPassword: "NuevaSegura-2026!", newPassword: "Corta-1" })).status === 400);
  ok("cambio igual a actual → 400", (await cp({ currentPassword: "NuevaSegura-2026!", newPassword: "NuevaSegura-2026!" })).status === 400);
  const g2 = new S(); await g2.login(email, "NuevaSegura-2026!");
  const ok1 = await cp({ currentPassword: "NuevaSegura-2026!", newPassword: "OtraSegura-2026!" });
  ok("cambio válido → 200", ok1.status === 200, ok1.text);
  ok("tras cambio: /gestor 200 y API 200", (await g.get("/gestor")).status === 200 && (await g.get("/api/expedientes")).status === 200);
  ok("tras cambio: otra sesión (g2) revocada", [401, 403].includes((await g2.get("/api/expedientes")).status));
  ok("la contraseña anterior ya no sirve para login", (await new S().login(email, "NuevaSegura-2026!")).status !== 200);

  console.log("== reset");
  const rs = await adm.post("/api/admin/users", { action: "reset_password", userId: uid });
  const setupUrl2 = rs.json?.setupUrl;
  const temp2 = setupUrl2 && new URL(setupUrl2).searchParams.get("token");
  ok("reset → 200 con nuevo enlace", rs.status === 200 && temp2 && temp2 !== setupToken, JSON.stringify(rs.json));
  ok("reset revoca sesión activa", [401, 403].includes((await g.get("/api/expedientes")).status));
  ok("contraseña cambiada ya no sirve tras reset", (await new S().login(email, "OtraSegura-2026!")).status !== 200);
  const dbExpired = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  dbExpired.prepare("UPDATE password_setup_tokens SET expires_at = ? WHERE token_hash = (SELECT token_hash FROM password_setup_tokens WHERE used_at IS NULL ORDER BY created_at DESC LIMIT 1)").run(new Date(Date.now() - 60_000).toISOString());
  dbExpired.close();
  ok("enlace vencido falla", (await new S().post("/api/auth/setup-password", { token: temp2, newPassword: "TerceraSegura-2026!" })).status === 400);
  const rs2 = await adm.post("/api/admin/users", { action: "reset_password", userId: uid });
  const temp3 = rs2.json?.setupUrl && new URL(rs2.json.setupUrl).searchParams.get("token");
  const g3 = new S();
  ok("tras reset: enlace define nueva contraseña", (await g3.post("/api/auth/setup-password", { token: temp3, newPassword: "TerceraSegura-2026!" })).status === 200);
  ok("cliente no puede resetear → 403", (await cli.post("/api/admin/users", { action: "reset_password", userId: uid })).status === 403);

  console.log("== rastros");
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const dump = JSON.stringify([db.prepare("select * from audit_events").all(), db.prepare("select * from users").all(), db.prepare("select * from notifications").all()]);
  ok("enlaces/contraseñas no están en BD en claro (audit, users, notifications)", !["NuevaSegura-2026!", "OtraSegura-2026!", "TerceraSegura-2026!"].some((s) => dump.includes(s)));
  ok("enlaces no aparecen en logs del servidor", ![setupToken, replacementToken, temp2, temp3].some((s) => serverLog.includes(s)));
  const ev = db.prepare("select event_type from audit_events").all().map((r) => r.event_type);
  ok("auditoría: alta, definición y reset registrados", ["definicion_contrasena_enlace", "reset_contrasena"].every((e) => ev.includes(e)) && ev.some((e) => /alta_gestor/.test(e)), [...new Set(ev)].join(","));
  db.close();
} finally {
  server?.kill(); await new Promise((r) => setTimeout(r, 800));
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`); if (fails.length) console.log(" - " + fails.join("\n - "));
  if (fail) process.exitCode = 1;
}
