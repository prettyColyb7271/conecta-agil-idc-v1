import type { Estatus } from "@/data/mock";
import { ETAPAS, REQUISITOS_PRE_FIRMA } from "@/lib/etapas";

type Gate = { gate_code: string; status: string };
type Requisito = { requirement_code: string; status: string };

// Gate actual (1 a 8): el primero que no está cerrado. Si todos cerraron, el último.
export function gateActual(gates: Gate[]): number {
  const index = ETAPAS.findIndex((etapa) => gates.find((gate) => gate.gate_code === etapa.code)?.status !== "cerrado");
  return index === -1 ? ETAPAS.length : index + 1;
}

// Semáforo del expediente con datos reales:
// - Atrasado: hay documentos observados que esperan corrección.
// - Con riesgo: faltan requisitos de CFE previos a la cita de firma (R01–R09).
// - En tiempo: no hay faltantes ni observaciones.
export function semaforoExpediente(gates: Gate[], requisitos: Requisito[]): { estatus: Estatus; detalle: string } {
  const observados = requisitos.filter((item) => item.status === "observado").length;
  if (observados) return { estatus: "atrasado", detalle: `${observados} con observación` };
  const g1Cerrado = gates.find((gate) => gate.gate_code === "G1")?.status === "cerrado";
  const preFirma: readonly string[] = REQUISITOS_PRE_FIRMA;
  const faltantes = g1Cerrado ? 0 : requisitos.filter((item) => preFirma.includes(item.requirement_code) && item.status === "requerido").length;
  if (faltantes) return { estatus: "riesgo", detalle: `${faltantes} requisito${faltantes > 1 ? "s" : ""} por completar` };
  return { estatus: "entiempo", detalle: "Sin faltantes" };
}
