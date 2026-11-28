"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { MessageBox, Panel, SmallButton, StatusBadge } from "@/components/ui";

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

  return <div className="space-y-4">
    <Panel title="Vincular OneAuth">
      <div className="space-y-3 rounded bg-white p-3">
        <p>La autenticación de dos factores protege las cuentas administrativas.</p>
        {state.enabled ? <StatusBadge tone="positive">MFA activo</StatusBadge> : <>
          {!state.setup && <SmallButton onClick={() => void start()}>Iniciar vinculación</SmallButton>}
          {state.setup && <section className="space-y-2 rounded border p-4">
            <p>Escanea este código con OneAuth u otra aplicación Authenticator:</p>
            <QRCodeSVG value={state.setup.otpauthUri} size={224} marginSize={4} title="Código QR de vinculación MFA" />
            <p>Si no puedes escanearlo, agrega la cuenta manualmente, selecciona código basado en tiempo e introduce este secreto:</p>
            <code className="block font-bold">{state.setup.secret}</code>
            <details>
              <summary>Mostrar URI para aplicaciones compatibles</summary>
              <code className="block break-all text-sm">{state.setup.otpauthUri}</code>
            </details>
            <label className="block text-sm font-semibold">Código de 6 dígitos
              <input className="mt-1 block max-w-xs rounded border p-2 font-normal" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            </label>
            <SmallButton onClick={() => void confirm()}>Confirmar MFA</SmallButton>
          </section>}
        </>}
        {message && <MessageBox tone={message.includes("activado") ? "success" : "error"}>{message}</MessageBox>}
      </div>
    </Panel>
    <Panel title="Códigos de respaldo">
      {state.backupCodes ? (
        <div className="rounded bg-white p-3">
          <p>Guárdalos ahora; no volverán a mostrarse.</p>
          <pre className="mt-2 overflow-auto rounded bg-slate-50 p-3 text-sm">{state.backupCodes.join("\n")}</pre>
        </div>
      ) : <MessageBox>Los códigos se muestran una sola vez al terminar la vinculación.</MessageBox>}
    </Panel>
    <MessageBox tone="warning">No proyectes esta pantalla: el QR y los códigos dan acceso a la cuenta.</MessageBox>
  </div>;
}
