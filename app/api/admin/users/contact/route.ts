import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, getCurrentUser, mfaRequiredResponse, passwordChangeRequired, verifyUserTotp } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

const CONTACT_FIELDS = ["apellidos", "email", "telefono_contacto"] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    const passwordResponse = passwordChangeRequired(actor);
    if (passwordResponse) return passwordResponse;
    if (!actor || actor.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const mfaResponse = mfaRequiredResponse(actor);
    if (mfaResponse) return mfaResponse;
    const body = await readJson<{ userId?: string; field?: ContactField; code?: string }>(request);
    const field = body.field;
    if (!body.userId || !field || !CONTACT_FIELDS.includes(field)) {
      return NextResponse.json({ error: "Cuenta y dato de contacto requeridos." }, { status: 400 });
    }

    const database = getDatabase();
    const session = database.prepare("SELECT mfa_recent_verified_at FROM sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL").get(actor.sessionId, actor.id) as { mfa_recent_verified_at: string | null } | undefined;
    const verifiedAt = session?.mfa_recent_verified_at ? Date.parse(session.mfa_recent_verified_at) : NaN;
    const elapsed = Date.now() - verifiedAt;
    if (!Number.isFinite(verifiedAt) || elapsed < 0 || elapsed > 5 * 60 * 1000) {
      if (!body.code) return NextResponse.json({ error: "Ingresa un código OneAuth para revelar este dato.", mfaRequired: true }, { status: 428 });
      if (!verifyUserTotp(actor.id, body.code.trim())) return NextResponse.json({ error: "El código OneAuth no es válido." }, { status: 401 });
      database.prepare("UPDATE sessions SET mfa_recent_verified_at = ? WHERE id = ?").run(new Date().toISOString(), actor.sessionId);
    }

    const column: Record<ContactField, string> = {
      apellidos: "apellidos",
      email: "email",
      telefono_contacto: "telefono_contacto",
    };
    const row = database.prepare(`SELECT ${column[field]} AS value FROM users WHERE id = ?`).get(body.userId) as { value: string | null } | undefined;
    if (!row) return NextResponse.json({ error: "La cuenta no existe." }, { status: 404 });
    auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "dato_contacto_revelado", entityType: "user", entityId: body.userId, metadata: { field } });
    return NextResponse.json({ field, value: row.value });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible revelar el dato de contacto." }, { status: 500 });
  }
}
