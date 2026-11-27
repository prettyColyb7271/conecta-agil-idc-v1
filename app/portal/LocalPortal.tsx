"use client";

import PortalInicio, { type Aviso } from "./PortalClient";
import { TRAMITE_FV_MT, TRAMITE_FV_MT_LABEL } from "@/lib/etapas";
import { documentosDelCliente, type RequisitoCliente } from "@/lib/portal-cliente";
import { gateActual, semaforoExpediente } from "@/lib/semaforo";
import { Panel } from "@/components/ui";

type Props = {
  expediente: {
    id: string; folio: string; tramite: string; status: string;
    privacy_accepted_at: string | null;
    reproceso_cfe: { fecha: string; mensaje: string; requirementCodes: string[] } | null;
    gates: Array<{ gate_code: string; status: string }>;
    requirements: Array<{ requirement_code: string; name: string; status: string }>;
  } | null;
  review: RequisitoCliente[];
};

// Inicio del cliente en modo local: mismo diseño que la demo, con datos reales del expediente.
export default function LocalPortal({ expediente, review }: Props) {
  if (!expediente) return <Panel title="Mi expediente"><p className="text-sm">Aún no tienes expediente asignado.</p></Panel>;
  const current = expediente;

  async function aceptarAviso() {
    const response = await fetch(`/api/expedientes/${current.id}/privacy`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "aviso-privacidad-v1" }) });
    if (response.ok) window.location.reload();
    else window.alert(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "No fue posible aceptar el aviso.");
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
  if (expediente.reproceso_cfe) notificaciones.unshift({ id: "cfe-reproceso", titulo: `CFE pidió correcciones el ${expediente.reproceso_cfe.fecha.slice(0, 10)}`, archivo: expediente.reproceso_cfe.mensaje, urgente: true, href: "/portal/formatos" });
  const pendientes: Aviso[] = [
    ...(!expediente.privacy_accepted_at ? [{ id: "aviso", titulo: "Aceptar el aviso de privacidad", archivo: "Necesario para que IDC inicie tu trámite", urgente: true }] : []),
    ...review
      .filter((item) => item.status === "pendiente_firma_presencial")
      .map((item) => ({ id: `firma-${item.requirement_code}`, titulo: `Firmar ${item.name} en la cita única`, archivo: item.requirement_code, urgente: true, href: "/portal/formatos" })),
    ...documentos
      .filter((item) => puedeSubir(item) && ["requerido", "en_captura", "invalidado_por_cambio", "vencido"].includes(item.status))
      .map((item) => ({ id: `doc-${item.requirement_code}`, titulo: `Subir ${item.name}`, archivo: item.requirement_code, urgente: false, href: "/portal/formatos" })),
  ];
  const semaforo = semaforoExpediente(expediente.gates, expediente.requirements);
  const tramite = expediente.tramite === TRAMITE_FV_MT ? TRAMITE_FV_MT_LABEL : expediente.tramite;

  return (
    <PortalInicio
      folio={expediente.folio}
      tramite={tramite}
      notificaciones={notificaciones}
      pendientes={pendientes}
      procesos={[{ id: "fv", nombre: "Interconexión FV en MT", archivo: expediente.folio, estatus: semaforo.estatus, detalle: semaforo.detalle, gate: gateActual(expediente.gates) }]}
      extra={!expediente.privacy_accepted_at && (
        <div className="rounded border border-amber-500 bg-amber-50 p-3 text-sm text-[#0d1f33]">
          <p><b>Aviso de privacidad (texto pendiente de confirmar con IDC)</b></p>
          <p className="mt-1">Acéptalo para que IDC pueda iniciar tu trámite.</p>
          <button onClick={() => void aceptarAviso()} className="mt-2 rounded bg-[#0d1f33] px-3 py-1.5 font-semibold text-white">Aceptar aviso</button>
        </div>
      )}
    />
  );
}
