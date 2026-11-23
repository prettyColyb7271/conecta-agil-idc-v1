import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { acceptPrivacy, ValidationError } from "@/lib/data/expedientes";
import { readJson, RequestInputError } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const blocked = passwordChangeRequired(user);
    if (blocked) return blocked;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ version?: string }>(request);
    return Response.json({ privacy: acceptPrivacy(user, (await params).id, body.version ?? "") });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError || error instanceof ValidationError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "FORBIDDEN") return Response.json({ error: "No autorizado." }, { status: 403 });
    if (error instanceof Error && error.message === "NOT_FOUND") return Response.json({ error: "Expediente no encontrado." }, { status: 404 });
    return Response.json({ error: "No fue posible registrar el aviso." }, { status: 500 });
  }
}
