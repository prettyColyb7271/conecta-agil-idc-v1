// Supervisor: pruebas adversariales de documentos (PASO 5) en instancia aislada.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = "3198";
const B = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-docs-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ✅", n); } else { fail++; fails.push(n); console.log("  ❌", n, x); } };
const SEED = "ConectaLocal-2026!";

class S { jar = {};
  ck() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, p, { json, form, raw, headers = {} } = {}) {
    const h = { origin: B, ...headers }; if (this.ck()) h.cookie = this.ck();
    let body; if (json !== undefined) { h["content-type"] = "application/json"; body = JSON.stringify(json); } else if (form) body = form; else if (raw) { body = raw.body; h["content-type"] = raw.type; }
    const r = await fetch(B + p, { method, headers: h, body, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar[kv.slice(0, i)] = kv.slice(i + 1); }
    const buf = Buffer.from(await r.arrayBuffer()); let j; try { j = JSON.parse(buf.toString()); } catch {}
    return { status: r.status, headers: r.headers, buf, json: j, text: buf.toString("latin1").slice(0, 300) };
  }
  login(e, p = SEED) { return this.req("POST", "/api/auth/login", { json: { email: e, password: p } }); }
}
const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n% prueba ficticia ${extra}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const up = (s, expId, code, bytes, name, type) => { const f = new FormData(); f.set("requirementCode", code); f.set("file", new Blob([bytes], { type }), name); return s.req("POST", `/api/expedientes/${expId}/documents`, { form: f }); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

let server;
try {
  const runScript = (script) => execFileSync(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), script], { cwd: root, env, stdio: "ignore" });
  runScript("scripts/db-migrate.ts"); runScript("scripts/db-seed.ts");
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", port], { cwd: root, env, stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }

  const idc = new S(); await idc.login("coordinador.demo@example.invalid");
  const A = new S(); await A.login("cliente.demo@example.invalid");
  const adm = new S(); await adm.login("seguridad.demo@example.invalid");
  const expA = (await A.req("GET", "/api/expedientes")).json.expedientes[0];
  // cliente B con expediente propio
  const Bc = new S(); const eb = "sup.b@example.invalid", pb = "Supervisor-B-2026!";
  await Bc.req("POST", "/api/auth/register", { json: { email: eb, password: pb, displayName: "Sup B", privacyAccepted: true, privacyVersion: "0.1-borrador" } });
  const rq = (await idc.req("GET", "/api/coordinator/requests")).json.requests.find((r) => r.email === eb);
  await idc.req("POST", "/api/coordinator/requests", { json: { requestId: rq.id, action: "approve" } });
  await Bc.login(eb, pb);
  const opts = (await idc.req("GET", "/api/expedientes")).json.options;
  const expB = (await idc.req("POST", "/api/expedientes", { json: { clienteId: opts.clients.find((c) => c.email === eb).id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true } })).json.expediente;
  console.log("expA", expA?.folio, "expB", expB?.folio);

  console.log("== carga");
  const f1 = pdf("v1"); const u1 = await up(A, expA.id, "R06", f1, "ine.pdf", "application/pdf");
  ok("cliente sube R06 (integra Cliente) → 201 + sha256 correcto", u1.status === 201 && u1.json?.document?.sha256 === sha(f1), u1.text);
  ok("cliente sube R02 (integra IDC) → 403", (await up(A, expA.id, "R02", pdf(), "croquis.pdf", "application/pdf")).status === 403);
  ok("exe renombrado .pdf → 400", (await up(A, expA.id, "R06", Buffer.from("MZ\x90\x00 ejecutable"), "x.pdf", "application/pdf")).status === 400);
  ok("PNG con mime application/pdf → 400", (await up(A, expA.id, "R06", png, "x.pdf", "application/pdf")).status === 400);
  ok("HTML con mime text/html → 400", (await up(A, expA.id, "R06", Buffer.from("<script>alert(1)</script>"), "x.html", "text/html")).status === 400);
  ok("cliente B sube a expediente de A → 404", (await up(Bc, expA.id, "R06", pdf(), "x.pdf", "application/pdf")).status === 404);
  ok("admin sube → 403", (await up(adm, expA.id, "R06", pdf(), "x.pdf", "application/pdf")).status === 403);
  ok("requirementCode inválido (../R06) → 400", (await up(A, expA.id, "../R06", pdf(), "x.pdf", "application/pdf")).status === 400);
  const big = Buffer.concat([pdf(), Buffer.alloc(21 * 1024 * 1024, 32)]);
  const ub = await up(A, expA.id, "R06", big, "grande.pdf", "application/pdf");
  ok("PDF de 21 MB → 413", ub.status === 413, ub.status);
  const early = await A.req("POST", `/api/expedientes/${expA.id}/documents`, { raw: { body: Buffer.alloc(22 * 1024 * 1024, 32), type: "multipart/form-data; boundary=not-parsed" }, headers: { "content-length": String(22 * 1024 * 1024) } });
  ok("Content-Length excesivo → 413 sin parsear multipart", early.status === 413, early.status);
  const evilName = '../../..\\evil"\r\nX-Inject: 1.pdf';
  const u2 = await up(A, expA.id, "R08", pdf("evil"), evilName, "application/pdf");
  ok("nombre con traversal/comillas/CRLF → 201", u2.status === 201, u2.text);

  console.log("== descarga");
  const docId = u1.json?.document?.documentId;
  const d1 = await A.req("GET", `/api/documents/${docId}`);
  ok("cliente descarga su doc → mismos bytes", d1.status === 200 && sha(d1.buf) === sha(f1));
  ok("cabeceras attachment + nosniff", /attachment/.test(d1.headers.get("content-disposition") ?? "") && d1.headers.get("x-content-type-options") === "nosniff");
  const d2 = await A.req("GET", `/api/documents/${u2.json?.document?.documentId}`);
  const cd = d2.headers.get("content-disposition") ?? "";
  ok("filename saneado (sin / \\ comillas internas ni CRLF)", d2.status === 200 && !/[\/\\\r\n]|X-Inject:/.test(cd) && (cd.match(/"/g) ?? []).length === 2 && !d2.headers.get("x-inject"), cd);
  ok("cliente B descarga doc de A → 404", (await Bc.req("GET", `/api/documents/${docId}`)).status === 404);
  ok("admin descarga → 403", (await adm.req("GET", `/api/documents/${docId}`)).status === 403);
  ok("cliente pide versión específica → 403", (await A.req("GET", `/api/documents/${docId}?version=${u1.json.document.versionId}`)).status === 403);
  ok("IDC descarga versión específica → 200", (await idc.req("GET", `/api/documents/${docId}?version=${u1.json.document.versionId}`)).status === 200);
  ok("sin sesión → 401/403", [401, 403].includes((await new S().req("GET", `/api/documents/${docId}`)).status));

  console.log("== revisión");
  const rv = (s, code, body, exp = expA.id) => s.req("POST", `/api/expedientes/${exp}/requirements/${code}`, { json: body });
  const vEmpty = await rv(idc, "R01", { action: "validate" });
  ok("validar requisito SIN documento → 400/409", [400, 409].includes(vEmpty.status), `${vEmpty.status} ${vEmpty.text}`);
  ok("cliente no puede validar → 403", (await rv(A, "R06", { action: "validate" })).status === 403);
  ok("observar sin motivo → 400", (await rv(idc, "R06", { action: "observe" })).status === 400);
  ok("visibilidad inválida → 400", (await rv(idc, "R06", { action: "observe", reason: "x", visibility: "publico" })).status === 400);
  ok("acción inválida → 400", (await rv(idc, "R06", { action: "borrar" })).status === 400, (await rv(idc, "R06", { action: "borrar" })).status);
  await rv(idc, "R06", { action: "observe", reason: "INE ilegible (cliente)", visibility: "cliente" });
  await rv(idc, "R06", { action: "observe", reason: "NOTA INTERNA secreta", visibility: "interno_idc" });
  const revA = (await A.req("GET", `/api/expedientes/${expA.id}/requirements/R06`)).json?.requirements?.find((r) => r.requirement_code === "R06");
  ok("cliente ve observación visible", JSON.stringify(revA).includes("INE ilegible"));
  ok("cliente NO ve observación interna (ni en observed_reason)", !JSON.stringify(revA).includes("NOTA INTERNA"), JSON.stringify(revA)?.slice(0, 300));
  const portalA = (await A.req("GET", "/portal")).buf.toString();
  ok("portal del cliente NO contiene nota interna", !portalA.includes("NOTA INTERNA"));
  ok("cliente B no lista requisitos de A → 404", (await Bc.req("GET", `/api/expedientes/${expA.id}/requirements/R06`)).status === 404);
  await rv(idc, "R06", { action: "validate" });
  const u3 = await up(A, expA.id, "R06", pdf("v2"), "ine2.pdf", "application/pdf");
  const r06 = (await idc.req("GET", `/api/expedientes/${expA.id}/requirements/R06`)).json.requirements.find((r) => r.requirement_code === "R06");
  ok("nueva versión tras validar → requisito 'cargado', 2 versiones", u3.status === 201 && r06.status === "cargado" && r06.versions.length === 2, `${r06.status} v=${r06.versions.length}`);
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"));
  db.prepare("UPDATE gates SET status = 'cerrado' WHERE expediente_id = ? AND gate_code = 'G1'").run(expA.id);
  db.close();
  ok("validar con G1 cerrado → 409", (await rv(idc, "R06", { action: "validate" })).status === 409);

  console.log("== disco");
  const files = fs.readdirSync(path.join(dataDir, "documents"), { recursive: true }).map(String);
  ok("ningún archivo con nombre original", !files.some((f) => /ine|evil|grande|croquis/i.test(f)), files.join(","));
  ok("no se escribió nada fuera de documents/ por traversal", !fs.readdirSync(dataDir).some((f) => /evil/i.test(f)));
  ok("archivo de 21 MB no quedó en disco", !files.some((f) => { try { return fs.statSync(path.join(dataDir, "documents", f)).size > 20 * 1024 * 1024; } catch { return false; } }));
} finally {
  server?.kill(); await new Promise((r) => setTimeout(r, 800));
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`); if (fails.length) console.log(" - " + fails.join("\n - "));
  if (fail) process.exitCode = 1;
}
