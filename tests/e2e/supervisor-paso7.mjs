const BASE = process.env.BASE ?? "http://localhost:3199";
const password = "ConectaLocal-2026!";

function client() {
  let cookie = "";
  return {
    async request(path, options = {}) {
      const headers = { origin: BASE, ...(options.headers ?? {}) };
      if (cookie) headers.cookie = cookie;
      const response = await fetch(`${BASE}${path}`, { ...options, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      let json = null;
      try { json = await response.json(); } catch {}
      return { response, json };
    },
    post(path, body) { return this.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); },
  };
}

const checks = [];
function ok(name, value, detail = "") { checks.push({ name, value, detail }); console.log(`  ${value ? "✅" : "❌"} ${name}${value ? "" : ` ${detail}`}`); }

const idc = client();
await idc.post("/api/auth/login", { email: "coordinador.demo@example.invalid", password });
const expedientes = await idc.request("/api/expedientes");
const expediente = expedientes.json?.expedientes?.find((item) => item.folio === "IDC-DEMO-0001") ?? expedientes.json?.[0];
if (!expediente) throw new Error("No hay expediente de prueba para Paso 7.");

let result = await idc.post(`/api/expedientes/${expediente.id}/gates`, { action: "close", gateCode: "G3" });
ok("G3 sin acuse externo → 409", result.response.status === 409, JSON.stringify(result.json));
result = await idc.post(`/api/expedientes/${expediente.id}/gates`, { action: "event", eventType: "ingreso_acuse", description: "Acuse sin datos" });
ok("acuse sin medio, número y documento → 400", result.response.status === 400, JSON.stringify(result.json));
result = await idc.post(`/api/expedientes/${expediente.id}/gates`, { action: "event", eventType: "resolucion_cfe", description: "Oficio sin vigencia", documentId: "no-existe", resultado: "favorable" });
ok("oficio sin evidencia válida → 400", result.response.status === 400, JSON.stringify(result.json));
result = await idc.request(`/api/expedientes/${expediente.id}/gates`);
ok("consulta de gates incluye G3–G7", result.response.ok && result.json?.gates?.some((gate) => gate.gate_code === "G7"));

const cliente = client();
await cliente.post("/api/auth/login", { email: "cliente.demo@example.invalid", password });
result = await cliente.post(`/api/expedientes/${expediente.id}/gates`, { action: "event", eventType: "ingreso_acuse", description: "No autorizado", medio: "ventanilla", solicitudNumero: "CFE-DEMO", documentId: "no-existe" });
ok("cliente no registra eventos externos → 403", result.response.status === 403, JSON.stringify(result.json));

const admin = client();
await admin.post("/api/auth/login", { email: "seguridad.demo@example.invalid", password });
result = await admin.request(`/api/expedientes/${expediente.id}/gates`);
ok("admin no consulta gates → 403", result.response.status === 403, JSON.stringify(result.json));

const failed = checks.filter((check) => !check.value);
console.log(`PASO 7: ${checks.length - failed.length} ✅ / ${failed.length} ❌`);
process.exitCode = failed.length ? 1 : 0;
