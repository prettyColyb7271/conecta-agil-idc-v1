import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { DocumentConflictError, DocumentValidationError, listRequirementReview, reviewRequirement } from "@/lib/data/documents";

type Params = { params: Promise<{ id: string; code: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(user);
    if (passwordResponse) return passwordResponse;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const { id } = await params;
    return Response.json({ requirements: listRequirementReview(user, id) });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    return Response.json({ error: "No fue posible consultar los requisitos." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(user);
    if (passwordResponse) return passwordResponse;
    if (!user || user.role !== "coordinador_idc") return Response.json({ error: "No autorizado." }, { status: 403 });
    const { id, code } = await params;
    let body: { action?: "validate" | "observe" | "not_applicable"; reason?: string; visibility?: "cliente" | "interno_idc" };
    try {
      body = await request.json() as typeof body;
    } catch {
      return Response.json({ error: "JSON malformado." }, { status: 400 });
    }
    if (!body.action) return Response.json({ error: "La acción es requerida." }, { status: 400 });
    return Response.json({ requirement: reviewRequirement(user, id, code, body.action, body.reason, body.visibility) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof DocumentValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof DocumentConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente o requisito no encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    return Response.json({ error: "No fue posible actualizar el requisito." }, { status: 500 });
  }
}
