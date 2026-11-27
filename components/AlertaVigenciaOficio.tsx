import type { AlertaVigenciaOficio as Alerta } from "@/lib/vigencia-oficio";

export default function AlertaVigenciaOficio({ alerta }: { alerta: Alerta }) {
  const fecha = new Date(alerta.venceAt).toISOString().slice(0, 10);
  const texto = alerta.diasRestantes < 0
    ? `Vencido hace ${Math.abs(alerta.diasRestantes)} días`
    : alerta.diasRestantes <= 10
      ? `Vence en ${alerta.diasRestantes} días`
      : `El oficio vence el ${fecha}; quedan ${alerta.diasRestantes} días.`;

  return (
    <p
      role={alerta.nivel === "roja" ? "alert" : "status"}
      className={`mt-2 rounded border px-2 py-1 text-xs font-bold ${alerta.nivel === "roja" ? "border-red-500 bg-red-50 text-red-900" : "border-sky-400 bg-sky-50 text-sky-900"}`}
    >
      {texto} · Fecha límite: {fecha}
    </p>
  );
}
