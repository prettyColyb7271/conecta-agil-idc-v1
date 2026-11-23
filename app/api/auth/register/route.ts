import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAppMode } from "@/lib/adapters/config";
import { assertSameOrigin, auditEvent, hashPassword } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function POST(request: Request) {
  if (getAppMode() !== "local") return NextResponse.json({ error: "El registro local no está activo en modo demo." }, { status: 404 });
  try {
    assertSameOrigin(request);
    const body = await readJson<{ email?: string; password?: string; displayName?: string }>(request);
    const email = body.email?.trim().toLowerCase() ?? "";
    const displayName = body.displayName?.trim() ?? "";
    const password = body.password ?? "";
    if (!email || !displayName || password.length < 10) {
      return NextResponse.json({ error: "Revisa los datos: la contraseña debe tener al menos 10 caracteres." }, { status: 400 });
    }

    const database = getDatabase();
    const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!existing) {
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      database.prepare(
        "INSERT INTO users (id, email, display_name, role, status, password_hash, created_at, updated_at) VALUES (?, ?, ?, 'cliente', 'pendiente', ?, ?, ?)",
      ).run(userId, email, displayName, hashPassword(password), now, now);
      database.prepare(
        "INSERT INTO account_requests (id, email, display_name, status, user_id, requested_role, created_at) VALUES (?, ?, ?, 'pendiente', ?, 'cliente', ?)",
      ).run(crypto.randomUUID(), email, displayName, userId, now);
      auditEvent({ actorId: userId, actorRole: "cliente", eventType: "registro", entityType: "user", entityId: userId });
    }
    return NextResponse.json({ message: "Si los datos son válidos, tu solicitud quedó pendiente de revisión." }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible procesar el registro." }, { status: 500 });
  }
}
