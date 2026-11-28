import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertSafeDemoDataDir } from "./demo-safety";

const allowedEntries = new Set(["conecta-agil.sqlite", "documents", "outbox", "zoho-outbox"]);

function validateName(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) || value === "." || value === "..") {
    throw new Error("El nombre del snapshot solo puede contener letras, números, punto, guion y guion bajo.");
  }
  return value;
}

function assertKnownEntries(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory);
  for (const name of entries) {
    if (name === "conecta-agil.sqlite-wal" || name === "conecta-agil.sqlite-shm") continue;
    if (!allowedEntries.has(name)) throw new Error(`La carpeta de demo contiene un elemento no esperado: ${name}.`);
    if (fs.lstatSync(path.join(directory, name)).isSymbolicLink()) throw new Error("No se admiten enlaces simbólicos en los datos de demo.");
  }
  return entries;
}

function copyDataFiles(source: string, destination: string, includeDatabase: boolean): void {
  for (const name of assertKnownEntries(source)) {
    if (name === "conecta-agil.sqlite-wal" || name === "conecta-agil.sqlite-shm") continue;
    if (!includeDatabase && name === "conecta-agil.sqlite") continue;
    fs.cpSync(path.join(source, name), path.join(destination, name), { recursive: true, errorOnExist: true });
  }
}

function save(dataDir: string, snapshotDir: string): void {
  const databasePath = path.join(dataDir, "conecta-agil.sqlite");
  if (!fs.existsSync(databasePath)) throw new Error("No existe la base ficticia que se debe guardar.");
  assertKnownEntries(dataDir);
  if (fs.existsSync(snapshotDir)) throw new Error("Ya existe un snapshot con ese nombre; elige otro.");
  const temporary = `${snapshotDir}.tmp-${process.pid}`;
  fs.mkdirSync(path.dirname(snapshotDir), { recursive: true });
  fs.mkdirSync(temporary);
  try {
    copyDataFiles(dataDir, temporary, false);
    const snapshotDatabase = path.join(temporary, "conecta-agil.sqlite");
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(`VACUUM INTO '${snapshotDatabase.replaceAll("'", "''")}'`);
    } finally {
      database.close();
    }
    fs.renameSync(temporary, snapshotDir);
    console.log("Snapshot ficticio guardado.");
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function restore(dataDir: string, snapshotDir: string): void {
  if (!fs.existsSync(path.join(snapshotDir, "conecta-agil.sqlite"))) {
    throw new Error("No existe el snapshot solicitado.");
  }
  assertKnownEntries(dataDir);
  assertKnownEntries(snapshotDir);
  fs.mkdirSync(dataDir, { recursive: true });
  for (const name of fs.readdirSync(dataDir)) {
    if (name === "conecta-agil.sqlite-wal" || name === "conecta-agil.sqlite-shm") continue;
    if (!allowedEntries.has(name)) throw new Error(`No se puede restaurar sobre un elemento no esperado: ${name}.`);
  }
  for (const name of fs.readdirSync(dataDir)) {
    if (name === "conecta-agil.sqlite-wal" || name === "conecta-agil.sqlite-shm") continue;
    fs.rmSync(path.join(dataDir, name), { recursive: true, force: true });
  }
  copyDataFiles(snapshotDir, dataDir, true);
  console.log("Snapshot ficticio restaurado. La app debe estar detenida durante esta operación.");
}

try {
  const [action, rawName, ...extra] = process.argv.slice(2);
  if (extra.length || (action !== "save" && action !== "restore")) {
    throw new Error("Uso: npm run demo:snapshot -- save|restore <nombre>");
  }
  const name = validateName(rawName);
  const dataDir = assertSafeDemoDataDir();
  const snapshotDir = path.join(path.dirname(dataDir), `${path.basename(dataDir)}-snapshots`, name);
  if (action === "save") save(dataDir, snapshotDir);
  else restore(dataDir, snapshotDir);
} catch (error) {
  console.error("No se pudo procesar el snapshot de demo.", error);
  process.exitCode = 1;
}
