"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { SmallButton } from "@/components/ui";

export type ContactField = "apellidos" | "email" | "telefono_contacto";
export type ContactValue = { field: ContactField; label: string; masked: string };

export default function ContactRevealGroup({ userId, values }: { userId: string; values: ContactValue[] }) {
  const [revealed, setRevealed] = useState<{ field: ContactField; value: string } | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [code, setCode] = useState("");
  const [pendingField, setPendingField] = useState<ContactField | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function reveal(field: ContactField, mfaCode?: string) {
    setError("");
    setRevealed(null);
    if (timer.current) clearTimeout(timer.current);
    const response = await fetch("/api/admin/users/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, field, ...(mfaCode ? { code: mfaCode } : {}) }),
    });
    const data = await response.json() as { field?: ContactField; value?: string | null; mfaRequired?: boolean; error?: string };
    if (response.status === 428 && data.mfaRequired) {
      setPendingField(field);
      setMfaRequired(true);
      return;
    }
    if (!response.ok || data.field !== field) {
      setError(data.error ?? "No fue posible revelar el dato.");
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setRevealed({ field, value: data.value ?? "No capturado" });
    setPendingField(null);
    setMfaRequired(false);
    setCode("");
    timer.current = setTimeout(() => setRevealed(null), 30_000);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingField) await reveal(pendingField, code);
  }

  return (
    <div className="mt-2 space-y-2">
      {values.map((item) => (
        <div key={item.field} className="flex flex-wrap items-center gap-2 text-xs">
          <span><strong>{item.label}:</strong> {revealed?.field === item.field ? revealed.value : item.masked || "No capturado"}</span>
          <SmallButton disabled={mfaRequired} onClick={() => void reveal(item.field)} aria-label={`Mostrar ${item.label.toLowerCase()}`}>Mostrar</SmallButton>
        </div>
      ))}
      {mfaRequired && (
        <form onSubmit={(event) => void verify(event)} className="flex flex-wrap items-end gap-2 rounded bg-amber-50 p-2">
          <label className="text-xs font-semibold">Código OneAuth (válido 5 minutos)
            <input autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 block rounded border p-2 text-sm font-normal" />
          </label>
          <SmallButton type="submit">Verificar y mostrar</SmallButton>
          <SmallButton onClick={() => { setMfaRequired(false); setPendingField(null); setCode(""); }}>Cancelar</SmallButton>
        </form>
      )}
      {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}
