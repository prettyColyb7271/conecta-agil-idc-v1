// Datos de ejemplo. Más adelante vendrán de Supabase con esta misma forma.

// Roles según ESPECIFICACION_PILOTO_MT_FV.md §2
export type Role = "cliente" | "gestor_tramites_cfe" | "coordinador_idc" | "admin_seguridad";
export type Estatus = "atrasado" | "riesgo" | "entiempo";

export const ROLE_LABEL: Record<Role, string> = {
  cliente: "Cliente",
  gestor_tramites_cfe: "Rol histórico inactivo",
  coordinador_idc: "Gestor IDC",
  admin_seguridad: "Administrador de seguridad",
};

export const GATES = [
  { n: 1, nombre: "Alta y clasificación" },
  { n: 2, nombre: "Revisión antes de CFE" },
  { n: 3, nombre: "Cierre de obra y pruebas" },
  { n: 4, nombre: "Plazos y vigencias" },
  { n: 5, nombre: "Cierre del expediente" },
];

export const expediente = {
  folio: "IDC-2026-021",
  tramite: "Aprobación de proyecto y entrega de recepción de obra en MT.",
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
  { id: "p1", titulo: "Firmar la carta poder", archivo: "IDC_CartaPoder_021.pdf", urgente: true, hora: "12:03:07" },
];

export const procesos: {
  id: string; nombre: string; archivo: string; estatus: Estatus; detalle: string; gate: number;
}[] = [
  { id: "pr1", nombre: "Contratación y medidor", archivo: "IDC_ContratodeContraprestación_021.pdf", estatus: "atrasado", detalle: "- 1 día", gate: 3 },
  { id: "pr2", nombre: "Interconexión GD", archivo: "IDC_SolicituddeInterconexión_021.pdf", estatus: "riesgo", detalle: "12:03:07", gate: 2 },
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
  { id: "f-cm", nombre: "Contratación y medidor", archivo: "IDC_ContratodeContraprestación_021.pdf", completado: false },
  { id: "f-gd", nombre: "Interconexión GD", archivo: "IDC_SolicituddeInterconexión_021.pdf", completado: false },
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
  { id: "g2", titulo: "Vence plazo de respuesta de CFE (2 meses)", folio: "IDC-2026-017", urgente: true },
  { id: "g3", titulo: "Subir Formato 5 a SISPROTER", folio: "IDC-2026-014", urgente: false },
];

export const tramites = ["Aprobación de proyecto MT y entrega-recepción", "Contratación y colocación de medidor", "Interconexión GD"];

export const proyectos: {
  folio: string; proyecto: string; cliente: string; tramite: string; estatus: Estatus; gate: number; responsable: string;
}[] = [
  { folio: "IDC-2026-021", proyecto: "Subestación planta Hermosillo", cliente: "Industrias Ejemplo S.A. de C.V.", tramite: "Interconexión GD", estatus: "riesgo", gate: 2, responsable: "Olegario Serenes" },
  { folio: "IDC-2026-017", proyecto: "Línea MT parque industrial", cliente: "Parque Norte S.A.", tramite: "Aprobación MT", estatus: "atrasado", gate: 3, responsable: "Olegario Serenes" },
  { folio: "IDC-2026-014", proyecto: "Contratación bodega 2", cliente: "Logística Sonora S.A.", tramite: "Contratación y medidor", estatus: "entiempo", gate: 4, responsable: "Olegario Serenes" },
  { folio: "IDC-2026-009", proyecto: "Paneles solares oficinas", cliente: "Despacho Ejemplo", tramite: "Interconexión GD", estatus: "entiempo", gate: 5, responsable: "Olegario Serenes" },
];

export type EstadoUsuario = "pendiente" | "activo" | "bloqueado";
export const usuariosIniciales: { id: string; nombre: string; rol: Role; estado: EstadoUsuario }[] = [
  { id: "u1", nombre: "Prudencio Villa Buenaventura", rol: "cliente", estado: "pendiente" },
  { id: "u2", nombre: "Olegario Serenes Souza", rol: "coordinador_idc", estado: "activo" },
  { id: "u3", nombre: "Crecencio Chaparro Moreno", rol: "gestor_tramites_cfe", estado: "bloqueado" },
];
