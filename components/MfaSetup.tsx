"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

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
    const data = await response.json() as { secret?: string; otpauthUri?: string; error?: string };
    if (!response.ok || !data.secret || !data.otpauthUri) setMessage(data.error ?? "No se pudo iniciar MFA.");
    else {
      setState({ enabled: false, setup: { secret: data.secret, otpauthUri: data.otpauthUri } });
      setMessage("");
    }
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
        <p>Escanea este código con OneAuth u otra aplicación Authenticator:</p>
        <QRCodeSVG value={state.setup.otpauthUri} size={224} marginSize={4} title="Código QR de vinculación MFA" />
        <p>Si no puedes escanearlo, agrega la cuenta manualmente, selecciona código basado en tiempo e introduce este secreto:</p>
        <code className="block font-bold">{state.setup.secret}</code>
        <details>
          <summary>Mostrar URI para aplicaciones compatibles</summary>
          <code className="block break-all text-sm">{state.setup.otpauthUri}</code>
        </details>
        <input className="rounded border p-2" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código de 6 dígitos" />
        <button className="rounded bg-blue-700 px-4 py-2 text-white" onClick={confirm}>Confirmar MFA</button>
      </section>}
    </>}
    {state.backupCodes && <section><h2 className="font-bold">Códigos de respaldo</h2><p>Guárdalos ahora; no volverán a mostrarse.</p><pre>{state.backupCodes.join("\n")}</pre></section>}
    {message && <p role="status">{message}</p>}
  </main>;
}
