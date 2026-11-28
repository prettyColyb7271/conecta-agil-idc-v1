import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-migration-011-"));
const databasePath = path.join(dataDir, "conecta-agil.sqlite");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  EMAIL_TRANSPORT: "file",
  RESEND_API_KEY: "",
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: "",
  ZOHO_REFRESH_TOKEN: "",
  ZOHO_PORTAL_ID: "",
  ZOHO_PROJECT_ID: "",
};
const priorMigrations = [
  "001_inicial.sql", "002_catalogo_y_registro.sql", "003_contrasena_temporal.sql",
  "004_flujo_firma_privacidad.sql", "005_password_setup_tokens.sql", "006_plantillas_docx.sql",
  "007_paso7_eventos_externos.sql", "008_mfa_seguridad.sql", "009_outbox.sql",
  "010_audit_events_privacidad.sql",
];
let pass = 0;
let fail = 0;
let database;

function ok(name, condition) {
  if (condition) {
    pass += 1;
    console.log("  ✅", name);
  } else {
    fail += 1;
    console.log("  ❌", name);
  }
}

function runMigrate() {
  execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "ignore" });
}

try {
  database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
    CREATE TABLE account_requests (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const migration = database.prepare("INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, 'fixture', '2026-11-27')");
  for (const filename of priorMigrations) migration.run(filename);
  database.prepare("INSERT INTO account_requests (id, email, display_name, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("request-before-011", "previo@example.invalid", "Solicitud previa", "pendiente", "2026-11-27T00:00:00.000Z");
  database.close();
  database = undefined;

  runMigrate();
  database = new DatabaseSync(databasePath);
  const oldRequest = database.prepare("SELECT email, display_name, privacy_notice_version FROM account_requests WHERE id = ?").get("request-before-011");
  const columns = database.prepare("PRAGMA table_info(account_requests)").all().map((column) => column.name);
  ok("la migración 011 agrega privacy_notice_version sin alterar la solicitud previa",
    columns.includes("privacy_notice_version") && oldRequest.email === "previo@example.invalid" &&
    oldRequest.display_name === "Solicitud previa" && oldRequest.privacy_notice_version === null);
  database.close();
  database = undefined;

  runMigrate();
  database = new DatabaseSync(databasePath);
  database.prepare(`
    INSERT INTO account_requests (id, email, display_name, status, created_at, privacy_notice_version)
    VALUES ('request-current', 'nuevo@example.invalid', 'Solicitud nueva', 'pendiente', '2026-11-27T00:00:00.000Z', ?)
  `).run("0.1-borrador");
  const schemaVersion = Number(database.prepare("SELECT MAX(CAST(substr(filename, 1, 3) AS INTEGER)) AS version FROM schema_migrations").get().version);
  const migrationCount = Number(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE filename = '011_privacy_notice_registration.sql'").get().count);
  const newRequest = database.prepare("SELECT privacy_notice_version FROM account_requests WHERE id = 'request-current'").get();
  ok("schemaVersion llega a 11 y registra la versión aceptada", schemaVersion === 11 && migrationCount === 1 && newRequest.privacy_notice_version === "0.1-borrador");
  database.close();
  database = undefined;

  runMigrate();
  database = new DatabaseSync(databasePath, { readOnly: true });
  const rows = Number(database.prepare("SELECT COUNT(*) AS count FROM account_requests").get().count);
  const repeated = Number(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE filename = '011_privacy_notice_registration.sql'").get().count);
  ok("db:migrate se puede repetir sin duplicar la migración ni perder solicitudes", rows === 2 && repeated === 1);
} catch (error) {
  console.error("Error en migration-011-with-data:", error instanceof Error ? error.message : "fallo desconocido");
  process.exitCode = 1;
} finally {
  try { database?.close(); } catch {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {
    console.error("No se pudo limpiar la base temporal de migration-011.");
    process.exitCode = 1;
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (fail) process.exitCode = 1;
}
