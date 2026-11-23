import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { assertSameOrigin, auditEvent, getCurrentUser } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "coordinador_idc") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const rows = getDatabase().prepare(
    "SELECT id, email, display_name, requested_role, status, created_at, reason FROM account_requests WHERE status = 'pendiente' ORDER BY created_at",
  ).all();
  return NextResponse.json({ requests: rows });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user || user.role !== "coordinador_idc") return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const body = await request.json() as { requestId?: string; action?: "approve" | "reject"; reason?: string };
    if (!body.requestId || !body.action || (body.action === "reject" && !body.reason?.trim())) {
      return NextResponse.json({ error: "La decisión y el motivo de rechazo son obligatorios." }, { status: 400 });
    }
    const database = getDatabase();
    const accountRequest = database.prepare(
      "SELECT id, user_id, email, display_name, requested_role FROM account_requests WHERE id = ? AND status = 'pendiente'",
    ).get(body.requestId) as { id: string; user_id: string; email: string; display_name: string; requested_role: string } | undefined;
    if (!accountRequest) return NextResponse.json({ error: "Solicitud no disponible." }, { status: 404 });
    const now = new Date().toISOString();
    if (body.action === "approve") {
      database.prepare("UPDATE users SET status = 'activo', updated_at = ? WHERE id = ?").run(now, accountRequest.user_id);
      database.prepare("UPDATE account_requests SET status = 'aprobada', reviewed_by = ?, reviewed_at = ? WHERE id = ?").run(user.id, now, accountRequest.id);
      database.prepare(
        "INSERT INTO notifications (id, user_id, type, priority, title, body, created_at) VALUES (?, ?, 'account_approved', 'normal', ?, ?, ?)",
      ).run(crypto.randomUUID(), accountRequest.user_id, "Cuenta aprobada", "Tu cuenta fue aprobada por el coordinador IDC.", now);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "aprobacion", entityType: "account_request", entityId: accountRequest.id });
    } else {
      database.prepare("UPDATE users SET status = 'bloqueado', updated_at = ? WHERE id = ?").run(now, accountRequest.user_id);
      database.prepare("UPDATE account_requests SET status = 'rechazada', reviewed_by = ?, reviewed_at = ?, reason = ? WHERE id = ?").run(user.id, now, body.reason!.trim(), accountRequest.id);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "rechazo", entityType: "account_request", entityId: accountRequest.id, metadata: { reason: body.reason!.trim() } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "No fue posible procesar la solicitud." }, { status: 500 });
  }
}
