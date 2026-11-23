import { requireRole } from "@/lib/auth";
import { listExpedientes } from "@/lib/data/expedientes";

export const instant = false;

export default async function GestorCfeInicio() {
  const user = await requireRole("gestor_tramites_cfe");
  if (!user) return null;
  const expedientes = listExpedientes(user);
  return (
    <section className="space-y-3 rounded-sm bg-[#b6cde3] p-6 text-[#0d1f33]">
      <h2 className="text-xl font-bold">Mis expedientes</h2>
      {expedientes.length === 0 ? <p className="text-sm">No tienes expedientes asignados.</p> : expedientes.map((expediente) => (
        <article key={expediente.id} className="rounded bg-white p-3 text-sm">
          <p className="font-bold">{expediente.folio} · {expediente.tramite}</p>
          <p>Cliente: {expediente.cliente_nombre} · Estado: {expediente.status}</p>
          <p>Gate actual: {expediente.gates.find((gate) => gate.status === "abierto")?.gate_code ?? "—"}</p>
          <details className="mt-2"><summary className="cursor-pointer font-semibold">Datos del expediente (solo lectura)</summary><pre className="mt-1 overflow-auto text-xs">{expediente.data_json}</pre></details>
        </article>
      ))}
    </section>
  );
}
