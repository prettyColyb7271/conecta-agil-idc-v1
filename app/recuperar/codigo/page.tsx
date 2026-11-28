"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import AuthShell, { inputCls } from "@/components/AuthShell";

export default function RecuperarCodigoPage() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/auth/recovery/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          code: form.get("code"),
          newPassword: form.get("newPassword"),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "El código no es válido, expiró o ya se utilizó.");
      setSuccess(true);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "El código no es válido, expiró o ya se utilizó.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-3xl font-extrabold">Usar código de recuperación</h1>
        <p className="text-center text-sm">El código vence en 30 minutos y solo puede usarse una vez.</p>
        <label className="block text-sm font-semibold">Correo
          <input name="email" type="email" required autoComplete="email" className={inputCls} />
        </label>
        <label className="block text-sm font-semibold">Código de 8 caracteres
          <input name="code" required minLength={8} maxLength={8} autoCapitalize="characters" autoComplete="one-time-code" className={inputCls} />
        </label>
        <label className="block text-sm font-semibold">Nueva contraseña (mínimo 12 caracteres)
          <input name="newPassword" type="password" required minLength={12} autoComplete="new-password" className={inputCls} />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
        {success && <p role="status" className="rounded bg-emerald-50 p-3 text-sm">Contraseña actualizada. Ya puedes iniciar sesión.</p>}
        <button disabled={busy} className="w-full rounded bg-[#0f2540] px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Validando…" : "Cambiar contraseña"}</button>
        <p className="text-center text-sm"><Link href="/recuperar" className="underline">Volver a recuperación</Link></p>
      </form>
    </AuthShell>
  );
}
