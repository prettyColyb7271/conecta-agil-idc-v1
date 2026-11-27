"use client";

import { useState } from "react";

type Requirement = { requirement_code: string; name: string; status: string; version_id: string | null };
type Evento = {
  event_type: string;
  document_id: string | null;
  resultado: string | null;
  vence_at: string | null;
  subgate_requerido: number;
  subgate_document_id: string | null;
  medio: string | null;
  solicitud_numero: string | null;
  sequence: number;
};
type Tipo = "ingreso_acuse" | "resolucion_cfe" | "contrato" | "uiie" | "certificado_uiie" | "medidor" | "interconexion" | "alta_comercial";
type Props = {
  expedienteId: string;
  gate: string;
  abierto: boolean;
  responsableActual: boolean;
  requirements: Requirement[];
  eventos: Evento[];
  ocupado: string | null;
  setOcupado: (value: string | null) => void;
  notificar: (value: { ok: boolean; text: string }) => void;
  refrescar: () => Promise<void>;
  cerrar: (gate: string) => Promise<void>;
  verUiie: () => void;
  alReprocesar: () => void;
};

const LABELS: Record<Tipo, string> = {
  ingreso_acuse: "Acuse de CFE",
  resolucion_cfe: "Oficio resolutivo",
  contrato: "Contrato",
  uiie: "Visita UIIE",
  certificado_uiie: "Certificado UIIE",
  medidor: "Medidor",
  interconexion: "Interconexión",
  alta_comercial: "Alta comercial",
};
const POR_GATE: Record<string, Tipo[]> = {
  G3: ["ingreso_acuse"],
  G4: ["resolucion_cfe"],
  G5: ["contrato"],
  G6: ["uiie", "certificado_uiie"],
  G7: ["medidor", "interconexion", "alta_comercial"],
};
const input = "mt-1 block w-full rounded border border-[#1b3d66] bg-white px-2 py-1 font-normal";
const boton = "rounded bg-[#0d1f33] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";

function ultimo(eventos: Evento[], tipo: string) {
  return eventos.filter((evento) => evento.event_type === tipo).at(-1);
}

