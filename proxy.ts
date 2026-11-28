import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserFromSessionToken, mfaEnabled, SESSION_COOKIE } from "@/lib/auth";

const protectedPrefixes = ["/portal", "/gestor", "/gestor-cfe", "/admin"];
const requiredRoles = [
  ["/portal", "cliente", "/portal"],
  ["/gestor", "coordinador_idc", "/gestor"],
  ["/gestor-cfe", "coordinador_idc", "/gestor"],
  ["/admin", "admin_seguridad", "/admin"],
] as const;

export function proxy(request: NextRequest) {
  if (process.env.APP_MODE !== "local") return NextResponse.next();
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`));
  if (isProtected && !request.cookies.has("conecta-session")) {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("conecta-role");
    return response;
  }
  if (isProtected && request.cookies.get("conecta-must-change")?.value === "1" && request.nextUrl.pathname !== "/cambiar-contrasena") {
    return NextResponse.redirect(new URL("/cambiar-contrasena", request.url));
  }
  const required = requiredRoles.find(([prefix]) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`));
  const role = request.cookies.get("conecta-role")?.value;
  const adminOnlyPages = ["/admin/recuperacion", "/admin/incidentes", "/admin/configuracion"];
  if (adminOnlyPages.includes(request.nextUrl.pathname) && role && role !== "admin_seguridad") {
    return new NextResponse("No autorizado.", { status: 403 });
  }
  if (required && role && role !== required[1]) {
    return NextResponse.redirect(new URL(requiredRoles.find(([, candidate]) => candidate === role)?.[2] ?? "/", request.url));
  }
  if (required?.[0] === "/admin") {
    const user = getUserFromSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (user?.role === "admin_seguridad" && !user.mustChangePassword && !mfaEnabled(user.id)) {
      return NextResponse.redirect(new URL("/seguridad", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/gestor/:path*", "/gestor-cfe/:path*", "/admin/:path*"],
};
