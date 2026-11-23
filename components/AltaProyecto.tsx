"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui";

type Option = { id: string; display_name: string; email: string };
type Expediente = {
  id: string; folio: string; tramite: string; nivel_tension: string; status: string;
  cliente_nombre: string; gestor_nombre: string | null; gestor_id: string | null;
  gates: Array<{ gate_code: string; status: string }>;
  assignments: Array<{ display_name: string; assignment_type: string; starts_at: string; ends_at: string | null }>;
};

const inputCls = "w-full rounded border border-[#1b3d66] bg-white px-3 py-2 text-sm text-[#0d1f33]";

export default function AltaProyecto() {
  const [clients, setClients] = useState<Option[]>([]);
  const [responsables, setResponsables] = useState<Option[]>([]);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/expedientes");
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "No fue posible consultar expedientes."); return; }
    setExpedientes(body.expedientes);
    setClients(body.options?.clients ?? []);
    setResponsables(body.options?.responsables ?? []);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function create(form: HTMLFormElement) {
    const values = new FormData(form);
    setError(""); setMessage("");
    const response = await fetch("/api/expedientes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clienteId: values.get("clienteId"),
        tramite: values.get("tramite"),
        nivelTension: values.get("nivelTension"),
        habilitado: values.get("habilitado") === "on",
        responsableId: values.get("responsableId") || undefined,
      }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error ?? "No fue posible crear el expediente."); return; }
    form.reset(); setMessage(`Expediente ${body.expediente.folio} creado.`); await load();
  }

  async function assign(id: string, responsableId: string) {
    setError(""); setMessage("");
    const response = await fetch(`/api/expedientes/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "assign", responsableId }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "No fue posible reasignar.");
    else { setMessage("Responsable IDC actualizado."); await load(); }
  }

  return (
    <div className="space-y-3">
      <Panel title="Registrar expediente">
        <form className="mx-auto max-w-2xl space-y-3" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}>
          <select name="clienteId" className={inputCls} required defaultValue=""><option value="" disabled>Selecciona cliente activo</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.display_name} — {c.email}</option>)}</select>
          <input name="tramite" className={inputCls} placeholder="Trámite (ej. interconexion_fv_mt)" required />
          <select name="nivelTension" className={inputCls} defaultValue="MT"><option value="MT">Media tensión (MT)</option><option value="BT">Baja tensión (BT)</option></select>
          <select name="responsableId" className={inputCls} defaultValue=""><option value="">Sin Responsable IDC por ahora</option>{responsables.map((g) => <option key={g.id} value={g.id}>{g.display_name}</option>)}</select>
          <label className="flex items-center gap-2 text-sm text-[#0d1f33]"><input name="habilitado" type="checkbox" defaultChecked /> Trámite habilitado</label>
          <button className="rounded bg-[#0d1f33] px-5 py-2 text-sm font-semibold text-white">Crear expediente</button>
        </form>
        {message && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}
      </Panel>
      <Panel title="Expedientes">
        {expedientes.length === 0 ? <p className="text-sm">No hay expedientes visibles.</p> : <div className="space-y-3">{expedientes.map((e) => (
          <article key={e.id} className="rounded border border-[#8da9c5] bg-white p-3 text-sm text-[#0d1f33]">
            <div className="flex flex-wrap justify-between gap-2"><b>{e.folio}</b><span>{e.tramite} · {e.nivel_tension} · {e.status}</span></div>
            <p>Cliente: {e.cliente_nombre} · Responsable IDC: {e.gestor_nombre ?? "Sin asignar"}</p>
            <p>Gate actual: {e.gates.find((g) => g.status === "abierto")?.gate_code ?? e.gates.find((g) => g.status === "pendiente")?.gate_code ?? "—"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><select className={inputCls} value={e.gestor_id ?? ""} onChange={(event) => { if (event.target.value) void assign(e.id, event.target.value); }}><option value="">Reasignar Responsable IDC</option>{responsables.map((g) => <option key={g.id} value={g.id}>{g.display_name}</option>)}</select></div>
            <details className="mt-2"><summary className="cursor-pointer font-semibold">Historial de responsables IDC</summary>{e.assignments.map((a, index) => <p key={`${a.display_name}-${index}`} className="text-xs">{a.assignment_type === "coordinador_idc" ? "Responsable IDC" : a.assignment_type}: {a.display_name} · {a.ends_at ? `hasta ${a.ends_at}` : "vigente"}</p>)}</details>
          </article>
        ))}</div>}
      </Panel>
    </div>
  );
}
