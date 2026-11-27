import assert from "node:assert/strict";
import { documentosDelCliente, type RequisitoCliente } from "../../lib/portal-cliente";
import { encabezadoGate, semaforoExpediente } from "../../lib/semaforo";
import { ETAPAS } from "../../lib/etapas";
import { sumarMesesCalendario } from "../../lib/fechas";
import { etiquetaGate, traducirGateMensaje } from "../../lib/gate-display";
import { alertaVigenciaOficio, diasHastaFecha, nivelAlertaOficio } from "../../lib/vigencia-oficio";

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

const avance = (cerrados: number, status = "abierto") => ETAPAS.map((etapa, index) => ({ gate_code: etapa.code, status: index < cerrados ? "cerrado" : index === cerrados ? status : "bloqueado" }));
assert.equal(encabezadoGate([], "cargando"), "Cargando…");
assert.equal(encabezadoGate([], "error"), "No se pudo cargar el avance");
assert.equal(encabezadoGate(avance(0), "listo"), "Gate 1 · Registro y captura");
assert.equal(encabezadoGate(avance(4, "bloqueado"), "listo"), "Gate 5 · Oficio resolutivo");
assert.equal(encabezadoGate(avance(7), "listo"), "Gate 8 · Medidor y alta");
assert.equal(encabezadoGate(avance(8), "listo"), "Expediente cerrado");

assert.equal(sumarMesesCalendario("2026-01-31T12:30:00.000Z", 1).toISOString(), "2026-02-28T12:30:00.000Z");
assert.equal(sumarMesesCalendario("2024-01-31T00:00:00.000Z", 1).toISOString(), "2024-02-29T00:00:00.000Z");
assert.equal(sumarMesesCalendario("2024-02-29T00:00:00.000Z", 12).toISOString(), "2025-02-28T00:00:00.000Z");

assert.equal(etiquetaGate("G3"), "Gate 4 · UVIE e ingreso a CFE");
assert.equal(traducirGateMensaje("G3 requiere un acuse antes de G4."), "Gate 4 · UVIE e ingreso a CFE requiere un acuse antes de Gate 5 · Oficio resolutivo.");

const hoy = new Date("2026-11-27T12:00:00.000Z");
assert.equal(diasHastaFecha("2026-12-02T00:00:00.000Z", hoy), 5);
assert.equal(nivelAlertaOficio(11), "informativa");
assert.equal(nivelAlertaOficio(10), "roja");
assert.equal(nivelAlertaOficio(-1), "roja");
const eventoOficio = [{ event_type: "resolucion_cfe", resultado: "favorable", vence_at: "2026-12-02T00:00:00.000Z" }];
assert.deepEqual(alertaVigenciaOficio([{ gate_code: "G5", status: "abierto" }], eventoOficio, hoy), {
  venceAt: "2026-12-02T00:00:00.000Z", diasRestantes: 5, nivel: "roja",
});
assert.equal(alertaVigenciaOficio([{ gate_code: "G5", status: "cerrado" }], eventoOficio, hoy), null);
assert.equal(alertaVigenciaOficio([{ gate_code: "G5", status: "abierto" }], [{ ...eventoOficio[0], resultado: "no_favorable" }], hoy), null);

console.log("Regresiones PR #1: portal, semáforo, meses calendario y alertas OK");
