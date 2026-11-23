import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
  const notifications = getDatabase().prepare(`
    SELECT id, expediente_id, type, priority, title, body, read_at, created_at
    FROM notifications WHERE user_id = ? ORDER BY created_at DESC
  `).all(user.id);
  return Response.json({ notifications });
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(user);
    if (passwordResponse) return passwordResponse;
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ id?: string }>(request);
    if (!body.id) return Response.json({ error: "Falta el id de la notificación." }, { status: 400 });
    getDatabase().prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), body.id, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "No fue posible actualizar la notificación." }, { status: 500 });
  }
}
