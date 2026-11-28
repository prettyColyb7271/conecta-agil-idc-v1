"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useSyncExternalStore } from "react";
import { ROLE_LABEL, Role } from "@/data/mock";
import { clearSession, useSession } from "@/lib/session";
import NotificationsBell from "@/components/NotificationsBell";

const NAV: Record<Role, { href: string; label: string }[]> = {
  cliente: [
    { href: "/portal", label: "Inicio" },
    { href: "/portal/formatos", label: "Formatos CFE" },
  ],
  coordinador_idc: [
    { href: "/gestor", label: "Inicio" },
    { href: "/gestor/proyectos", label: "Proyectos" },
    { href: "/gestor/usuarios", label: "Usuarios" },
  ],
  gestor_tramites_cfe: [],
  admin_seguridad: [
    { href: "/admin", label: "Inicio" },
    { href: "/admin/usuarios", label: "Cuentas" },
    { href: "/admin/recuperacion", label: "Recuperación de acceso" },
    { href: "/admin/incidentes", label: "Seguridad e incidentes" },
    { href: "/admin/accesos", label: "Auditoría" },
    { href: "/admin/integraciones", label: "Integraciones" },
    { href: "/admin/configuracion", label: "Configuración" },
    { href: "/seguridad", label: "Seguridad de la cuenta" },
  ],
};

const ADDRESS = "Tepic 46, Palo Verde, 83280, Hermosillo, Sonora, México.";

function formatNow(d: Date) {
  const wd = d.toLocaleDateString("es-MX", { weekday: "long" });
  const month = d.toLocaleDateString("es-MX", { month: "long" });
  const day = d.toLocaleDateString("es-MX", { day: "2-digit" });
  const time = d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${month} ${day} del ${d.getFullYear()} a las ${time}`;
}

// Reloj que se actualiza cada 30 s. null en el servidor y antes de montar.
let clockNow: Date | null = null;
function subscribeClock(callback: () => void) {
  clockNow = new Date();
  const id = setInterval(() => {
    clockNow = new Date();
    callback();
  }, 30000);
  return () => clearInterval(id);
}
function useClock() {
  return useSyncExternalStore(subscribeClock, () => clockNow, () => null);
}

export default function AppShell({ role, children, navigationDisabled = false }: { role: Role; children: ReactNode; navigationDisabled?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const now = useClock();
  const localMode = process.env.NEXT_PUBLIC_MODO === "local";

  // Protección DEMO: sin sesión (o con otro rol) regresa al login
  useEffect(() => {
    if (session === undefined) return;
    if (!localMode && (!session || session.role !== role)) router.replace("/");
  }, [localMode, session, role, router]);

  return (
    <div className="flex min-h-screen flex-col bg-[#dbe8f5]">
      {/* Encabezado */}
      <header className="flex items-center justify-between gap-4 bg-[#0d1f33] px-4 py-2 text-white">
        <div className="px-2 py-1">
          <Image src="/logo_blanco_1.png" alt="IDC Sistemas Eléctricos" width={384} height={183} className="h-8 w-auto" priority />
        </div>
        <div className="text-right text-[11px] leading-tight md:text-xs">
          <p className="font-bold">{now ? formatNow(now) : "\u00A0"}</p>
          <p className="hidden text-slate-300 sm:block">{ADDRESS}</p>
          <NotificationsBell localMode={localMode} />
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Barra lateral */}
        <aside className="flex w-full flex-col gap-3 bg-[#1b3d66] p-4 text-white md:w-56">
          <div>
            <p className="text-xl font-extrabold leading-tight">Conecta<br />Ágil</p>
            <p className="mt-4 text-lg font-bold">{session?.name ?? "\u00A0"}</p>
            <p className="text-sm text-slate-300">{ROLE_LABEL[role]}</p>
          </div>

          <nav className="flex flex-wrap gap-2 md:flex-col">
            {NAV[role].map((item) => {
              const active = pathname === item.href;
              if (navigationDisabled) {
                return (
                  <span
                    key={item.href}
                    aria-disabled="true"
                    title="Primero vincula OneAuth"
                    className="cursor-not-allowed rounded border border-white/40 px-3 py-1 text-sm text-white/60"
                  >
                    {item.label}
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded border border-white/60 px-3 py-1 text-sm ${active ? "bg-[#10c98a] font-bold text-[#0d1f33]" : "hover:bg-white/10"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {role === "cliente" && (
            <Link href="/privacidad" className="mt-2 text-sm font-semibold underline md:mt-auto">Aviso de privacidad</Link>
          )}
          {navigationDisabled && <p className="text-xs text-amber-100">Primero vincula OneAuth</p>}

          <button
            onClick={async () => {
              if (localMode) {
                try {
                  const response = await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                  });
                  if (!response.ok) {
                    window.alert("No fue posible cerrar la sesión. Recarga la página e inténtalo de nuevo.");
                    return;
                  }
                } catch {
                  window.alert("No hay conexión con el servidor. Verifica que la app siga corriendo.");
                  return;
                }
              }
              clearSession();
              router.replace("/");
              router.refresh();
            }}
            className="mt-2 rounded border border-white px-3 py-1 text-sm hover:bg-white/10 md:mt-auto"
          >
            Cerrar Sesión
          </button>
        </aside>

        <main className="flex-1 space-y-3 p-4">{children}</main>
      </div>
    </div>
  );
}
