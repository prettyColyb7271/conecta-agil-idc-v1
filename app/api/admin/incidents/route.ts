import { NextResponse } from "next/server";
import { getAppMode } from "@/lib/adapters/config";
import { getCurrentUser, mfaRequiredResponse, passwordChangeRequired } from "@/lib/auth";
import { getIncidentsDashboard } from "@/lib/admin/incidents";

export async function GET() {
  if (getAppMode() === "demo") {
    return NextResponse.json({ error: "Las alertas requieren eventos locales reales." }, { status: 404 });
  }
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role !== "admin_seguridad") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const mfaResponse = mfaRequiredResponse(user);
  if (mfaResponse) return mfaResponse;
  try {
    return NextResponse.json(getIncidentsDashboard());
  } catch (error) {
    console.error("No fue posible calcular las alertas de seguridad.", error);
    return NextResponse.json({ error: "No fue posible calcular las alertas de seguridad." }, { status: 500 });
  }
}
