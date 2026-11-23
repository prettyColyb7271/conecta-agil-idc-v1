import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";

const dir = path.join(process.cwd(), "templates");
const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const body = (title: string, text: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${title}</w:t></w:r></w:p>${text}<w:p><w:r><w:t>Documento generado por Conecta Ágil IDC · versión de plantilla aprobada</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;
const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const templates: Record<string, string> = {
  "F-02_carta_poder.docx": body("F-02 Carta poder para interconexión", [p("Lugar y fecha: {{fecha}}"), p("Otorgante: {{cliente.nombre}} · RFC: {{cliente.rfc}}"), p("Apoderado: {{apoderado.nombre}} · Cargo: {{apoderado.cargo}}"), p("Objeto: {{tramite}}"), p("Firma otorgante: ____________________    Firma apoderado: ____________________")].join("")),
  "F-03_carta_poder_uiie.docx": body("F-03 Carta poder simple UIIE", [p("Lugar y fecha: {{fecha}}"), p("Cliente: {{cliente.nombre}}"), p("Apoderado: {{apoderado.nombre}}"), p("Trámite UIIE: {{tramite}}"), p("Firma: ______________________________")].join("")),
  "F-04_ficha.docx": body("F-04 Ficha de datos y responsables", [p("Titular: {{cliente.nombre}}"), p("RPU: {{rpu}} · Tarifa: {{tarifa}} · Tensión: {{tension}}"), p("Responsable: {{responsable.nombre}} · {{responsable.correo}}"), p("Enlace Empresarial CFE: {{enlace_cfe}}")].join("")),
  "F-06_caratula.docx": body("F-06 Carátula e índice del expediente", [p("Folio: {{folio}} · Cliente: {{cliente.nombre}}"), p("Trámite: {{tramite}} · Fecha: {{fecha}}"), p("Requisitos: {{#requisitos}}{{code}} — {{status}}; {{/requisitos}}")].join("")),
};
for (const [filename, document] of Object.entries(templates)) {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", rels);
  zip.file("word/document.xml", document);
  fs.writeFileSync(path.join(dir, filename), zip.generate({ type: "nodebuffer" }));
}
