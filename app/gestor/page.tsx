import GestorInicio from "@/components/GestorInicio";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import LocalGestorReview from "@/components/LocalGestorReview";
import { listExpedientes, listGestorPendientes } from "@/lib/data/expedientes";
import { TRAMITE_FV_MT } from "@/lib/etapas";
import { gateActual, semaforoExpediente } from "@/lib/semaforo";

// Datos de ejemplo y estado en el navegador: se omite la validación instantánea (solo aviso de desarrollo)
export const instant = false;

export default async function Page() {
  const user = await requireRole("coordinador_idc");
  if (user?.mustChangePassword) redirect("/cambiar-contrasena");
  if (getAppMode() !== "local" || !user) return <GestorInicio />;

  // Mismo tablero que la demo, con expedientes y pendientes reales (objetos simples para el cliente).
  const proyectos = listExpedientes(user).map((expediente) => {
    const data = JSON.parse(expediente.data_json) as { solicitante?: { nombre_razon_social?: string }; central?: { capacidad_bruta_kw?: number } };
    const kw = data.central?.capacidad_bruta_kw;
    const semaforo = semaforoExpediente(expediente.gates, expediente.requirements);
    return {
      folio: expediente.folio,
      proyecto: kw ? `Central FV ${kw} kW` : "Central FV",
      cliente: data.solicitante?.nombre_razon_social || expediente.cliente_nombre,
      tramite: expediente.tramite === TRAMITE_FV_MT ? "Interconexión FV MT" : expediente.tramite,
      estatus: semaforo.estatus,
      gate: gateActual(expediente.gates),
    };
  });
  const pendientes = listGestorPendientes(user, "all").slice(0, 6).map((item, index) => ({
    id: `${item.kind}-${item.expedienteId}-${item.requirementCode ?? index}`,
    titulo: item.label,
    folio: item.folio,
    urgente: item.kind === "observado" || item.kind === "sin_responsable",
  }));
  return (
    <>
      <GestorInicio proyectos={proyectos} pendientes={pendientes} datosReales />
      <LocalGestorReview usuarioId={user.id} />
    </>
  );
}
