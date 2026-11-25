"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthShell, { inputLgCls } from "@/components/AuthShell";
import { usePrefs } from "@/components/prefs";
import { setSession } from "@/lib/session";
import type { Role } from "@/data/mock";

const LOCAL_MODE = process.env.NEXT_PUBLIC_MODO === "local";

// DEMO: perfiles fijos para probar cada pantalla. Se reemplazará por Supabase en la Fase 2.
const PERFILES: { role: Role; name: string; ruta: string }[] = [
  { role: "cliente", name: "Prudencio", ruta: "/portal" },
  { role: "coordinador_idc", name: "Gestor IDC", ruta: "/gestor" },
  { role: "admin_seguridad", name: "Administrador", ruta: "/admin" },
];

export default function LoginPage() {
  const { t } = usePrefs();
  const router = useRouter();
  const [error, setError] = useState("");
  const [mfaPending, setMfaPending] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");

  return (
    <AuthShell logo="/logo_blanco.png">
      <form
        className="flex w-full max-w-sm flex-col items-stretch gap-4 md:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          if (LOCAL_MODE) {
            void (async () => {
              const response = await fetch(mfaPending ? "/api/auth/mfa/verify" : "/api/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(mfaPending
                  ? { code: data.get("mfaCode") }
                  : { email: data.get("usuario"), password: data.get("password") }),
              });
              const result = await response.json() as { error?: string; role?: Role; name?: string; mfaRequired?: boolean };
              if (result.mfaRequired) {
                setMfaPending(true);
                setError("Ingresa el código de tu aplicación Authenticator o un código de respaldo.");
                return;
              }
              if (!response.ok || !result.role || !result.name) {
                setError(result.error ?? "No fue posible iniciar sesión.");
                return;
              }
              setError("");
              setMfaPending(false);
              setSession({ name: result.name, role: result.role });
              router.push(PERFILES.find((p) => p.role === result.role)?.ruta ?? "/");
            })();
            return;
          }
          const clave = String(data.get("perfil") ?? "");
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

        <p className="rounded-md bg-amber-100 px-3 py-2 text-center text-xs font-semibold text-amber-900">
          {LOCAL_MODE ? "Modo local: usa tus credenciales aprobadas." : t.demo}
        </p>

        {!LOCAL_MODE && <label className="text-xs font-semibold">
          {t.demoProfile}
          <select name="perfil" className={inputLgCls} defaultValue="cliente">
            {PERFILES.map((p) => (
              <option key={p.role} value={p.role}>{t.demoProfiles[p.role]}</option>
            ))}
          </select>
        </label>}
        {!mfaPending && <><input name="usuario" className={inputLgCls} placeholder={t.user} autoComplete="username" />
        <input name="password" className={inputLgCls} type="password" placeholder={t.password} autoComplete="current-password" /></>}
        {mfaPending && <input name="mfaCode" className={inputLgCls} inputMode="numeric" pattern="[0-9a-fA-F]{6,12}" placeholder="Código MFA o respaldo" autoComplete="one-time-code" autoFocus />}
        {error && <p className="text-center text-sm font-bold text-red-600" role="alert">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/registro"
            className="rounded-md bg-[#0f2540] py-3 text-center text-base font-semibold text-white hover:bg-[#16345a]"
          >
            {t.register}
          </Link>
          <button className="rounded-md bg-[#3d6a99] py-3 text-base font-semibold text-white hover:bg-[#4b7bb0]">
            {mfaPending ? "Validar MFA" : t.login}
          </button>
        </div>

        <p className="text-center text-xs">{LOCAL_MODE ? "La cuenta debe ser aprobada por el coordinador IDC." : t.demoHint}</p>
        {LOCAL_MODE && !mfaPending && <button type="button" className="text-xs font-semibold underline" onClick={async () => {
          const email = window.prompt("Correo de la cuenta cliente:");
          if (!email) return;
          const response = await fetch("/api/auth/recovery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request", email }) });
          const data = await response.json() as { message?: string; error?: string };
          setRecoveryMessage(data.message ?? data.error ?? "Solicitud registrada.");
        }}>¿Olvidaste tu contraseña?</button>}
        {recoveryMessage && <p className="text-center text-xs font-semibold">{recoveryMessage}</p>}
      </form>
    </AuthShell>
  );
}
