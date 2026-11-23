"use client";

import { useState } from "react";
import { Panel } from "@/components/ui";

type Props = {
  expediente: {
    id: string; folio: string; tramite: string; status: string; data_json: string;
    gates: Array<{ gate_code: string; status: string }>;
    requirements: Array<{ requirement_code: string; name: string; status: string }>;
  } | null;
};

const input = "w-full rounded border border-[#1b3d66] bg-white px-3 py-2 text-sm text-[#0d1f33]";

export default function LocalPortal({ expediente }: Props) {
  const initial = expediente ? JSON.parse(expediente.data_json) as Record<string, Record<string, unknown>> : {};
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!expediente) return <Panel title="Mi expediente"><p className="text-sm">Aún no tienes expediente asignado.</p></Panel>;
  const currentExpediente = expediente;

  const value = (section: string, field: string) => String(data[section]?.[field] ?? "");
  const update = (section: string, field: string, next: string | number) => setData((current) => ({ ...current, [section]: { ...(current[section] ?? {}), [field]: next } }));
  async function save() {
    setError(""); setMessage("");
    const response = await fetch(`/api/expedientes/${currentExpediente.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "No fue posible guardar los datos.");
    else setMessage("Datos guardados correctamente.");
  }
  return <div className="space-y-3">
    <Panel title="Mi expediente">
      <p className="text-sm"><b>Folio:</b> {expediente.folio}</p><p className="text-sm"><b>Trámite:</b> {expediente.tramite}</p><p className="text-sm"><b>Estado:</b> {expediente.status}</p>
    </Panel>
    <Panel title="Captura de datos F-01 / F-04">
      <div className="grid gap-3 md:grid-cols-2 text-[#0d1f33]">
        <label className="text-xs font-bold">Tipo de persona<select className={input} value={value("solicitante", "tipo_persona")} onChange={(e) => update("solicitante", "tipo_persona", e.target.value)}><option value="">Selecciona</option><option value="fisica">Física</option><option value="moral">Moral</option></select></label>
        <label className="text-xs font-bold">Nombre / razón social<input className={input} value={value("solicitante", "nombre_razon_social")} onChange={(e) => update("solicitante", "nombre_razon_social", e.target.value)} /></label>
        <label className="text-xs font-bold">RFC<input className={input} maxLength={13} value={value("solicitante", "rfc")} onChange={(e) => update("solicitante", "rfc", e.target.value.toUpperCase())} /></label>
        <label className="text-xs font-bold">Correo<input className={input} type="email" value={value("solicitante", "correo")} onChange={(e) => update("solicitante", "correo", e.target.value)} /></label>
        <label className="text-xs font-bold">Teléfono<input className={input} value={value("solicitante", "telefono")} onChange={(e) => update("solicitante", "telefono", e.target.value)} /></label>
        <label className="text-xs font-bold">RPU<input className={input} value={value("servicio_actual", "rpu")} onChange={(e) => update("servicio_actual", "rpu", e.target.value)} /></label>
        <label className="text-xs font-bold">Nivel de tensión del suministro<input className={input} value={value("servicio_actual", "nivel_tension_suministro")} onChange={(e) => update("servicio_actual", "nivel_tension_suministro", e.target.value)} /></label>
        <label className="text-xs font-bold">Tarifa<input className={input} value={value("servicio_actual", "tarifa")} onChange={(e) => update("servicio_actual", "tarifa", e.target.value)} /></label>
        <label className="text-xs font-bold">Tecnología<input className={input} value={value("central", "tecnologia")} onChange={(e) => update("central", "tecnologia", e.target.value)} /></label>
        <label className="text-xs font-bold">Capacidad bruta (kW)<input className={input} type="number" min="0.01" value={value("central", "capacidad_bruta_kw")} onChange={(e) => update("central", "capacidad_bruta_kw", Number(e.target.value))} /></label>
      </div>
      <button onClick={() => void save()} className="mt-4 rounded bg-[#0d1f33] px-5 py-2 text-sm font-semibold text-white">Guardar datos</button>
      {message && <p role="status" className="mt-2 text-sm font-bold text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{error}</p>}
    </Panel>
    <Panel title="Gates y requisitos">
      <p className="text-sm font-bold">Gates: {expediente.gates.map((gate) => `${gate.gate_code}: ${gate.status}`).join(" · ")}</p>
      <div className="mt-2 grid gap-1 text-xs md:grid-cols-2">{expediente.requirements.map((requirement) => <p key={requirement.requirement_code}><b>{requirement.requirement_code}</b> {requirement.name}: {requirement.status}</p>)}</div>
    </Panel>
  </div>;
}
