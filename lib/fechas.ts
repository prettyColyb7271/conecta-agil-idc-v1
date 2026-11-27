export function sumarMesesCalendario(fecha: string | Date, meses: number): Date {
  const original = new Date(fecha);
  if (!Number.isFinite(original.getTime())) throw new RangeError("La fecha no es válida.");
  if (!Number.isInteger(meses)) throw new RangeError("Los meses deben ser un número entero.");

  const dia = original.getUTCDate();
  const destino = new Date(original);
  destino.setUTCDate(1);
  destino.setUTCMonth(destino.getUTCMonth() + meses);
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(dia, ultimoDia));
  return destino;
}

export function formatoFecha(fecha: string | Date): string {
  const date = fecha instanceof Date ? fecha : new Date(fecha);
  if (!Number.isFinite(date.getTime())) throw new RangeError("La fecha no es válida.");
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
