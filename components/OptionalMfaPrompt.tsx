"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageBox } from "@/components/ui";

export default function OptionalMfaPrompt() {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/mfa", { signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { enabled?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo consultar la protección de la cuenta.");
      setVisible(!data.enabled);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo consultar la protección de la cuenta.");
    });
    return () => controller.abort();
  }, []);

  if (error) return <MessageBox tone="error">{error}</MessageBox>;
  if (!visible) return null;
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-blue-400 bg-blue-50 p-3 text-sm text-[#0d1f33]">
      <p>Protege tu cuenta vinculando OneAuth. Es opcional para clientes.</p>
      <span className="flex gap-3">
        <Link href="/seguridad" className="font-semibold underline">Configurar OneAuth</Link>
        <button type="button" className="font-semibold underline" onClick={() => setVisible(false)}>Omitir por ahora</button>
      </span>
    </section>
  );
}
