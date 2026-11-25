"use client";

import { useEffect, useState } from "react";

type MfaState = { enabled: boolean; setup?: { secret: string; otpauthUri: string }; backupCodes?: string[] };

export default function MfaSetup() {
  const [state, setState] = useState<MfaState>({ enabled: false });
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/auth/mfa");
    const data = await response.json() as { enabled?: boolean; error?: string };
    if (!response.ok) setMessage(data.error ?? "No se pudo consultar MFA.");
    else setState({ enabled: Boolean(data.enabled) });
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function start() {
    const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "begin" }) });
    const data = await response.json() as MfaState & { error?: string };
    if (!response.ok) setMessage(data.error ?? "No se pudo iniciar MFA.");
    else setState(data);
  }
  async function confirm() {
    const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirm", code }) });
    const data = await response.json() as MfaState & { error?: string };
    if (!response.ok) setMessage(data.error ?? "Código inválido.");
    else { setState({ enabled: true, backupCodes: data.backupCodes }); setMessage("MFA activado."); }
  }

  return <main className="mx-auto max-w-xl space-y-4 p-6">
    <h1 className="text-2xl font-bold">Seguridad de la cuenta</h1>
    <p>La autenticación de dos factores protege las cuentas administrativas.</p>
    {state.enabled ? <p className="font-semibold text-green-700">MFA activo.</p> : <>
      {!state.setup && <button className="rounded bg-blue-700 px-4 py-2 text-white" onClick={start}>Iniciar vinculación</button>}
      {state.setup && <section className="space-y-2 rounded border p-4">
        <p>Escanea esta URI en tu aplicación TOTP o copia el secreto:</p>
        <code className="block break-all text-sm">{state.setup.otpauthUri}</code>
        <code className="block font-bold">{state.setup.secret}</code>
        <input className="rounded border p-2" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código de 6 dígitos" />
        <button className="rounded bg-blue-700 px-4 py-2 text-white" onClick={confirm}>Confirmar MFA</button>
      </section>}
    </>}
    {state.backupCodes && <section><h2 className="font-bold">Códigos de respaldo</h2><p>Guárdalos ahora; no volverán a mostrarse.</p><pre>{state.backupCodes.join("\n")}</pre></section>}
    {message && <p role="status">{message}</p>}
  </main>;
}
