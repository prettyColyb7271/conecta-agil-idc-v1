import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { FormatValidationError, generateFormat, listGeneratedFormats, printFormat } from "@/lib/data/formats";
import { readJson, RequestInputError } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const blocked = passwordChangeRequired(user);
    if (blocked) return blocked;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ action?: "generate" | "print"; formatCode?: string; versionId?: string }>(request);
    const result = body.action === "print"
      ? printFormat(user, (await params).id, body.formatCode ?? "", body.versionId ?? "")
      : await generateFormat(user, (await params).id, body.formatCode ?? "");
    return Response.json({ format: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError || error instanceof FormatValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
    if (error instanceof Error && error.message === "G1_NOT_CLOSED") return Response.json({ error: "Los formatos se generan después de cerrar G1." }, { status: 409 });
    return Response.json({ error: "No fue posible generar el formato." }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    const blocked = passwordChangeRequired(user);
    if (blocked) return blocked;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    return Response.json({ formats: listGeneratedFormats(user, (await params).id) });
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
    return Response.json({ error: "No fue posible consultar los formatos." }, { status: 500 });
  }
}
