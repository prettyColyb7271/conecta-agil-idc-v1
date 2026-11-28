export const AUDIT_EVENT_LABELS: Record<string, string> = {
  aceptacion_aviso_privacidad: "Aviso de privacidad aceptado",
  alta_expediente: "Alta de expediente",
  alta_gestor_idc: "Gestor IDC creado",
  aprobacion: "Solicitud aprobada",
  asignacion_responsable_idc: "Responsable IDC asignado",
  bloqueo: "Cuenta bloqueada",
  cambio_contrasena: "Contraseña actualizada",
  captura_datos: "Datos del expediente actualizados",
  cierre_expediente: "Expediente cerrado",
  cierre_gate: "Gate cerrado",
  correccion_datos_materiales: "Datos materiales corregidos",
  definicion_contrasena_enlace: "Contraseña definida con enlace",
  descarga_documento: "Documento descargado",
  documento_cargado: "Documento recibido",
  desbloqueo: "Cuenta desbloqueada",
  evidencia_externa_actualizada: "Evidencia externa actualizada",
  evidencia_externa_registrada: "Evidencia externa registrada",
  escaneo_verificado: "Escaneo verificado",
  evidencia_certificado_uiie_registrada: "Certificado UIIE registrado",
  evidencia_cfe_incompleto_registrada: "Reproceso CFE registrado",
  evidencia_contrato_registrada: "Contrato registrado",
  evidencia_firma_presencial_registrada: "Firma presencial registrada",
  evidencia_ingreso_acuse_registrada: "Acuse CFE registrado",
  evidencia_interconexion_registrada: "Interconexión registrada",
  evidencia_medidor_registrada: "Medidor registrado",
  evidencia_resolucion_cfe_registrada: "Oficio resolutivo registrado",
  evidencia_uiie_registrada: "Visita UIIE registrada",
  evidencia_alta_comercial_registrada: "Alta comercial registrada",
  login_bloqueado: "Inicio de sesión bloqueado",
  login_fallido: "Contraseña incorrecta",
  login_ok: "Inicio de sesión",
  logout: "Cierre de sesión",
  generacion_formato: "Formato generado",
  impresion_formato: "Formato preparado para impresión",
  invalidacion_formato_por_cambio: "Formato invalidado por cambio",
  mfa_descifrado_fallido: "Error al descifrar MFA",
  mfa_desafio: "Validación MFA solicitada",
  mfa_desvinculado: "MFA desvinculado",
  mfa_desvinculado_admin: "MFA desvinculado por administración",
  mfa_fallido: "Código MFA incorrecto",
  mfa_vinculado: "MFA vinculado",
  mfa_vinculacion_iniciada: "Vinculación MFA iniciada",
  notificacion_enviada: "Notificación enviada",
  no_aplica_requisito: "Requisito marcado como no aplica",
  oficio_resolutivo_registrado: "Oficio resolutivo registrado",
  observacion_requisito: "Requisito observado",
  reasignacion_responsable: "Responsable reasignado",
  reasignacion_responsable_idc: "Responsable IDC reasignado",
  recuperacion_cliente_generada: "Enlace de recuperación emitido",
  recuperacion_solicitada: "Recuperación solicitada",
  rechazo: "Solicitud rechazada",
  reapertura_gate: "Gate reabierto",
  registro: "Cuenta registrada",
  requisito_no_aplica: "Requisito marcado como no aplica",
  requisito_observado: "Requisito observado",
  requisito_validado: "Requisito validado",
  reset_contrasena: "Enlace para cambiar contraseña emitido",
  responsable_bloqueado: "Responsable bloqueado",
  revocacion_sesiones: "Sesiones revocadas",
  consulta_detalle_expediente: "Consulta de expediente",
  carga_documento: "Documento recibido",
  verificacion_escaneo: "Escaneo verificado",
  validacion_requisito: "Requisito validado",
  evidencia_cierre_registrada: "Cierre registrado",
  evidencia_visita_uiie_registrada: "Visita UIIE registrada",
};

const SAFE_METADATA_FIELDS = {
  expedientes_sin_responsable_activo: "Expedientes sin responsable activo",
  mfa: "MFA",
  requested: "Solicitud",
  revoked: "Sesión revocada",
} as const;

export type SafeMetadataItem = { label: string; value: string };

export function eventLabel(eventType: string): string {
  return AUDIT_EVENT_LABELS[eventType] ?? "Otro evento";
}

export function sanitizeAuditMetadata(value: unknown): SafeMetadataItem[] {
  if (typeof value !== "string") return [];
  let metadata: unknown;
  try {
    metadata = JSON.parse(value);
  } catch {
    return [];
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  const record = metadata as Record<string, unknown>;
  const result: SafeMetadataItem[] = [];
  for (const [key, label] of Object.entries(SAFE_METADATA_FIELDS)) {
    const item = record[key];
    if (typeof item === "boolean") {
      result.push({ label, value: item ? "Sí" : "No" });
    } else if (key === "expedientes_sin_responsable_activo" && typeof item === "number" && Number.isSafeInteger(item) && item >= 0) {
      result.push({ label, value: String(item) });
    }
  }
  return result;
}
