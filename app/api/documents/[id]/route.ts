import { getCurrentUser } from "@/lib/auth";
import { downloadDocument } from "@/lib/data/documents";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const { id } = await params;
    const versionId = new URL(request.url).searchParams.get("version");
    const document = await downloadDocument(user, id, versionId ?? undefined);
    return new Response(document.file, {
      headers: {
        "content-type": document.mimeType,
        "content-length": String(document.file.byteLength),
        "content-disposition": `attachment; filename="${document.filename}"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Documento no encontrado." }, { status: 404 });
    return Response.json({ error: "No fue posible descargar el documento." }, { status: 500 });
  }
}
