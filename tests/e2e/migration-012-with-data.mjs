import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-migration-012-"));
const databasePath = path.join(dataDir, "conecta-agil.sqlite");
const migrationsDir = path.join(root, "lib", "db", "migrations");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  EMAIL_TRANSPORT: "file",
  RESEND_API_KEY: "",
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: "",
  ZOHO_REFRESH_TOKEN: "",
  ZOHO_PORTAL_ID: "",
  ZOHO_PROJECT_ID: "",
};
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

function migrate() {
  try {
    execFileSync(process.execPath, [tsx, "scripts/db-migrate.ts"], { cwd: root, env, stdio: "pipe", encoding: "utf8" });
  } catch (error) {
    throw new Error(error.stderr?.toString() || error.message);
  }
}

try {
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = OFF; CREATE TABLE schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);");
  const migration = database.prepare("INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, 'fixture', '2026-11-28')");
  for (const filename of fs.readdirSync(migrationsDir).filter((file) => Number.parseInt(file.slice(0, 3), 10) <= 11).sort()) {
    database.exec(fs.readFileSync(path.join(migrationsDir, filename), "utf8"));
    migration.run(filename);
  }
  const user = database.prepare(`
    INSERT INTO users (id, email, display_name, role, status, password_hash, created_at, updated_at, must_change_password)
    VALUES (?, ?, ?, ?, 'activo', 'fixture-hash', '2026-11-28', '2026-11-28', ?)
  `);
  user.run("client-before-012", "cliente@example.invalid", "Nombre", "cliente", 1);
  user.run("manager-before-012", "gestor@example.invalid", "Gestor", "coordinador_idc", 0);
  database.prepare("INSERT INTO sessions (id, user_id, session_token_hash, expires_at, created_at, last_seen_at) VALUES ('session-before-012', 'client-before-012', 'session-hash', '2030-01-01', '2026-11-28', '2026-11-28')").run();
  database.prepare("INSERT INTO password_recovery_requests (id, email, requested_at) VALUES ('request-existing', 'cliente@example.invalid', '2026-11-28'), ('request-missing', 'missing@example.invalid', '2026-11-28')").run();
  database.prepare(`
    INSERT INTO expedientes (id, folio, tramite, nivel_tension, habilitado, cliente_id, gestor_id, status, data_json, created_at, updated_at)
    VALUES ('exp-before-012', 'IDC-2026-9012', 'interconexion_fv_mt', 'MT', 1, 'client-before-012', 'manager-before-012', 'activo', '{}', '2026-11-28', '2026-11-28')
  `).run();
  database.prepare(`
    INSERT INTO expediente_assignments (id, expediente_id, user_id, assignment_type, assigned_by, starts_at, created_at)
    VALUES ('assignment-before-012', 'exp-before-012', 'manager-before-012', 'coordinador_idc', 'manager-before-012', '2026-11-28', '2026-11-28')
  `).run();
  database.close();
  database = undefined;

  migrate();
  database = new DatabaseSync(databasePath);
  const columns = database.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  const client = database.prepare("SELECT id, email, display_name, status, must_change_password, apellidos, telefono_contacto FROM users WHERE id = 'client-before-012'").get();
  const requestFlags = database.prepare("SELECT id, account_exists FROM password_recovery_requests ORDER BY id").all();
  const session = database.prepare("SELECT user_id, mfa_recent_verified_at FROM sessions WHERE id = 'session-before-012'").get();
  const expediente = database.prepare("SELECT cliente_id, gestor_id, status FROM expedientes WHERE id = 'exp-before-012'").get();
  const assignments = database.prepare("SELECT user_id FROM expediente_assignments WHERE expediente_id = 'exp-before-012' AND ends_at IS NULL").all();
  const violations = database.prepare("PRAGMA foreign_key_check").all();
  ok("la migración conserva usuarios, sesiones, solicitudes y expedientes enlazados",
    columns.includes("apellidos") && columns.includes("telefono_contacto") &&
    client.id === "client-before-012" && client.email === "cliente@example.invalid" &&
    client.status === "activo" && client.must_change_password === 1 &&
    requestFlags.find((row) => row.id === "request-existing")?.account_exists === 1 &&
    requestFlags.find((row) => row.id === "request-missing")?.account_exists === 0 &&
    session.user_id === "client-before-012" && session.mfa_recent_verified_at === null &&
    expediente.cliente_id === "client-before-012" && expediente.gestor_id === "manager-before-012" &&
    assignments.length === 1 && violations.length === 0);
  database.prepare(`
    INSERT INTO users (id, email, display_name, role, status, password_hash, created_at, updated_at)
    VALUES ('deactivated-user', 'baja@example.invalid', 'Baja', 'cliente', 'baja', 'fixture-hash', '2026-11-28', '2026-11-28')
  `).run();
  const schemaVersion = Number(database.prepare("SELECT MAX(CAST(substr(filename, 1, 3) AS INTEGER)) AS version FROM schema_migrations").get().version);
  const migrationCount = Number(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE filename = '012_a8b_contact_recovery_deactivation.sql'").get().count);
  ok("schema 12 acepta el estado baja y registra la migración una sola vez", schemaVersion === 12 && migrationCount === 1);
  database.close();
  database = undefined;

  migrate();
  database = new DatabaseSync(databasePath, { readOnly: true });
  const repeated = Number(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE filename = '012_a8b_contact_recovery_deactivation.sql'").get().count);
  const preserved = Number(database.prepare("SELECT COUNT(*) AS count FROM expedientes WHERE id = 'exp-before-012'").get().count);
  ok("db:migrate repetido no duplica el registro ni elimina el expediente", repeated === 1 && preserved === 1);
} catch (error) {
  console.error("Error en migration-012-with-data:", error instanceof Error ? error.message : "fallo desconocido");
  process.exitCode = 1;
} finally {
  try { database?.close(); } catch {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {
    console.error("No se pudo limpiar la base temporal de migration-012.");
    process.exitCode = 1;
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (fail) process.exitCode = 1;
}
