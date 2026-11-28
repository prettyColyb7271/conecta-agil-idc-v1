// Datos de ejemplo. Más adelante vendrán de Supabase con esta misma forma.

import { ETAPAS, TRAMITE_FV_MT_LABEL } from "@/lib/etapas";

// Roles según ESPECIFICACION_PILOTO_MT_FV.md §2
export type Role = "cliente" | "gestor_tramites_cfe" | "coordinador_idc" | "admin_seguridad";
export type Estatus = "atrasado" | "riesgo" | "entiempo";

export const ROLE_LABEL: Record<Role, string> = {
  cliente: "Cliente",
  gestor_tramites_cfe: "Gestor CFE (inactivo)",
  coordinador_idc: "Gestor IDC",
  admin_seguridad: "Administrador de seguridad",
};

// Las 8 etapas G0-G7 del trámite de interconexión FV en MT.
export const GATES = ETAPAS.map((etapa, index) => ({ n: index + 1, code: etapa.code, nombre: etapa.nombre }));

export const expediente = {
  folio: "IDC-2026-021",
  tramite: TRAMITE_FV_MT_LABEL,
  kpis: [
    { color: "#7c4dff", valor: "4.5", titulo: "Semanas a Energización", nota: "Límite máximo desde obra terminada" },
    { color: "#2563eb", valor: "90%", titulo: "Aceptación inicial", nota: "Aprobación al primer ingreso CFE" },
    { color: "#10b981", valor: "< 5", titulo: "Minutos de Consulta", nota: "Visibilidad inmediata de estatus" },
  ],
};

export const notificaciones = [
  { id: "n1", titulo: "Falta información en acta constitutiva", archivo: "IDC_ActaConstitutiva_021.pdf", urgente: true },
];

export const pendientes = [
  { id: "p1", titulo: "Cita única de firma: solicitud CFE y carta poder", archivo: "IDC_PaqueteFirma_021.pdf", urgente: true, hora: "12:03:07" },
];

export const procesos: {
  id: string; nombre: string; archivo: string; estatus: Estatus; detalle: string; gate: number;
}[] = [
  { id: "pr1", nombre: "Interconexión FV en MT", archivo: "IDC_SolicituddeInterconexión_021.pdf", estatus: "riesgo", detalle: "12:03:07", gate: 3 },
];

// ---------- Formatos CFE (datos de ejemplo) ----------

// Datos que ya estarían capturados en el expediente (se reutilizan al generar formatos)
export const datosExpediente: Record<string, string> = {
  razonSocial: "Industrias Ejemplo S.A. de C.V.",
  calle: "Blvd. Kino",
  numExterior: "123",
  numInterior: "B",
  colonia: "Centro",
  cp: "83010",
  municipio: "Hermosillo",
  estado: "Sonora",
};

// OJO: la lista real de documentos por trámite la debe confirmar IDC
export const documentosGD: { id: string; nombre: string; archivo: string | null }[] = [
  { id: "d1", nombre: "Identidad oficial (INE)", archivo: "INE_021.pdf" },
  { id: "d2", nombre: "Comprobante de domicilio", archivo: null },
  { id: "d3", nombre: "Acta constitutiva", archivo: "IDC_ActaConstitutiva_021.pdf" },
  { id: "d4", nombre: "RFC (constancia de situación fiscal)", archivo: "RFC_021.pdf" },
  { id: "d5", nombre: "Carta poder simple firmada", archivo: null },
];

export const formatosTramite: { id: string; nombre: string; archivo: string; completado: boolean }[] = [
  { id: "f-gd", nombre: "Solicitud de interconexión (F-01)", archivo: "IDC_SolicituddeInterconexión_021.pdf", completado: false },
  { id: "f-cp", nombre: "Carta poder para CFE (F-02)", archivo: "IDC_CartaPoder_021.pdf", completado: false },
];

