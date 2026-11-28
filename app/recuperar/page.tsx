"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import AuthShell, { inputCls } from "@/components/AuthShell";

const LOCAL_MODE = process.env.NEXT_PUBLIC_MODO === "local";
const MESSAGE = "Si la cuenta existe, un Gestor IDC o el administrador entregará un enlace por un medio verificado.";

export default function RecuperarPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (!LOCAL_MODE) {
        setMessage(MESSAGE);
        return;
      }
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "request", email: form.get("email"), website: form.get("website") }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No fue posible enviar la solicitud.");
      setMessage(data.message ?? MESSAGE);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-4">
        <h1 className="text-center text-3xl font-extrabold">Recuperar acceso</h1>
        <p className="text-center text-sm">Ingresa el correo de tu cuenta. La respuesta no confirma si existe.</p>
        <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label>Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <label className="block text-sm font-semibold">Correo
          <input name="email" type="email" required autoComplete="email" className={inputCls} />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
        {message && <p role="status" className="rounded bg-emerald-50 p-3 text-sm">{message}</p>}
        <button disabled={busy} className="w-full rounded bg-[#0f2540] px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Enviando…" : "Solicitar recuperación"}</button>
        <p className="text-center text-sm"><Link href="/recuperar/codigo" className="font-semibold underline">Tengo un código de recuperación</Link></p>
        <p className="text-center text-sm"><Link href="/" className="underline">Volver al inicio de sesión</Link></p>
      </form>
    </AuthShell>
  );
}
