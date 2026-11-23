import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { getDatabase } from "@/lib/db/sqlite";

export const DOCX_FORMATS = ["F-02", "F-03", "F-04", "F-06"] as const;
export type DocxFormat = typeof DOCX_FORMATS[number];
export const TEMPLATE_FIELDS = [
  "folio", "fecha", "cliente.nombre", "cliente.rfc", "cliente.domicilio", "cliente.correo",
  "apoderado.nombre", "apoderado.cargo", "rpu", "tarifa", "tension", "tramite",
  "responsable.nombre", "responsable.correo", "enlace_cfe", "requisitos",
] as const;
const FILES: Record<DocxFormat, string> = {
  "F-02": "F-02_carta_poder.docx", "F-03": "F-03_carta_poder_uiie.docx",
  "F-04": "F-04_ficha.docx", "F-06": "F-06_caratula.docx",
};

export class TemplateValidationError extends Error {}

function assertSafeDocx(bytes: Buffer, filename: string): void {
  if (!filename.toLowerCase().endsWith(".docx") || filename.toLowerCase().endsWith(".docm")) throw new TemplateValidationError("Solo se aceptan plantillas DOCX sin macros.");
  if (bytes.length > 5 * 1024 * 1024) throw new TemplateValidationError("La plantilla excede 5 MB.");
  let zip: PizZip;
  try { zip = new PizZip(bytes); } catch { throw new TemplateValidationError("El archivo no es un ZIP DOCX válido."); }
  if (zip.file("vbaProject.bin") || zip.file("[Content_Types].xml")?.asText().includes("macroEnabled")) throw new TemplateValidationError("No se permiten macros.");
  const document = zip.file("word/document.xml")?.asText();
  if (!document) throw new TemplateValidationError("Falta word/document.xml.");
  if (/\{\{[^}]*$|\{\{[^}]*<w:br|\{\{[^}]*<w:tab/.test(document)) throw new TemplateValidationError("La plantilla contiene etiquetas divididas entre nodos.");
}

export async function renderDocx(code: DocxFormat, data: Record<string, unknown>, templateBytes?: Buffer) {
  const file = FILES[code];
  const bytes = templateBytes ?? await fs.readFile(path.join(process.cwd(), "templates", file));
  assertSafeDocx(bytes, file);
  const zip = new PizZip(bytes);
  const cliente = typeof data.cliente === "object" && data.cliente ? data.cliente as Record<string, unknown> : { nombre: data.cliente };
  const values: Record<string, unknown> = {
    folio: data.folio || "______", fecha: data.fecha || "______", tramite: data.tramite || "______",
    rpu: data.rpu || "______", tarifa: data.tarifa || "______", tension: data.tension || "______",
    enlace_cfe: data.enlace_cfe || "______", cliente: { nombre: cliente.nombre || "______", rfc: cliente.rfc || "______", domicilio: cliente.domicilio || "______", correo: cliente.correo || "______" },
    apoderado: { nombre: "______", cargo: "______" }, responsable: { nombre: "______", correo: "______" },
    requisitos: Array.isArray(data.requisitos) ? data.requisitos : [],
  };
  const missing = TEMPLATE_FIELDS.filter((field) => {
    if (field === "requisitos") return false;
    const [section, key] = field.split(".");
    const value = key ? (values[section] as Record<string, unknown>)?.[key] : values[field];
    return String(value ?? "").trim() === "______" || String(value ?? "").trim() === "";
  });
  try {
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{{", end: "}}" } });
    doc.render(values);
    return { bytes: doc.getZip().generate({ type: "nodebuffer" }) as Buffer, missing };
  } catch (error) {
    throw new TemplateValidationError(`No se pudo procesar ${code}: ${error instanceof Error ? error.message : "etiquetas inválidas"}`);
  }
}

export function templateHash(bytes: Buffer): string { return crypto.createHash("sha256").update(bytes).digest("hex"); }
export function listTemplates() {
  return getDatabase().prepare("SELECT code, filename, version, sha256, active, created_at FROM templates ORDER BY code, version DESC").all();
}
export { assertSafeDocx };
