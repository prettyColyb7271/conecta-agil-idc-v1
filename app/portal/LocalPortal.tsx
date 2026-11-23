"use client";

import { useState } from "react";
import { Panel } from "@/components/ui";

type Props = {
  expediente: {
    id: string; folio: string; tramite: string; status: string; data_json: string;
    privacy_accepted_at: string | null; privacy_accepted_version: string | null;
    gates: Array<{ gate_code: string; status: string }>;
    requirements: Array<{ requirement_code: string; name: string; status: string }>;
  } | null;
  review: Array<{ requirement_code: string; name: string; status: string; integra: string; validaciones: string; observations: Array<{ visibility: string; body: string }> }>;
  formats: Array<{ document_id: string; document_type: string; status: string; version_id: string; version_number: number; original_filename: string }>;
};

const input = "w-full rounded border border-[#1b3d66] bg-white px-3 py-2 text-sm text-[#0d1f33]";

export default function LocalPortal({ expediente, review, formats }: Props) {
  const raw = expediente ? JSON.parse(expediente.data_json) as Record<string, Record<string, unknown>> : {};
  const initial = expediente ? {
    solicitante: raw.solicitante,
    servicio_actual: raw.servicio_actual,
    central: raw.central ? Object.fromEntries(["tecnologia", "capacidad_bruta_kw", "capacidad_incrementar_kw", "generacion_mensual_kwh", "unidades", "utm", "modalidad", "fecha_estimada_operacion"].filter((key) => key in raw.central).map((key) => [key, raw.central[key]])) : undefined,
    contacto: raw.contacto,
    representacion: raw.representacion,
  } : {};
  const [data, setData] = useState(initial as Record<string, Record<string, unknown>>);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
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
  async function acceptPrivacyNotice() {
    const response = await fetch(`/api/expedientes/${currentExpediente.id}/privacy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "aviso-privacidad-v1" }) });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error ?? "No fue posible aceptar el aviso.");
    else window.location.reload();
  }
  async function upload(code: string, file: File | undefined) {
    if (!file) return;
    setUploadMessage("");
    const form = new FormData();
    form.set("requirementCode", code);
    form.set("file", file);
    const response = await fetch(`/api/expedientes/${currentExpediente.id}/documents`, { method: "POST", body: form });
    const body = await response.json() as { error?: string };
    setUploadMessage(response.ok ? `${code} cargado correctamente.` : body.error ?? "No fue posible cargar el documento.");
    if (response.ok) window.location.reload();
  }
  return <div className="space-y-3">
    <Panel title="Mi expediente">
      <p className="text-sm"><b>Folio:</b> {expediente.folio}</p><p className="text-sm"><b>Trámite:</b> {expediente.tramite}</p><p className="text-sm"><b>Estado:</b> {expediente.status}</p>
      {!expediente.privacy_accepted_at && <div className="mt-3 rounded border border-amber-500 bg-amber-50 p-3 text-sm"><p><b>Aviso de privacidad (texto pendiente de confirmar con IDC)</b></p><p className="mt-1">Acepta la versión registrada para poder avanzar el gate G0.</p><button onClick={() => void acceptPrivacyNotice()} className="mt-2 rounded bg-[#0d1f33] px-3 py-1.5 font-semibold text-white">Aceptar aviso</button></div>}
    </Panel>
    <Panel title="Formatos generados">
      {formats.length ? <ul className="space-y-2 text-sm">{formats.filter((item, index, list) => list.findIndex((other) => other.document_type === item.document_type) === index).map((format) => <li key={format.document_id}><a className="font-bold underline" href={`/api/documents/${format.document_id}`}>{format.document_type} · {format.original_filename}</a><span className="ml-2 text-xs">({format.status})</span></li>)}</ul> : <p className="text-sm">Aún no hay formatos generados. El Gestor IDC los genera después de cerrar G1.</p>}
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
      <p className="mt-2 text-sm font-bold">Avance: {review.filter((r) => ["validado_idc", "no_aplica_justificado"].includes(r.status)).length} de {review.length} validados o no aplica.</p>
      {uploadMessage && <p role="status" className="mt-2 text-sm font-bold">{uploadMessage}</p>}
      <div className="mt-2 space-y-2 text-xs">{review.map((requirement) => <div key={requirement.requirement_code} className="rounded border border-[#8da9c5] bg-white p-2">
        <p><b>{requirement.requirement_code}</b> {requirement.name}: <strong>{requirement.status}</strong></p>
        <p className="text-slate-600">Integra: {requirement.integra} · Validaciones: {requirement.validaciones}</p>
        {requirement.observations.map((observation, index) => <p key={index} className="mt-1 text-red-700">Observación: {observation.body}</p>)}
        <input aria-label={`Subir ${requirement.requirement_code}`} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => void upload(requirement.requirement_code, event.target.files?.[0])} />
      </div>)}</div>
    </Panel>
  </div>;
}
