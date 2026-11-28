// Supervisor: flujo completo G0 → G1 → formatos → firma → G2 (+ PA-05, PA-06, PDFs) en instancia aislada.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";

const root = process.argv[2];
const require = createRequire(path.join(root, "package.json"));
const { PDFDocument, PDFRawStream, PDFArray } = require("pdf-lib");
const PizZip = require("pizzip");
const port = "3196"; const B = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-flujo-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
let pass = 0, fail = 0; const fails = [];
const ok = (n, c, x = "") => { if (c) { pass++; console.log("  ✅", n); } else { fail++; fails.push(n); console.log("  ❌", n, x); } };
const SEED = "ConectaLocal-2026!";
class S { jar = {};
  ck() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, p, { json, form } = {}) { const h = { origin: B }; if (this.ck()) h.cookie = this.ck(); let body; if (json !== undefined) { h["content-type"] = "application/json"; body = JSON.stringify(json); } else if (form) body = form;
    const r = await fetch(B + p, { method, headers: h, body, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(";"); const i = kv.indexOf("="); const v = kv.slice(i + 1); if (!v) delete this.jar[kv.slice(0, i)]; else this.jar[kv.slice(0, i)] = v; }
    const buf = Buffer.from(await r.arrayBuffer()); let j; try { j = JSON.parse(buf.toString()); } catch {} return { status: r.status, buf, json: j, text: buf.toString().slice(0, 250) }; }
  get(p) { return this.req("GET", p); } post(p, json) { return this.req("POST", p, { json }); } patch(p, json) { return this.req("PATCH", p, { json }); }
  login(e, p = SEED) { return this.post("/api/auth/login", { email: e, password: p }); }
}
const pdf = (t) => Buffer.from(`%PDF-1.4\n% ${t}\n%%EOF\n`);
const up = (s, exp, code, bytes, extra = {}) => { const f = new FormData(); f.set("requirementCode", code); for (const [k, v] of Object.entries(extra)) f.set(k, v); f.set("file", new Blob([bytes], { type: "application/pdf" }), `${code}.pdf`); return s.req("POST", `/api/expedientes/${exp}/documents`, { form: f }); };
const upEvidence = (s, exp, eventType, bytes, extra = {}) => { const f = new FormData(); f.set("eventType", eventType); for (const [k, v] of Object.entries(extra)) f.set(k, v); f.set("file", new Blob([bytes], { type: "application/pdf" }), `${eventType}.pdf`); return s.req("POST", `/api/expedientes/${exp}/documents`, { form: f }); };
const streamsOf = async (bytes) => { const doc = await PDFDocument.load(bytes); const out = []; for (const page of doc.getPages()) { const c = page.node.Contents(); const refs = c instanceof PDFArray ? c.asArray() : [c]; for (const r of refs) { const s = doc.context.lookup(r); if (s instanceof PDFRawStream) { let d = Buffer.from(s.contents); try { d = zlib.inflateSync(d); } catch {} out.push(d); } } } return { doc, out }; };
const hexOf = (t) => Buffer.from(t, "latin1").toString("hex").toUpperCase();

