import { NextResponse } from "next/server";
import { assertSameOrigin, auditEvent, consumeMfaChallenge, createSession, deleteMfaChallenge, MFA_CHALLENGE_COOKIE, mfaRequiredForRole, sessionCookieOptions, verifyUserMfa, ROLE_COOKIE, SESSION_COOKIE, MUST_CHANGE_COOKIE } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import { getDatabase } from "@/lib/db/sqlite";
import { readJson, RequestInputError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    if (getAppMode() !== "local") return NextResponse.json({ error: "MFA local no está activo en modo demo." }, { status: 404 });
    assertSameOrigin(request);
    const body = await readJson<{ code?: string }>(request);
    const token = request.headers.get("x-mfa-challenge") ?? request.headers.get("cookie")?.match(new RegExp(`${MFA_CHALLENGE_COOKIE}=([^;]+)`))?.[1];
    if (!token || !body.code) return NextResponse.json({ error: "Código MFA requerido." }, { status: 401 });
    const challenge = consumeMfaChallenge(token);
    if (!challenge) return NextResponse.json({ error: "Desafío MFA inválido o vencido." }, { status: 401 });
    const user = getDatabase().prepare("SELECT id, email, display_name, role, status, must_change_password FROM users WHERE id = ?").get(challenge.userId) as { id: string; email: string; display_name: string; role: Parameters<typeof mfaRequiredForRole>[0]; status: string; must_change_password: number } | undefined;
    if (!user || user.status !== "activo" || !mfaRequiredForRole(user.role) || !verifyUserMfa(user.id, body.code.trim())) {
      auditEvent({ actorId: user?.id, actorRole: user?.role, eventType: "mfa_fallido", entityType: "auth", entityId: user?.id, metadata: { user_agent: request.headers.get("user-agent") ?? null } });
      return NextResponse.json({ error: "Código MFA inválido." }, { status: 401 });
    }
    deleteMfaChallenge(token);
    const session = createSession(user.id);
    const now = new Date().toISOString();
    getDatabase().prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, user.id);
    auditEvent({ actorId: user.id, actorRole: user.role, eventType: "login_ok", entityType: "session", entityId: session.sessionId, metadata: { mfa: true, user_agent: request.headers.get("user-agent") ?? null } });
    const response = NextResponse.json({ role: user.role, name: user.display_name, mustChangePassword: user.must_change_password === 1 });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt, request));
    response.cookies.set(ROLE_COOKIE, user.role, sessionCookieOptions(session.expiresAt, request));
    response.cookies.set(MUST_CHANGE_COOKIE, user.must_change_password === 1 ? "1" : "", { ...sessionCookieOptions(session.expiresAt, request), maxAge: user.must_change_password === 1 ? 60 * 60 * 8 : 0 });
    response.cookies.set(MFA_CHALLENGE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RequestInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "No fue posible validar MFA." }, { status: 500 });
  }
}
