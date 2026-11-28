"use client";

import Link from "next/link";
import { useState } from "react";
import PortalInicio, { type Aviso } from "./PortalClient";
import { TRAMITE_FV_MT, TRAMITE_FV_MT_LABEL } from "@/lib/etapas";
import { documentosDelCliente, type RequisitoCliente } from "@/lib/portal-cliente";
import { gateActual, semaforoExpediente } from "@/lib/semaforo";
import { Panel } from "@/components/ui";
import { alertaVigenciaOficio } from "@/lib/vigencia-oficio";
import AlertaVigenciaOficioBanner from "@/components/AlertaVigenciaOficio";
import { traducirGateMensaje } from "@/lib/gate-display";
import { formatoFecha } from "@/lib/fechas";
import { AVISO_RESUMEN, AVISO_VERSION } from "@/lib/privacidad";

type Props = {
  expediente: {
    id: string; folio: string; tramite: string; status: string;
    privacy_accepted_at: string | null;
    privacy_accepted_version: string | null;
    reproceso_cfe: { fecha: string; mensaje: string; requirementCodes: string[] } | null;
    gates: Array<{ gate_code: string; status: string }>;
    external_events?: Array<{ event_type: string; event_date: string; sequence: number; resultado: string | null; vence_at: string | null }>;
    requirements: Array<{ requirement_code: string; name: string; status: string }>;
  } | null;
  review: RequisitoCliente[];
};

// Inicio del cliente en modo local: mismo diseño que la demo, con datos reales del expediente.
export default function LocalPortal({ expediente, review }: Props) {
  const [avisoLeido, setAvisoLeido] = useState(false);
  const [aceptandoAviso, setAceptandoAviso] = useState(false);
  const [errorAviso, setErrorAviso] = useState("");
  if (!expediente) return <Panel title="Mi expediente"><p className="text-sm">Aún no tienes expediente asignado.</p></Panel>;
  const current = expediente;
  const requiereAviso = current.privacy_accepted_version !== AVISO_VERSION;

  async function aceptarAviso() {
    setErrorAviso("");
    setAceptandoAviso(true);
    try {
      const response = await fetch(`/api/expedientes/${current.id}/privacy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: AVISO_VERSION }) });
      if (response.ok) {
        window.location.reload();
        return;
      }
      setErrorAviso(traducirGateMensaje(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "No fue posible aceptar el aviso."));
    } catch {
      setErrorAviso("No hay conexión con el servidor. Inténtalo de nuevo.");
    } finally {
      setAceptandoAviso(false);
    }
  }

  const { documentos, puedeSubir } = documentosDelCliente(review, expediente.gates);
  const notificaciones: Aviso[] = review
    .filter((item) => item.status === "observado")
    .map((item) => ({
      id: `obs-${item.requirement_code}`,
      titulo: `Falta información en ${item.name}`,
      archivo: item.observations.find((observation) => observation.visibility === "cliente")?.body ?? item.requirement_code,
      urgente: true,
      href: "/portal/formatos",
    }));
  if (expediente.reproceso_cfe) notificaciones.unshift({ id: "cfe-reproceso", titulo: `CFE pidió correcciones el ${formatoFecha(expediente.reproceso_cfe.fecha)}`, archivo: expediente.reproceso_cfe.mensaje, urgente: true, href: "/portal/formatos" });
  const pendientes: Aviso[] = [
    ...(requiereAviso ? [{ id: "aviso", titulo: "Aceptar el aviso de privacidad", archivo: "Necesario para que IDC inicie tu trámite", urgente: true }] : []),
    ...review
      .filter((item) => item.status === "pendiente_firma_presencial")
      .map((item) => ({ id: `firma-${item.requirement_code}`, titulo: `Firmar ${item.name} en la cita única`, archivo: item.requirement_code, urgente: true, href: "/portal/formatos" })),
    ...documentos
      .filter((item) => puedeSubir(item) && ["requerido", "en_captura", "invalidado_por_cambio", "vencido"].includes(item.status))
      .map((item) => ({ id: `doc-${item.requirement_code}`, titulo: `Subir ${item.name}`, archivo: item.requirement_code, urgente: false, href: "/portal/formatos" })),
  ];
  const semaforo = semaforoExpediente(expediente.gates, expediente.requirements);
  const tramite = expediente.tramite === TRAMITE_FV_MT ? TRAMITE_FV_MT_LABEL : expediente.tramite;
  const alerta = alertaVigenciaOficio(expediente.gates, expediente.external_events ?? []);
  const extra = (
    <>
      {alerta && <AlertaVigenciaOficioBanner alerta={alerta} />}
      {requiereAviso && (
        <section className="space-y-3 rounded border border-amber-500 bg-amber-50 p-3 text-sm text-[#0d1f33]" aria-labelledby="privacy-consent-title">
          <div>
            <h2 id="privacy-consent-title" className="font-bold">Aviso de privacidad · versión {AVISO_VERSION}</h2>
            {current.privacy_accepted_at
              ? <p className="mt-1">Hay una nueva versión del aviso de privacidad. Léela y acéptala para continuar usando la plataforma.</p>
              : <p className="mt-1">Lee y acepta el aviso para que IDC pueda iniciar tu trámite.</p>}
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {AVISO_RESUMEN.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <Link href="/privacidad" className="inline-block font-semibold underline">Leer el aviso completo</Link>
          <label className="flex items-start gap-2 font-semibold">
            <input type="checkbox" checked={avisoLeido} onChange={(event) => setAvisoLeido(event.target.checked)} className="mt-1 h-4 w-4 shrink-0" />
            <span>Leí y acepto el aviso de privacidad (versión {AVISO_VERSION}).</span>
          </label>
          {errorAviso && <p role="alert" className="font-semibold text-red-700">{errorAviso}</p>}
          <button type="button" disabled={!avisoLeido || aceptandoAviso} onClick={() => void aceptarAviso()} className="rounded bg-[#0d1f33] px-3 py-1.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Aceptar</button>
        </section>
      )}
    </>
  );

  return (
    <PortalInicio
      folio={expediente.folio}
      tramite={tramite}
      notificaciones={notificaciones}
      pendientes={pendientes}
      procesos={[{ id: "fv", nombre: "Interconexión FV en MT", archivo: expediente.folio, estatus: semaforo.estatus, detalle: semaforo.detalle, gate: gateActual(expediente.gates) }]}
      modoDemo={false}
      extra={extra}
    />
  );
}
