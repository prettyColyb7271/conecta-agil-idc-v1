import { assertSameOrigin, getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";

export async function GET() {
  const user = await getCurrentUser();
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
    if (!user) return Response.json({ error: "No autorizado." }, { status: 403 });
    const body = await request.json() as { id?: string };
    if (!body.id) return Response.json({ error: "Falta el id de la notificación." }, { status: 400 });
    getDatabase().prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), body.id, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "No fue posible actualizar la notificación." }, { status: 500 });
  }
}
