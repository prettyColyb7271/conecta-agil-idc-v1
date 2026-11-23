import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function main() {
const root = process.cwd();
const template = await PDFDocument.load(await fs.readFile(path.join(root, "templates", "F-01_base.pdf")));
const page = template.getPages()[0];
const font = await template.embedFont(StandardFonts.Helvetica);
for (let x = 0; x <= page.getWidth(); x += 20) {
  page.drawLine({ start: { x, y: 0 }, end: { x, y: page.getHeight() }, thickness: 0.25, color: rgb(0.9, 0, 0) });
  page.drawText(String(x), { x: x + 1, y: page.getHeight() - 10, size: 5, font, color: rgb(0.7, 0, 0) });
}
for (let y = 0; y <= page.getHeight(); y += 20) {
  page.drawLine({ start: { x: 0, y }, end: { x: page.getWidth(), y }, thickness: 0.25, color: rgb(0, 0, 0.8) });
  page.drawText(String(y), { x: 1, y: y + 1, size: 5, font, color: rgb(0, 0, 0.7) });
}
await fs.mkdir(path.join(root, "docs", "muestras"), { recursive: true });
await fs.writeFile(path.join(root, "docs", "muestras", "F-01_grilla.pdf"), await template.save());
}
void main();
