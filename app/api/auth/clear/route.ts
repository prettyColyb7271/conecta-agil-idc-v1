import { NextResponse } from "next/server";
import { ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth";

export async function GET(request: Request) {
  const candidate = new URL(request.url).searchParams.get("next") || "/";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.startsWith("/\\") ? candidate : "/";
  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(ROLE_COOKIE);
  return response;
}
