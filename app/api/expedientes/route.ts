import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { createExpediente, listActiveClients, listActiveResponsables, listExpedientes, ValidationError, ALLOWED_TRAMITES } from "@/lib/data/expedientes";
import { readJson, RequestInputError } from "@/lib/http";
import { TRAMITE_FV_MT } from "@/lib/etapas";

export async function GET() {
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role === "admin_seguridad") return Response.json({ error: "No autorizado." }, { status: 403 });
  try {
    const expedientes = listExpedientes(user);
    const options = user.role === "coordinador_idc" ? { clients: listActiveClients(user), responsables: listActiveResponsables(user) } : undefined;
    return Response.json({ expedientes, options });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    return Response.json({ error: "No fue posible consultar los expedientes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(user);
    if (passwordResponse) return passwordResponse;
    if (!user || user.role !== "coordinador_idc") return Response.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ clienteId?: string; tramite?: string; nivelTension?: string; habilitado?: boolean; responsableId?: string }>(request);
    if (!body.clienteId || typeof body.habilitado !== "boolean") {
      return Response.json({ error: "Cliente y habilitado son requeridos." }, { status: 400 });
    }
    // Trámite y tensión son fijos en el piloto; si se envían, deben coincidir.
    const tramite = body.tramite?.trim() || TRAMITE_FV_MT;
    if (!ALLOWED_TRAMITES.includes(tramite as typeof ALLOWED_TRAMITES[number])) return Response.json({ error: "Trámite no permitido." }, { status: 400 });
    if ((body.nivelTension ?? "MT") !== "MT") return Response.json({ error: "El piloto solo admite media tensión (MT)." }, { status: 400 });
    return Response.json({ expediente: createExpediente(user, { clienteId: body.clienteId, tramite, nivelTension: "MT", habilitado: body.habilitado, responsableId: body.responsableId }) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError || error instanceof ValidationError) return Response.json({ error: error.message }, { status: error instanceof RequestInputError ? error.status : 400 });
    const message = error instanceof Error ? error.message : "";
    if (message === "CLIENT_NOT_FOUND") return Response.json({ error: "El cliente no existe o no está activo." }, { status: 400 });
    if (message === "RESPONSABLE_NOT_FOUND") return Response.json({ error: "El Responsable IDC no existe o no está activo." }, { status: 400 });
    return Response.json({ error: "No fue posible crear el expediente." }, { status: 500 });
  }
}
