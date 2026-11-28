import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PDFDocument } from "pdf-lib";

const root = path.resolve(process.argv[2] ?? process.cwd());
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-a5-demo-test-"));
const dataDir = path.join(tempRoot, "isolated-data");
const docsDir = path.join(tempRoot, "documents");
const localAppData = path.join(tempRoot, "localappdata");
const realDataDir = path.join(localAppData, "ConectaAgil");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCALAPPDATA: localAppData,
  LOCAL_DATA_DIR: dataDir,
  DEMO_DOCS_DIR: docsDir,
  MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  EMAIL_TRANSPORT: "file",
  RESEND_API_KEY: "",
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: "",
  ZOHO_REFRESH_TOKEN: "",
  ZOHO_PORTAL_ID: "",
  ZOHO_PROJECT_ID: "",
  ZOHO_DC: "com",
};
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, condition, detail = "") {
  if (condition) {
    pass++;
    console.log("  ✅", name);
  } else {
    fail++;
    failures.push(name);
    console.log("  ❌", name, detail);
  }
}

function runTsx(script, args = [], overrides = {}) {
  return spawnSync(process.execPath, [tsx, script, ...args], {
    cwd: root,
    env: { ...env, ...overrides },
    encoding: "utf8",
    timeout: 30_000,
  });
}

function readCapacity(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare("SELECT data_json FROM expedientes WHERE folio = ?").get("IDC-DEMO-0001");
    return JSON.parse(row.data_json).central.capacidad_bruta_kw;
  } finally {
    database.close();
  }
}

try {
  const seeded = runTsx("scripts/demo-seed.ts");
  ok("demo:seed crea la base en LOCAL_DATA_DIR aislado", seeded.status === 0, seeded.stderr);
  const seedOutput = seeded.stdout.trim().split(/\r?\n/).at(-1) ?? "{}";
  const seedSummary = seeded.status === 0 ? JSON.parse(seedOutput) : {};
  const databasePath = path.join(dataDir, "conecta-agil.sqlite");
  ok("la semilla crea dos gestores, un admin y el folio aceptado", seedSummary.gestores >= 2 &&
    seedSummary.administradores >= 1 && seedSummary.folio === "IDC-DEMO-0001");
  ok("la semilla usa la empresa, RFC ficticio y 45.5 kW", readCapacity(databasePath) === 45.5);

  const docs = runTsx("scripts/demo-docs.ts");
  ok("demo:docs genera PDF válidos sin depender de Zoho", docs.status === 0, docs.stderr);
  const requirementFiles = [
    ...Array.from({ length: 11 }, (_, index) => `R${String(index + 1).padStart(2, "0")}.pdf`),
    ...Array.from({ length: 17 }, (_, index) => `U${String(index + 1).padStart(2, "0")}.pdf`),
  ];
  const eventFiles = [
    "firma_presencial", "ingreso_acuse", "resolucion_cfe", "contrato", "uiie",
    "certificado_uiie", "medidor", "interconexion", "alta_comercial",
  ].map((event) => `evento-${event}.pdf`);
  const pdfFiles = [...requirementFiles, ...eventFiles];
  const actualFiles = fs.existsSync(docsDir) ? fs.readdirSync(docsDir).sort() : [];
  ok("hay un PDF por R01–R11, U01–U17 y cada evento externo", actualFiles.length === 37 &&
    actualFiles.sort().join(",") === pdfFiles.sort().join(","));
  const samplePdf = await PDFDocument.load(fs.readFileSync(path.join(docsDir, "R01.pdf")));
  ok("los PDF declaran su marca de muestra ficticia", samplePdf.getTitle()?.includes("Muestra ficticia") &&
    samplePdf.getSubject()?.includes("Datos ficticios") && samplePdf.getPageCount() === 1);

  fs.mkdirSync(path.join(dataDir, "documents"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "documents", "fixture.pdf"), "snapshot original");
  const saved = runTsx("scripts/demo-snapshot.ts", ["save", "punto-inicial"]);
  ok("demo:snapshot guarda una copia consistente de la base y archivos", saved.status === 0, saved.stderr);
  const changedDatabase = new DatabaseSync(databasePath);
  changedDatabase.prepare("UPDATE expedientes SET data_json = ? WHERE folio = ?")
    .run(JSON.stringify({ central: { capacidad_bruta_kw: 99.9 } }), "IDC-DEMO-0001");
  changedDatabase.close();
  fs.writeFileSync(path.join(dataDir, "documents", "fixture.pdf"), "contenido cambiado");
  const restored = runTsx("scripts/demo-snapshot.ts", ["restore", "punto-inicial"]);
  ok("demo:snapshot restaura base y documentos", restored.status === 0 && readCapacity(databasePath) === 45.5 &&
    fs.readFileSync(path.join(dataDir, "documents", "fixture.pdf"), "utf8") === "snapshot original", restored.stderr);

  const protectedSeed = runTsx("scripts/demo-seed.ts", [], { LOCAL_DATA_DIR: realDataDir });
  const protectedSnapshot = runTsx("scripts/demo-snapshot.ts", ["save", "prohibido"], { LOCAL_DATA_DIR: realDataDir });
  ok("demo:seed y demo:snapshot rechazan la ruta real de ConectaAgil", protectedSeed.status !== 0 &&
    protectedSnapshot.status !== 0 && !fs.existsSync(realDataDir));

  const notEmpty = runTsx("scripts/demo-seed.ts");
  ok("demo:seed rechaza una carpeta ya poblada", notEmpty.status !== 0);
} catch (error) {
  console.error("Falló la prueba de las herramientas de demo A5.", error);
  fail++;
  failures.push("ejecución completa de herramientas de demo");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (failures.length) console.log(` - ${failures.join("\n - ")}`);
  if (fail) process.exitCode = 1;
}
