"use client";

import Link from "next/link";
import { useState } from "react";
import AuthShell, { inputCls } from "@/components/AuthShell";
import { usePrefs } from "@/components/prefs";
import { CORREO_SOLICITUDES } from "@/data/mock";
import { AVISO_VERSION } from "@/lib/privacidad";

const label = "mb-1 block text-center text-xs font-semibold";
const LOCAL_MODE = process.env.NEXT_PUBLIC_MODO === "local";

export default function RegistroPage() {
  const { t } = usePrefs();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError(t.mismatch);
      return;
    }
    if (data.get("privacyAccepted") !== "on") {
      setError("Debes leer y aceptar el aviso de privacidad para enviar tu solicitud.");
      return;
    }
    if (LOCAL_MODE) {
      void (async () => {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: data.get("correo"),
            password: data.get("password"),
            displayName: String(data.get("nombres") ?? "").trim(),
            apellidos: `${data.get("paterno")} ${data.get("materno")}`.trim(),
            telefono: data.get("celular"),
            website: data.get("website"),
            privacyAccepted: data.get("privacyAccepted") === "on",
            privacyVersion: AVISO_VERSION,
          }),
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) {
          setError(result.error ?? "No fue posible enviar la solicitud.");
          return;
        }
        setError("");
        setSent(true);
      })();
      return;
    }
    setError("");
    setSent(true);
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="w-full max-w-lg space-y-3">
        <h2 className="text-center text-4xl font-extrabold">{t.registerTitle}</h2>
        {!LOCAL_MODE && <p className="rounded-md bg-amber-100 px-3 py-2 text-center text-xs font-semibold text-amber-900">Demo: no se envía correo.</p>}
        <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>{t.paterno}:</label>
            <input name="paterno" className={inputCls} placeholder={t.paterno} required />
          </div>
          <div>
            <label className={label}>{t.materno}:</label>
            <input name="materno" className={inputCls} placeholder={t.materno} required />
          </div>
        </div>

        <div>
          <label className={label}>{t.names}:</label>
          <input name="nombres" className={inputCls} placeholder={t.fullName} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>{t.password}:</label>
            <input name="password" type="password" minLength={LOCAL_MODE ? 10 : 8} className={inputCls} placeholder={t.password} required />
          </div>
          <div>
            <label className={label}>{t.confirm}:</label>
            <input name="confirm" type="password" className={inputCls} placeholder={t.password} required />
          </div>
        </div>

        <div>
          <label className={label}>{t.email}:</label>
          <input name="correo" type="email" className={inputCls} placeholder="correo@gmail.com" required />
        </div>

        <div>
          <label className={label}>{t.phone}:</label>
          <div className="flex gap-1">
            <span className="rounded-md border border-[#1b3d66] bg-white px-2 py-2 text-sm text-slate-800">(+52)</span>
            <input name="celular" inputMode="numeric" pattern="[0-9]{10}" className={inputCls} placeholder={t.phonePh} required />
          </div>
        </div>

        <div className="grid grid-cols-[1.6fr_1fr] gap-3">
          <div>
            <label className={label}>{t.message}:</label>
            <textarea
              name="mensaje"
              rows={3}
              defaultValue={t.messageDefault}
              placeholder={t.messagePh}
              className={inputCls}
            />
          </div>
          <div>
            <label className={label}>{t.proc}:</label>
            <select name="tramite" className={inputCls} defaultValue="0" required>
              <option value="" disabled>{t.procPh}</option>
              {t.procs.map((p, i) => (
                <option key={i} value={i}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {CORREO_SOLICITUDES && (
          <p className="rounded-md bg-[#3d6a99] px-3 py-2 text-center text-xs text-white">
            {t.notice} <u>{CORREO_SOLICITUDES}</u>
          </p>
        )}

        <div className="space-y-1 text-center text-sm">
          <label className="inline-flex items-start gap-2 text-left">
            <input name="privacyAccepted" type="checkbox" required className="mt-1 h-4 w-4 shrink-0" />
            <span>Leí el aviso de privacidad (versión {AVISO_VERSION}).</span>
          </label>
          <p><Link href="/privacidad" className="font-semibold underline">Leer el aviso de privacidad</Link></p>
        </div>

        {error && <p className="text-center text-sm font-bold text-red-500" role="alert">{error}</p>}
        {sent && <p className="text-center text-sm font-bold" role="status">{t.sent}</p>}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button className="rounded-md bg-[#0f2540] px-5 py-2 text-sm font-semibold text-white hover:bg-[#16345a]">
            {t.submit}
          </button>
          <Link href="/" className="text-sm underline">{t.back}</Link>
        </div>
      </form>
    </AuthShell>
  );
}
