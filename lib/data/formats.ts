import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFTextField, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { getAdapters } from "@/lib/adapters";
import { getDatabase } from "@/lib/db/sqlite";
import { auditEvent, withTransaction, type AuthUser } from "@/lib/auth";
import { getExpediente } from "@/lib/data/expedientes";
import { renderDocx, type DocxFormat } from "@/lib/data/templates";

export class FormatValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatValidationError";
  }
}

const FORMAT_CODES = ["F-01", "F-02", "F-03", "F-04", "F-05", "F-06"] as const;
export type FormatCode = typeof FORMAT_CODES[number];
const REQUIREMENT_BY_FORMAT: Partial<Record<FormatCode, string>> = { "F-01": "R01", "F-02": "R07", "F-03": "U15", "F-04": "U12", "F-05": "U09" };
const FORMAT_NAMES: Record<FormatCode, string> = {
  "F-01": "Solicitud de interconexión",
  "F-02": "Carta poder para interconexión",
  "F-03": "Carta poder simple para UIIE",
  "F-04": "Ficha de datos y responsables",
  "F-05": "Memoria de cálculo fotovoltaica",
  "F-06": "Carátula e índice del expediente",
};

type Data = Record<string, Record<string, unknown> | unknown>;
function assertIdc(user: AuthUser): void {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map(asText).join(", ");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${asText(item)}`).join(", ");
  return value === undefined || value === null ? "" : String(value);
}

function get(data: Data, section: string, field: string): string {
  const value = data[section];
  return value && typeof value === "object" && !Array.isArray(value) ? asText((value as Record<string, unknown>)[field]) : "";
}

function flat(data: Data): Array<[string, string]> {
  return Object.entries(data).flatMap(([section, raw]) => raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.entries(raw as Record<string, unknown>).map(([field, value]) => [`${section}.${field}`, asText(value)] as [string, string])
    : []);
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): { text: string; truncated: boolean } {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return { text, truncated: false };
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}…`, size) > maxWidth) result = result.slice(0, -1);
  return { text: `${result}…`, truncated: true };
}

function draw(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, maxWidth: number, notices: string[], label: string): void {
  const fitted = truncate(text, font, size, maxWidth);
  if (fitted.truncated) notices.push(`${label} excedía el ancho y fue truncado.`);
  page.drawText(fitted.text, { x, y, size, font, color: rgb(0.05, 0.1, 0.2) });
}

async function f01(data: Data, version: string, folio: string, notices: string[]): Promise<Buffer> {
  const managedPath = path.join(process.cwd(), "templates", "F-01_gestionable.pdf");
  const template = await fs.readFile(managedPath).catch(() => fs.readFile(path.join(process.cwd(), "templates", "F-01_base.pdf")));
  const map = JSON.parse(await fs.readFile(path.join(process.cwd(), "templates", "F-01_campos.json"), "utf8")) as Record<string, { page: number; x: number; y: number; size: number; maxWidth: number }>;
  const pdf = await PDFDocument.load(template);
  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const values: Record<string, string> = {
    tipo_persona: get(data, "solicitante", "tipo_persona"),
    nombre_razon_social: get(data, "solicitante", "nombre_razon_social"),
    rfc: get(data, "solicitante", "rfc"),
    domicilio: get(data, "solicitante", "domicilio"),
    telefono: get(data, "solicitante", "telefono"),
    correo: get(data, "solicitante", "correo"),
    rpu: get(data, "servicio_actual", "rpu"),
    tarifa: get(data, "servicio_actual", "tarifa"),
    nivel_tension_suministro: get(data, "servicio_actual", "nivel_tension_suministro"),
    tecnologia: get(data, "central", "tecnologia"),
    capacidad_bruta_kw: get(data, "central", "capacidad_bruta_kw"),
    utm: get(data, "central", "utm"),
  };
  const fieldNames: Record<string, string> = {
    tipo_persona: "solicitante.tipo_persona", nombre_razon_social: "solicitante.nombre_razon_social",
    rfc: "solicitante.rfc", domicilio: "solicitante.domicilio", telefono: "contacto.telefono",
    correo: "contacto.correo", rpu: "servicio.rpu", tarifa: "servicio.tarifa",
    nivel_tension_suministro: "servicio.nivel_tension_suministro", tecnologia: "central.tecnologia",
    capacidad_bruta_kw: "central.capacidad_kw", utm: "central.utm",
  };
  const form = pdf.getForm();
  for (const [field, position] of Object.entries(map)) {
    const name = fieldNames[field] ?? `solicitud.${field}`;
    const existing = form.getFields().find((candidate) => candidate.getName() === name);
    const textField = existing instanceof PDFTextField ? existing : form.createTextField(name);
    if (!existing) textField.addToPage(pdf.getPages()[position.page] ?? page, {
      x: position.x, y: position.y - 3, width: position.maxWidth, height: position.size + 5,
      borderWidth: 0, textColor: rgb(0.13, 0.44, 0.72), font: await pdf.embedFont(StandardFonts.Helvetica),
    });
    textField.setFontSize(position.size);
    textField.setText(values[field] ?? "");
  }
  form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));
  for (const [field, position] of Object.entries(map)) {
    draw(pdf.getPages()[position.page] ?? page, font, values[field] ?? "", position.x, position.y, position.size, position.maxWidth, notices, field);
  }
  const dataSha = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 12);
  drawFooter(page, font, `Folio ${folio} · versión de datos ${version} · sha256 ${dataSha} · Generado por Conecta Ágil`, notices);
  return Buffer.from(await pdf.save());
}

