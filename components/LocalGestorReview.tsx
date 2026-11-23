"use client";

import { useEffect, useState } from "react";

type Requirement = {
  requirement_code: string;
  name: string;
  status: string;
  tipo: string;
  integra: string;
  sensible: number;
  validaciones: string;
  observations: Array<{ visibility: string; body: string }>;
};

export default function LocalGestorReview() {
  const [expediente, setExpediente] = useState<{ id: string; folio: string } | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const list = await fetch("/api/expedientes").then((response) => response.json()) as { expedientes?: Array<{ id: string; folio: string }> };
    const first = list.expedientes?.[0] ?? null;
    setExpediente(first);
    if (first) {
      const review = await fetch(`/api/expedientes/${first.id}/requirements/R01`).then((response) => response.json()) as { requirements?: Requirement[] };
      setRequirements(review.requirements ?? []);
    }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function review(code: string, action: "validate" | "observe" | "not_applicable") {
    const reason = action === "validate" ? undefined : window.prompt("Motivo obligatorio:")?.trim();
    if (action !== "validate" && !reason) return;
    const response = await fetch(`/api/expedientes/${expediente?.id}/requirements/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason, visibility: "cliente" }),
    });
    const body = await response.json() as { error?: string };
    setMessage(response.ok ? `${code} actualizado.` : body.error ?? "No fue posible actualizar.");
    if (response.ok) await load();
  }

  if (!expediente) return <p className="text-sm">No hay expedientes para revisar.</p>;
  return <section className="space-y-3 rounded-sm bg-[#b6cde3] p-4 text-[#0d1f33]">
    <h2 className="text-xl font-bold">Revisión de requisitos — Gestor IDC</h2>
    <p className="text-sm">Expediente: <b>{expediente.folio}</b></p>
    {message && <p role="status" className="text-sm font-bold">{message}</p>}
    <div className="space-y-2">{requirements.map((item) => <article key={item.requirement_code} className="rounded bg-white p-3 text-sm">
      <p className="font-bold">{item.requirement_code} · {item.name} · {item.status}</p>
      <p className="text-xs">Integra: {item.integra} · Tipo: {item.tipo} · Sensible: {item.sensible ? "sí" : "no"}</p>
      <p className="text-xs text-slate-600">Checklist: {item.validaciones}</p>
      {item.observations.map((observation, index) => <p key={index} className="text-xs text-red-700">Observación ({observation.visibility}): {observation.body}</p>)}
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="rounded bg-emerald-700 px-2 py-1 text-xs text-white" onClick={() => void review(item.requirement_code, "validate")}>Validar</button>
        <button className="rounded bg-amber-600 px-2 py-1 text-xs text-white" onClick={() => void review(item.requirement_code, "observe")}>Observar</button>
        <button className="rounded bg-slate-600 px-2 py-1 text-xs text-white" onClick={() => void review(item.requirement_code, "not_applicable")}>No aplica</button>
      </div>
    </article>)}</div>
  </section>;
}
