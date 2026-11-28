import { NextResponse } from "next/server";
import { assertSameOrigin, getCurrentUser, mfaRequiredResponse, passwordChangeRequired } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { readJson, RequestInputError } from "@/lib/http";
import { getZohoDashboard } from "@/lib/zoho/outbox";
import { retryZohoDelivery } from "@/lib/zoho/adapter";

async function authorizeAdmin() {
  if (getAppMode() !== "local") return NextResponse.json({ error: "Integraciones locales no están disponibles en modo demo." }, { status: 404 });
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  return mfaRequiredResponse(user);
}

export async function GET() {
  try {
    const denied = await authorizeAdmin();
    if (denied) return denied;
    return NextResponse.json(getZohoDashboard());
  } catch {
    return NextResponse.json({ error: "No fue posible consultar las integraciones." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const denied = await authorizeAdmin();
    if (denied) return denied;
    const body = await readJson<{ id?: string }>(request);
    if (!body.id || typeof body.id !== "string") return NextResponse.json({ error: "El envío es obligatorio." }, { status: 400 });
    const result = await retryZohoDelivery(body.id);
    return NextResponse.json({
      id: result.id,
      status: result.status,
      attempts: result.attempts,
      lastError: result.last_error,
      lastAttemptAt: result.last_attempt_at,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "OUTBOX_NOT_FOUND") return NextResponse.json({ error: "El envío no existe." }, { status: 404 });
    if (error instanceof Error && ["OUTBOX_ALREADY_SENT", "OUTBOX_IN_PROGRESS"].includes(error.message)) return NextResponse.json({ error: "El envío ya está enviado o en proceso." }, { status: 409 });
    return NextResponse.json({ error: "No fue posible reintentar el envío." }, { status: 500 });
  }
}
