// Etapas del trámite de interconexión FV en MT, alineadas con el flujo de 10
// pasos de la propuesta "Conecta Ágil: optimización del trámite". Los códigos
// G0-G7 se conservan porque viven en la base de datos y en la bitácora.

export const TRAMITE_FV_MT = "interconexion_fv_mt";
export const TRAMITE_FV_MT_LABEL = "Interconexión fotovoltaica en media tensión (MT)";

export const ETAPAS = [
  { code: "G0", nombre: "Registro y captura", pasos: "Pasos 1–3", descripcion: "Alta del cliente, aviso de privacidad y captura única de datos." },
  { code: "G1", nombre: "Listo para firma", pasos: "Paso 4", descripcion: "Documentos del cliente y técnicos (R01–R09) validados." },
  { code: "G2", nombre: "Cita única de firma", pasos: "Paso 5", descripcion: "Solicitud y carta poder firmadas en una sola cita." },
  { code: "G3", nombre: "UVIE e ingreso a CFE", pasos: "Pasos 6–7", descripcion: "Fotos y dictamen UVIE (R10–R11); acuse de recibido de CFE." },
  { code: "G4", nombre: "Oficio resolutivo", pasos: "Paso 8", descripcion: "Respuesta de CFE; vigencia de 2 meses." },
  { code: "G5", nombre: "Firma de contratos", pasos: "Paso 9", descripcion: "Contratos de interconexión y contraprestación." },
  { code: "G6", nombre: "Inspección UIIE", pasos: "Paso 10", descripcion: "Requisitos U01–U17 y certificado UIIE." },
  { code: "G7", nombre: "Medidor y alta", pasos: "Paso 10", descripcion: "Medidor bidireccional, alta comercial y cierre." },
] as const;

export type EtapaCode = typeof ETAPAS[number]["code"];

export function etapaNombre(code: string): string {
  return ETAPAS.find((etapa) => etapa.code === code)?.nombre ?? code;
}

// Requisitos que solo existen después de instalar el sistema. No bloquean la
// cita de firma (G1/G2); se exigen al cerrar el ingreso a CFE (G3).
export const REQUISITOS_POST_INSTALACION = ["R10", "R11"] as const;
export const REQUISITOS_PRE_FIRMA = ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09"] as const;

export function esPostInstalacion(code: string): boolean {
  return (REQUISITOS_POST_INSTALACION as readonly string[]).includes(code);
}
