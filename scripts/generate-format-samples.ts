import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function main() {
const root = process.cwd();
const out = path.join(root, "docs", "muestras");
await fs.mkdir(out, { recursive: true });
async function pageDocument(code: string, title: string, lines: string[]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText(`${code} · ${title}`, { x: 42, y: 744, size: 16, font: bold, color: rgb(0.05, 0.1, 0.2) });
  page.drawText("MUESTRA FICTICIA · Texto final pendiente de aprobación IDC", { x: 42, y: 726, size: 9, font });
  lines.forEach((line, index) => page.drawText(line, { x: 48, y: 680 - index * 30, size: 10, font }));
  page.drawText("Generado por Conecta Ágil · folio IDC-MUESTRA-0001", { x: 42, y: 18, size: 6, font });
  await fs.writeFile(path.join(out, `${code}_muestra.pdf`), await pdf.save());
}

const base = await PDFDocument.load(await fs.readFile(path.join(root, "templates", "F-01_base.pdf")));
const basePage = base.getPages()[0];
const font = await base.embedFont(StandardFonts.Helvetica);
const values = ["Moral", "Empresa Solar Ficticia S.A. de C.V.", "XAXX010101000", "Calle Ficticia 123", "555-000-0000", "cliente.demo@example.invalid", "123456789012", "GDMTH", "13.8 kV", "Solar fotovoltaica", "187.5 kW", "UTM 500000, 2150000"];
const positions = [[116, 694], [116, 674], [448, 674], [116, 654], [116, 634], [300, 634], [116, 584], [300, 584], [448, 584], [116, 500], [300, 500], [116, 460]];
values.forEach((value, index) => basePage.drawText(value, { x: positions[index][0], y: positions[index][1], size: 8, font, color: rgb(0.05, 0.1, 0.2) }));
basePage.drawText("Generado por Conecta Ágil · folio IDC-MUESTRA-0001", { x: 32, y: 18, size: 6, font });
await fs.writeFile(path.join(out, "F-01_muestra.pdf"), await base.save());
await pageDocument("F-02", "Carta poder para interconexión", ["Lugar y fecha: Ciudad Ficticia, 23 de noviembre de 2026", "A CFE Suministrador de Servicios Básicos:", "Otorgante: Empresa Solar Ficticia S.A. de C.V.", "Apoderado: Gestor IDC Demo Ficticio", "[TEXTO PENDIENTE DE APROBACIÓN IDC]", "Otorga: __________________  Acepta: __________________", "Testigo 1: _______________  Testigo 2: _______________"]);
await pageDocument("F-04", "Ficha de datos y responsables", ["Titular / razón social: Empresa Solar Ficticia S.A. de C.V.", "RPU: 123456789012 · Tarifa: GDMTH · Tensión: 13.8 kV", "Responsable cliente: Cliente Demo Ficticio", "Enlace Empresarial CFE: [PENDIENTE DE CAPTURA]", "[TEXTO PENDIENTE DE APROBACIÓN IDC]"]);
await pageDocument("F-06", "Carátula e índice del expediente", ["Folio: IDC-MUESTRA-0001", "Cliente: Empresa Solar Ficticia S.A. de C.V.", "Trámite: Interconexión fotovoltaica MT", "R01–R11: estado y hash de cada documento en el índice", "Total de documentos: 11", "[TEXTO PENDIENTE DE APROBACIÓN IDC]"]);
}
void main();