function drawFooter(page: PDFPage, font: PDFFont, text: string, notices: string[]): void {
  draw(page, font, text, 32, 18, 6, page.getWidth() - 64, notices, "pie");
}

async function generatedTemplate(code: FormatCode, data: Data, expediente: { id?: string; folio: string; tramite: string; cliente_nombre: string; created_at: string }, notices: string[]): Promise<Buffer> {
  if (code === "F-02" || code === "F-03" || code === "F-04" || code === "F-06") {
    const database = getDatabase();
    const documents = database.prepare(`
      SELECT er.requirement_code AS codigo, er.status AS estado, rc.name AS nombre,
             dv.sha256, dv.version_number AS version
      FROM expediente_requirements er
      JOIN requirement_catalog rc ON rc.code = er.requirement_code
      LEFT JOIN document_versions dv ON dv.id = er.version_id
      WHERE er.expediente_id = ? AND er.requirement_code LIKE 'R%'
      ORDER BY er.requirement_code
    `).all(expediente.id) as Array<{ codigo: string; estado: string; nombre: string; sha256: string | null; version: number | null }>;
    const result = await renderDocx(code as DocxFormat, {
      folio: expediente.folio, tramite: expediente.tramite, fecha: new Date().toLocaleDateString("es-MX"),
      cliente: {
        nombre: get(data, "solicitante", "nombre_razon_social"),
        tipo_persona: get(data, "solicitante", "tipo_persona"),
      },
      servicio: {
        rpu: get(data, "servicio_actual", "rpu"),
        tarifa: get(data, "servicio_actual", "tarifa"),
        domicilio: get(data, "servicio_actual", "domicilio"),
      },
      central: {
        tension: get(data, "servicio_actual", "nivel_tension_suministro"),
        tecnologia: get(data, "central", "tecnologia"),
        capacidad_kw: get(data, "central", "capacidad_bruta_kw"),
      },
      responsable_cfe: { nombre: get(data, "representacion", "enlace_cfe"), correo: get(data, "representacion", "enlace_cfe_correo") },
      documentos: documents.map((document) => ({ ...document, sha256_corto: document.sha256?.slice(0, 12) })),
    });
    notices.push(...result.missing.map((field) => `Falta el campo ${field}; se dejó ______.`));
    return result.bytes;
  }
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText(`${code} · ${FORMAT_NAMES[code]}`, { x: 42, y: 744, size: 16, font: bold, color: rgb(0.05, 0.1, 0.2) });
  page.drawText("Conecta Ágil IDC · documento de trabajo", { x: 42, y: 726, size: 9, font });
  if ((code as string) === "F-02") {
    const lines = [
      "Lugar y fecha: ______________________________________________",
      "A CFE Suministrador de Servicios Básicos:",
      `Por medio de la presente, ${get(data, "solicitante", "nombre_razon_social") || "________________________"} otorga poder a`,
      `${get(data, "representacion", "apoderado_id") || "________________________"} para realizar el trámite de interconexión.`,
      "[TEXTO PENDIENTE DE APROBACIÓN IDC]",
      "",
      "Otorga: ____________________   Acepta: ____________________",
      "Nombre: ___________________   Nombre: ___________________",
      "Testigo 1: _________________   Testigo 2: _________________",
      "Nombre: ___________________   Nombre: ___________________",
    ];
    lines.forEach((line, index) => page.drawText(line, { x: 48, y: 680 - index * 30, size: 10, font }));
  } else if ((code as string) === "F-04") {
    const rows = [
      ["Titular / razón social", get(data, "solicitante", "nombre_razon_social")],
      ["RPU", get(data, "servicio_actual", "rpu")],
      ["Tarifa", get(data, "servicio_actual", "tarifa")],
      ["Nivel de tensión", get(data, "servicio_actual", "nivel_tension_suministro")],
      ["Responsable certificado (cliente)", get(data, "contacto", "nombre")],
      ["Correo y teléfono del cliente", `${get(data, "contacto", "correo")} · ${get(data, "contacto", "telefono")}`],
      ["Enlace Empresarial CFE", get(data, "representacion", "enlace_cfe")],
    ];
    table(page, bold, font, rows, 48, 680, notices);
  } else if ((code as string) === "F-06") {
    page.drawText(`Folio: ${expediente.folio}`, { x: 48, y: 700, size: 10, font });
    page.drawText(`Cliente: ${expediente.cliente_nombre}`, { x: 48, y: 682, size: 10, font });
    page.drawText(`Trámite: ${expediente.tramite}`, { x: 48, y: 664, size: 10, font });
    page.drawText(`Fecha: ${new Date(expediente.created_at).toLocaleDateString("es-MX")}`, { x: 48, y: 646, size: 10, font });
    const db = getDatabase();
    const rows = (db.prepare(`
      SELECT er.requirement_code, er.status, er.version_id, dv.created_at, dv.sha256
      FROM expediente_requirements er LEFT JOIN document_versions dv ON dv.id = er.version_id
      WHERE er.expediente_id = ? AND er.requirement_code LIKE 'R%' ORDER BY er.requirement_code
    `).all((expediente as { id?: string }).id) as Array<{ requirement_code: string; status: string; version_id: string | null; created_at: string | null; sha256: string | null }>);
    table(page, bold, font, [["Requisito", "Estado", "Versión", "Fecha", "SHA-256"]].concat(rows.map((row) => [row.requirement_code, row.status, row.version_id ? "vigente" : "—", row.created_at ? new Date(row.created_at).toLocaleDateString("es-MX") : "—", row.sha256?.slice(0, 12) ?? "—"])), 42, 600, notices);
  } else {
    let y = 680;
    for (const [label, value] of flat(data)) {
      draw(page, font, `${label}: ${value}`, 48, y, 9, 510, notices, label);
      y -= 16;
      if (y < 55) break;
    }
  }
  drawFooter(page, font, "Generado por Conecta Ágil · [TEXTO PENDIENTE DE APROBACIÓN IDC]", notices);
  return Buffer.from(await pdf.save());
}

