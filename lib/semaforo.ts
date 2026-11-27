import type { Estatus } from "@/data/mock";
import { ETAPAS, REQUISITOS_POST_INSTALACION, REQUISITOS_PRE_FIRMA } from "@/lib/etapas";

type Gate = { gate_code: string; status: string };
type Requisito = { requirement_code: string; status: string };

// Gate actual (1 a 8): el primero que no está cerrado. Si todos cerraron, el último.
export function gateActual(gates: Gate[]): number {
  const index = ETAPAS.findIndex((etapa) => gates.find((gate) => gate.gate_code === etapa.code)?.status !== "cerrado");
  return index === -1 ? ETAPAS.length : index + 1;
}

export function encabezadoGate(gates: Gate[], estado: "cargando" | "error" | "listo"): string {
  if (estado === "cargando") return "Cargando…";
  if (estado === "error") return "No se pudo cargar el avance";
  if (ETAPAS.every((etapa) => gates.some((gate) => gate.gate_code === etapa.code && gate.status === "cerrado"))) return "Expediente cerrado";
  const actual = gateActual(gates);
  return `Gate ${actual} · ${ETAPAS[actual - 1].nombre}`;
}

export function semaforoExpediente(gates: Gate[], requisitos: Requisito[]): { estatus: Estatus; detalle: string } {
  const observados = requisitos.filter((item) => item.status === "observado").length;
  if (observados) return { estatus: "atrasado", detalle: `${observados} con observación` };
  const estadoGate = (code: string) => gates.find((gate) => gate.gate_code === code)?.status;
  const codes: readonly string[] = estadoGate("G1") !== "cerrado"
    ? REQUISITOS_PRE_FIRMA
    : estadoGate("G3") !== "cerrado"
      ? REQUISITOS_POST_INSTALACION
      : estadoGate("G6") === "abierto"
        ? Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`)
        : [];
  const faltantes = requisitos.filter((item) => codes.includes(item.requirement_code) && item.status === "requerido").length;
  if (faltantes) return { estatus: "riesgo", detalle: `${faltantes} requisito${faltantes > 1 ? "s" : ""} por completar` };
  if (requisitos.some((item) => item.status === "requerido")) return { estatus: "entiempo", detalle: "Hay requisitos de otras etapas" };
  return { estatus: "entiempo", detalle: "Sin faltantes" };
}
