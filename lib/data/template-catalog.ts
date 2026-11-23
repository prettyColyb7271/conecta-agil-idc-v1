import catalog from "@/templates/marcas.catalogo.json";

export type CatalogFormat = { marks: string[]; required: string[] };
export type Catalog = {
  formats: Record<string, CatalogFormat>;
  cycles?: Record<string, { itemMarks: string[] }> | Array<{ nombre: string; campos: string[] }>;
  ciclos?: Array<{ nombre: string; campos: string[] }>;
};
export const MARK_CATALOG = catalog as Catalog;

export class CatalogValidationError extends Error {}

export function extractTemplateMarks(document: string): string[] {
  return [...document.matchAll(/\{\{\s*([#/]?)([A-Za-z_][\w.]*)\s*\}\}/g)].map((match) => `${match[1]}${match[2]}`);
}

export function validateTemplateMarks(document: string, code: string): { marks: string[]; warnings: string[] } {
  const definition = MARK_CATALOG.formats[code];
  if (!definition) throw new CatalogValidationError(`Formato sin catálogo: ${code}`);
  const marks = extractTemplateMarks(document);
  const allowed = new Set(definition.marks);
  const sourceCycles = MARK_CATALOG.ciclos ?? MARK_CATALOG.cycles ?? [];
  const cycles = Array.isArray(sourceCycles)
    ? sourceCycles.map((cycle) => ({ name: cycle.nombre, itemMarks: cycle.campos }))
    : Object.entries(sourceCycles).map(([name, cycle]) => ({ name, itemMarks: cycle.itemMarks }));
  for (const cycle of cycles) allowed.add(`#${cycle.name}`);
  for (const mark of marks) {
    const normalized = mark.replace(/^[/#]/, "");
    if (!allowed.has(mark) && !allowed.has(normalized) && !cycles.some((item) => item.itemMarks.includes(normalized))) {
      throw new CatalogValidationError(`Marca desconocida en ${code}: ${mark}`);
    }
  }
  const present = new Set(marks.map((mark) => mark.replace(/^[/#]/, "")));
  return { marks, warnings: definition.required.filter((required) => !present.has(required)).map((required) => `Falta marca requerida: ${required}`) };
}
