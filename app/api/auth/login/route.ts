import { NextResponse } from "next/server";
import { getAppMode } from "@/lib/adapters/config";
import { assertSameOrigin, auditEvent, createMfaChallenge, createSession, MFA_CHALLENGE_COOKIE, MUST_CHANGE_COOKIE, mfaEnabled, sessionCookieOptions, verifyPassword, ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth";
import { getDatabase } from "@/lib/db/sqlite";
import type { Role } from "@/data/mock";
import { readJson, RequestInputError } from "@/lib/http";

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
    const body = await readJson<{ email?: string; password?: string }>(request);
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    if (!email || !password || isRateLimited(email)) {
      registerFailure(email);
      auditEvent({ eventType: "login_bloqueado", entityType: "auth", metadata: { email, ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, user_agent: request.headers.get("user-agent") ?? null } });
      return NextResponse.json({ error: "No fue posible iniciar sesión con esas credenciales." }, { status: 401 });
    }

    const user = getDatabase().prepare("SELECT id, email, display_name, role, status, password_hash, must_change_password FROM users WHERE email = ?").get(email) as {
      id: string; email: string; display_name: string; role: Role; status: "pendiente" | "activo" | "bloqueado"; password_hash: string;
      must_change_password: number;
    } | undefined;
    const validPassword = user ? verifyPassword(password, user.password_hash) : false;
    if (!user || !validPassword) {
      registerFailure(email);
      auditEvent({ actorId: user?.id ?? null, actorRole: user?.role ?? null, eventType: "login_fallido", entityType: "user", entityId: user?.id ?? null, metadata: { email, ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, user_agent: request.headers.get("user-agent") ?? null } });
      return NextResponse.json({ error: "No fue posible iniciar sesión con esas credenciales." }, { status: 401 });
    }
    const rejectedRequest = getDatabase().prepare(
      "SELECT 1 FROM account_requests WHERE user_id = ? AND status = 'rechazada' LIMIT 1",
    ).get(user.id);
    if (rejectedRequest) return NextResponse.json({ error: "Tu solicitud de cuenta no fue aprobada. Contacta a IDC." }, { status: 403 });
    if (user.status === "pendiente") return NextResponse.json({ error: "Tu cuenta está pendiente de aprobación." }, { status: 403 });
    if (user.status === "bloqueado") return NextResponse.json({ error: "No fue posible iniciar sesión con esas credenciales." }, { status: 403 });

    failures.delete(email);
    if (mfaEnabled(user.id)) {
      const challenge = createMfaChallenge(user.id);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "mfa_desafio", entityType: "auth", entityId: user.id, metadata: { ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, user_agent: request.headers.get("user-agent") ?? null } });
      const response = NextResponse.json({ mfaRequired: true });
      response.cookies.set(MFA_CHALLENGE_COOKIE, challenge.token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", expires: new Date(challenge.expiresAt) });
      return response;
    }
    const session = createSession(user.id);
    const now = new Date().toISOString();
    getDatabase().prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, user.id);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "login_ok", entityType: "session", entityId: session.sessionId, metadata: { ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, user_agent: request.headers.get("user-agent") ?? null } });
    const response = NextResponse.json({ role: user.role, name: user.display_name, mustChangePassword: user.must_change_password === 1 });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt, request));
    response.cookies.set(ROLE_COOKIE, user.role, sessionCookieOptions(session.expiresAt, request));
    response.cookies.set(MUST_CHANGE_COOKIE, user.must_change_password === 1 ? "1" : "", { ...sessionCookieOptions(session.expiresAt, request), maxAge: user.must_change_password === 1 ? 60 * 60 * 8 : 0 });
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible iniciar sesión." }, { status: 500 });
  }
}
