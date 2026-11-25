import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, createPasswordSetupToken, getCurrentUser, hashPassword, passwordChangeRequired } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function GET() {
  const actor = await getCurrentUser();
  const passwordResponse = passwordChangeRequired(actor);
  if (passwordResponse) return passwordResponse;
  if (!actor || !["admin_seguridad", "coordinador_idc"].includes(actor.role)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const rows = getDatabase().prepare("SELECT id, email, status, requested_at FROM password_recovery_requests WHERE status = 'pendiente' ORDER BY requested_at").all();
  return NextResponse.json({ requests: rows });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson<{ action?: "request" | "generate"; email?: string; userId?: string }>(request);
    const database = getDatabase();
    const actor = await getCurrentUser();
    if (body.action === "request" || !body.action) {
      const email = body.email?.trim().toLowerCase() ?? "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Si la cuenta existe, recibirá instrucciones por un medio verificado." }, { status: 200 });
      database.prepare("INSERT INTO password_recovery_requests (id, email, requested_at) VALUES (?, ?, ?)").run(crypto.randomUUID(), email, new Date().toISOString());
      auditEvent({ eventType: "recuperacion_solicitada", entityType: "auth", metadata: { requested: true } });
      return NextResponse.json({ message: "Si la cuenta existe, un Gestor IDC o el administrador entregará un enlace por un medio verificado." });
    }
    const passwordResponse = passwordChangeRequired(actor);
    if (passwordResponse) return passwordResponse;
    if (!actor || !["admin_seguridad", "coordinador_idc"].includes(actor.role) || !body.userId) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const target = database.prepare("SELECT id, email, role FROM users WHERE id = ? AND role = 'cliente'").get(body.userId) as { id: string; email: string; role: string } | undefined;
    if (!target) return NextResponse.json({ error: "Cliente no disponible." }, { status: 404 });
    const now = new Date().toISOString();
    database.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").run(hashPassword(crypto.randomBytes(32).toString("base64url")), now, target.id);
    database.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, target.id);
    database.prepare("UPDATE password_recovery_requests SET status = 'atendida', handled_by = ?, handled_at = ? WHERE email = ? AND status = 'pendiente'").run(actor.id, now, target.email);
    const setup = createPasswordSetupToken(target.id, actor.id);
    auditEvent({ actorId: actor.id, actorRole: actor.role, eventType: "recuperacion_cliente_generada", entityType: "user", entityId: target.id });
    return NextResponse.json({ setupUrl: new URL(`/definir-contrasena?token=${encodeURIComponent(setup.token)}`, request.url).toString(), expiresAt: setup.expiresAt });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible gestionar la recuperación." }, { status: 500 });
  }
}
