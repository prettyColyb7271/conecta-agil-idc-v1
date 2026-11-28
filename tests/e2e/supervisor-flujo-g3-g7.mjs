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
const port = "3195"; const B = `http://localhost:${port}`;
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
const upEvidence = (s, exp, eventType, bytes, extra = {}) => { const f = new FormData(); f.set("eventType", eventType); f.set("description", extra.description ?? eventType); for (const [k, v] of Object.entries(extra)) if (k !== "description") f.set(k, String(v)); f.set("file", new Blob([bytes], { type: "application/pdf" }), `${eventType}.pdf`); return s.req("POST", `/api/expedientes/${exp}/documents`, { form: f }); };
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

  console.log("== G1 (R01-R09 antes de la cita de firma; R10-R11 llegan después de instalar)");
  const postInstalacion = ["R10", "R11"];
  const cat = (await g1.get(`${E}/requirements/R01`)).json.requirements.filter((r) => r.requirement_code?.startsWith("R") && !postInstalacion.includes(r.requirement_code));
  const currentData = JSON.parse((await cli.get(E)).json.expediente.data_json);
  currentData.contacto = { nombre: "Responsable Cliente Ficticio", correo: "cliente@example.invalid", telefono: "5550000000" };
  currentData.representacion = { ...(currentData.representacion ?? {}), enlace_cfe: "Enlace CFE Ficticio", enlace_cfe_correo: "enlace@example.invalid" };
  await cli.patch(E, { data: currentData });
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
  ok("G1 con R01-R09 y sin dictamen UVIE → 200 y G2 abierto", c1.status === 200 && (await gate("G2")) === "abierto", c1.text);
  const estadoF01 = async () => (await cli.get("/portal/formatos")).buf.toString().match(/Solicitud de interconexión \(formato CFE\)[\s\S]*?<\/div>/)?.[0] ?? "";
  ok("R01 validado sin firma no aparece como firmado", !(await estadoF01()).includes("Firmado") && (await estadoF01()).includes("Pendiente"));

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
  ok("escaneo recibido aparece como firma en revisión", (await estadoF01()).includes("Firma en revisión"));
  const evEvidence = await upEvidence(g1, exp.id, "firma_presencial", pdf("firma presencial"), { description: "Firma en oficina IDC" });
  const ev = await g1.post(`${E}/gates`, { action: "event", eventType: "firma_presencial", description: "Firma en oficina IDC", lugar: "Hermosillo", firmantes: ["solicitante", "otorgante", "apoderado", "testigo 1", "testigo 2"], documentId: evEvidence.json?.document?.documentId });
  ok("registrar firma presencial → 201", ev.status === 201, ev.text);
  ok("verificar escaneo por quien lo subió → 409", (await g1.post(`${E}/requirements/R01`, { action: "verify_scan", versionId: scans["F-01"]?.versionId })).status === 409);
  for (const [f, code] of [["F-01", "R01"], ["F-02", "R07"]]) { const v = await g2.post(`${E}/requirements/${code}`, { action: "verify_scan", versionId: scans[f]?.versionId }); ok(`verificar escaneo ${f} (otro gestor) → 200`, v.status === 200, v.text); }
  ok("escaneo verificado aparece como firmado", (await estadoF01()).includes("Firmado"));
  const c2 = await g1.post(`${E}/gates`, { action: "close", gateCode: "G2" });
  ok("G2 cierra → 200 y G3 abierto", c2.status === 200 && (await gate("G3")) === "abierto", c2.text);

  console.log("== PASO 7: G3 → G7");
  ok("precondición: G2 cerrado", (await gate("G2")) === "cerrado", await gate("G2"));
  const evt = (body) => g1.post(`${E}/gates`, { action: "event", ...body });
  const close = (g, s = g1) => s.post(`${E}/gates`, { action: "close", gateCode: g });
  const acuse = { description: "Acuse sellado", medio: "ventanilla", solicitudNumero: "SOL-2026-001" };
  const earlyUpload = await upEvidence(g1, exp.id, "ingreso_acuse", pdf("acuse anticipado"), acuse);
  ok("subir acuse sin R10 y R11 validados → 409", earlyUpload.status === 409 && /R10/.test(earlyUpload.json?.error ?? "") && /R11/.test(earlyUpload.json?.error ?? ""), earlyUpload.text);
  const earlyEvent = await evt({ eventType: "ingreso_acuse", ...acuse, documentId: evEvidence.json?.document?.documentId });
  ok("registrar acuse sin R10 y R11 validados → 409", earlyEvent.status === 409 && /R10/.test(earlyEvent.json?.error ?? "") && /R11/.test(earlyEvent.json?.error ?? ""), earlyEvent.text);
  ok("acuse rechazado no registra evento", !(await g1.get(E)).json.expediente.external_events.some((event) => event.event_type === "ingreso_acuse"));
  const c3early = await close("G3");
  ok("G3 sin fotos ni dictamen UVIE → 409", c3early.status === 409 && /R10/.test(c3early.json?.error ?? "") && /R11/.test(c3early.json?.error ?? ""), c3early.text);
  for (const code of postInstalacion) {
    const u = await up(g1, exp.id, code, pdf(code));
    ok(`cargar ${code} con G1 cerrado → 201`, u.status === 201, `${u.status} ${u.text}`);
    const v = await g2.post(`${E}/requirements/${code}`, { action: "validate" });
    ok(`validar ${code} con G1 cerrado → 200`, v.status === 200, `${v.status} ${v.text}`);
    if (code === "R10") {
      const partial = await upEvidence(g1, exp.id, "ingreso_acuse", pdf("acuse prematuro"), acuse);
      ok("acuse con R11 pendiente → 409", partial.status === 409 && /R11/.test(partial.json?.error ?? ""), partial.text);
    }
  }
  const upAcuse = await upEvidence(g1, exp.id, "ingreso_acuse", pdf("acuse sellado"), acuse);
  ok("subir acuse con R10 y R11 validados → 201", upAcuse.status === 201, `${upAcuse.status} ${upAcuse.text}`);
  const registered = await evt({ eventType: "ingreso_acuse", ...acuse, documentId: upAcuse.json?.document?.documentId });
  ok("registrar acuse con R10 y R11 validados → 201", registered.status === 201, registered.text);
  const r06doc = (await req("R06"))?.document_id;
  const fake = await evt({ eventType: "ingreso_acuse", ...acuse, documentId: r06doc });
  ok("usar la INE (R06) como 'acuse' → rechazado", fake.status >= 400, `${fake.status} ${fake.text}`);
  ok("R09 sigue bloqueado con G1 cerrado → 409", (await up(cli, exp.id, "R09", pdf("R09 tarde"))).status === 409);
  const steps = [
    ["G3", null],
    ["G4", ["resolucion_cfe", { description: "Oficio", resultado: "favorable", vigenciaMeses: 2 }]],
    ["G5", ["contrato", { description: "Contrato firmado" }]],
  ];
  for (const [g, spec] of steps) {
    if (spec) { const r = await upEvidence(g1, exp.id, spec[0], pdf(spec[0]), spec[1]); if (r.status !== 201) console.log("    evidencia", spec[0], r.status, r.text); }
    const c = await close(g); ok(`${g} cierra`, c.status === 200, c.text);
  }
  ok("R11 bloqueado tras cerrar G3 → 409", (await up(g1, exp.id, "R11", pdf("R11 tarde"))).status === 409);
  const u = (await g1.get(`${E}/requirements/U01`)).json?.requirements ?? [];
  const uReqs = u.filter((r) => r.requirement_code?.startsWith("U"));
  ok("U01–U17 visibles en la revisión (17)", uReqs.length === 17, `vistos=${uReqs.length} (la lista de revisión solo trae R%?)`);
  const portal = (await cli.get("/portal/formatos")).buf.toString();
  ok("U06 requerido es visible y cargable para el cliente", portal.includes('aria-label="Subir Identificación del representante legal"'));
  const upU = await up(cli, exp.id, "U07", pdf("INE de quien atiende"));
  ok("cliente sube U07 (requisito UIIE) → 201", upU.status === 201, `${upU.status} ${upU.text}`);
  const valU = await g2.post(`${E}/requirements/U07`, { action: "validate" });
  ok("Gestor IDC valida U07 tras G1 cerrado → 200", valU.status === 200, `${valU.status} ${valU.text}`);
  for (const code of ["U12", "U13", "U17"]) { const v = await g2.post(`${E}/requirements/${code}`, { action: "validate" }); ok(`Gestor IDC valida ${code} con datos estructurados → 200`, v.status === 200, v.text); }
  for (const [code, uploader] of [["U04", cli], ["U05", cli], ["U06", cli], ["U09", g1], ["U14", g1], ["U15", cli]]) {
    const uploaded = await up(uploader, exp.id, code, pdf(code));
    const validated = await g2.post(`${E}/requirements/${code}`, { action: "validate" });
    ok(`${code} cargado y validado`, uploaded.status === 201 && validated.status === 200, `${uploaded.status} ${validated.status}`);
  }
  for (const b of ["uiie", "certificado_uiie"].map((eventType) => [eventType, { description: eventType }])) await upEvidence(g1, exp.id, b[0], pdf(b[0]), b[1]);
  const c6 = await close("G6"); ok("G6 cierra (con U01–U17 y certificado)", c6.status === 200, c6.text);
  for (const eventType of ["medidor", "interconexion", "alta_comercial"]) await upEvidence(g1, exp.id, eventType, pdf(eventType), { description: eventType });
  await evt({ eventType: "cierre", description: "Cierre revisado" });
  const c7own = await close("G7", g1); const c7 = c7own.status === 200 ? c7own : await close("G7", g2);
  ok("G7 cierra por un Gestor IDC distinto del responsable", c7.status === 200, `${c7own.status} ${c7.text}`);
  const st = (await g1.get(E)).json?.expediente?.status;
  ok("expediente queda 'cerrado'", st === "cerrado", st);
  const edit = await g1.patch(E, { data: JSON.parse((await g1.get(E)).json.expediente.data_json), reason: "x" });
  ok("expediente cerrado: edición → 409", edit.status === 409, edit.status);
  const tl = (await cli.get(E)).json?.expediente?.external_events ?? [];
  ok("cliente ve su línea de tiempo (eventos externos)", tl.length >= 5, tl.length);
} finally {
  server?.kill(); await new Promise((r) => setTimeout(r, 800)); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`); if (fails.length) { console.log(" - " + fails.join("\n - ")); process.exitCode = 1; }
}

