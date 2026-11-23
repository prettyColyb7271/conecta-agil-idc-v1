import { NextResponse } from "next/server";
import { getCurrentUser, passwordChangeRequired } from "@/lib/auth";
import { listGestorPendientes } from "@/lib/data/expedientes";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(user);
  if (passwordResponse) return passwordResponse;
  if (!user || user.role !== "coordinador_idc") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const scope = new URL(request.url).searchParams.get("scope") === "mine" ? "mine" : "all";
  return NextResponse.json({ scope, pendientes: listGestorPendientes(user, scope) });
}
