const B = process.env.BASE ?? "http://localhost:3140";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PizZip = require("pizzip");
let pass = 0, fail = 0;
const ok = (name, condition, extra = "") => {
  if (condition) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name, extra); }
};

class Session {
  jar = {};
  cookie() { return Object.entries(this.jar).map(([key, value]) => `${key}=${value}`).join("; "); }
  store(response) {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const [key, value] = pair.split("=");
      if (!value || /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cookie)) delete this.jar[key];
      else this.jar[key] = value;
    }
  }
  async request(method, path, body) {
    const headers = { origin: B };
    if (this.cookie()) headers.cookie = this.cookie();
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(B + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    this.store(response);
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch {}
    return { status: response.status, text, json };
  }
}

const gestor = new Session();
const login = await gestor.request("POST", "/api/auth/login", { email: "coordinador.demo@example.invalid", password: "ConectaLocal-2026!" });
ok("Gestor IDC inicia sesión", login.status === 200);
const expedientes = await gestor.request("GET", "/api/expedientes");
const expediente = expedientes.json?.expedientes?.find((item) => item.folio === "IDC-DEMO-0001") ?? expedientes.json?.expedientes?.[0];
ok("hay expediente de semilla", Boolean(expediente?.id));
if (expediente) {
  const gates = await gestor.request("GET", `/api/expedientes/${expediente.id}/gates`);
  ok("consulta G0–G7", gates.status === 200 && gates.json?.gates?.length === 8);
  const beforePrivacy = await gestor.request("POST", `/api/expedientes/${expediente.id}/gates`, { action: "close", gateCode: "G0" });
  ok("G0 sin aviso de privacidad → 409", beforePrivacy.status === 409 && /privacidad/i.test(beforePrivacy.json?.error ?? ""));
  const client = new Session();
  await client.request("POST", "/api/auth/login", { email: "cliente.demo@example.invalid", password: "ConectaLocal-2026!" });
  const privacy = await client.request("POST", `/api/expedientes/${expediente.id}/privacy`, { version: "0.1-borrador" });
  ok("cliente acepta aviso de privacidad", privacy.status === 200, `${privacy.status} ${privacy.text}`);
  const afterPrivacy = await gestor.request("POST", `/api/expedientes/${expediente.id}/gates`, { action: "close", gateCode: "G0" });
  ok("G0 con aviso aceptado → 200", afterPrivacy.status === 200, `${afterPrivacy.status} ${afterPrivacy.text}`);
  const closeG1 = await gestor.request("POST", `/api/expedientes/${expediente.id}/gates`, { action: "close", gateCode: "G1" });
  ok("G1 incompleto queda bloqueado", closeG1.status === 409, closeG1.text);
  const formatBeforeG1 = await gestor.request("POST", `/api/expedientes/${expediente.id}/formats`, { formatCode: "F-01" });
  ok("F-01 antes de G1 cerrado → 409", formatBeforeG1.status === 409);
  const clientFormat = await client.request("POST", `/api/expedientes/${expediente.id}/formats`, { formatCode: "F-01" });
  ok("cliente no puede generar formatos", clientFormat.status === 403);
  const invalidFormat = await gestor.request("POST", `/api/expedientes/${expediente.id}/formats`, { formatCode: "F-99" });
  ok("formato desconocido devuelve 400", invalidFormat.status === 400);
  const zip = new PizZip(await fs.readFile(`${process.cwd()}/templates/F-02_carta_poder.docx`));
  const xml = zip.file("word/document.xml").asText().replace("{{firma.fecha_corta}}", "{{marca.inexistente}}");
  zip.file("word/document.xml", xml);
  const form = new FormData();
  form.set("code", "F-02");
  form.set("file", new Blob([zip.generate({ type: "nodebuffer" })], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "unknown.docx");
  const unknown = await fetch(B + "/api/templates", { method: "POST", headers: { origin: B, cookie: gestor.cookie() }, body: form });
  ok("plantilla con marca desconocida → 400", unknown.status === 400, `${unknown.status} ${await unknown.text()}`);
  let publicTemplate = true;
  try { await fs.stat(`${process.cwd()}/public/plantillas`); } catch { publicTemplate = false; }
  ok("plantilla F-01 no está publicada", !publicTemplate);
}
const admin = new Session();
await admin.request("POST", "/api/auth/login", { email: "seguridad.demo@example.invalid", password: "ConectaLocal-2026!" });
if (expediente) {
  const denied = await admin.request("GET", `/api/expedientes/${expediente.id}/gates`);
  ok("admin no puede consultar gates", denied.status === 403, `${denied.status} ${denied.text}`);
}
console.log(`PASO 6: ${pass} ✅ / ${fail} ❌`);
process.exitCode = fail ? 1 : 0;
