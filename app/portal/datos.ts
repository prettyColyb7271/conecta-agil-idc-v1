import "server-only";

import { auditEvent, type AuthUser } from "@/lib/auth";
import { listExpedientes } from "@/lib/data/expedientes";
import { listRequirementReview } from "@/lib/data/documents";
import { listGeneratedFormats } from "@/lib/data/formats";

// Datos del portal del cliente como objetos simples: las filas de node:sqlite
// no se pueden enviar a un Client Component.
export function cargarPortalCliente(user: AuthUser) {
  const expediente = listExpedientes(user)[0] ?? null;
  if (expediente) {
    auditEvent({
      actorId: user.id,
      actorRole: user.role,
      eventType: "consulta_detalle_expediente",
      entityType: "expediente",
      entityId: expediente.id,
      expedienteId: expediente.id,
    });
  }
  const review = expediente ? listRequirementReview(user, expediente.id).map((item) => ({
    requirement_code: item.requirement_code,
    name: item.name,
    status: item.status,
    tipo: item.tipo,
    integra: item.integra,
    validaciones: item.validaciones,
    reutiliza_code: item.reutiliza_code ?? null,
    updated_at: item.updated_at,
    observations: item.observations.map((observation) => ({ visibility: observation.visibility, body: observation.body })),
  })) : [];
  const formats = expediente ? listGeneratedFormats(user, expediente.id).map((format) => ({ ...format })) : [];
  return { expediente, review, formats };
}
