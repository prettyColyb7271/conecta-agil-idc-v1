import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.argv[2];
const port = 3202;
const base = `http://localhost:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a1-"));
const env = { ...process.env, APP_MODE: "local", NEXT_PUBLIC_MODO: "local", LOCAL_DATA_DIR: dataDir };
let pass = 0, fail = 0;
const failures = [];
function ok(name, condition, detail = "") {
  if (condition) { pass++; console.log("  ✅", name); }
  else { fail++; failures.push(name); console.log("  ❌", name, detail); }
}

class Session {
  cookies = {};
  async request(method, url, body) {
    const headers = { origin: base };
    const cookie = Object.entries(this.cookies).map(([key, value]) => `${key}=${value}`).join("; ");
    if (cookie) headers.cookie = cookie;
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetch(base + url, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index), content = pair.slice(index + 1);
      if (content) this.cookies[name] = content;
      else delete this.cookies[name];
    }
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`Respuesta no JSON (${response.status}): ${text.slice(0, 200)}`); }
    return { status: response.status, json };
  }
  get(url) { return this.request("GET", url); }
  post(url, body) { return this.request("POST", url, body); }
}

function documentForm(fields, name) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set("file", new Blob([Buffer.from(`%PDF-1.4\n% ${name}\n%%EOF\n`)], { type: "application/pdf" }), `${name}.pdf`);
  return form;
}

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
  if (!ready) throw new Error("No inició el servidor aislado de A1.");

  const cliente = new Session(), gestor = new Session(), otro = new Session();
  for (const [session, email] of [[cliente, "cliente.demo@example.invalid"], [gestor, "coordinador.demo@example.invalid"], [otro, "idc2.demo@example.invalid"]]) {
    const login = await session.post("/api/auth/login", { email, password: seed.password });
    if (login.status !== 200 || login.json.mfaRequired) throw new Error(`No inició sesión el usuario ficticio: ${login.status}`);
  }
  const expediente = (await cliente.get("/api/expedientes")).json.expedientes[0];
  if (!expediente) throw new Error("No hay expediente ficticio.");
  const endpoint = `/api/expedientes/${expediente.id}`;
  if ((await cliente.post(`${endpoint}/privacy`, { version: "0.1-borrador" })).status !== 200 ||
      (await gestor.post(`${endpoint}/gates`, { action: "close", gateCode: "G0" })).status !== 200) throw new Error("No se pudo cerrar G0.");
  const review = await gestor.get(`${endpoint}/requirements/R01`);
  for (const requirement of review.json.requirements.filter((item) => /^R0[1-9]$/.test(item.requirement_code))) {
    const uploader = /Cliente/.test(requirement.integra) && !/IDC\//.test(requirement.integra) ? cliente : gestor;
    const uploaded = await uploader.post(`${endpoint}/documents`, documentForm({ requirementCode: requirement.requirement_code }, requirement.requirement_code));
    if (uploaded.status !== 201) throw new Error(`No se pudo cargar ${requirement.requirement_code}: ${uploaded.json.error}`);
    const verified = await otro.post(`${endpoint}/requirements/${requirement.requirement_code}`, { action: "validate" });
    if (verified.status !== 200) throw new Error(`No se pudo validar ${requirement.requirement_code}: ${verified.json.error}`);
  }
  const g1 = await gestor.post(`${endpoint}/gates`, { action: "close", gateCode: "G1" });
  ok("G1 cerrado", g1.status === 200, g1.json.error);
  const early = await gestor.post(`${endpoint}/gates`, { action: "close", gateCode: "G2" });
  ok("G2 antes de tiempo → 409 con mensaje", early.status === 409 && typeof early.json.error === "string" && early.json.error.length > 0, early.json.error);

  for (const formatCode of ["F-01", "F-02"]) {
    const generated = await gestor.post(`${endpoint}/formats`, { action: "generate", formatCode });
    if (generated.status !== 201) throw new Error(`No se pudo generar ${formatCode}: ${generated.json.error}`);
  }
  const regenerated = await gestor.post(`${endpoint}/formats`, { action: "generate", formatCode: "F-01" });
  const formats = (await gestor.get(`${endpoint}/formats`)).json.formats;
  ok("la lista expone primero la última versión generada", formats.find((item) => item.document_type === "F-01")?.version_id === regenerated.json.format.versionId);
  for (const [formatCode, requirementCode] of [["F-01", "R01"], ["F-02", "R07"]]) {
    const format = formats.find((item) => item.document_type === formatCode);
    const printed = await gestor.post(`${endpoint}/formats`, { action: "print", formatCode, versionId: format.version_id });
    ok(`marcar ${formatCode} para firma`, printed.status === 201, printed.json.error);
    const scan = await gestor.post(`${endpoint}/documents`, documentForm({ requirementCode, sourceVersionId: format.version_id }, `escaneo-${requirementCode}`));
    ok(`subir escaneo ${requirementCode}`, scan.status === 201, scan.json.error);
    const versionId = scan.json.document?.versionId;
    const ownReview = (await gestor.get(`${endpoint}/requirements/${requirementCode}`)).json.requirements.find((item) => item.requirement_code === requirementCode);
    const otherReview = (await otro.get(`${endpoint}/requirements/${requirementCode}`)).json.requirements.find((item) => item.requirement_code === requirementCode);
    ok(`${requirementCode}: la revisión identifica al cargador`, ownReview.versions[0]?.uploaded_by_current_user === 1 && otherReview.versions[0]?.uploaded_by_current_user === 0);
    const same = await gestor.post(`${endpoint}/requirements/${requirementCode}`, { action: "verify_scan", versionId });
    ok(`${requirementCode}: quien subió no verifica → 409`, same.status === 409 && typeof same.json.error === "string", same.json.error);
    const verified = await otro.post(`${endpoint}/requirements/${requirementCode}`, { action: "verify_scan", versionId });
    ok(`${requirementCode}: otro Gestor IDC verifica`, verified.status === 200, verified.json.error);
  }

  const eventDate = "2026-11-27";
  const lugar = "Oficina ficticia";
  const firmantes = ["Solicitante: Persona A", "Otorgante: Persona B", "Apoderado: Persona C", "Testigo 1: Persona D", "Testigo 2: Persona E"];
  const description = "Firma presencial";
  const fullDescription = `${description} · Lugar: ${lugar} · Firmantes: ${firmantes.join(", ")}`;
  const evidence = await gestor.post(`${endpoint}/documents`, documentForm({ eventType: "firma_presencial", eventDate, description: fullDescription }, "evidencia-firma"));
  ok("subir evidencia de firma", evidence.status === 201, evidence.json.error);
  const eventBody = { action: "event", eventType: "firma_presencial", eventDate, description, lugar, firmantes, documentId: evidence.json.document?.documentId };
  const event = await gestor.post(`${endpoint}/gates`, eventBody);
  ok("registrar firma con fecha, lugar y firmantes", event.status === 201, event.json.error);
  const repeated = await gestor.post(`${endpoint}/gates`, eventBody);
  ok("reintentar el registro conserva el evento", repeated.status === 201 && repeated.json.event?.id === event.json.event?.id, repeated.json.error);
  const events = (await gestor.get(endpoint)).json.expediente.external_events.filter((item) => item.event_type === "firma_presencial");
  ok("existe exactamente un evento con todos los datos", events.length === 1 && events[0].event_date === eventDate && events[0].description === fullDescription && events[0].document_id === eventBody.documentId);
  const closed = await gestor.post(`${endpoint}/gates`, { action: "close", gateCode: "G2" });
  ok("G2 cerrado y G3 abierto", closed.status === 200 && closed.json.gates?.some((gate) => gate.gate_code === "G2" && gate.status === "cerrado") && closed.json.gates?.some((gate) => gate.gate_code === "G3" && gate.status === "abierto"), closed.json.error);
} finally {
  server?.kill();
  await new Promise((resolve) => setTimeout(resolve, 800));
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  if (fail) process.exitCode = 1;
}
