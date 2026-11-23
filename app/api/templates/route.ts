import crypto from "node:crypto";
import { getAdapters } from "@/lib/adapters";
import { assertSameOrigin, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { DOCX_FORMATS, assertSafeDocx, listTemplates, templateHash, TemplateValidationError } from "@/lib/data/templates";

export async function GET() {
  const user = await getCurrentUser();
  const blocked = passwordChangeRequired(user);
  if (blocked) return blocked;
  if (!user || user.role !== "coordinador_idc") return Response.json({ error: "No autorizado." }, { status: 403 });
  return Response.json({ templates: listTemplates() });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const blocked = passwordChangeRequired(user);
    if (blocked) return blocked;
    if (!user || user.role !== "coordinador_idc") return Response.json({ error: "No autorizado." }, { status: 403 });
    const form = await request.formData();
    const code = String(form.get("code") ?? "");
    const file = form.get("file");
    if (!DOCX_FORMATS.includes(code as never) || !(file instanceof File)) throw new TemplateValidationError("Código o archivo inválido.");
    const bytes = Buffer.from(await file.arrayBuffer());
    assertSafeDocx(bytes, file.name);
    const db = (await import("@/lib/db/sqlite")).getDatabase();
    const next = Number((db.prepare("SELECT COALESCE(MAX(version), 0) AS n FROM templates WHERE code = ?").get(code) as { n: number }).n) + 1;
    const id = crypto.randomUUID();
    const storageKey = `templates/${code}/${id}.docx`;
    const stored = await (await getAdapters()).storage.put(bytes, { storageKey, filename: file.name, mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const now = new Date().toISOString();
    db.prepare("UPDATE templates SET active = 0 WHERE code = ?").run(code);
    db.prepare("INSERT INTO templates (id, code, filename, version, sha256, storage_key, mime_type, size_bytes, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)").run(id, code, file.name, next, templateHash(bytes), stored.storageKey, stored.mimeType, bytes.length, user.id, now);
    return Response.json({ template: { id, code, version: next, sha256: templateHash(bytes) } }, { status: 201 });
  } catch (error) {
    if (error instanceof TemplateValidationError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: "No fue posible cargar la plantilla." }, { status: 500 });
  }
}
