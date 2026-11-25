// Supervisor: pruebas adversariales de MFA, bitácora y recuperación (Paso 8), instancia aislada.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = "3194"; const B = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-seg-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir, MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"), MFA_REQUIRED_ROLES: "admin_seguridad" };
let pass = 0, fail = 0; const fails = []; let serverLog = "";
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ✅", n); } else { fail++; fails.push(n); console.log("  ❌", n, x); } };
const SEED = "ConectaLocal-2026!";
class S { jar = {};
  ck() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, p, json) { const h = { origin: B }; if (this.ck()) h.cookie = this.ck(); if (json !== undefined) h["content-type"] = "application/json";
    const r = await fetch(B + p, { method, headers: h, body: json === undefined ? undefined : JSON.stringify(json), redirect: "manual" });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); const v = kv.slice(i + 1); if (!v) delete this.jar[kv.slice(0, i)]; else this.jar[kv.slice(0, i)] = v; }
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch {} return { status: r.status, loc: r.headers.get("location"), ct: r.headers.get("content-type") ?? "", text: t, json: j }; }
  get(p) { return this.req("GET", p); } post(p, b) { return this.req("POST", p, b); }
  login(e, p = SEED) { return this.post("/api/auth/login", { email: e, password: p }); }
}
const b32 = (s) => { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const ch of s.replace(/=+$/, "").toUpperCase()) bits += a.indexOf(ch).toString(2).padStart(5, "0"); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totp = (secret, offset = 0) => { const step = Math.floor(Date.now() / 30000) + offset; const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac("sha1", b32(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0"); };
const secretOf = (r) => r.json?.secret ?? r.json?.setup?.secret ?? (r.json?.otpauth ?? r.json?.uri ?? "").match(/secret=([A-Z2-7]+)/i)?.[1];
const waitNextStep = async () => { const ms = 30000 - (Date.now() % 30000) + 300; await new Promise((r) => setTimeout(r, ms)); };

let server;
try {
  for (const c of ["db:migrate", "db:seed"]) execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", "npm.cmd", "run", "-s", c], { cwd: root, env, stdio: "ignore" });
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", port], { cwd: root, env });
  server.stdout.on("data", (d) => serverLog += d); server.stderr.on("data", (d) => serverLog += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }

  console.log("== admin sin MFA");
  const adm = new S(); await adm.login("seguridad.demo@example.invalid");
  const accNo = await adm.get("/api/admin/access");
  ok("admin sin MFA: API bitácora bloqueada", [401, 403].includes(accNo.status), accNo.status);
  const pageNo = await adm.get("/admin/usuarios");
  ok("admin sin MFA: /admin/usuarios → /seguridad", [303, 307, 308].includes(pageNo.status) && /seguridad/.test(pageNo.loc ?? ""), `${pageNo.status} ${pageNo.loc}`);

  console.log("== vincular celular (admin)");
  const begin = await adm.post("/api/auth/mfa", { action: "begin" });
  const sec = secretOf(begin);
  ok("begin devuelve secreto TOTP", !!sec, begin.text.slice(0, 200));
  ok("confirm con código inválido → no activa", (await adm.post("/api/auth/mfa", { action: "confirm", code: "000000" })).status >= 400);
  const conf = await adm.post("/api/auth/mfa", { action: "confirm", code: totp(sec) });
  const backups = conf.json?.backupCodes ?? [];
  ok("confirm con código válido → activo + 10 respaldos", conf.status === 200 && backups.length === 10, conf.text.slice(0, 200));
  ok("tras vincular: bitácora accesible", (await adm.get("/api/admin/access")).status === 200);

  console.log("== login con TOTP");
  await waitNextStep();
  const a2 = new S(); const l2 = await a2.login("seguridad.demo@example.invalid");
  ok("login pide MFA", l2.json?.mfaRequired === true, l2.text);
  ok("antes del código no hay sesión (API 401/403)", [401, 403].includes((await a2.get("/api/admin/access")).status));
  const code = totp(sec);
  const v2 = await a2.post("/api/auth/mfa/verify", { code });
  ok("código TOTP actual → 200", v2.status === 200, v2.text);
  ok("con sesión MFA: bitácora 200", (await a2.get("/api/admin/access")).status === 200);
  const a3 = new S(); await a3.login("seguridad.demo@example.invalid");
  const v3 = await a3.post("/api/auth/mfa/verify", { code });
  ok("mismo código TOTP reutilizado → 401", v3.status === 401, v3.status);

  console.log("== MFA opcional de un Gestor IDC");
  const g = new S(); await g.login("coordinador.demo@example.invalid");
  const gb = await g.post("/api/auth/mfa", { action: "begin" }); const gsec = secretOf(gb);
  const gc = await g.post("/api/auth/mfa", { action: "confirm", code: totp(gsec) });
  ok("Gestor IDC puede vincular celular (opcional)", gc.status === 200, gc.text.slice(0, 150));
  const g2 = new S(); const gl = await g2.login("coordinador.demo@example.invalid");
  ok("Gestor con MFA vinculado: el login SÍ pide código", gl.json?.mfaRequired === true, gl.text);
  ok("Gestor con MFA: sin código no hay sesión", [401, 403].includes((await g2.get("/api/expedientes")).status));

  console.log("== admin desvincula celular del gestor");
  const users = (await a2.get("/api/admin/users")).json?.users ?? [];
  const gid = users.find((u) => u.email === "coordinador.demo@example.invalid")?.id;
  ok("desvincular sin motivo → 400", (await a2.post("/api/admin/users", { action: "disable_mfa", userId: gid })).status === 400);
  const dis = await a2.post("/api/admin/users", { action: "disable_mfa", userId: gid, reason: "Celular extraviado" });
  ok("desvincular con motivo → 200", dis.status === 200, dis.text);
  ok("sesión previa del gestor revocada", [401, 403].includes((await g.get("/api/expedientes")).status));
  const g3 = new S(); const gl3 = await g3.login("coordinador.demo@example.invalid");
  ok("gestor vuelve a entrar sin código (MFA quitado)", gl3.status === 200 && !gl3.json?.mfaRequired, gl3.text);

  console.log("== bitácora");
  await new S().login("nadie.existe@example.invalid", "MalaClave-123");
  const ev = await a2.get("/api/admin/access");
  const evText = JSON.stringify(ev.json?.events ?? []);
  ok("login fallido aparece con el correo intentado", evText.includes("nadie.existe@example.invalid"));
  ok("desvinculación MFA aparece en bitácora", /mfa/i.test(evText) && /desvinc|disable|revoc/i.test(evText));
  ok("cliente → 403 en bitácora", (await (async () => { const c = new S(); await c.login("cliente.demo@example.invalid"); return (await c.get("/api/admin/access")).status; })()) === 403);
  ok("Gestor IDC → 403 en bitácora", (await g3.get("/api/admin/access")).status === 403);
  const csv = await a2.get("/api/admin/access?format=csv");
  ok("CSV de bitácora se descarga", csv.ct.includes("text/csv"), csv.ct);
  ok("CSV sin secretos, códigos ni contraseñas", ![sec, gsec, ...backups, SEED].some((s) => s && csv.text.includes(s)) && !/password_hash|secret_ciphertext/i.test(csv.text));

  console.log("== recuperación de cliente");
  const r1 = await new S().post("/api/auth/recovery", { action: "request", email: "cliente.demo@example.invalid" });
  const r2 = await new S().post("/api/auth/recovery", { action: "request", email: "no.existe@example.invalid" });
  ok("correo existente e inexistente → mismo mensaje", r1.status === r2.status && (r1.json?.message ?? r1.json?.error) === (r2.json?.message ?? r2.json?.error), `${r1.text} | ${r2.text}`);
  const cid = users.find((u) => u.email === "cliente.demo@example.invalid")?.id;
  const gen = await g3.post("/api/auth/recovery", { action: "generate", userId: cid });
  const tok = new URL(gen.json?.setupUrl ?? "http://x/?token=").searchParams.get("token");
  ok("Gestor IDC genera enlace de recuperación", gen.status === 200 && !!tok, gen.text);
  ok("enlace funciona una vez", (await new S().post("/api/auth/setup-password", { token: tok, newPassword: "ClienteNueva-2026!" })).status === 200);
  ok("enlace reutilizado → falla", (await new S().post("/api/auth/setup-password", { token: tok, newPassword: "OtraMas-2026!x" })).status >= 400);
  ok("cliente entra con la nueva contraseña", (await new S().login("cliente.demo@example.invalid", "ClienteNueva-2026!")).status === 200);
  ok("cliente no puede generar enlaces", (await (async () => { const c = new S(); await c.login("cliente.demo@example.invalid", "ClienteNueva-2026!"); return (await c.post("/api/auth/recovery", { action: "generate", userId: cid })).status; })()) === 403);

  console.log("== rastros");
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const dump = JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => db.prepare(`SELECT * FROM "${t.name}"`).all()));
  db.close();
  ok("secreto TOTP no está en claro en ninguna tabla", ![sec, gsec].some((s) => dump.includes(s)));
  ok("códigos de respaldo no están en claro", !backups.some((b) => dump.includes(b)));
  ok("token de recuperación no está en claro", !dump.includes(tok));
  ok("secretos/códigos no aparecen en logs del servidor", ![sec, gsec, ...backups, tok].some((s) => s && serverLog.includes(s)));
} finally {
  server?.kill(); await new Promise((r) => setTimeout(r, 800)); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`); if (fails.length) console.log(" - " + fails.join("\n - "));
}
