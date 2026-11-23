// Supervisor: pruebas adversariales de Gestores IDC / contraseña temporal (PASO 5b-2), instancia aislada.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = "3197"; const B = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-gest-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
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
let server;
try {
  for (const c of ["db:migrate", "db:seed"]) execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", npmCmd, "run", "-s", c], { cwd: root, env, stdio: "ignore" });
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", port], { cwd: root, env });
  server.stdout.on("data", (d) => serverLog += d); server.stderr.on("data", (d) => serverLog += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  const adm = new S(); await adm.login("seguridad.demo@example.invalid");
  const idc = new S(); await idc.login("coordinador.demo@example.invalid");
  const cli = new S(); await cli.login("cliente.demo@example.invalid");
  const email = "nuevo.gestor@example.invalid";

  console.log("== alta");
  ok("cliente no puede crear gestor → 403", (await cli.post("/api/admin/users", { action: "create_gestor", email: "x1@example.invalid", displayName: "X" })).status === 403);
  ok("Gestor IDC no puede crear gestor → 403", (await idc.post("/api/admin/users", { action: "create_gestor", email: "x2@example.invalid", displayName: "X" })).status === 403);
  const c = await adm.post("/api/admin/users", { action: "create_gestor", email, displayName: "Nuevo Gestor", password: "ElegidaPorAdmin-123" });
  const temp = c.json?.temporaryPassword ?? c.json?.temporary_password ?? c.json?.password ?? Object.values(c.json?.user ?? {}).find((v) => typeof v === "string" && v.length >= 16 && !v.includes("@") && !/^[0-9a-f-]{36}$/.test(v)) ?? (JSON.stringify(c.json).match(/"(?:temp\w*|password)"\s*:\s*"([^"]+)"/i) ?? [])[1];
  ok("alta → 201 con temporal ≥16 (ignora password del admin)", c.status === 201 && typeof temp === "string" && temp.length >= 16 && temp !== "ElegidaPorAdmin-123", JSON.stringify(c.json));
  const uid = c.json?.user?.id;
  ok("intentar crear admin vía create_gestor con role → sigue siendo coordinador_idc", (await adm.post("/api/admin/users", { action: "create_gestor", email: "x3@example.invalid", displayName: "X", role: "admin_seguridad" })).json?.user?.role !== "admin_seguridad");
  const list = await adm.get("/api/admin/users");
  ok("GET usuarios no expone temporal ni hashes", !list.text.includes(temp) && !/scrypt\$|password_hash/.test(list.text));
  ok("GET usuarios no expone data_json/expedientes", !/data_json|IDC-DEMO-0001|XAXX/.test(list.text));

  console.log("== primer acceso");
  const g = new S();
  ok("login con la contraseña que mandó el admin → falla", (await g.login(email, "ElegidaPorAdmin-123")).status !== 200);
  ok("login con temporal → 200", (await g.login(email, temp)).status === 200);
  for (const p of ["/gestor", "/gestor/proyectos", "/portal", "/admin"]) { const r = await g.get(p); ok(`temporal: ${p} → /cambiar-contrasena`, [303, 307, 308].includes(r.status) && /cambiar-contrasena/.test(r.loc ?? ""), `${r.status} ${r.loc}`); }
  for (const p of ["/api/expedientes", "/api/notifications", "/api/coordinator/requests", "/api/expedientes/x/requirements/R01", "/api/documents/x"]) { const r = await g.get(p); ok(`temporal: API ${p} → 403`, r.status === 403, r.status); }
  ok("temporal: /cambiar-contrasena 200", (await g.get("/cambiar-contrasena")).status === 200);
  const cp = (b) => g.post("/api/auth/change-password", b);
  ok("cambio sin actual correcta → 400/401/403", [400, 401, 403].includes((await cp({ currentPassword: "mala-mala-mala", newPassword: "NuevaSegura-2026!" })).status));
  ok("cambio <12 → 400", (await cp({ currentPassword: temp, newPassword: "Corta-1" })).status === 400);
  ok("cambio igual a temporal → 400", (await cp({ currentPassword: temp, newPassword: temp })).status === 400);
  const g2 = new S(); await g2.login(email, temp);
  const ok1 = await cp({ currentPassword: temp, newPassword: "NuevaSegura-2026!" });
  ok("cambio válido → 200", ok1.status === 200, ok1.text);
  ok("tras cambio: /gestor 200 y API 200", (await g.get("/gestor")).status === 200 && (await g.get("/api/expedientes")).status === 200);
  ok("tras cambio: otra sesión (g2) revocada", [401, 403].includes((await g2.get("/api/expedientes")).status));
  ok("temporal ya no sirve para login", (await new S().login(email, temp)).status !== 200);

  console.log("== reset");
  const rs = await adm.post("/api/admin/users", { action: "reset_password", userId: uid });
  const temp2 = (JSON.stringify(rs.json).match(/"(?:temp\w*|password)"\s*:\s*"([^"]+)"/i) ?? [])[1];
  ok("reset → 200 con nueva temporal", rs.status === 200 && temp2 && temp2 !== temp, JSON.stringify(rs.json));
  ok("reset revoca sesión activa", [401, 403].includes((await g.get("/api/expedientes")).status));
  ok("contraseña cambiada ya no sirve tras reset", (await new S().login(email, "NuevaSegura-2026!")).status !== 200);
  const g3 = new S(); await g3.login(email, temp2);
  ok("tras reset: vuelve a exigir cambio", (await g3.get("/api/expedientes")).status === 403);
  ok("cliente no puede resetear → 403", (await cli.post("/api/admin/users", { action: "reset_password", userId: uid })).status === 403);

  console.log("== rastros");
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const dump = JSON.stringify([db.prepare("select * from audit_events").all(), db.prepare("select * from users").all(), db.prepare("select * from notifications").all()]);
  ok("temporales/contraseñas no están en BD en claro (audit, users, notifications)", ![temp, temp2, "NuevaSegura-2026!"].some((s) => dump.includes(s)));
  ok("temporales no aparecen en logs del servidor", ![temp, temp2].some((s) => serverLog.includes(s)));
  const ev = db.prepare("select event_type from audit_events").all().map((r) => r.event_type);
  ok("auditoría: alta, cambio y reset registrados", ["cambio_contrasena", "reset_contrasena"].every((e) => ev.includes(e)) && ev.some((e) => /alta_gestor/.test(e)), [...new Set(ev)].join(","));
  db.close();
} finally {
  server?.kill(); await new Promise((r) => setTimeout(r, 800));
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`); if (fails.length) console.log(" - " + fails.join("\n - "));
}