function table(page: PDFPage, bold: PDFFont, font: PDFFont, rows: string[][], x: number, y: number, notices: string[]): void {
  const widths = rows[0].map((_, index) => index === 0 ? 125 : 95);
  rows.forEach((row, rowIndex) => {
    let cursor = x;
    row.forEach((cell, index) => {
      const width = widths[index] ?? 95;
      page.drawRectangle({ x: cursor, y: y - rowIndex * 24 - 5, width, height: 24, borderColor: rgb(0.45, 0.55, 0.65), borderWidth: 0.5 });
      draw(page, rowIndex === 0 ? bold : font, cell, cursor + 4, y - rowIndex * 24 + 4, 7, width - 8, notices, `tabla-${rowIndex}-${index}`);
      cursor += width;
    });
  });
}

async function createPdf(code: FormatCode, data: Data, version: string, expediente: { id: string; folio: string; tramite: string; cliente_nombre: string; created_at: string }, notices: string[]): Promise<Buffer> {
  return code === "F-01" ? f01(data, version, expediente.folio, notices) : generatedTemplate(code, data, expediente, notices);
}

export async function generateFormat(user: AuthUser, expedienteId: string, formatCode: string) {
  assertIdc(user);
  if (!FORMAT_CODES.includes(formatCode as FormatCode)) throw new FormatValidationError("Formato inválido.");
  const code = formatCode as FormatCode;
  const expediente = getExpediente(user, expedienteId);
  if (!expediente) throw new Error("NOT_FOUND");
  const gate = getDatabase().prepare("SELECT status FROM gates WHERE expediente_id = ? AND gate_code = 'G1'").get(expedienteId) as { status: string } | undefined;
  if (gate?.status !== "cerrado") throw new Error("G1_NOT_CLOSED");
  const data = JSON.parse(expediente.data_json) as Data;
  const notices: string[] = [];
  const bytes = await createPdf(code, data, expediente.updated_at, { ...expediente, id: expedienteId }, notices);
  const adapters = await getAdapters();
  const requirementCode = REQUIREMENT_BY_FORMAT[code];
  const previous = getDatabase().prepare("SELECT d.id AS document_id, dv.id AS version_id, COALESCE(MAX(dv.version_number), 0) AS version_number FROM documents d LEFT JOIN document_versions dv ON dv.document_id = d.id WHERE d.expediente_id = ? AND d.document_type = ? GROUP BY d.id, dv.id ORDER BY version_number DESC LIMIT 1").get(expedienteId, code) as { document_id: string; version_id: string; version_number: number } | undefined;
  const documentId = previous?.document_id ?? crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const isDocx = code === "F-02" || code === "F-03" || code === "F-04" || code === "F-06";
  const extension = isDocx ? "docx" : "pdf";
  const mimeType = isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";
  const storageKey = `${documentId}/${versionId}.${extension}`;
  const stored = await adapters.storage.put(bytes, { storageKey, filename: `${code}-${expediente.folio}.${extension}`, mimeType });
  const now = new Date().toISOString();
  try {
    withTransaction(() => {
      const database = getDatabase();
      if (previous) database.prepare("UPDATE document_versions SET change_reason = 'invalidado_por_cambio' WHERE id = ?").run(previous.version_id);
      if (!previous) database.prepare("INSERT INTO documents (id, expediente_id, requirement_id, document_type, source, sensitivity, status, created_by, created_at, updated_at) VALUES (?, ?, (SELECT id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = ?), ?, 'generado', 'normal', 'pdf_generado', ?, ?, ?)").run(documentId, expedienteId, expedienteId, requirementCode ?? "", code, user.id, now, now);
      else database.prepare("UPDATE documents SET status = 'pdf_generado', updated_at = ? WHERE id = ?").run(now, documentId);
      const template = isDocx ? database.prepare("SELECT version, sha256 FROM templates WHERE code = ? AND active = 1 ORDER BY version DESC LIMIT 1").get(code) as { version: number; sha256: string } | undefined : undefined;
      database.prepare("INSERT INTO document_versions (id, document_id, version_number, storage_key, original_filename, mime_type, size_bytes, sha256, author_id, origin, template_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'generado', ?, ?)").run(versionId, documentId, previous ? previous.version_number + 1 : 1, stored.storageKey, stored.filename, stored.mimeType, stored.sizeBytes, stored.sha256, user.id, code === "F-01" ? "F-01_base.pdf" : `v${template?.version ?? 1}:${template?.sha256 ?? "local"}`, now);
      if (requirementCode) database.prepare("UPDATE expediente_requirements SET document_id = ?, version_id = ?, status = 'pdf_generado', observed_reason = NULL, updated_at = ? WHERE expediente_id = ? AND requirement_code = ?").run(documentId, versionId, now, expedienteId, requirementCode);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "generacion_formato", entityType: "document_version", entityId: versionId, expedienteId, metadata: { format_code: code, sha256: stored.sha256, truncations: notices } });
    });
  } catch (error) {
    await adapters.storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
  return { formatCode: code, formatName: FORMAT_NAMES[code], documentId, versionId, sha256: stored.sha256, filename: stored.filename, notices };
}

