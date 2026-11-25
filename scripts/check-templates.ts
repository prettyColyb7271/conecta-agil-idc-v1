import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { validateTemplateMarks } from "../lib/data/template-catalog";
import { PDFDocument } from "pdf-lib";
async function main(): Promise<void> {
function assertSafeDocx(bytes: Buffer, filename: string): void {
  if (!filename.endsWith(".docx") || bytes.length > 5 * 1024 * 1024) throw new Error(`${filename}: archivo inválido`);
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml || zip.file("vbaProject.bin") || !zip.file("[Content_Types].xml")?.asText().includes("wordprocessingml.document")) throw new Error(`${filename}: DOCX inválido`);
}

const expected = ["F-02_carta_poder.docx", "F-03_carta_poder_uiie.docx", "F-04_ficha.docx", "F-05_memoria_calculo.docx", "F-06_caratula.docx"];
for (const filename of expected) {
  const bytes = fs.readFileSync(path.join(process.cwd(), "templates", filename));
  assertSafeDocx(bytes, filename);
  const xml = new PizZip(bytes).file("word/document.xml")!.asText();
  if (!xml.includes("{{") || !xml.includes("}}")) throw new Error(`${filename}: faltan etiquetas`);
  const code = filename.slice(0, 4);
  validateTemplateMarks(xml, code);
}
console.log(`OK: ${expected.length} plantillas DOCX válidas`);
const f01 = await PDFDocument.load(fs.readFileSync(path.join(process.cwd(), "templates", "F-01_gestionable.pdf")));
if (f01.getForm().getFields().length !== Object.keys(JSON.parse(fs.readFileSync(path.join(process.cwd(), "templates", "F-01_campos.json"), "utf8"))).length) {
  throw new Error("F-01: cantidad de campos AcroForm no coincide con F-01_campos.json");
}
if (f01.getPages().length !== 1) throw new Error("F-01: debe conservar una página");
console.log("OK: F-01 PDF gestionable válido");
}
void main();
