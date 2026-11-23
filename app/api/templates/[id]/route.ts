import fs from "node:fs/promises";
import path from "node:path";
import { getAdapters } from "@/lib/adapters";
import { getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const blocked = passwordChangeRequired(user);
  if (blocked) return blocked;
  if (!user || user.role !== "coordinador_idc") return Response.json({ error: "No autorizado." }, { status: 403 });
  const row = getDatabase().prepare("SELECT filename, storage_key, mime_type FROM templates WHERE id = ?").get((await params).id) as { filename: string; storage_key: string; mime_type: string } | undefined;
  if (!row) return Response.json({ error: "Plantilla no encontrada." }, { status: 404 });
  let file: Buffer;
  try { file = await fs.readFile(await (await getAdapters()).storage.getPath(row.storage_key)); }
  catch { file = await fs.readFile(path.join(process.cwd(), "templates", row.filename)); }
  return new Response(new Uint8Array(file), { headers: { "content-type": row.mime_type, "content-disposition": `attachment; filename="${row.filename}"`, "x-content-type-options": "nosniff" } });
}
