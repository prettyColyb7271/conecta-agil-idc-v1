import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function main() {
const root = process.cwd();
const base = await PDFDocument.load(await fs.readFile(path.join(root, "templates", "F-01_base.pdf")));
const map = JSON.parse(await fs.readFile(path.join(root, "templates", "F-01_campos.json"), "utf8")) as Record<string, { page: number; x: number; y: number; size: number; maxWidth: number }>;
const names: Record<string, string> = {
  tipo_persona: "solicitante.tipo_persona", nombre_razon_social: "solicitante.nombre_razon_social",
  rfc: "solicitante.rfc", domicilio: "solicitante.domicilio", telefono: "contacto.telefono",
  correo: "contacto.correo", rpu: "servicio.rpu", tarifa: "servicio.tarifa",
  nivel_tension_suministro: "servicio.nivel_tension_suministro", tecnologia: "central.tecnologia",
  capacidad_bruta_kw: "central.capacidad_kw", utm: "central.utm",
};
const font = await base.embedFont(StandardFonts.Helvetica);
const form = base.getForm();
for (const [field, position] of Object.entries(map)) {
  const text = form.createTextField(names[field] ?? `solicitud.${field}`);
  text.addToPage(base.getPages()[position.page], {
    x: position.x, y: position.y - 3, width: position.maxWidth, height: position.size + 5,
    borderWidth: 0, textColor: rgb(0.13, 0.44, 0.72), font,
  });
  text.setFontSize(position.size);
}
form.updateFieldAppearances(font);
await fs.writeFile(path.join(root, "templates", "F-01_gestionable.pdf"), await base.save({ useObjectStreams: false }));
console.log("F-01 gestionable generado.");
}
void main();
