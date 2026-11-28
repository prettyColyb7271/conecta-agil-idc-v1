import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const requirementCodes = [
  ...Array.from({ length: 11 }, (_, index) => `R${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`),
];
const externalEvents = [
  "firma_presencial",
  "ingreso_acuse",
  "resolucion_cfe",
  "contrato",
  "uiie",
  "certificado_uiie",
  "medidor",
  "interconexion",
  "alta_comercial",
];
const outputDir = path.resolve(process.env.DEMO_DOCS_DIR?.trim() || path.join(process.cwd(), "demo-docs"));

async function createSamplePdf(title: string, filename: string): Promise<void> {
  const document = await PDFDocument.create();
  document.setTitle(`Muestra ficticia · ${title}`);
  document.setSubject("Datos ficticios para pruebas de Conecta Ágil");
  document.setCreator("Conecta Ágil · Kit de demo");
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText("MUESTRA – DATOS FICTICIOS", { x: 54, y: 710, size: 20, font: bold });
  page.drawText(title, { x: 54, y: 658, size: 16, font: bold });
  page.drawText("Documento de ejemplo; no contiene datos de clientes reales.", { x: 54, y: 620, size: 11, font });
  page.drawText("Conecta Ágil · Entorno de demostración", { x: 54, y: 52, size: 9, font });
  fs.writeFileSync(path.join(outputDir, filename), await document.save());
}

async function main(): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const code of requirementCodes) await createSamplePdf(`Requisito ${code}`, `${code}.pdf`);
  for (const eventType of externalEvents) {
    await createSamplePdf(`Evento externo ${eventType}`, `evento-${eventType}.pdf`);
  }
  console.log(`PDF ficticios generados: ${requirementCodes.length + externalEvents.length}.`);
}

main().catch((error: unknown) => {
  console.error("No se pudieron generar los documentos ficticios.", error);
  process.exitCode = 1;
});
