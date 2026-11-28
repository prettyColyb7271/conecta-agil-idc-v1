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

export function formatoFechaHora(fecha: string | Date): string {
  const date = fecha instanceof Date ? fecha : new Date(fecha);
  if (!Number.isFinite(date.getTime())) throw new RangeError("La fecha no es válida.");
  const values = Object.fromEntries(new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Hermosillo",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${values.day}/${values.month}/${values.year} ${values.hour}:${values.minute}`;
}

export function inicioDiaHermosillo(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new RangeError("La fecha no es válida.");
  const date = new Date(`${fecha}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fecha) {
    throw new RangeError("La fecha no es válida.");
  }

  const zonedParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Hermosillo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  const zonedAsUtc = Date.UTC(
    Number(zonedParts.year),
    Number(zonedParts.month) - 1,
    Number(zonedParts.day),
    Number(zonedParts.hour),
    Number(zonedParts.minute),
    Number(zonedParts.second),
  );
  return new Date(date.getTime() - (zonedAsUtc - date.getTime())).toISOString();
}
