import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { getDatabase } from "@/lib/db/sqlite";
import { CatalogValidationError, requiredMarksForFormat, validateTemplateMarks } from "@/lib/data/template-catalog";
export { extractTemplateMarks, MARK_CATALOG } from "@/lib/data/template-catalog";

export const DOCX_FORMATS = ["F-02", "F-03", "F-04", "F-06"] as const;
export const TEMPLATE_CODES = ["F-02", "F-03", "F-04", "F-05", "F-06"] as const;
export type DocxFormat = typeof DOCX_FORMATS[number];
const FILES: Record<string, string> = {
  "F-02": "F-02_carta_poder.docx", "F-03": "F-03_carta_poder_uiie.docx",
  "F-04": "F-04_ficha.docx", "F-06": "F-06_caratula.docx",
  "F-05": "F-05_memoria_calculo.docx",
};

export class TemplateValidationError extends Error {}


function assertSafeDocx(bytes: Buffer, filename: string, expectedCode?: string): void {
  if (!filename.toLowerCase().endsWith(".docx") || filename.toLowerCase().endsWith(".docm")) throw new TemplateValidationError("Solo se aceptan plantillas DOCX sin macros.");
  if (bytes.length > 5 * 1024 * 1024) throw new TemplateValidationError("La plantilla excede 5 MB.");
  let zip: PizZip;
  try { zip = new PizZip(bytes); } catch { throw new TemplateValidationError("El archivo no es un ZIP DOCX válido."); }
  if (zip.file("vbaProject.bin") || zip.file("[Content_Types].xml")?.asText().includes("macroEnabled")) throw new TemplateValidationError("No se permiten macros.");
  const document = zip.file("word/document.xml")?.asText();
  if (!document) throw new TemplateValidationError("Falta word/document.xml.");
  if (/\{\{[^}]*$|\{\{[^}]*<w:br|\{\{[^}]*<w:tab/.test(document)) throw new TemplateValidationError("La plantilla contiene etiquetas divididas entre nodos.");
  const code = expectedCode ?? Object.entries(FILES).find(([, name]) => name === filename)?.[0];
  if (code) {
    try { validateTemplateMarks(document, code); }
    catch (error) { throw new TemplateValidationError(error instanceof CatalogValidationError ? error.message : "Catálogo de marcas inválido."); }
  }
}

export async function renderDocx(code: DocxFormat, data: Record<string, unknown>, templateBytes?: Buffer) {
  const file = FILES[code];
  const bytes = templateBytes ?? await fs.readFile(path.join(process.cwd(), "templates", file));
  assertSafeDocx(bytes, file);
  const zip = new PizZip(bytes);
  const cliente = typeof data.cliente === "object" && data.cliente ? data.cliente as Record<string, unknown> : { nombre: data.cliente };
  const rawDocuments = Array.isArray(data.documentos) ? data.documentos : (Array.isArray(data.lista) ? data.lista : (Array.isArray(data.requisitos) ? data.requisitos : []));
  const documents = rawDocuments.map((item) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      documento: {
        codigo: source.codigo ?? source.code ?? source.id ?? "______",
        estado: source.estado ?? source.status ?? "______",
        nombre: source.nombre ?? source.name ?? "______",
        paginas: source.paginas ?? source.pages ?? "______",
        rpu: source.rpu ?? "______",
        sha256_corto: source.sha256_corto ?? source.sha256 ?? "______",
      },
    };
  });
  const responsableCliente = typeof data.responsable_cliente === "object" && data.responsable_cliente ? data.responsable_cliente as Record<string, unknown> : {};
  const responsableCfe = typeof data.responsable_cfe === "object" && data.responsable_cfe ? data.responsable_cfe as Record<string, unknown> : {};
  const servicio = typeof data.servicio === "object" && data.servicio ? data.servicio as Record<string, unknown> : {};
  const central = typeof data.central === "object" && data.central ? data.central as Record<string, unknown> : {};
  const expediente = typeof data.expediente === "object" && data.expediente ? data.expediente as Record<string, unknown> : {};
  const values: Record<string, unknown> = {
    expediente: { folio: expediente.folio ?? data.folio ?? "______", fecha: expediente.fecha ?? data.fecha ?? "______", tramite: expediente.tramite ?? data.tramite ?? "______" },
    cliente: { nombre: cliente.nombre || "______", tipo_persona: cliente.tipo_persona || "______", rfc: cliente.rfc || "______", domicilio: cliente.domicilio || "______", correo: cliente.correo || "______" },
    firma: { lugar: data.lugar || "______", fecha_corta: data.fecha || "______", fecha_larga: data.fecha || "______" },
    apoderado: { nombre: (data.apoderado as Record<string, unknown> | undefined)?.nombre || "______" },
    testigo1: { nombre: (data.testigo1 as Record<string, unknown> | undefined)?.nombre || "______" },
    testigo2: { nombre: (data.testigo2 as Record<string, unknown> | undefined)?.nombre || "______" },
    servicio: { rpu: servicio.rpu ?? data.rpu ?? "______", tarifa: servicio.tarifa ?? data.tarifa ?? "______", domicilio: servicio.domicilio ?? "______" },
    central: { tension: central.tension ?? data.tension ?? "______", tecnologia: central.tecnologia ?? data.tecnologia ?? "______", capacidad_kw: central.capacidad_kw ?? data.capacidad_kw ?? "______" },
    responsable_cliente: { nombre: responsableCliente.nombre ?? "______", correo: responsableCliente.correo ?? "______", telefono: responsableCliente.telefono ?? "______" },
    responsable_cfe: { nombre: responsableCfe.nombre ?? data.enlace_cfe ?? "______", correo: responsableCfe.correo ?? data.enlace_cfe_correo ?? "______" },
    gestor: data.gestor ?? { nombre: "______" },
    ingeniero: data.ingeniero ?? { nombre: "______" },
    plantilla: { version: data.template_version ?? "______" },
    documentos: documents,
  };
  const missing = requiredMarksForFormat(code).filter((field) => {
    const [section, key] = field.split(".");
    const value = key ? (values[section] as Record<string, unknown> | undefined)?.[key] : values[field];
    return String(value ?? "").trim() === "______" || String(value ?? "").trim() === "";
  });
  try {
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true, linebreaks: true, delimiters: { start: "{{", end: "}}" },
      nullGetter: () => "______",
      parser: (tag: string) => {
        const parts = tag.trim().split(".");
        return { get: (scope: Record<string, unknown>) => parts.reduce<unknown>((value, part) => value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, scope) };
      },
    });
    doc.render(values);
    return { bytes: doc.getZip().generate({ type: "nodebuffer" }) as Buffer, missing };
  } catch (error) {
    throw new TemplateValidationError(`No se pudo procesar ${code}: ${error instanceof Error ? error.message : "etiquetas inválidas"}`);
  }
}

export function templateHash(bytes: Buffer): string { return crypto.createHash("sha256").update(bytes).digest("hex"); }
export function listTemplates() {
  return getDatabase().prepare("SELECT id, code, filename, version, sha256, active, created_at FROM templates ORDER BY code, version DESC").all();
}
export { assertSafeDocx };
