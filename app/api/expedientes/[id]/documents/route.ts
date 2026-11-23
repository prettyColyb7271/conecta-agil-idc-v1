import { assertSameOrigin, getCurrentUser } from "@/lib/auth";
import { DocumentTooLargeError, DocumentValidationError, uploadDocument } from "@/lib/data/documents";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const { id } = await params;
    const form = await request.formData();
    const requirementCode = String(form.get("requirementCode") ?? "");
    const file = form.get("file");
    if (!/^R\d{2}$/.test(requirementCode) || !(file instanceof File)) return Response.json({ error: "Requisito y archivo son requeridos." }, { status: 400 });
    return Response.json({ document: await uploadDocument(user, id, requirementCode, file) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof DocumentTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof DocumentValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "LOCKED") return Response.json({ error: "La carga está bloqueada porque G1 está cerrado." }, { status: 409 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente o requisito no encontrado." }, { status: 404 });
    return Response.json({ error: "No fue posible cargar el documento." }, { status: 500 });
  }
}