function Formulario({ tipo, expedienteId, ocupado, setOcupado, notificar, refrescar, alTerminar }: Pick<Props, "expedienteId" | "ocupado" | "setOcupado" | "notificar" | "refrescar"> & { tipo: Tipo; alTerminar?: () => void }) {
  const [fecha, setFecha] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [medio, setMedio] = useState("ventanilla");
  const [solicitud, setSolicitud] = useState("");
  const [resultado, setResultado] = useState("favorable");
  const [subgate, setSubgate] = useState<File | null>(null);
  const limite = fecha ? new Date(Date.parse(`${fecha}T00:00:00Z`) + 60 * 86400000).toISOString().slice(0, 10) : "";

  async function registrar() {
    if (!archivo) return;
    setOcupado(tipo);
    try {
      const data = new FormData();
      data.set("eventType", tipo);
      data.set("eventDate", fecha);
      data.set("description", LABELS[tipo]);
      data.set("file", archivo);
      if (tipo === "ingreso_acuse") { data.set("medio", medio); data.set("solicitudNumero", solicitud.trim()); }
      if (tipo === "resolucion_cfe") {
        data.set("resultado", resultado);
        data.set("vigenciaMeses", "2");
        if (resultado === "condicionado" && subgate) { data.set("subgateRequerido", "true"); data.set("subgateFile", subgate); }
      }
      const response = await fetch(`/api/expedientes/${expedienteId}/documents`, { method: "POST", body: data });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}.`);
      notificar({ ok: true, text: `${LABELS[tipo]} registrado.` });
      alTerminar?.();
      await refrescar();
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible registrar la evidencia." });
    } finally { setOcupado(null); }
  }

  return (
    <form className="grid gap-2 rounded bg-[#cfe0f1] p-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void registrar(); }}>
      <p className="text-xs font-bold sm:col-span-2">Registrar {LABELS[tipo]}</p>
      <label className="text-xs font-bold">Fecha<input required type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className={input} /></label>
      {tipo === "ingreso_acuse" && <>
        <label className="text-xs font-bold">Medio<select value={medio} onChange={(event) => setMedio(event.target.value)} className={input}><option value="ventanilla">Ventanilla</option><option value="portal">Portal</option></select></label>
        <label className="text-xs font-bold">Número de solicitud<input required value={solicitud} onChange={(event) => setSolicitud(event.target.value)} className={input} /></label>
      </>}
      {tipo === "resolucion_cfe" && <>
        <label className="text-xs font-bold">Resultado<select value={resultado} onChange={(event) => setResultado(event.target.value)} className={input}><option value="favorable">Favorable</option><option value="condicionado">Condicionado</option><option value="no_favorable">No favorable</option></select></label>
        <p className="text-xs sm:col-span-2">Vigencia: 2 meses (60 días). Fecha límite: <b>{limite || "selecciona la fecha"}</b>.</p>
        {resultado === "no_favorable" && <p className="text-xs font-bold text-red-800 sm:col-span-2">Un oficio no favorable no permite cerrar G4.</p>}
        {resultado === "condicionado" && <label className="text-xs font-bold">PDF del estudio o aportación del subgate<input required type="file" accept=".pdf,application/pdf" onChange={(event) => setSubgate(event.target.files?.[0] ?? null)} className="mt-1 block w-full font-normal" /><span className="block font-normal">Ambos archivos y el formulario deben sumar menos de 21 MB.</span></label>}
      </>}
      <label className="text-xs font-bold">PDF de {LABELS[tipo]}<input required type="file" accept=".pdf,application/pdf" onChange={(event) => setArchivo(event.target.files?.[0] ?? null)} className="mt-1 block w-full font-normal" /></label>
      <div className="sm:col-span-2"><button type="submit" disabled={ocupado !== null || !fecha || !archivo || (tipo === "ingreso_acuse" && !solicitud.trim()) || (tipo === "resolucion_cfe" && resultado === "condicionado" && !subgate)} className={boton}>{ocupado === tipo ? "Registrando…" : `Registrar ${LABELS[tipo]}`}</button></div>
    </form>
  );
}

export default function RegistrarEventos(props: Props) {
  const { gate, abierto, responsableActual, requirements, eventos, ocupado, setOcupado, notificar, refrescar, cerrar, verUiie, alReprocesar, expedienteId } = props;
  const [motivo, setMotivo] = useState("");
  const [otroOficio, setOtroOficio] = useState(false);
  const [seleccion, setSeleccion] = useState(() => Array.from({ length: 11 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`));
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [internalNotes, setInternalNotes] = useState<Record<string, string>>({});
  const tipos = POR_GATE[gate] ?? [];
  const r = (code: string) => requirements.find((item) => item.requirement_code === code);
  const listo = (code: string) => ["validado_idc", "no_aplica_justificado"].includes(r(code)?.status ?? "");
  const oficio = ultimo(eventos, "resolucion_cfe");
  const faltantes: string[] = [];
  if (gate === "G3") {
    for (const code of ["R10", "R11"]) if (r(code)?.status !== "validado_idc" || (code === "R11" && !r(code)?.version_id)) faltantes.push(`${code} validado`);
    const acuse = ultimo(eventos, "ingreso_acuse");
    if (!acuse?.document_id || !acuse.medio || !acuse.solicitud_numero) faltantes.push("Acuse con medio y número de solicitud");
  }
  if (gate === "G4") {
    if (!oficio?.document_id || !oficio.vence_at || !oficio.resultado) faltantes.push("Oficio con vigencia y resultado");
    else {
      if (oficio.resultado === "no_favorable") faltantes.push("Oficio favorable o condicionado");
      if (oficio.subgate_requerido && !oficio.subgate_document_id) faltantes.push("Evidencia del subgate");
    }
  }
  if (gate === "G6") for (let i = 1; i <= 17; i++) { const code = `U${String(i).padStart(2, "0")}`; if (!listo(code)) faltantes.push(`${code} completo`); }
  for (const tipo of tipos.filter((item) => !["ingreso_acuse", "resolucion_cfe"].includes(item))) {
    if (!ultimo(eventos, tipo)?.document_id) faltantes.push(LABELS[tipo]);
  }
  if (gate === "G7" && !ultimo(eventos, "cierre")) faltantes.push("Cierre registrado");

  async function eventoSinDocumento(eventType: "cfe_incompleto" | "cierre") {
    const description = eventType === "cfe_incompleto" ? motivo.trim() : "Cierre revisado";
    if (!description) return;
    if (eventType === "cfe_incompleto" && (!seleccion.length || seleccion.some((code) => !feedback[code]?.trim()))) return;
    if (eventType === "cfe_incompleto" && !window.confirm("CFE reporta incompleto: se reabrirá G1, se bloquearán G2 a G7, solo los requisitos seleccionados quedarán observados y se reiniciará el plazo de CFE. ¿Continuar?")) return;
    setOcupado(eventType);
    try {
      const response = await fetch(`/api/expedientes/${expedienteId}/gates`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "event", eventType, description, ...(eventType === "cfe_incompleto" ? { requirementCodes: seleccion, feedback, internalNotes } : {}) }) });
      const body = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(body.error ?? `Error HTTP ${response.status}.`);
      setMotivo("");
      notificar({ ok: !body.warning, text: body.warning ?? (eventType === "cierre" ? "Cierre registrado." : "Reproceso registrado; G1 se reabrió.") });
      if (eventType === "cfe_incompleto") alReprocesar();
      await refrescar();
    } catch (error) {
      notificar({ ok: false, text: error instanceof Error ? error.message : "No fue posible registrar el evento." });
    } finally { setOcupado(null); }
  }

  return (
    <div className="mt-4 space-y-3 rounded bg-white p-3">
      {gate === "G3" && <div className="text-xs"><p className="font-bold">Requisitos para el acuse</p>{["R10", "R11"].map((code) => <p key={code}>{r(code)?.status === "validado_idc" ? "✓" : "○"} {code} validado</p>)}</div>}
      {gate === "G6" && <div className="text-xs"><p className="font-bold">Checklist U01–U17</p><div className="mt-1 flex flex-wrap gap-1">{Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`).map((code) => <span key={code} className={`rounded px-1 ${listo(code) ? "bg-emerald-100" : "bg-amber-100"}`}>{listo(code) ? "✓" : "○"} {code}</span>)}</div><button type="button" onClick={verUiie} className="mt-1 underline">Ir al grupo U de la revisión</button></div>}
      {tipos.map((tipo) => {
        const registrado = ultimo(eventos, tipo);
        return <div key={tipo} className="space-y-1">
          {registrado?.document_id && <p className="text-xs">✓ {LABELS[tipo]} registrado · <a className="underline" href={`/api/documents/${registrado.document_id}`}>Ver PDF</a></p>}
          {tipo === "resolucion_cfe" && registrado && <div className="text-xs">Resultado: {registrado.resultado ?? "sin registrar"} · Fecha límite: {registrado.vence_at?.slice(0, 10) ?? "sin registrar"}{registrado.subgate_document_id && <> · <a className="underline" href={`/api/documents/${registrado.subgate_document_id}`}>Ver subgate</a></>}</div>}
          {abierto && (!registrado || (tipo === "resolucion_cfe" && otroOficio)) && <Formulario key={`${expedienteId}-${tipo}`} tipo={tipo} expedienteId={expedienteId} ocupado={ocupado} setOcupado={setOcupado} notificar={notificar} refrescar={refrescar} alTerminar={() => setOtroOficio(false)} />}
          {abierto && tipo === "resolucion_cfe" && registrado && !otroOficio && <button type="button" onClick={() => setOtroOficio(true)} className="text-xs underline">Registrar otro oficio</button>}
        </div>;
      })}
      {gate === "G7" && <div className="text-xs">{ultimo(eventos, "cierre") ? <p>✓ Cierre registrado.</p> : abierto && <button type="button" disabled={ocupado !== null || tipos.some((tipo) => !ultimo(eventos, tipo)?.document_id)} onClick={() => void eventoSinDocumento("cierre")} className={boton}>Registrar cierre</button>}<p className="mt-1 font-semibold">G7 lo cierra un Gestor IDC distinto del responsable.</p></div>}
      <div className="text-xs"><p className="font-bold">Qué falta para cerrar {gate}</p>{faltantes.length ? <ul className="list-inside list-disc">{faltantes.map((item) => <li key={item}>{item}</li>)}</ul> : <p>No falta nada.</p>}</div>
      {abierto && <button type="button" disabled={ocupado !== null || faltantes.length > 0 || (gate === "G7" && responsableActual)} onClick={() => void cerrar(gate)} className={boton}>{gate === "G7" && responsableActual ? "Lo cierra otro Gestor IDC" : ocupado === gate ? "Cerrando…" : `Cerrar ${gate}`}</button>}
      {gate === "G3" && abierto && <form className="space-y-2 border-t border-red-300 pt-3" onSubmit={(event) => { event.preventDefault(); void eventoSinDocumento("cfe_incompleto"); }}><p className="text-xs font-bold text-red-800">CFE reporta incompleto · reproceso destructivo</p><label className="block text-xs font-bold">Mensaje general al cliente<textarea required value={motivo} onChange={(event) => setMotivo(event.target.value)} className={input} /></label>
        {Array.from({ length: 11 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`).map((code) => <div key={code} className="rounded bg-red-50 p-2 text-xs">
          <label className="font-bold"><input type="checkbox" checked={seleccion.includes(code)} onChange={(event) => setSeleccion((current) => event.target.checked ? [...current, code] : current.filter((value) => value !== code))} /> {code} · {r(code)?.name}</label>
          {seleccion.includes(code) && <><label className="block font-bold">Retroalimentación para el cliente<textarea required value={feedback[code] ?? ""} onChange={(event) => setFeedback({ ...feedback, [code]: event.target.value })} className={input} /></label><label className="block font-bold">Nota interna (opcional)<textarea value={internalNotes[code] ?? ""} onChange={(event) => setInternalNotes({ ...internalNotes, [code]: event.target.value })} className={input} /></label></>}
        </div>)}
        {(seleccion.includes("R01") || seleccion.includes("R07")) && <p className="text-xs font-bold text-red-800">Habrá que volver a firmar F-01/F-02.</p>}
        <button type="submit" disabled={ocupado !== null || !motivo.trim() || !seleccion.length || seleccion.some((code) => !feedback[code]?.trim())} className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">CFE reporta incompleto</button></form>}
    </div>
  );
}
