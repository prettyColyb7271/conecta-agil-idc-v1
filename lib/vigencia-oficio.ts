type Gate = { gate_code: string; status: string };
type EventoOficio = { event_type: string; event_date?: string; sequence?: number; resultado: string | null; vence_at: string | null };

export type AlertaVigenciaOficio = {
  venceAt: string;
  diasRestantes: number;
  nivel: "informativa" | "roja";
};

export function diasHastaFecha(fecha: string, hoy = new Date()): number {
  const limite = new Date(fecha);
  if (!Number.isFinite(limite.getTime()) || !Number.isFinite(hoy.getTime())) throw new RangeError("La fecha no es válida.");
  const limiteUtc = Date.UTC(limite.getUTCFullYear(), limite.getUTCMonth(), limite.getUTCDate());
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.round((limiteUtc - hoyUtc) / 86400000);
}

export function nivelAlertaOficio(diasRestantes: number): AlertaVigenciaOficio["nivel"] {
  return diasRestantes <= 10 ? "roja" : "informativa";
}

export function alertaVigenciaOficio(gates: Gate[], eventos: EventoOficio[], hoy = new Date()): AlertaVigenciaOficio | null {
  if (gates.find((gate) => gate.gate_code === "G5")?.status === "cerrado") return null;
  const oficio = eventos
    .filter((evento) => evento.event_type === "resolucion_cfe")
    .sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? "") || (a.sequence ?? 0) - (b.sequence ?? 0))
    .at(-1);
  if (!oficio?.vence_at || !["favorable", "condicionado"].includes(oficio.resultado ?? "")) return null;
  const diasRestantes = diasHastaFecha(oficio.vence_at, hoy);
  return { venceAt: oficio.vence_at, diasRestantes, nivel: nivelAlertaOficio(diasRestantes) };
}
