import { NextResponse } from "next/server";
import { getAppMode } from "@/lib/adapters/config";
import { assertSameOrigin, auditEvent, createSession, sessionCookieOptions, verifyPassword, ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import type { Role } from "@/data/mock";

const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function isRateLimited(email: string): boolean {
  const recent = (failures.get(email) ?? []).filter((time) => Date.now() - time < WINDOW_MS);
  failures.set(email, recent);
  return recent.length >= MAX_FAILURES;
}

function registerFailure(email: string): void {
  const recent = (failures.get(email) ?? []).filter((time) => Date.now() - time < WINDOW_MS);
  recent.push(Date.now());
  failures.set(email, recent);
}

export async function POST(request: Request) {
  if (getAppMode() !== "local") return NextResponse.json({ error: "El login local no está activo en modo demo." }, { status: 404 });
  try {
    assertSameOrigin(request);
    const body = await request.json() as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!email || !password || isRateLimited(email)) {
      registerFailure(email);
      return NextResponse.json({ error: "No fue posible iniciar sesión con esas credenciales." }, { status: 401 });
    }

    const user = getDatabase().prepare("SELECT id, email, display_name, role, status, password_hash FROM users WHERE email = ?").get(email) as {
      id: string; email: string; display_name: string; role: Role; status: "pendiente" | "activo" | "bloqueado"; password_hash: string;
    } | undefined;
    const validPassword = user ? verifyPassword(password, user.password_hash) : false;
    if (!user || !validPassword) {
      registerFailure(email);
      auditEvent({ actorId: user?.id ?? null, actorRole: user?.role ?? null, eventType: "login_fallido", entityType: "user", entityId: user?.id ?? null, metadata: { email } });
      return NextResponse.json({ error: "No fue posible iniciar sesión con esas credenciales." }, { status: 401 });
    }
    if (user.status === "pendiente") return NextResponse.json({ error: "Tu cuenta está pendiente de aprobación." }, { status: 403 });
    if (user.status === "bloqueado") return NextResponse.json({ error: "No fue posible iniciar sesión con esas credenciales." }, { status: 403 });

    failures.delete(email);
    const session = createSession(user.id);
    const now = new Date().toISOString();
    getDatabase().prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, user.id);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "login_ok", entityType: "session", entityId: session.sessionId });
    const response = NextResponse.json({ role: user.role, name: user.display_name });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt, request));
    response.cookies.set(ROLE_COOKIE, user.role, sessionCookieOptions(session.expiresAt, request));
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "No fue posible iniciar sesión." }, { status: 500 });
  }
}
