import assert from "node:assert/strict";
import { documentosDelCliente, type RequisitoCliente } from "../../lib/portal-cliente";
import { semaforoExpediente } from "../../lib/semaforo";

const gates = [{ gate_code: "G1", status: "cerrado" }, { gate_code: "G3", status: "cerrado" }, { gate_code: "G6", status: "abierto" }];
const requisito = (status: string): RequisitoCliente => ({
  requirement_code: "U06", name: "Identificación", status, tipo: "carga", integra: "Cliente",
  validaciones: "", reutiliza_code: "R06", observations: [],
});

for (const status of ["requerido", "observado", "cargado"]) {
  const item = requisito(status);
  const result = documentosDelCliente([item], gates);
  assert.equal(result.documentos.length, 1, `U06 ${status} debe ser visible`);
  assert.equal(result.puedeSubir(item), true, `U06 ${status} debe permitir carga`);
  assert.equal(result.reutilizados, 0);
}
for (const status of ["validado_idc", "no_aplica_justificado"]) {
  const result = documentosDelCliente([requisito(status)], gates);
  assert.equal(result.documentos.length, 0, `U06 ${status} debe ocultarse`);
  assert.equal(result.reutilizados, 1);
}
assert.equal(documentosDelCliente([requisito("requerido")], [{ gate_code: "G6", status: "bloqueado" }]).documentos.length, 0);

const req = (requirement_code: string, status = "requerido") => ({ requirement_code, status });
assert.deepEqual(semaforoExpediente([{ gate_code: "G1", status: "abierto" }], [req("R01"), req("U06")]), { estatus: "riesgo", detalle: "1 requisito por completar" });
assert.deepEqual(semaforoExpediente([{ gate_code: "G1", status: "cerrado" }, { gate_code: "G3", status: "abierto" }], [req("R10"), req("R11")]), { estatus: "riesgo", detalle: "2 requisitos por completar" });
assert.deepEqual(semaforoExpediente(gates, [req("U06"), req("U07")]), { estatus: "riesgo", detalle: "2 requisitos por completar" });
assert.equal(semaforoExpediente(gates, [req("U06", "observado")]).estatus, "atrasado");
assert.notEqual(semaforoExpediente([{ gate_code: "G1", status: "abierto" }], [req("U06")]).detalle, "Sin faltantes");
assert.deepEqual(semaforoExpediente(gates, [req("U06", "validado_idc")]), { estatus: "entiempo", detalle: "Sin faltantes" });

console.log("Regresiones PR #1: portal reutilizados y semáforo OK");
