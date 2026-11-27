"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dot, Panel } from "@/components/ui";
import CapturaDatos from "@/components/portal/CapturaDatos";
import { ESTADO_DOCUMENTO, LISTOS, documentosDelCliente, type RequisitoCliente } from "@/lib/portal-cliente";

// TODO: reemplazar por el portal de trámites que indique IDC
const CFE_PORTAL_URL = "https://www.cfe.mx";
const MAX_MB = 20;

type Props = {
  expediente: { id: string; folio: string; data_json: string; gates: Array<{ gate_code: string; status: string }> } | null;
  review: RequisitoCliente[];
  formats: Array<{ document_id: string; document_type: string; status: string; version_id: string; version_number: number; original_filename: string }>;
};

// Formatos que el cliente revisa y firma; los prepara IDC con los datos capturados.
const FORMATOS = [
  { code: "F-01", requisito: "R01", nombre: "Solicitud de interconexión (formato CFE)" },
  { code: "F-02", requisito: "R07", nombre: "Carta poder para el trámite ante CFE" },
  { code: "F-03", requisito: "U15", nombre: "Carta poder simple para la UIIE" },
];
const FIRMADO = ["escaneo_recibido", "escaneo_verificado_idc", "ingresado_con_acuse", "validado_idc"];

// Formatos CFE del cliente en modo local: mismo diseño que la demo, con carga real de documentos.
export default function LocalDocumentos({ expediente, review, formats }: Props) {
  const router = useRouter();
  const [cargando, setCargando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; text: string } | null>(null);
  if (!expediente) return <Panel title="Formatos CFE"><p className="text-sm">Aún no tienes expediente asignado.</p></Panel>;
  const current = expediente;

  const { documentos, puedeSubir, reutilizados } = documentosDelCliente(review, expediente.gates);
  const subidos = documentos.filter((item) => !["requerido", "en_captura", "invalidado_por_cambio", "vencido"].includes(item.status)).length;
  const pct = documentos.length ? Math.round((subidos / documentos.length) * 100) : 0;

  async function subir(item: RequisitoCliente, file: File) {
    setAviso(null);
    if (file.size > MAX_MB * 1024 * 1024) { setAviso({ ok: false, text: `"${file.name}" pesa más de ${MAX_MB} MB.` }); return; }
    setCargando(item.requirement_code);
    try {
      const form = new FormData();
      form.set("requirementCode", item.requirement_code);
      form.set("file", file);
      const response = await fetch(`/api/expedientes/${current.id}/documents`, { method: "POST", body: form });
      const body = await response.json().catch(() => ({})) as { error?: string };
      setAviso(response.ok ? { ok: true, text: `${item.name}: archivo recibido. IDC lo revisará.` } : { ok: false, text: body.error ?? "No fue posible subir el archivo." });
      if (response.ok) router.refresh();
    } catch {
      setAviso({ ok: false, text: "No hay conexión con el servidor. Inténtalo de nuevo." });
    } finally {
      setCargando(null);
    }
  }

  const ultimoFormato = (code: string) => formats.find((format) => format.document_type.includes(code));
  const estadoRequisito = (code: string) => review.find((item) => item.requirement_code === code)?.status;

  return (
    <>
      <Panel title="Trámites en CFE">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <b>Portal en CFE.</b>
            <span className="block text-xs text-slate-600">El gestor ve a un lado los datos del expediente para copiarlos o adjuntarlos.</span>
          </p>
          <a href={CFE_PORTAL_URL} target="_blank" rel="noopener noreferrer" className="rounded bg-[#5885b1] px-3 py-1 text-xs font-semibold text-white hover:bg-[#3d6a99]">Ir</a>
        </div>
      </Panel>

      <Panel title="Trámite: interconexión FV en MT">
        <p className="text-sm font-bold">Documentos {subidos} de {documentos.length} subidos</p>
        <div className="my-2 h-4 overflow-hidden rounded bg-[#0d1f33]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Documentos subidos">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[480px] space-y-2 text-sm">
            <div className="grid grid-cols-[2fr_1fr_auto] gap-3 text-xs font-bold">
              <span>Documento</span><span>Estado</span><span className="w-24 text-center">Acción</span>
            </div>
            {documentos.map((d) => {
              const observacion = d.status === "observado" ? d.observations.find((observation) => observation.visibility === "cliente")?.body : undefined;
              const vacio = ["requerido", "en_captura", "invalidado_por_cambio", "vencido"].includes(d.status);
              return (
                <div key={d.requirement_code} className="grid grid-cols-[2fr_1fr_auto] items-center gap-3">
                  <span>
                    <span className="block font-bold">{d.name}</span>
                    <span className="block text-xs text-slate-600">{d.requirement_code} · {d.validaciones}</span>
                    {observacion && <span className="block text-xs font-bold text-red-700">Observación: {observacion}</span>}
                  </span>
                  <span className={`font-bold ${d.status === "observado" ? "text-red-700" : ""}`}>{ESTADO_DOCUMENTO[d.status] ?? d.status}</span>
                  {puedeSubir(d) ? (
                    <label className={`w-24 cursor-pointer rounded px-3 py-1 text-center text-xs font-semibold text-white focus-within:ring-2 focus-within:ring-sky-400 ${cargando === d.requirement_code ? "bg-slate-400" : "bg-[#5885b1] hover:bg-[#3d6a99]"}`}>
                      {cargando === d.requirement_code ? "Subiendo…" : vacio ? "Subir" : "Reemplazar"}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        className="sr-only"
                        disabled={cargando !== null}
                        aria-label={`Subir ${d.name}`}
                        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void subir(d, file); }}
                      />
                    </label>
                  ) : (
                    <span className="w-24 text-center text-xs text-slate-600">{LISTOS.includes(d.status) ? "Listo" : "En revisión"}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {aviso && <p role={aviso.ok ? "status" : "alert"} className={`mt-2 text-sm font-bold ${aviso.ok ? "text-emerald-800" : "text-red-700"}`}>{aviso.text}</p>}
        <p className="mt-2 text-xs text-slate-600">
          Se suben una sola vez: {reutilizados} documentos de la inspección UIIE se toman de este expediente y no se vuelven a pedir. PDF, JPG o PNG de hasta {MAX_MB} MB.
        </p>
      </Panel>

      <Panel title="Formato del trámite">
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-[2fr_1fr_auto] gap-3 text-xs font-bold">
            <span>Formato</span><span>Completado</span><span className="w-24 text-center">Acción</span>
          </div>
          {FORMATOS.map((f) => {
            const generado = ultimoFormato(f.code);
            const firmado = FIRMADO.includes(estadoRequisito(f.requisito) ?? "");
            return (
              <div key={f.code} className="grid grid-cols-[2fr_1fr_auto] items-center gap-3">
                <span>
                  <span className="block font-bold">{f.nombre}</span>
                  <span className="block text-xs text-slate-600">{generado ? generado.original_filename : `${f.code} · lo prepara IDC con tus datos`}</span>
                </span>
                <span className="flex items-center gap-2 font-bold">
                  <Dot tipo={firmado ? "entiempo" : generado ? "riesgo" : "atrasado"} />
                  {firmado ? "Firmado" : generado ? "Listo para firmar" : "No"}
                </span>
                <span className="w-24 text-center">
                  {generado
                    ? <a href={`/api/documents/${generado.document_id}`} className="inline-block rounded bg-[#5885b1] px-3 py-1 text-xs font-semibold text-white hover:bg-[#3d6a99]">Descargar</a>
                    : <span className="text-xs text-slate-600">Pendiente</span>}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>

      <CapturaDatos expedienteId={expediente.id} dataJson={expediente.data_json} />
    </>
  );
}
