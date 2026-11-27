"use client";

type Requirement = {
  requirement_code: string;
  name: string;
  status: string;
  tipo: string;
  integra: string;
  updated_at?: string;
  observations: Array<{ visibility: string; body: string }>;
};
type Reproceso = { fecha: string; mensaje: string; requirementCodes: string[] };
const REQUIREMENT_CODES = Array.from({ length: 11 }, (_, index) => `R${String(index + 1).padStart(2, "0")}`);

function estado(status: string) {
  if (["validado_idc", "no_aplica_justificado", "escaneo_verificado_idc"].includes(status)) return "🟢 Validado";
  if (["cargado", "en_revision_idc", "escaneo_recibido", "pdf_generado", "pendiente_firma_presencial"].includes(status)) return "🟡 En revisión IDC";
  if (status === "observado") return "🔴 Observado";
  return "⚪ Pendiente de subir";
}

function responsable(item: Requirement) {
  if (item.tipo === "generado") return "IDC prepara · Cliente firma";
  if (item.integra === "Cliente" && ["carga", "carga_sensible"].includes(item.tipo)) return "Cliente";
  return "IDC";
}

export default function ReprocesoCfe({ reproceso, requirements, gestor, subir, ocupado }: {
  reproceso: Reproceso;
  requirements: Requirement[];
  gestor: boolean;
  subir?: (item: Requirement, file: File) => void;
  ocupado?: boolean;
}) {
  const itemsForCode = (code: string) => requirements.find((item) => item.requirement_code === code);
  const items = REQUIREMENT_CODES
    .filter((code) => reproceso.requirementCodes.includes(code))
    .map(itemsForCode)
    .filter((item): item is Requirement => Boolean(item));
  const allItems = REQUIREMENT_CODES.map(itemsForCode).filter((item): item is Requirement => Boolean(item));
  const corregidos = items.filter((item) => estado(item.status).startsWith("🟢")).length;
  const revision = items.filter((item) => estado(item.status).startsWith("🟡")).length;
  const retroalimentacion = (item: Requirement) => item.observations.find((observation) => observation.visibility === "cliente")?.body ?? "—";
  const notaInterna = (item: Requirement) => item.observations.find((observation) => observation.visibility === "interno_idc")?.body ?? "—";
  return <section className="my-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm">
    <h3 className="font-bold">{gestor ? "Reproceso CFE" : `CFE pidió correcciones el ${reproceso.fecha.slice(0, 10)}`}</h3>
    <p>{reproceso.mensaje}</p>
    <p className="my-2 font-semibold">CFE observó {items.length} documentos · {corregidos} corregidos · {revision} en revisión · {items.length - corregidos - revision} pendientes</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Documento</th><th>Semáforo</th><th>Última retroalimentación visible</th>{gestor && <th>Nota interna</th>}<th>Le toca a</th>{gestor && <th>Última actualización</th>}{!gestor && <th>Acción</th>}</tr></thead>
      <tbody>{items.map((item) => <tr key={item.requirement_code} className="border-t border-amber-200">
        <td className="p-1">{item.requirement_code} · {item.name}</td><td className="p-1">{estado(item.status)}</td>
        <td className="p-1">{item.observations.find((observation) => observation.visibility === "cliente")?.body ?? "—"}</td>
        {gestor && <td className="p-1">{item.observations.find((observation) => observation.visibility === "interno_idc")?.body ?? "—"}</td>}
        <td className="p-1">{responsable(item)}</td>{gestor && <td className="p-1">{item.updated_at?.slice(0, 10) ?? "—"}</td>}
        {!gestor && <td className="p-1">{responsable(item) === "Cliente" && !estado(item.status).startsWith("🟢") ? <label className="cursor-pointer underline">Subir<input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={ocupado} aria-label={`Subir ${item.name}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) subir?.(item, file); }} /></label> : responsable(item) === "Cliente" ? "Listo" : "Lo corrige IDC"}</td>}
      </tr>)}</tbody></table></div>
    <details data-testid="reproceso-documentos-completos" className="mt-3 rounded border border-amber-300 bg-white">
      <summary className="w-fit cursor-pointer rounded bg-[#0d1f33] px-3 py-1.5 font-semibold text-white">Ver los 11 documentos</summary>
      <div className="overflow-x-auto p-2">
        <table className="w-full text-left text-xs">
          <thead><tr><th>Documento</th><th>Semáforo</th><th>Última retroalimentación visible</th>{gestor && <th>Nota interna</th>}<th>Le toca a</th><th>Última actualización</th></tr></thead>
          <tbody>{allItems.map((item) => <tr key={item.requirement_code} className="border-t border-amber-200">
            <td className="p-1">{item.requirement_code} · {item.name}</td>
            <td className="p-1">{estado(item.status)}</td>
            <td className="p-1">{retroalimentacion(item)}</td>
            {gestor && <td className="p-1">{notaInterna(item)}</td>}
            <td className="p-1">{responsable(item)}</td>
            <td className="p-1">{item.updated_at?.slice(0, 10) ?? "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}
