// Reglas del portal del cliente (sin dependencias de servidor).

export type RequisitoCliente = {
  requirement_code: string;
  name: string;
  status: string;
  tipo: string;
  integra: string;
  validaciones: string;
  reutiliza_code: string | null;
  updated_at?: string;
  observations: Array<{ visibility: string; body: string }>;
};
type Gate = { gate_code: string; status: string };

const CARGABLES = ["carga", "carga_sensible", "carga_multiple"];
export const LISTOS = ["validado_idc", "no_aplica_justificado", "escaneo_verificado_idc"];

export const ESTADO_DOCUMENTO: Record<string, string> = {
  requerido: "Pendiente",
  en_captura: "Pendiente",
  cargado: "Subido",
  en_revision_idc: "Subido",
  observado: "Con observación",
  validado_idc: "Validado",
  no_aplica_justificado: "No aplica",
  vencido: "Vencido",
  invalidado_por_cambio: "Volver a subir",
};

export function documentosDelCliente(review: RequisitoCliente[], gates: Gate[]) {
  const status = (code: string) => gates.find((gate) => gate.gate_code === code)?.status;
  const cfeAbierto = status("G1") !== "cerrado";
  const uiieAbierto = status("G6") === "abierto";
  const delCliente = (item: RequisitoCliente) => item.integra.includes("Cliente") && CARGABLES.includes(item.tipo);
  const cfe = review.filter((item) => item.requirement_code.startsWith("R") && delCliente(item));
  const reutilizado = (item: RequisitoCliente) => Boolean(item.reutiliza_code) && ["validado_idc", "no_aplica_justificado"].includes(item.status);
  const uiie = review.filter((item) => item.requirement_code.startsWith("U") && delCliente(item) && !reutilizado(item));
  return {
    documentos: [...cfe, ...(uiieAbierto ? uiie : [])],
    puedeSubir: (item: RequisitoCliente) => !LISTOS.includes(item.status) && (item.requirement_code.startsWith("R") ? cfeAbierto : uiieAbierto),
    reutilizados: review.filter((item) => item.requirement_code.startsWith("U") && reutilizado(item)).length,
  };
}