export function printFormat(user: AuthUser, expedienteId: string, formatCode: string, versionId: string) {
  assertIdc(user);
  const code = formatCode as FormatCode;
  if (!FORMAT_CODES.includes(code)) throw new FormatValidationError("Formato inválido.");
  const row = getDatabase().prepare("SELECT d.id AS document_id, er.id AS requirement_id FROM documents d LEFT JOIN expediente_requirements er ON er.document_id = d.id WHERE d.expediente_id = ? AND d.document_type = ? AND EXISTS (SELECT 1 FROM document_versions dv WHERE dv.id = ? AND dv.document_id = d.id)").get(expedienteId, code, versionId) as { document_id: string; requirement_id: string | null } | undefined;
  if (!row) throw new Error("NOT_FOUND");
  const now = new Date().toISOString();
  getDatabase().prepare("UPDATE documents SET status = 'pendiente_firma_presencial', updated_at = ? WHERE id = ?").run(now, row.document_id);
  if (row.requirement_id) getDatabase().prepare("UPDATE expediente_requirements SET status = 'pendiente_firma_presencial', updated_at = ? WHERE id = ?").run(now, row.requirement_id);
  auditEvent({ actorId: user.id, actorRole: user.role, eventType: "impresion_formato", entityType: "document_version", entityId: versionId, expedienteId, metadata: { format_code: code } });
  return { status: "pendiente_firma_presencial", versionId };
}

export function listGeneratedFormats(user: AuthUser, expedienteId: string): Array<{ document_id: string; document_type: string; status: string; version_id: string; version_number: number; original_filename: string }> {
  const expediente = getExpediente(user, expedienteId);
  if (!expediente) throw new Error("NOT_FOUND");
  return getDatabase().prepare("SELECT d.id AS document_id, d.document_type, d.status, dv.id AS version_id, dv.version_number, dv.original_filename FROM documents d JOIN document_versions dv ON dv.document_id = d.id WHERE d.expediente_id = ? AND d.source = 'generado' ORDER BY d.document_type, dv.version_number DESC").all(expedienteId) as Array<{ document_id: string; document_type: string; status: string; version_id: string; version_number: number; original_filename: string }>;
}
