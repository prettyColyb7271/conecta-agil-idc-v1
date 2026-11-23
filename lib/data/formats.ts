import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAdapters } from "@/lib/adapters";
import { getDatabase } from "@/lib/db/sqlite";
import { auditEvent, withTransaction, type AuthUser } from "@/lib/auth";
import { getExpediente } from "@/lib/data/expedientes";

export class FormatValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatValidationError";
  }
}

const FORMAT_REQUIREMENTS: Record<string, string | undefined> = { "F-01": "R01", "F-02": "R07", "F-03": "U15", "F-04": "U12", "F-05": "U09", "F-06": undefined };
const FORMAT_NAMES: Record<string, string> = {
  "F-01": "Solicitud de interconexión",
  "F-02": "Carta poder para interconexión",
  "F-03": "Carta poder simple para UIIE",
  "F-04": "Ficha de datos y responsables",
  "F-05": "Memoria de cálculo fotovoltaica",
  "F-06": "Carátula e índice del expediente",
};

function flattenData(data: Record<string, unknown>): Array<[string, string]> {
  const values: Array<[string, string]> = [];
  for (const [section, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") values.push([`${section}.${field}`, String(value)]);
    }
  }
  return values;
}

async function createPdf(formatCode: string, data: Record<string, unknown>): Promise<Buffer> {
  if (formatCode === "F-01") {
    const template = await fs.readFile(path.join(process.cwd(), "public", "plantillas", "Solicitud para la interconexion.pdf"));
    const pdf = await PDFDocument.load(template);
    const page = pdf.getPages()[0];
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let y = page.getHeight() - 70;
    for (const [label, value] of flattenData(data).slice(0, 12)) {
      page.drawText(`${label}: ${value}`.slice(0, 90), { x: 45, y, size: 7, font, color: rgb(0.05, 0.1, 0.2) });
      y -= 11;
    }
    return Buffer.from(await pdf.save());
  }
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`${formatCode} — ${FORMAT_NAMES[formatCode]}`, { x: 45, y: 740, size: 16, font, color: rgb(0.05, 0.1, 0.2) });
  page.drawText("Borrador generado por Conecta Ágil IDC. Texto final pendiente de aprobación de IDC.", { x: 45, y: 716, size: 8, font });
  let y = 680;
  for (const [label, value] of flattenData(data)) {
    page.drawText(`${label}: ${value}`.slice(0, 110), { x: 45, y, size: 9, font });
    y -= 16;
    if (y < 45) break;
  }
  return Buffer.from(await pdf.save());
}

export async function generateFormat(user: AuthUser, expedienteId: string, formatCode: string) {
  if (user.role !== "coordinador_idc") throw new Error("FORBIDDEN");
  if (!FORMAT_REQUIREMENTS.hasOwnProperty(formatCode)) throw new FormatValidationError("Formato inválido.");
  const expediente = getExpediente(user, expedienteId);
  if (!expediente) throw new Error("NOT_FOUND");
  const data = JSON.parse(expediente.data_json) as Record<string, unknown>;
  const requirementCode = FORMAT_REQUIREMENTS[formatCode];
  if (requirementCode) {
    const requirement = getDatabase().prepare("SELECT status FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = ?").get(expedienteId, requirementCode) as { status: string } | undefined;
    if (!requirement || !["validado_idc", "no_aplica_justificado"].includes(requirement.status)) throw new FormatValidationError(`${requirementCode} debe estar validado antes de generar ${formatCode}.`);
  }
  const bytes = await createPdf(formatCode, data);
  const adapters = await getAdapters();
  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const storageKey = `${documentId}/${versionId}.pdf`;
  const stored = await adapters.storage.put(bytes, { storageKey, filename: `${formatCode}-${expediente.folio}.pdf`, mimeType: "application/pdf" });
  const now = new Date().toISOString();
  try {
    withTransaction(() => {
      databaseInsertGenerated(documentId, versionId, expedienteId, requirementCode, formatCode, user.id, stored, now);
      auditEvent({ actorId: user.id, actorRole: user.role, eventType: "generacion_formato", entityType: "document_version", entityId: versionId, expedienteId, metadata: { format_code: formatCode, sha256: stored.sha256, version_id: versionId } });
    });
  } catch (error) {
    await adapters.storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
  return { formatCode, formatName: FORMAT_NAMES[formatCode], documentId, versionId, sha256: stored.sha256, filename: stored.filename };
}

function databaseInsertGenerated(documentId: string, versionId: string, expedienteId: string, requirementCode: string | undefined, formatCode: string, userId: string, stored: { storageKey: string; filename: string; mimeType: string; sizeBytes: number; sha256: string }, now: string): void {
  const database = getDatabase();
  const requirement = requirementCode ? database.prepare("SELECT id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = ?").get(expedienteId, requirementCode) as { id: string } | undefined : undefined;
  database.prepare("INSERT INTO documents (id, expediente_id, requirement_id, document_type, source, sensitivity, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'generado', 'normal', 'pdf_generado', ?, ?, ?)").run(documentId, expedienteId, requirement?.id ?? null, formatCode, userId, now, now);
  database.prepare("INSERT INTO document_versions (id, document_id, version_number, storage_key, original_filename, mime_type, size_bytes, sha256, author_id, origin, template_version, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 'generado', ?, ?)").run(versionId, documentId, stored.storageKey, stored.filename, stored.mimeType, stored.sizeBytes, stored.sha256, userId, formatCode === "F-01" ? "Solicitud para la interconexion.pdf" : "plantilla-idc-v1", now);
  if (requirement) database.prepare("UPDATE expediente_requirements SET document_id = ?, version_id = ?, status = 'cargado', updated_at = ? WHERE id = ?").run(documentId, versionId, now, requirement.id);
}
