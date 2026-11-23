"use client";

import { useRef, useState } from "react";
import { Dot, Panel, SmallButton } from "@/components/ui";
import { camposFormato, datosExpediente, documentosGD, formatosTramite } from "@/data/mock";

// TODO: reemplazar por el portal de trámites que indique IDC
const CFE_PORTAL_URL = "https://www.cfe.mx";
const MAX_MB = 10;

const inputCls =
  "w-full rounded border border-[#1b3d66] bg-white px-2 py-1 text-sm text-[#0d1f33] focus:outline-none focus:ring-2 focus:ring-sky-400";

export default function FormatosCFE() {
  const [docs, setDocs] = useState(documentosGD);
  const [formatos, setFormatos] = useState(formatosTramite);
  const [sel, setSel] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [faltan, setFaltan] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");
  const [errDoc, setErrDoc] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const subidos = docs.filter((d) => d.archivo).length;
  const pct = Math.round((subidos / docs.length) * 100);

  function onFile(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrDoc(`"${file.name}" pesa más de ${MAX_MB} MB.`);
      return;
    }
    setErrDoc("");
    // DEMO: solo se guarda el nombre; el archivo aún no se sube a ningún lado
    setDocs((ds) => ds.map((d) => (d.id === id ? { ...d, archivo: file.name } : d)));
  }

  function abrir(id: string) {
    setSel(id);
    setFaltan([]);
    setAviso("");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function set(id: string, v: string) {
    setValores((p) => ({ ...p, [id]: v }));
  }

  function generar() {
    const falt = camposFormato.filter((c) => c.requerido !== false && !valores[c.id]?.trim()).map((c) => c.id);
    setFaltan(falt);
    if (falt.length) {
      setAviso("");
      return;
    }
    setFormatos((fs) => fs.map((f) => (f.id === sel ? { ...f, completado: true } : f)));
    setAviso("Formato completo y listo para revisión y firma. El PDF oficial se conectará cuando tengamos el formato vigente de CFE.");
  }

  return (
    <>
      <Panel title="Trámites en CFE">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <b>Portal en CFE.</b>
            <span className="block text-xs text-slate-600">El gestor ve a un lado los datos del expediente para copiarlos o adjuntarlos.</span>
          </p>
          <a
            href={CFE_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-[#5885b1] px-3 py-1 text-xs font-semibold text-white hover:bg-[#3d6a99]"
          >
            Ir
          </a>
        </div>
      </Panel>

      <Panel title="Trámite Interconexión GD">
        <p className="text-sm font-bold">Documentos {subidos} de {docs.length} subidos</p>
        <div
          className="my-2 h-4 overflow-hidden rounded bg-[#0d1f33]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Documentos subidos"
        >
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[480px] space-y-2 text-sm">
            <div className="grid grid-cols-[2fr_1fr_auto] gap-3 text-xs font-bold">
              <span>Documento</span><span>Estado</span><span className="w-24 text-center">Acción</span>
            </div>
            {docs.map((d) => (
              <div key={d.id} className="grid grid-cols-[2fr_1fr_auto] items-center gap-3">
                <span>
                  <span className="block font-bold">{d.nombre}</span>
                  {d.archivo && <span className="block text-xs text-slate-600">{d.archivo}</span>}
                </span>
                <span className="font-bold">{d.archivo ? "Subido" : "Pendiente"}</span>
                <label className="w-24 cursor-pointer rounded bg-[#5885b1] px-3 py-1 text-center text-xs font-semibold text-white focus-within:ring-2 focus-within:ring-sky-400 hover:bg-[#3d6a99]">
                  {d.archivo ? "Reemplazar" : "Subir"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => onFile(d.id, e)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
        {errDoc && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{errDoc}</p>}
        <p className="mt-2 text-xs text-slate-600">Demostración: los archivos aún no se guardan en ningún servidor.</p>
      </Panel>

      <Panel title="Formato del trámite">
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-[2fr_1fr_auto] gap-3 text-xs font-bold">
            <span>Formato</span><span>Completado</span><span className="w-24 text-center">Acción</span>
          </div>
          {formatos.map((f) => (
            <div key={f.id} className="grid grid-cols-[2fr_1fr_auto] items-center gap-3">
              <span>
                <span className="block font-bold">{f.nombre}</span>
                <span className="block text-xs text-slate-600">{f.archivo}</span>
              </span>
              <span className="flex items-center gap-2 font-bold">
                <Dot tipo={f.completado ? "entiempo" : "atrasado"} />
                {f.completado ? "Sí" : "No"}
              </span>
              <span className="w-24 text-center">
                <SmallButton onClick={() => abrir(f.id)} active={sel === f.id}>Generar</SmallButton>
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <div ref={formRef} className="scroll-mt-4">
        {sel === "f-cm" && (
          <Panel title="Generación del documento">
            <p className="text-sm">El formulario de Contratación y medidor estará disponible próximamente.</p>
          </Panel>
        )}

        {sel === "f-gd" && (
          <Panel title="Generación del documento">
            <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
              <div className="space-y-2">
                <button
                  onClick={() => setValores({ ...datosExpediente })}
                  className="w-full rounded bg-[#0d1f33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#16345a]"
                >
                  Autocompletar todo desde el expediente
                </button>

                {camposFormato.map((c) => {
                  const err = faltan.includes(c.id);
                  return (
                    <div key={c.id}>
                      <label htmlFor={`campo-${c.id}`} className="mb-0.5 block text-xs font-bold">
                        {c.label}{c.requerido === false ? " (opcional)" : ":"}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={`campo-${c.id}`}
                          className={`${inputCls} ${err ? "border-red-600 ring-1 ring-red-600" : ""}`}
                          value={valores[c.id] ?? ""}
                          onChange={(e) => set(c.id, e.target.value)}
                          aria-invalid={err}
                        />
                        <SmallButton onClick={() => set(c.id, datosExpediente[c.id] ?? "")}>Autocompletar</SmallButton>
                      </div>
                      {err && <p className="text-xs font-bold text-red-700">Campo obligatorio</p>}
                    </div>
                  );
                })}

                <button
                  onClick={generar}
                  className="mt-2 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Generar formato
                </button>
                {faltan.length > 0 && (
                  <p role="alert" className="text-sm font-bold text-red-700">
                    Faltan {faltan.length} campo(s) obligatorio(s). El formato no puede generarse hasta completarlos.
                  </p>
                )}
                {aviso && <p role="status" className="text-sm font-bold text-emerald-800">{aviso}</p>}
              </div>

              {/* Vista previa ilustrativa */}
              <div className="rounded border border-slate-400 bg-white p-4 text-[#0d1f33] shadow">
                <p className="mb-1 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Vista previa ilustrativa</p>
                <p className="text-2xl font-black italic text-emerald-700">CFE</p>
                <p className="mt-2 text-center text-xs font-bold">
                  ANEXO 2 Formato de Solicitud de Interconexión a las Redes Generales de Distribución para Centrales Eléctricas con capacidad menor a 0.5 MW
                </p>
                <p className="mt-3 bg-slate-200 px-2 py-0.5 text-[11px] font-bold">I. Datos del solicitante</p>
                <div className="grid grid-cols-2 gap-px bg-slate-400 text-[11px] sm:grid-cols-4">
                  {camposFormato.map((c) => (
                    <div key={c.id} className={`bg-white p-1.5 ${c.id === "razonSocial" ? "col-span-2 sm:col-span-4" : ""}`}>
                      <span className="block text-[9px] font-bold text-slate-500">{c.label}</span>
                      <span className="block min-h-4 break-words">{valores[c.id] || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
