import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
function assertSafeDocx(bytes: Buffer, filename: string): void {
  if (!filename.endsWith(".docx") || bytes.length > 5 * 1024 * 1024) throw new Error(`${filename}: archivo inválido`);
  const zip = new PizZip(bytes);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml || zip.file("vbaProject.bin") || !zip.file("[Content_Types].xml")?.asText().includes("wordprocessingml.document")) throw new Error(`${filename}: DOCX inválido`);
}

const expected = ["F-02_carta_poder.docx", "F-03_carta_poder_uiie.docx", "F-04_ficha.docx", "F-06_caratula.docx"];
for (const filename of expected) {
  const bytes = fs.readFileSync(path.join(process.cwd(), "templates", filename));
  assertSafeDocx(bytes, filename);
  const xml = new PizZip(bytes).file("word/document.xml")!.asText();
  if (!xml.includes("{{") || !xml.includes("}}")) throw new Error(`${filename}: faltan etiquetas`);
}
console.log(`OK: ${expected.length} plantillas DOCX válidas`);
