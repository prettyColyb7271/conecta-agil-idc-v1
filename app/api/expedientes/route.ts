import { assertSameOrigin, getCurrentUser } from "@/lib/auth";
import { createExpediente, listActiveClients, listActiveGestors, listExpedientes, ValidationError, ALLOWED_TRAMITES } from "@/lib/data/expedientes";
import { readJson, RequestInputError } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "admin_seguridad") return Response.json({ error: "No autorizado." }, { status: 403 });
  try {
    const expedientes = listExpedientes(user);
    const options = user.role === "coordinador_idc" ? { clients: listActiveClients(user), gestors: listActiveGestors(user) } : undefined;
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
    if (!user || user.role !== "coordinador_idc") return Response.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ clienteId?: string; tramite?: string; nivelTension?: "BT" | "MT"; habilitado?: boolean; gestorId?: string }>(request);
    if (!body.clienteId || !body.tramite?.trim() || !body.nivelTension || typeof body.habilitado !== "boolean") {
      return Response.json({ error: "Cliente, trámite, nivel de tensión y habilitado son requeridos." }, { status: 400 });
    }
    if (!ALLOWED_TRAMITES.includes(body.tramite as typeof ALLOWED_TRAMITES[number])) return Response.json({ error: "Trámite no permitido." }, { status: 400 });
    if (body.nivelTension !== "BT" && body.nivelTension !== "MT") return Response.json({ error: "nivelTension debe ser BT o MT." }, { status: 400 });
    return Response.json({ expediente: createExpediente(user, { clienteId: body.clienteId, tramite: body.tramite.trim(), nivelTension: body.nivelTension, habilitado: body.habilitado, gestorId: body.gestorId }) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError || error instanceof ValidationError) return Response.json({ error: error.message }, { status: error instanceof RequestInputError ? error.status : 400 });
    const message = error instanceof Error ? error.message : "";
    if (message === "CLIENT_NOT_FOUND") return Response.json({ error: "El cliente no existe o no está activo." }, { status: 400 });
    if (message === "GESTOR_NOT_FOUND") return Response.json({ error: "El gestor no existe o no está activo." }, { status: 400 });
    return Response.json({ error: "No fue posible crear el expediente." }, { status: 500 });
  }
}
