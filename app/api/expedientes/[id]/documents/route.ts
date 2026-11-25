import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { DocumentConflictError, DocumentTooLargeError, DocumentValidationError, uploadDocument, uploadExternalEvidence } from "@/lib/data/documents";

type Params = { params: Promise<{ id: string }> };
const MAX_MULTIPART_BYTES = 21 * 1024 * 1024;

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(user);
    if (passwordResponse) return passwordResponse;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const { id } = await params;
    const contentLength = request.headers.get("content-length");
    if (!contentLength) return Response.json({ error: "Content-Length es requerido para cargar documentos." }, { status: 411 });
    if (!Number.isSafeInteger(Number(contentLength)) || Number(contentLength) > MAX_MULTIPART_BYTES) return Response.json({ error: "El cuerpo de carga excede el límite permitido." }, { status: 413 });
    const form = await request.formData();
    const eventType = String(form.get("eventType") ?? "");
    const evidenceFile = form.get("file");
    if (eventType) {
      if (!(evidenceFile instanceof File)) return Response.json({ error: "eventType y archivo son requeridos." }, { status: 400 });
      return Response.json({ document: await uploadExternalEvidence(user, id, eventType, evidenceFile, {
        eventDate: String(form.get("eventDate") ?? "") || undefined,
        description: String(form.get("description") ?? ""),
        medio: String(form.get("medio") ?? "") || undefined,
        solicitudNumero: String(form.get("solicitudNumero") ?? "") || undefined,
        vigenciaMeses: Number(form.get("vigenciaMeses") ?? "") || undefined,
        venceAt: String(form.get("venceAt") ?? "") || undefined,
        resultado: (String(form.get("resultado") ?? "") || undefined) as "favorable" | "condicionado" | "no_favorable" | undefined,
        subgateRequerido: String(form.get("subgateRequerido") ?? "") === "true",
      }) }, { status: 201 });
    }
    const requirementCode = String(form.get("requirementCode") ?? "");
    const sourceVersionId = String(form.get("sourceVersionId") ?? "") || undefined;
    const file = form.get("file");
    if (!/^[RU]\d{2}$/.test(requirementCode) || !(file instanceof File)) return Response.json({ error: "Requisito y archivo son requeridos." }, { status: 400 });
    return Response.json({ document: await uploadDocument(user, id, requirementCode, file, sourceVersionId) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof DocumentTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof DocumentValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof DocumentConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === "LOCKED") return Response.json({ error: "La carga está bloqueada porque G1 está cerrado." }, { status: 409 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente o requisito no encontrado." }, { status: 404 });
    return Response.json({ error: "No fue posible cargar el documento." }, { status: 500 });
  }
}