let server;
try {
  for (const c of ["db:migrate", "db:seed"]) execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", "npm.cmd", "run", "-s", c], { cwd: root, env, stdio: "ignore" });
  server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", port], { cwd: root, env, stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(B + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  const g1 = new S(); await g1.login("coordinador.demo@example.invalid");
  const g2 = new S(); await g2.login("idc2.demo@example.invalid");
  const cli = new S(); await cli.login("cliente.demo@example.invalid");
  const exp = (await cli.get("/api/expedientes")).json.expedientes[0]; const E = `/api/expedientes/${exp.id}`;
  const gate = async (code) => (await g1.get(`${E}/gates`)).json?.gates?.find((g) => g.gate_code === code)?.status;
  console.log("expediente", exp.folio, "responsable", exp.gestor_id ? "sí" : "NO");

  console.log("== G0");
  ok("privacidad: cliente acepta", (await cli.post(`${E}/privacy`, { version: "0.1-borrador" })).status === 200);
  const c0 = await g1.post(`${E}/gates`, { action: "close", gateCode: "G0" });
  ok("G0 cierra → 200", c0.status === 200, c0.text);

  console.log("== G1 (11 requisitos; carga por un gestor, valida otro)");
  const cat = (await g1.get(`${E}/requirements/R01`)).json.requirements.filter((r) => r.requirement_code?.startsWith("R"));
  for (const r of cat) {
    const uploader = /Cliente/.test(r.integra) && !/IDC\//.test(r.integra) ? cli : g1;
    const u = await up(uploader, exp.id, r.requirement_code, pdf(r.requirement_code));
    if (u.status !== 201) console.log("    carga", r.requirement_code, u.status, u.text);
  }
  const selfV = await g1.post(`${E}/requirements/R02`, { action: "validate" });
  ok("PA-02: autovalidación → 409", selfV.status === 409, selfV.status);
  const c1early = await g1.post(`${E}/gates`, { action: "close", gateCode: "G1" });
  ok("PA-03: G1 con requisitos sin validar → 409 con lista", c1early.status === 409 && /R0\d/.test(c1early.json?.error ?? ""), c1early.text);
  for (const r of cat) { const v = await g2.post(`${E}/requirements/${r.requirement_code}`, { action: "validate" }); if (v.status !== 200) console.log("    validar", r.requirement_code, v.status, v.text); }
  const c1 = await g1.post(`${E}/gates`, { action: "close", gateCode: "G1" });
  ok("G1 con 11/11 → 200 y G2 abierto", c1.status === 200 && (await gate("G2")) === "abierto", c1.text);

  console.log("== formatos");
  const gen = {};
  for (const f of ["F-01", "F-02", "F-04", "F-06"]) { const r = await g1.post(`${E}/formats`, { action: "generate", formatCode: f }); gen[f] = r.json?.format; ok(`generar ${f} → 201`, r.status === 201, r.text); }
  ok("cliente no genera formatos → 403", (await cli.post(`${E}/formats`, { action: "generate", formatCode: "F-01" })).status === 403);
  const req = async (code) => (await g1.get(`${E}/requirements/${code}`)).json.requirements.find((r) => r.requirement_code === code);
  ok("R01 → pdf_generado", (await req("R01"))?.status === "pdf_generado", (await req("R01"))?.status);
  ok("R07 → pdf_generado", (await req("R07"))?.status === "pdf_generado", (await req("R07"))?.status);
  // PDFs
  const dl = async (f) => {
    const bytes = (await g1.get(`/api/documents/${gen[f]?.documentId}`)).buf;
    if (process.env.SAVE_SAMPLES === "1") {
      const sampleDir = path.join(root, "docs", "muestras", ".generated");
      fs.mkdirSync(sampleDir, { recursive: true });
      fs.writeFileSync(path.join(sampleDir, `${f}_muestra.pdf`), bytes);
    }
    return bytes;
  };
  const base = await streamsOf(fs.readFileSync(path.join(root, "templates/F-01_base.pdf")));
  const f01 = await streamsOf(await dl("F-01"));
  ok("F-01: 1 página", f01.doc.getPageCount() === 1);
  ok("F-01: conserva intactos los content streams originales de CFE", base.out.every((s) => f01.out.some((o) => o.equals(s))));
  const added = Buffer.concat(f01.out.filter((o) => !base.out.some((s) => s.equals(o)))).toString("latin1");
  ok("F-01: texto agregado contiene el RFC ficticio", added.includes(hexOf("XAXX010101000")) || added.includes("XAXX010101000"));
  ok("F-01: texto agregado contiene el folio", added.includes(hexOf(exp.folio)) || added.includes(exp.folio));
  ok("F-01: sin volcado 'seccion.campo:'", !added.includes(hexOf("solicitante.")) && !added.includes("solicitante."));
  await dl("F-04");
  const f02Docx = new PizZip(await dl("F-02")).file("word/document.xml").asText();
  const r06Review = await req("R06");
  const r06Sha = r06Review?.versions?.find((version) => !version.change_reason)?.sha256?.slice(0, 12);
  ok("F-02 DOCX conserva contenido de carta y datos ficticios", !f02Docx.includes("{{") && /CARTA PODER|Carta poder/.test(f02Docx) && /testigo/i.test(f02Docx) && f02Docx.includes("Empresa Solar Ficticia") && f02Docx.includes(exp.folio));
  const f06Docx = new PizZip(await dl("F-06")).file("word/document.xml").asText();
  ok("F-06 DOCX conserva folio y SHA de R06", !f06Docx.includes("{{") && /CARÁTULA|Carátula/.test(f06Docx) && f06Docx.includes(exp.folio) && !!r06Sha && f06Docx.includes(r06Sha));

  console.log("== firma presencial y escaneos");
  for (const f of ["F-01", "F-02"]) { const r = await g1.post(`${E}/formats`, { action: "print", formatCode: f, versionId: gen[f]?.versionId }); ok(`imprimir ${f} → pendiente_firma`, [200, 201].includes(r.status), r.text); }
  const c2early = await g1.post(`${E}/gates`, { action: "close", gateCode: "G2" });
  ok("PA-04: G2 sin escaneos verificados → 409", c2early.status === 409, c2early.text);
  const scans = {};
  for (const [f, code] of [["F-01", "R01"], ["F-02", "R07"]]) { const s = await up(g1, exp.id, code, pdf(`escaneo ${f}`), { sourceVersionId: gen[f]?.versionId }); scans[f] = s.json?.document; ok(`subir escaneo firmado ${f} (G1 cerrado) → 201`, s.status === 201, `${s.status} ${s.text}`); }
  const evEvidence = await upEvidence(g1, exp.id, "firma_presencial", pdf("firma presencial"), { description: "Firma en oficina IDC" });
  const ev = await g1.post(`${E}/gates`, { action: "event", eventType: "firma_presencial", description: "Firma en oficina IDC", lugar: "Hermosillo", firmantes: ["solicitante", "otorgante", "apoderado", "testigo 1", "testigo 2"], documentId: evEvidence.json?.document?.documentId });
  ok("registrar firma presencial → 201", ev.status === 201, ev.text);
  ok("verificar escaneo por quien lo subió → 409", (await g1.post(`${E}/requirements/R01`, { action: "verify_scan", versionId: scans["F-01"]?.versionId })).status === 409);
  for (const [f, code] of [["F-01", "R01"], ["F-02", "R07"]]) { const v = await g2.post(`${E}/requirements/${code}`, { action: "verify_scan", versionId: scans[f]?.versionId }); ok(`verificar escaneo ${f} (otro gestor) → 200`, v.status === 200, v.text); }
  const c2 = await g1.post(`${E}/gates`, { action: "close", gateCode: "G2" });
  ok("G2 cierra → 200 y G3 abierto", c2.status === 200 && (await gate("G3")) === "abierto", c2.text);

  console.log("== PA-05 / PA-06");
  const data = JSON.parse((await g1.get(E)).json.expediente.data_json);
  data.central = { ...(data.central ?? {}), capacidad_bruta_kw: (data.central?.capacidad_bruta_kw ?? 100) + 50 };
  const corr = await g1.patch(E, { data, reason: "Corrección de capacidad" });
  ok("PA-05: Gestor IDC corrige dato material con motivo → 200", corr.status === 200, corr.text);
  ok("PA-05: G2 reabierto tras cambio material", (await gate("G2")) === "abierto", await gate("G2"));
  ok("PA-05: G3 vuelve a bloqueado", (await gate("G3")) === "bloqueado", await gate("G3"));
  ok("PA-05: F-01 deja de estar vigente (R01 no verificado)", !["escaneo_verificado_idc", "pdf_generado"].includes((await req("R01"))?.status), (await req("R01"))?.status);
  ok("PA-05: cliente no puede corregir tras G1 → 409", (await cli.patch(E, { data })).status === 409);
  const ro = await g1.post(`${E}/gates`, { action: "reopen", gateCode: "G1", reason: "CFE reporta incompleto", requirementCodes: ["R09"] });
  ok("PA-06: reabrir G1 → 200", ro.status === 200, ro.text);
  const gs = (await g1.get(`${E}/gates`)).json.gates;
  ok("PA-06: G2–G7 bloqueados", gs.filter((g) => g.gate_code > "G1").every((g) => g.status === "bloqueado"), gs.map((g) => `${g.gate_code}:${g.status}`).join(" "));
  ok("PA-06: R09 vuelve a observado", (await req("R09"))?.status === "observado", (await req("R09"))?.status);
} finally {
  server?.kill(); await new Promise((r) => setTimeout(r, 800)); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`); if (fails.length) console.log(" - " + fails.join("\n - "));
  if (fail) process.exitCode = 1;
}
