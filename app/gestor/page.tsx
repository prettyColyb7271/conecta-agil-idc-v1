import GestorInicio from "@/components/GestorInicio";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getAppMode } from "@/lib/adapters/config";
import LocalGestorReview from "@/components/LocalGestorReview";
import { listExpedientes, listGestorPendientes, type ExpedienteView } from "@/lib/data/expedientes";
import { ETAPAS, TRAMITE_FV_MT } from "@/lib/etapas";
import { gateActual, semaforoExpediente } from "@/lib/semaforo";
import { alertaVigenciaOficio } from "@/lib/vigencia-oficio";

// Datos de ejemplo y estado en el navegador: se omite la validación instantánea (solo aviso de desarrollo)
export const instant = false;

function promedioDias(expedientes: ExpedienteView[], eventType: "ingreso_acuse" | "alta_comercial"): number | null {
  const muestras = expedientes.flatMap((expediente) => {
    const eventos = expediente.external_events ?? [];
    const candidatos = eventos.filter((evento) => evento.event_type === eventType);
    const evento = eventType === "ingreso_acuse"
      ? (() => {
        const ultimoReproceso = Math.max(0, ...eventos.filter((item) => item.event_type === "cfe_incompleto").map((item) => item.sequence));
        return candidatos.filter((item) => item.sequence > ultimoReproceso).sort((a, b) => a.sequence - b.sequence)[0];
      })()
      : candidatos.sort((a, b) => a.sequence - b.sequence)[0];
    if (!evento) return [];
    const inicio = Date.parse(expediente.created_at);
    const fin = Date.parse(evento.event_date);
    return Number.isFinite(inicio) && Number.isFinite(fin) ? [Math.max(0, (fin - inicio) / 86400000)] : [];
  });
  return muestras.length ? Number((muestras.reduce((sum, dias) => sum + dias, 0) / muestras.length).toFixed(1)) : null;
}

export default async function Page() {
  const user = await requireRole("coordinador_idc");
  if (user?.mustChangePassword) redirect("/cambiar-contrasena");
  if (getAppMode() !== "local" || !user) {
    const demo = await import("@/data/mock");
    return <GestorInicio proyectos={demo.proyectos} pendientes={demo.pendientesGestor} datosDemo={{ metas: demo.metas, tendencia: demo.tendencia }} />;
  }

  // Mismo tablero que la demo, con expedientes y pendientes reales (objetos simples para el cliente).
  const expedientes = listExpedientes(user);
  const proyectos = expedientes.map((expediente) => {
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
      alertaVigencia: alertaVigenciaOficio(expediente.gates, expediente.external_events ?? []),
    };
  });
  const conteosSemaforo = {
    entiempo: proyectos.filter((item) => item.estatus === "entiempo").length,
    riesgo: proyectos.filter((item) => item.estatus === "riesgo").length,
    atrasado: proyectos.filter((item) => item.estatus === "atrasado").length,
  };
  const indicadores = {
    totalExpedientes: expedientes.length,
    porGate: ETAPAS.map((etapa, index) => ({
      gate: index + 1,
      nombre: etapa.nombre,
      total: proyectos.filter((item) => item.gate === index + 1).length,
    })),
    semaforo: conteosSemaforo,
    diasAcuse: promedioDias(expedientes, "ingreso_acuse"),
    diasAlta: promedioDias(expedientes, "alta_comercial"),
    rechazosPrimera: expedientes.filter((expediente) => expediente.external_events?.some((item) => item.event_type === "cfe_incompleto")).length,
  };
  const pendientes = listGestorPendientes(user, "all").slice(0, 6).map((item, index) => ({
    id: `${item.kind}-${item.expedienteId}-${item.requirementCode ?? index}`,
    titulo: item.label,
    folio: item.folio,
    urgente: item.kind === "observado" || item.kind === "sin_responsable",
  }));
  return (
    <>
      <GestorInicio proyectos={proyectos} pendientes={pendientes} datosReales indicadores={indicadores} />
      <LocalGestorReview usuarioId={user.id} />
    </>
  );
}
