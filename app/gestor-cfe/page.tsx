import { requireRole } from "@/lib/auth";
import { listExpedientes } from "@/lib/data/expedientes";

export const instant = false;

export default async function GestorCfeInicio() {
  const user = await requireRole("gestor_tramites_cfe");
  if (!user) return null;
  const expedientes = listExpedientes(user).map((expediente) => {
    const data = JSON.parse(expediente.data_json) as { solicitante?: { nombre_razon_social?: string; tipo_persona?: string; rfc?: string }; servicio_actual?: { rpu?: string; tarifa?: string }; central?: { tecnologia?: string; capacidad_bruta_kw?: number } };
    const short = (value: string | undefined) => (value ?? "—").slice(0, 300);
    return {
      id: expediente.id, folio: expediente.folio, tramite: expediente.tramite, status: expediente.status,
      cliente_nombre: expediente.cliente_nombre, gates: expediente.gates,
      solicitante: short(data.solicitante?.nombre_razon_social),
      tipo_persona: short(data.solicitante?.tipo_persona),
      rfc: short(data.solicitante?.rfc), rpu: short(data.servicio_actual?.rpu),
      tarifa: short(data.servicio_actual?.tarifa), tecnologia: short(data.central?.tecnologia),
      capacidad: data.central?.capacidad_bruta_kw ?? "—",
    };
  });
  return (
    <section className="space-y-3 rounded-sm bg-[#b6cde3] p-6 text-[#0d1f33]">
      <h2 className="text-xl font-bold">Mis expedientes</h2>
      {expedientes.length === 0 ? <p className="text-sm">No tienes expedientes asignados.</p> : expedientes.map((expediente) => (
        <article key={expediente.id} className="rounded bg-white p-3 text-sm">
          <p className="font-bold">{expediente.folio} · {expediente.tramite}</p>
          <p>Cliente: {expediente.cliente_nombre} · Estado: {expediente.status}</p>
          <p>Gate actual: {expediente.gates.find((gate) => gate.status === "abierto")?.gate_code ?? "—"}</p>
          <details className="mt-2"><summary className="cursor-pointer font-semibold">Datos principales (solo lectura)</summary>
            <div className="mt-1 text-xs"><p>Solicitante: {expediente.solicitante} ({expediente.tipo_persona})</p><p>RFC: {expediente.rfc} · RPU: {expediente.rpu} · Tarifa: {expediente.tarifa}</p><p>Central: {expediente.tecnologia} · {expediente.capacidad} kW</p></div>
          </details>
        </article>
      ))}
    </section>
  );
}
