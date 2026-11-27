import { ETAPAS } from "@/lib/etapas";

export function etiquetaGate(code: string): string {
  const index = ETAPAS.findIndex((etapa) => etapa.code === code);
  return index < 0 ? code : `Gate ${index + 1} · ${ETAPAS[index].nombre}`;
}

export function traducirGateMensaje(mensaje: string): string {
  return mensaje.replace(/\bG([0-7])\b/g, (_match, numero: string) => etiquetaGate(`G${numero}`));
}
