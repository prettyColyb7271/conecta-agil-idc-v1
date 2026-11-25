import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, beginMfaSetup, confirmMfaSetup, disableUserMfa, getCurrentUser, mfaEnabled, verifyPassword, verifyUserMfa } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function GET() {
  if (getAppMode() !== "local") return NextResponse.json({ enabled: false });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  return NextResponse.json({ enabled: mfaEnabled(user.id) });
}

export async function POST(request: Request) {
  try {
    if (getAppMode() !== "local") return NextResponse.json({ error: "MFA local no está activo en modo demo." }, { status: 404 });
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    const body = await readJson<{ action?: "begin" | "confirm" | "disable"; code?: string; password?: string }>(request);
    if (body.action === "begin") {
      const setup = beginMfaSetup(user.id);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "mfa_vinculacion_iniciada", entityType: "user_mfa", entityId: user.id });
      return NextResponse.json(setup);
    }
    if (body.action === "confirm") {
      if (!body.code) return NextResponse.json({ error: "Código MFA requerido." }, { status: 400 });
      const backupCodes = confirmMfaSetup(user.id, body.code.trim());
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "mfa_vinculado", entityType: "user_mfa", entityId: user.id });
      return NextResponse.json({ enabled: true, backupCodes });
    }
    if (body.action === "disable") {
      if (!body.password || !body.code) return NextResponse.json({ error: "Contraseña y código MFA requeridos." }, { status: 400 });
      const row = getDatabase().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string } | undefined;
      if (!row || !verifyPassword(body.password, row.password_hash) || !verifyUserMfa(user.id, body.code.trim())) return NextResponse.json({ error: "No fue posible desvincular MFA." }, { status: 401 });
      disableUserMfa(user.id);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "mfa_desvinculado", entityType: "user_mfa", entityId: user.id });
      return NextResponse.json({ enabled: false });
    }
    return NextResponse.json({ error: "Acción MFA inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "MFA_INVALID_CODE") return NextResponse.json({ error: "Código MFA inválido." }, { status: 400 });
    if (error instanceof Error && error.message === "MFA_ENCRYPTION_KEY debe representar exactamente 32 bytes.") return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ error: "No fue posible actualizar MFA." }, { status: 500 });
  }
}
