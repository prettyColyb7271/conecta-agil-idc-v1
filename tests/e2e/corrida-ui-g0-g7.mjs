import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.argv[2];
const port = 3203;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a2-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
let pass = 0, fail = 0;
const failures = [];
function ok(name, value, detail = "") {
  if (value) { pass++; console.log("  ✅", name); }
  else { fail++; failures.push(name); console.log("  ❌", name, detail); }
}
function must(name, response, expected) {
  ok(name, response.status === expected, response.json?.error);
  if (response.status !== expected) throw new Error(`${name}: HTTP ${response.status}`);
  return response.json;
}
class Session {
  cookies = {};
  async request(method, url, body) {
    const headers = { origin: base };
    const cookie = Object.entries(this.cookies).map(([name, value]) => `${name}=${value}`).join("; ");
    if (cookie) headers.cookie = cookie;
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetch(base + url, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair.indexOf("=");
      if (pair.slice(index + 1)) this.cookies[pair.slice(0, index)] = pair.slice(index + 1);
      else delete this.cookies[pair.slice(0, index)];
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Respuesta no JSON: HTTP ${response.status}`); }
    return { status: response.status, json };
  }
  get(url) { return this.request("GET", url); }
  post(url, body) { return this.request("POST", url, body); }
  patch(url, body) { return this.request("PATCH", url, body); }
}
const pdf = (name) => new Blob([`%PDF-1.4\n% ${name}\n%%EOF\n`], { type: "application/pdf" });
function form(fields, name, subgate) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("file", pdf(name), `${name}.pdf`);
  if (subgate) data.set("subgateFile", subgate, "subgate.pdf");
  return data;
}
const labels = {
  ingreso_acuse: "Acuse de CFE", resolucion_cfe: "Oficio resolutivo", contrato: "Contrato",
  uiie: "Visita UIIE", certificado_uiie: "Certificado UIIE", medidor: "Medidor",
  interconexion: "Interconexión", alta_comercial: "Alta comercial",
};

let server;
try {
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "pipe" });
  const seed = JSON.parse(execFileSync(process.execPath, [tsx, "scripts/db-seed.ts"], { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  server = spawn(process.execPath, [path.join(root, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], { cwd: root, env, stdio: "ignore" });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("No inició el servidor aislado de A2.");
  const cliente = new Session(), gestor = new Session(), otro = new Session();
  for (const [session, email] of [[cliente, "cliente.demo@example.invalid"], [gestor, "coordinador.demo@example.invalid"], [otro, "idc2.demo@example.invalid"]]) {
    must(`login ficticio ${email}`, await session.post("/api/auth/login", { email, password: seed.password }), 200);
  }
  const list = must("consultar expedientes", await gestor.get("/api/expedientes"), 200);
  const sample = list.expedientes[0];
  const owner = list.options.responsables.find((item) => item.email === "coordinador.demo@example.invalid");
  if (!sample || !owner) throw new Error("La semilla no tiene el cliente o responsable esperado.");
  const expediente = must("crear expediente ficticio principal", await gestor.post("/api/expedientes", { clienteId: sample.cliente_id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true, responsableId: owner.id }), 201).expediente;
  const E = `/api/expedientes/${expediente.id}`;
  must("completar captura ficticia principal", await cliente.patch(E, { data: JSON.parse(sample.data_json) }), 200);
  const close = (session, endpoint, gateCode) => session.post(`${endpoint}/gates`, { action: "close", gateCode });
  const evidence = (endpoint, type, extra = {}, subgate) => gestor.post(`${endpoint}/documents`, form({ eventType: type, eventDate: "2026-11-27", description: labels[type], ...extra }, type, subgate));

  async function prepararG3(endpoint) {
    must("cliente acepta privacidad", await cliente.post(`${endpoint}/privacy`, { version: "aviso-privacidad-v1" }), 200);
    must("cerrar G0", await close(gestor, endpoint, "G0"), 200);
    const current = must("consultar captura", await cliente.get(endpoint), 200).expediente;
    const data = JSON.parse(current.data_json);
    data.contacto = { nombre: "Contacto ficticio", correo: "contacto@example.invalid", telefono: "5550000000" };
    data.representacion = { ...(data.representacion ?? {}), enlace_cfe: "Enlace ficticio", enlace_cfe_correo: "enlace@example.invalid" };
    must("completar datos ficticios", await cliente.patch(endpoint, { data }), 200);
    const review = must("consultar requisitos R", await gestor.get(`${endpoint}/requirements/R01`), 200);
    for (const item of review.requirements.filter((r) => /^R0[1-9]$/.test(r.requirement_code))) {
      const uploader = /Cliente/.test(item.integra) && !/IDC\//.test(item.integra) ? cliente : gestor;
      must(`subir ${item.requirement_code}`, await uploader.post(`${endpoint}/documents`, form({ requirementCode: item.requirement_code }, item.requirement_code)), 201);
      must(`validar ${item.requirement_code}`, await otro.post(`${endpoint}/requirements/${item.requirement_code}`, { action: "validate" }), 200);
    }
    must("cerrar G1", await close(gestor, endpoint, "G1"), 200);
    for (const [formatCode, requirementCode] of [["F-01", "R01"], ["F-02", "R07"]]) {
      const generated = must(`generar ${formatCode}`, await gestor.post(`${endpoint}/formats`, { action: "generate", formatCode }), 201).format;
      must(`marcar ${formatCode} para firma`, await gestor.post(`${endpoint}/formats`, { action: "print", formatCode, versionId: generated.versionId }), 201);
      const scan = must(`subir escaneo ${requirementCode}`, await gestor.post(`${endpoint}/documents`, form({ requirementCode, sourceVersionId: generated.versionId }, requirementCode)), 201).document;
      must(`verificar escaneo ${requirementCode}`, await otro.post(`${endpoint}/requirements/${requirementCode}`, { action: "verify_scan", versionId: scan.versionId }), 200);
    }
    const lugar = "Oficina ficticia";
    const firmantes = ["Solicitante: Persona A", "Otorgante: Persona B", "Apoderado: Persona C", "Testigo 1: Persona D", "Testigo 2: Persona E"];
    const description = "Firma presencial";
    const full = `${description} · Lugar: ${lugar} · Firmantes: ${firmantes.join(", ")}`;
    const firma = must("subir firma presencial", await gestor.post(`${endpoint}/documents`, form({ eventType: "firma_presencial", eventDate: "2026-11-27", description: full }, "firma")), 201).document;
    must("completar firma presencial", await gestor.post(`${endpoint}/gates`, { action: "event", eventType: "firma_presencial", eventDate: "2026-11-27", description, lugar, firmantes, documentId: firma.documentId }), 201);
    must("cerrar G2", await close(gestor, endpoint, "G2"), 200);
  }
  await prepararG3(E);
  const early = await evidence(E, "ingreso_acuse", { medio: "ventanilla", solicitudNumero: "SOL-001" });
  ok("acuse sin R10 y R11 → 409", early.status === 409 && /R10/.test(early.json.error) && /R11/.test(early.json.error), early.json.error);
  for (const code of ["R10", "R11"]) {
    must(`subir ${code}`, await gestor.post(`${E}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code}`, await otro.post(`${E}/requirements/${code}`, { action: "validate" }), 200);
  }
  const acuse = must("registrar acuse", await evidence(E, "ingreso_acuse", { medio: "ventanilla", solicitudNumero: "SOL-001" }), 201).document;
  const db = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const workflows = db.prepare("SELECT workflow_status FROM expediente_requirements WHERE expediente_id = ? AND requirement_code IN ('R01', 'R07')").all(expediente.id);
  const acuseStatus = db.prepare("SELECT status FROM documents WHERE id = ?").get(acuse.documentId);
  ok("la carga única actualiza el estado de ingreso con acuse", workflows.length === 2 && workflows.every((row) => row.workflow_status === "ingresado_con_acuse") && acuseStatus?.status === "ingresado_con_acuse");
  db.close();
  must("cerrar G3", await close(gestor, E, "G3"), 200);
  const badSubgate = await evidence(E, "resolucion_cfe", { resultado: "condicionado", vigenciaMeses: "2", subgateRequerido: "true" }, new Blob(["no es PDF"], { type: "application/pdf" }));
  ok("subgate inválido rechazado", badSubgate.status === 400, badSubgate.json.error);
  must("registrar oficio condicionado con subgate", await evidence(E, "resolucion_cfe", { resultado: "condicionado", vigenciaMeses: "2", subgateRequerido: "true" }, pdf("subgate ficticio")), 201);
  const resolution = (await gestor.get(E)).json.expediente.external_events.find((item) => item.event_type === "resolucion_cfe");
  ok("oficio conserva resultado, fecha límite y documento de subgate", resolution?.resultado === "condicionado" && resolution.vence_at?.startsWith("2027-01-26") && !!resolution.subgate_document_id);
  must("cerrar G4", await close(gestor, E, "G4"), 200);
  must("registrar contrato", await evidence(E, "contrato"), 201);
  must("cerrar G5", await close(gestor, E, "G5"), 200);
  for (const code of ["U12", "U13", "U17"]) must(`validar ${code}`, await otro.post(`${E}/requirements/${code}`, { action: "validate" }), 200);
  for (const [code, uploader] of [["U04", cliente], ["U05", cliente], ["U06", cliente], ["U07", cliente], ["U09", gestor], ["U14", gestor], ["U15", cliente]]) {
    must(`subir ${code}`, await uploader.post(`${E}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code}`, await otro.post(`${E}/requirements/${code}`, { action: "validate" }), 200);
  }
  for (const tipo of ["uiie", "certificado_uiie"]) must(`registrar ${tipo}`, await evidence(E, tipo), 201);
  must("cerrar G6", await close(gestor, E, "G6"), 200);
  for (const tipo of ["medidor", "interconexion", "alta_comercial"]) must(`registrar ${tipo}`, await evidence(E, tipo), 201);
  must("registrar cierre", await gestor.post(`${E}/gates`, { action: "event", eventType: "cierre", description: "Cierre revisado" }), 201);
  const own = await close(gestor, E, "G7");
  ok("responsable no cierra G7 → 409", own.status === 409 && /distinto del responsable/.test(own.json.error), own.json.error);
  must("otro gestor cierra G7", await close(otro, E, "G7"), 200);
  const final = must("consultar expediente cerrado", await gestor.get(E), 200).expediente;
  ok("expediente cerrado", final.status === "cerrado" && final.gates.every((gate) => gate.status === "cerrado"));
  for (const type of ["firma_presencial", ...Object.keys(labels), "cierre"]) ok(`un solo evento ${type}`, final.external_events.filter((event) => event.event_type === type).length === 1);

  const newExp = must("crear expediente ficticio de reproceso", await gestor.post("/api/expedientes", { clienteId: expediente.cliente_id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true, responsableId: owner.id }), 201).expediente;
  const R = `/api/expedientes/${newExp.id}`;
  must("copiar captura ficticia al reproceso", await cliente.patch(R, { data: JSON.parse(final.data_json) }), 200);
  await prepararG3(R);
  for (const code of ["R10", "R11"]) {
    must(`subir ${code} del reproceso`, await gestor.post(`${R}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code} del reproceso`, await otro.post(`${R}/requirements/${code}`, { action: "validate" }), 200);
  }
  must("registrar acuse antes del reproceso", await evidence(R, "ingreso_acuse", { medio: "portal", solicitudNumero: "SOL-REPROCESO" }), 201);
  must("registrar CFE incompleto", await gestor.post(`${R}/gates`, { action: "event", eventType: "cfe_incompleto", description: "Faltan datos informados por CFE" }), 201);
  const reproceso = must("consultar reproceso", await gestor.get(R), 200).expediente;
  ok("reproceso reabre G1 y bloquea G2–G7", reproceso.gates.find((gate) => gate.gate_code === "G1")?.status === "abierto" && reproceso.gates.filter((gate) => gate.gate_code >= "G2").every((gate) => gate.status === "bloqueado"));
  ok("reproceso observa todos los R", reproceso.requirements.filter((item) => /^R\d{2}$/.test(item.requirement_code)).length === 11 && reproceso.requirements.filter((item) => /^R\d{2}$/.test(item.requirement_code)).every((item) => item.status === "observado"));
  const clientReview = must("cliente consulta motivo del reproceso", await cliente.get(`${R}/requirements/R01`), 200).requirements;
  ok("motivo visible para el cliente en cada requisito R", clientReview.filter((item) => /^R\d{2}$/.test(item.requirement_code)).every((item) => item.observations.some((observation) => observation.visibility === "cliente" && observation.body === "Faltan datos informados por CFE")));
  const reprocesoDb = new DatabaseSync(path.join(dataDir, "conecta-agil.sqlite"), { readOnly: true });
  const stale = reprocesoDb.prepare("SELECT COUNT(*) AS n FROM expediente_requirements WHERE expediente_id = ? AND requirement_code LIKE 'R%' AND (validated_by IS NOT NULL OR validated_at IS NOT NULL OR workflow_status IS NOT NULL)").get(newExp.id);
  const reset = reprocesoDb.prepare("SELECT reinicio_at FROM external_events WHERE expediente_id = ? AND event_type = 'cfe_incompleto'").get(newExp.id);
  ok("reproceso limpia la validación previa y registra el reinicio", stale.n === 0 && !!reset?.reinicio_at);
  reprocesoDb.close();
  ok("un solo evento de reproceso", reproceso.external_events.filter((event) => event.event_type === "cfe_incompleto").length === 1);

  const replacement = must("crear expediente ficticio para oficio no favorable", await gestor.post("/api/expedientes", { clienteId: expediente.cliente_id, tramite: "interconexion_fv_mt", nivelTension: "MT", habilitado: true, responsableId: owner.id }), 201).expediente;
  const O = `/api/expedientes/${replacement.id}`;
  must("copiar captura ficticia al expediente de oficio", await cliente.patch(O, { data: JSON.parse(final.data_json) }), 200);
  await prepararG3(O);
  for (const code of ["R10", "R11"]) {
    must(`subir ${code} del oficio`, await gestor.post(`${O}/documents`, form({ requirementCode: code }, code)), 201);
    must(`validar ${code} del oficio`, await otro.post(`${O}/requirements/${code}`, { action: "validate" }), 200);
  }
  must("registrar acuse del oficio", await evidence(O, "ingreso_acuse", { medio: "portal", solicitudNumero: "SOL-OFICIO" }), 201);
  must("cerrar G3 del oficio", await close(gestor, O, "G3"), 200);
  must("registrar oficio no favorable", await evidence(O, "resolucion_cfe", { resultado: "no_favorable", vigenciaMeses: "2" }), 201);
  const noFavorable = await close(gestor, O, "G4");
  ok("oficio no favorable impide cerrar G4", noFavorable.status === 409 && /no favorable/.test(noFavorable.json.error), noFavorable.json.error);
  const favorable = must("registrar otro oficio de la misma fecha", await evidence(O, "resolucion_cfe", { resultado: "favorable", vigenciaMeses: "2" }), 201).document;
  must("el último oficio permite cerrar G4", await close(gestor, O, "G4"), 200);
  must("registrar contrato del oficio", await evidence(O, "contrato"), 201);
  must("cerrar G5 del oficio", await close(gestor, O, "G5"), 200);
  const updated = (await gestor.get(O)).json.expediente.external_events.filter((event) => event.event_type === "resolucion_cfe");
  const reused = (await gestor.get(`${O}/requirements/U01`)).json.requirements.find((item) => item.requirement_code === "U01");
  ok("cada oficio es un evento y se reutiliza el último", updated.length === 2 && updated.at(-1)?.document_id === favorable.documentId && reused?.document_id === favorable.documentId, `eventos=${updated.length}; último=${updated.at(-1)?.document_id}; esperado=${favorable.documentId}; reutilizado=${reused?.document_id}`);
} finally {
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 800));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
