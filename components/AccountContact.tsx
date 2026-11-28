"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MessageBox, Panel, SmallButton } from "@/components/ui";

type Account = { displayName: string; apellidos: string | null; email: string; telefono: string | null };

export default function AccountContact() {
  const [account, setAccount] = useState<Account | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/contact", { signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { account?: Account; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error ?? "No fue posible cargar los datos de la cuenta.");
      setAccount(data.account);
      setPhone(data.account.telefono ?? "");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setMessage({ error: true, text: error instanceof Error ? error.message : "No fue posible cargar los datos de la cuenta." });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/contact", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefono: phone }),
      });
      const data = await response.json() as { telefono?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No fue posible actualizar el teléfono.");
      setAccount((current) => current ? { ...current, telefono: data.telefono ?? null } : current);
      setMessage({ error: false, text: "Teléfono actualizado." });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "No fue posible actualizar el teléfono." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Datos de la cuenta">
      {loading ? <MessageBox>Cargando datos de la cuenta…</MessageBox> : account && (
        <form onSubmit={(event) => void save(event)} className="max-w-xl space-y-3 rounded bg-white p-3">
          <p><strong>Nombre:</strong> {account.displayName}</p>
          {account.apellidos && <p><strong>Apellidos:</strong> {account.apellidos}</p>}
          <p><strong>Correo:</strong> {account.email}</p>
          <label className="block text-sm font-semibold">Teléfono de contacto (opcional)
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full rounded border p-2 font-normal"
              placeholder="10 dígitos"
            />
          </label>
          <SmallButton type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar teléfono"}</SmallButton>
        </form>
      )}
      {message && <MessageBox tone={message.error ? "error" : "success"}>{message.text}</MessageBox>}
      <p className="mt-3 text-xs text-slate-600">El teléfono es un dato de contacto de la cuenta y no modifica los datos de ningún expediente.</p>
    </Panel>
  );
}
