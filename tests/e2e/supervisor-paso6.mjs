const B = process.env.BASE ?? "http://localhost:3140";
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
const expediente = expedientes.json?.expedientes?.[0];
ok("hay expediente de semilla", Boolean(expediente?.id));
if (expediente) {
  const gates = await gestor.request("GET", `/api/expedientes/${expediente.id}/gates`);
  ok("consulta G0–G7", gates.status === 200 && gates.json?.gates?.length === 8);
  const closeG1 = await gestor.request("POST", `/api/expedientes/${expediente.id}/gates`, { action: "close", gateCode: "G1" });
  ok("G1 incompleto queda bloqueado", closeG1.status === 409, closeG1.text);
  const invalidFormat = await gestor.request("POST", `/api/expedientes/${expediente.id}/formats`, { formatCode: "F-99" });
  ok("formato desconocido devuelve 400", invalidFormat.status === 400);
}
const admin = new Session();
await admin.request("POST", "/api/auth/login", { email: "seguridad.demo@example.invalid", password: "ConectaLocal-2026!" });
if (expediente) {
  const denied = await admin.request("GET", `/api/expedientes/${expediente.id}/gates`);
  ok("admin no puede consultar gates", denied.status === 403, `${denied.status} ${denied.text}`);
}
console.log(`PASO 6: ${pass} ✅ / ${fail} ❌`);
process.exitCode = fail ? 1 : 0;