export const camposFormato: { id: string; label: string; requerido?: boolean }[] = [
  { id: "razonSocial", label: "Razón social" },
  { id: "calle", label: "Calle" },
  { id: "numExterior", label: "No. exterior" },
  { id: "numInterior", label: "No. interior", requerido: false },
  { id: "colonia", label: "Colonia" },
  { id: "cp", label: "Código postal" },
  { id: "municipio", label: "Municipio" },
  { id: "estado", label: "Estado" },
];

// ---------- Panel del gestor (datos de ejemplo) ----------

// Correo de solicitudes desde variable de entorno (NEXT_PUBLIC_CONTACTO_IDC), nunca escrito en el código
export const CORREO_SOLICITUDES = process.env.NEXT_PUBLIC_CONTACTO_IDC ?? "";

// Línea base y meta del reto (cifras del anteproyecto, no son mediciones)
export const metas = [
  { titulo: "Semanas a energización", hoy: "9", meta: "≤ 4.5", color: "#7c4dff" },
  { titulo: "Aceptación al primer ingreso", hoy: "50%", meta: "≥ 90%", color: "#2563eb" },
  { titulo: "Consulta de estatus", hoy: "1 día", meta: "< 5 min", color: "#10b981" },
  { titulo: "Horas de gestión por semana", hoy: "12 h", meta: "≤ 6 h", color: "#f59e0b" },
];

// Ilustrativo
export const tendencia = [
  { semana: "S1", entiempo: 3, riesgo: 2, atrasado: 2 },
  { semana: "S2", entiempo: 4, riesgo: 2, atrasado: 1 },
  { semana: "S3", entiempo: 5, riesgo: 1, atrasado: 1 },
  { semana: "S4", entiempo: 5, riesgo: 2, atrasado: 0 },
  { semana: "S5", entiempo: 6, riesgo: 1, atrasado: 0 },
  { semana: "S6", entiempo: 7, riesgo: 1, atrasado: 0 },
];

export const pendientesGestor = [
  { id: "g1", titulo: "Revisar acta constitutiva observada", folio: "IDC-2026-021", urgente: true },
  { id: "g2", titulo: "Vence la vigencia del oficio resolutivo (2 meses)", folio: "IDC-2026-017", urgente: true },
  { id: "g3", titulo: "Llegó el oficio: agendar firma de contratos", folio: "IDC-2026-014", urgente: false },
];

export const tramites = [TRAMITE_FV_MT_LABEL];

export const proyectos: {
  folio: string; proyecto: string; cliente: string; tramite: string; estatus: Estatus; gate: number; responsable: string;
}[] = [
  { folio: "IDC-2026-021", proyecto: "Central FV 45.5 kWp planta Hermosillo", cliente: "Industrias Ejemplo S.A. de C.V.", tramite: "Interconexión FV MT", estatus: "riesgo", gate: 3, responsable: "Gestor IDC Demo" },
  { folio: "IDC-2026-017", proyecto: "Central FV parque industrial", cliente: "Parque Norte S.A.", tramite: "Interconexión FV MT", estatus: "atrasado", gate: 5, responsable: "Gestor IDC Demo" },
  { folio: "IDC-2026-014", proyecto: "Central FV bodega 2", cliente: "Logística Sonora S.A.", tramite: "Interconexión FV MT", estatus: "entiempo", gate: 6, responsable: "Gestor IDC Demo" },
  { folio: "IDC-2026-009", proyecto: "Paneles solares oficinas", cliente: "Despacho Ejemplo", tramite: "Interconexión FV MT", estatus: "entiempo", gate: 8, responsable: "Gestor IDC Demo" },
];

export type EstadoUsuario = "pendiente" | "activo" | "bloqueado" | "baja";
export const usuariosIniciales: { id: string; nombre: string; rol: Role; estado: EstadoUsuario }[] = [
  { id: "u1", nombre: "Prudencio Villa Buenaventura", rol: "cliente", estado: "pendiente" },
  { id: "u2", nombre: "Gestor IDC Demo", rol: "coordinador_idc", estado: "activo" },
  { id: "u3", nombre: "Crecencio Chaparro Moreno", rol: "gestor_tramites_cfe", estado: "bloqueado" },
];
