import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

function canManageContact(role: string): boolean {
  return role === "cliente" || role === "coordinador_idc";
}

export async function GET() {
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || !canManageContact(user.role)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const row = getDatabase().prepare("SELECT display_name, apellidos, email, telefono_contacto FROM users WHERE id = ?").get(user.id) as {
    display_name: string; apellidos: string | null; email: string; telefono_contacto: string | null;
  } | undefined;
  if (!row) return NextResponse.json({ error: "No se encontró la cuenta." }, { status: 404 });
  return NextResponse.json({ account: { displayName: row.display_name, apellidos: row.apellidos, email: row.email, telefono: row.telefono_contacto } });
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(user);
    if (passwordResponse) return passwordResponse;
    if (!user || !canManageContact(user.role)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const body = await readJson<{ telefono?: string }>(request);
    const telefono = body.telefono?.trim() ?? "";
    if (telefono && !/^\d{10}$/.test(telefono)) {
      return NextResponse.json({ error: "El teléfono debe tener 10 dígitos." }, { status: 400 });
    }
    const value = telefono || null;
    getDatabase().prepare("UPDATE users SET telefono_contacto = ?, updated_at = ? WHERE id = ?").run(value, new Date().toISOString(), user.id);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "dato_contacto_actualizado", entityType: "user", entityId: user.id, metadata: { field: "telefono_contacto" } });
    return NextResponse.json({ telefono: value });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible actualizar el teléfono." }, { status: 500 });
  }
}
