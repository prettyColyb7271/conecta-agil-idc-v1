import { assertSameOrigin, getCurrentUser } from "@/lib/auth";
import { assignResponsable, getExpediente, updateExpedienteData, ValidationError, type ExpedienteData } from "@/lib/data/expedientes";
import { readJson, RequestInputError } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || user.role === "admin_seguridad") return Response.json({ error: "No autorizado." }, { status: 403 });
  const { id } = await params;
  const expediente = getExpediente(user, id);
  return expediente ? Response.json({ expediente }) : Response.json({ error: "Expediente no encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const { id } = await params;
    const body = await readJson<{ action?: string; responsableId?: string; data?: ExpedienteData }>(request);
    if (body.action === "assign" && user.role === "coordinador_idc" && body.responsableId) {
      return Response.json({ expediente: assignResponsable(user, id, body.responsableId) });
    }
    if (body.data) {
      try {
        return Response.json({ expediente: updateExpedienteData(user, id, body.data) });
      } catch (error) {
        if (error instanceof Error && error.message === "LOCKED") return Response.json({ error: "Los datos están bloqueados porque G1 está cerrado." }, { status: 409 });
        if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
        throw error;
      }
    }
    return Response.json({ error: "Operación no válida." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "RESPONSABLE_NOT_FOUND") return Response.json({ error: "El Responsable IDC no existe o no está activo." }, { status: 400 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof RequestInputError || error instanceof ValidationError) return Response.json({ error: error.message }, { status: error instanceof RequestInputError ? error.status : 400 });
    return Response.json({ error: "No fue posible actualizar el expediente." }, { status: 500 });
  }
}
