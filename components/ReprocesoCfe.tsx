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
  const items = requirements.filter((item) => reproceso.requirementCodes.includes(item.requirement_code)).sort((a, b) => a.requirement_code.localeCompare(b.requirement_code));
  const corregidos = items.filter((item) => estado(item.status).startsWith("🟢")).length;
  const revision = items.filter((item) => estado(item.status).startsWith("🟡")).length;
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
  </section>;
}
