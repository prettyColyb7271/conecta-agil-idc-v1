import { NextResponse } from "next/server";
import { getAppMode } from "@/lib/adapters/config";
import { assertSameOrigin, auditEvent, MUST_CHANGE_COOKIE, revokeSessionByToken, ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  if (getAppMode() !== "local") return NextResponse.json({ ok: true });
  try {
    assertSameOrigin(request);
    const token = request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
    const userId = token ? revokeSessionByToken(token) : null;
    if (userId) auditEvent({ actorId: userId, eventType: "logout", entityType: "session", metadata: { revoked: true } });
    const response = NextResponse.json({ ok: true });
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const secure = forwardedProto ? forwardedProto === "https" : new URL(request.url).protocol === "https:";
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    response.cookies.set(ROLE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    response.cookies.set(MUST_CHANGE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "No fue posible cerrar la sesión." }, { status: 500 });
  }
}
