"use client";

import { useCallback, useEffect, useState } from "react";

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
type Pending = { kind: string; expedienteId: string; folio: string; requirementCode?: string; label: string };
type Gate = { gate_code: string; status: string };

export default function LocalGestorReview() {
  const [expediente, setExpediente] = useState<{ id: string; folio: string } | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [pending, setPending] = useState<Pending[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; code: string; version: number; sha256: string; active: number }>>([]);

  const load = useCallback(async () => {
    const list = await fetch("/api/expedientes").then((response) => response.json()) as { expedientes?: Array<{ id: string; folio: string }> };
    const pendingData = await fetch(`/api/gestor/pendientes?scope=${scope}`).then((response) => response.json()) as { pendientes?: Pending[] };
    setPending(pendingData.pendientes ?? []);
    const first = list.expedientes?.[0] ?? null;
    setExpediente(first);
    if (first) {
      const review = await fetch(`/api/expedientes/${first.id}/requirements/R01`).then((response) => response.json()) as { requirements?: Requirement[] };
      setRequirements(review.requirements ?? []);
      const gateData = await fetch(`/api/expedientes/${first.id}/gates`).then((response) => response.json()) as { gates?: Gate[] };
      setGates(gateData.gates ?? []);
    }
    const templateData = await fetch("/api/templates").then((response) => response.json()) as { templates?: typeof templates };
    setTemplates(templateData.templates ?? []);
  }, [scope]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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

  async function closeGate(gateCode: string) {
    const response = await fetch(`/api/expedientes/${expediente?.id}/gates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "close", gateCode }),
    });
    const body = await response.json() as { error?: string; gates?: Gate[] };
    setMessage(response.ok ? `${gateCode} cerrado.` : body.error ?? "No fue posible cerrar el gate.");
    if (response.ok) setGates(body.gates ?? []);
  }

  async function generate(formatCode: string) {
    const response = await fetch(`/api/expedientes/${expediente?.id}/formats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formatCode }),
    });
    const body = await response.json() as { error?: string; format?: { documentId: string; filename: string } };
    setMessage(response.ok ? `${formatCode} generado. Descárgalo desde documentos (${body.format?.filename ?? "PDF"}).` : body.error ?? "No fue posible generar el formato.");
  }

  if (!expediente) return <p className="text-sm">No hay expedientes para revisar.</p>;
  return <section className="space-y-3 rounded-sm bg-[#b6cde3] p-4 text-[#0d1f33]">
    <h2 className="text-xl font-bold">Revisión de requisitos — Gestor IDC</h2>
    <div className="rounded bg-white p-3">
      <h3 className="font-bold">Plantillas Word IDC</h3>
      <p className="text-xs text-slate-600">DOCX sin macros · máximo 5 MB · versión activa y hash verificable.</p>
      <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">{templates.map((template) => <li key={template.id} className="rounded border p-2">
        <b>{template.code}</b> · v{template.version} · {template.active ? "activa" : "inactiva"} · <code>{template.sha256.slice(0, 12)}</code>
        <a className="ml-2 underline" href={`/api/templates/${template.id}`}>Descargar</a>
      </li>)}</ul>
    </div>
    <div className="rounded bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Mis pendientes</h3>
        <label className="text-sm">Mostrar{" "}
          <select value={scope} onChange={(event) => setScope(event.target.value as "mine" | "all")} className="border px-2 py-1">
            <option value="mine">míos</option>
            <option value="all">todos</option>
          </select>
        </label>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {pending.map((item, index) => <li key={`${item.kind}-${item.expedienteId}-${item.requirementCode ?? index}`}><b>{item.folio}</b> · {item.label}</li>)}
        {!pending.length && <li>No hay pendientes en este filtro.</li>}
      </ul>
    </div>
    <p className="text-sm">Expediente: <b>{expediente.folio}</b></p>
    {message && <p role="status" className="text-sm font-bold">{message}</p>}
    <div className="rounded bg-white p-3">
      <h3 className="font-bold">Barra de gates (5 etapas · G0–G7)</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {gates.map((gate) => <div key={gate.gate_code} className="rounded border p-2 text-center text-xs">
          <b>{gate.gate_code}</b><span className="block">{gate.status}</span>
          {gate.status === "abierto" && <button className="mt-1 rounded bg-emerald-700 px-2 py-1 text-white" onClick={() => void closeGate(gate.gate_code)}>Cerrar</button>}
        </div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {["F-01", "F-02", "F-03", "F-04", "F-05", "F-06"].map((formatCode) => <button key={formatCode} className="rounded bg-[#0d1f33] px-2 py-1 text-xs text-white" onClick={() => void generate(formatCode)}>Generar {formatCode}</button>)}
      </div>
    </div>
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
