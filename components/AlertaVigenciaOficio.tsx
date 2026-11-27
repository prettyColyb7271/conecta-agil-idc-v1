import { textoAlertaVigenciaOficio, type AlertaVigenciaOficio as Alerta } from "@/lib/vigencia-oficio";

export default function AlertaVigenciaOficio({ alerta, esGestor = false }: { alerta: Alerta; esGestor?: boolean }) {
  const texto = textoAlertaVigenciaOficio(alerta, esGestor);

  return (
    <p
      role={alerta.nivel === "roja" ? "alert" : "status"}
      className={`mt-2 rounded border px-2 py-1 text-xs font-bold ${alerta.nivel === "roja" ? "border-red-500 bg-red-50 text-red-900" : "border-sky-400 bg-sky-50 text-sky-900"}`}
    >
      {texto}
    </p>
  );
}
