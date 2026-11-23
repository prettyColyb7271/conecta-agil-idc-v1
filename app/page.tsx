"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { inputLgCls } from "@/components/AuthShell";
import { usePrefs } from "@/components/prefs";
import { setSession } from "@/lib/session";
import type { Role } from "@/data/mock";

// DEMO: perfiles fijos para probar cada pantalla. Se reemplazará por Supabase en la Fase 2.
const PERFILES: { role: Role; name: string; ruta: string }[] = [
  { role: "cliente", name: "Prudencio", ruta: "/portal" },
  { role: "gestor_tramites_cfe", name: "Crecencio", ruta: "/gestor-cfe" },
  { role: "coordinador_idc", name: "Olegario", ruta: "/gestor" },
  { role: "admin_seguridad", name: "Administrador", ruta: "/admin" },
];

export default function LoginPage() {
  const { t } = usePrefs();
  const router = useRouter();

  return (
    <AuthShell logo="/logo_blanco.png">
      <form
        className="flex w-full max-w-sm flex-col items-stretch gap-4 md:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          const clave = String(new FormData(e.currentTarget).get("perfil") ?? "");
          const perfil = PERFILES.find((p) => p.role === clave) ?? PERFILES[0];
          setSession({ name: perfil.name, role: perfil.role });
          router.push(perfil.ruta);
        }}
      >
        <h2 className="text-center text-4xl font-extrabold">{t.loginTitle}</h2>

        <div className="mx-auto my-3 flex h-32 w-32 items-end justify-center overflow-hidden rounded-full bg-slate-300">
          <svg viewBox="0 0 24 24" className="h-28 w-28 text-white" fill="currentColor" aria-hidden>
            <circle cx="12" cy="8" r="4.5" />
            <path d="M2 24c0-6 4.5-9 10-9s10 3 10 9z" />
          </svg>
        </div>

        <p className="rounded-md bg-amber-100 px-3 py-2 text-center text-xs font-semibold text-amber-900">{t.demo}</p>

        <label className="text-xs font-semibold">
          {t.demoProfile}
          <select name="perfil" className={inputLgCls} defaultValue="cliente">
            {PERFILES.map((p) => (
              <option key={p.role} value={p.role}>{t.demoProfiles[p.role]}</option>
            ))}
          </select>
        </label>
        <input name="usuario" className={inputLgCls} placeholder={t.user} autoComplete="username" />
        <input name="password" className={inputLgCls} type="password" placeholder={t.password} autoComplete="current-password" />

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/registro"
            className="rounded-md bg-[#0f2540] py-3 text-center text-base font-semibold text-white hover:bg-[#16345a]"
          >
            {t.register}
          </Link>
          <button className="rounded-md bg-[#3d6a99] py-3 text-base font-semibold text-white hover:bg-[#4b7bb0]">
            {t.login}
          </button>
        </div>

        <p className="text-center text-xs">{t.demoHint}</p>
      </form>
    </AuthShell>
  );
}
