import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "conecta-migration-010-"));
const databasePath = path.join(dataDir, "conecta-agil.sqlite");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const migration = "010_audit_events_privacidad.sql";
const env = {
  ...process.env,
  APP_MODE: "local",
  NEXT_PUBLIC_MODO: "local",
  LOCAL_DATA_DIR: dataDir,
  MFA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  MFA_ENCRYPTION_KEY_ANTERIOR: "",
  MFA_REQUIRED_ROLES: "admin_seguridad",
  EMAIL_TRANSPORT: "file",
  EMAIL_FROM: "Conecta Agil <no-reply@example.invalid>",
  RESEND_API_KEY: "",
  ZOHO_TRANSPORT: "file",
  ZOHO_CLIENT_ID: "",
  ZOHO_CLIENT_SECRET: "",
  ZOHO_REFRESH_TOKEN: "",
  ZOHO_PORTAL_ID: "",
  ZOHO_PROJECT_ID: "",
  ZOHO_DC: "com",
};
const applicationTables = [
  "users", "account_requests", "sessions", "expedientes", "expediente_assignments",
  "requirement_catalog", "expediente_requirements", "documents", "document_versions",
  "observations", "gates", "external_events", "notifications", "audit_events",
  "export_jobs", "password_setup_tokens", "templates", "user_mfa", "mfa_backup_codes",
  "mfa_login_challenges", "password_recovery_requests", "outbox",
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

function runTsx(script) {
  execFileSync(process.execPath, [tsx, script], { cwd: root, env, stdio: "ignore" });
}

function populateAllTables() {
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const ids = database.prepare(`
    SELECT
      (SELECT id FROM users WHERE email = 'cliente.demo@example.invalid') AS client_id,
      (SELECT id FROM users WHERE email = 'coordinador.demo@example.invalid') AS manager_id,
      (SELECT id FROM users WHERE email = 'seguridad.demo@example.invalid') AS admin_id,
      (SELECT id FROM expedientes WHERE folio = 'IDC-DEMO-0001') AS expediente_id
  `).get();
  if (!ids.client_id || !ids.manager_id || !ids.admin_id || !ids.expediente_id) {
    throw new Error("No se encontró la base ficticia de prueba para migration-010.");
  }
  const requirementId = database.prepare(
    "SELECT id FROM expediente_requirements WHERE expediente_id = ? AND requirement_code = 'R06'",
  ).get(ids.expediente_id)?.id;
  if (!requirementId) throw new Error("No se encontró el requisito ficticio de prueba.");

  const now = "2026-11-27T12:00:00.000Z";
  database.prepare(`
    INSERT INTO account_requests (id, email, display_name, status, created_at, requested_role)
    VALUES ('fixture-request', 'solicitud@example.invalid', 'Solicitud Ficticia', 'pendiente', ?, 'cliente')
  `).run(now);
  database.prepare(`
    INSERT INTO sessions (id, user_id, session_token_hash, expires_at, created_at, last_seen_at)
    VALUES ('fixture-session', ?, 'fixture-session-hash', '2030-01-01T00:00:00.000Z', ?, ?)
  `).run(ids.client_id, now, now);
  database.prepare(`
    INSERT INTO documents (id, expediente_id, requirement_id, document_type, source, sensitivity, status, created_by, created_at, updated_at)
    VALUES ('fixture-document', ?, ?, 'identificacion', 'cliente', 'sensible', 'cargado', ?, ?, ?)
  `).run(ids.expediente_id, requirementId, ids.client_id, now, now);
  database.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, storage_key, original_filename, mime_type, size_bytes, sha256, author_id, origin, created_at)
    VALUES ('fixture-version', 'fixture-document', 1, 'fixture/version.pdf', 'ficticio.pdf', 'application/pdf', 1, 'fixture-hash', ?, 'carga', ?)
  `).run(ids.client_id, now);
  database.prepare(`
    INSERT INTO observations (id, expediente_id, requirement_id, document_version_id, author_id, visibility, body, created_at)
    VALUES ('fixture-observation', ?, ?, 'fixture-version', ?, 'interno_idc', 'Observación ficticia', ?)
  `).run(ids.expediente_id, requirementId, ids.manager_id, now);
  database.prepare(`
    INSERT INTO external_events (id, expediente_id, event_type, event_date, description, created_by, created_at)
    VALUES ('fixture-external-event', ?, 'ingreso_acuse', ?, 'Evento ficticio', ?, ?)
  `).run(ids.expediente_id, now, ids.manager_id, now);
  database.prepare(`
    INSERT INTO notifications (id, user_id, expediente_id, type, priority, title, body, created_at)
    VALUES ('fixture-notification', ?, ?, 'fixture', 'normal', 'Aviso ficticio', 'Contenido ficticio', ?)
  `).run(ids.client_id, ids.expediente_id, now);
  database.prepare(`
    INSERT INTO export_jobs (id, requested_by, export_type, status, created_at)
    VALUES ('fixture-export', ?, 'migration', 'pendiente', ?)
  `).run(ids.manager_id, now);
  database.prepare(`
    INSERT INTO password_setup_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES ('fixture-password-token', ?, 'fixture-token-hash', '2030-01-01T00:00:00.000Z', ?)
  `).run(ids.client_id, now);
  database.prepare(`
    INSERT INTO user_mfa (user_id, secret_ciphertext, secret_iv, secret_auth_tag, created_at, updated_at)
    VALUES (?, 'fixture-ciphertext', 'fixture-iv', 'fixture-tag', ?, ?)
  `).run(ids.admin_id, now, now);
  database.prepare(`
    INSERT INTO mfa_backup_codes (id, user_id, code_hash, created_at)
    VALUES ('fixture-backup-code', ?, 'fixture-backup-hash', ?)
  `).run(ids.admin_id, now);
  database.prepare(`
    INSERT INTO mfa_login_challenges (id, user_id, token_hash, expires_at, created_at)
    VALUES ('fixture-mfa-challenge', ?, 'fixture-challenge-hash', '2030-01-01T00:00:00.000Z', ?)
  `).run(ids.admin_id, now);
  database.prepare(`
    INSERT INTO password_recovery_requests (id, email, status, requested_at)
    VALUES ('fixture-recovery', 'cliente.demo@example.invalid', 'pendiente', ?)
  `).run(now);
  database.prepare(`
    INSERT INTO outbox (id, event_type, expediente_id, payload_json, status, created_at)
    VALUES ('fixture-outbox', 'migration_fixture', ?, '{"source":"fixture"}', 'pendiente', ?)
  `).run(ids.expediente_id, now);

  const legacyRows = [
    {
      id: "fixture-audit-unknown",
      actorId: null,
      eventType: "migration_fixture_unknown",
      metadata: { email: "legacy.unknown@example.invalid", ip: "192.168.56.123", user_agent: "FIXTURE_AGENT", retained: "unknown" },
    },
    {
      id: "fixture-audit-known",
      actorId: ids.manager_id,
      eventType: "migration_fixture_known",
      metadata: { email: "coordinador.demo@example.invalid", ip: "2001:0db8:85a3::8a2e:0370:7334", user_agent: "FIXTURE_AGENT", retained: "known" },
    },
    {
      id: "fixture-audit-third",
      actorId: null,
      eventType: "migration_fixture_third",
      metadata: { email: "legacy.third@example.invalid", ip: "203.0.113.17", user_agent: "FIXTURE_AGENT", retained: "third" },
    },
  ];
  const insertAudit = database.prepare(`
    INSERT INTO audit_events (id, actor_id, actor_role, event_type, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, 'user', ?, ?, ?)
  `);
  for (const row of legacyRows) {
    insertAudit.run(
      row.id,
      row.actorId,
      row.actorId ? "coordinador_idc" : null,
      row.eventType,
      row.id,
      JSON.stringify(row.metadata),
      now,
    );
  }

  const counts = new Map(applicationTables.map((table) => [
    table,
    Number(database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count),
  ]));
  const allTablesHaveData = [...counts.values()].every((count) => count > 0) &&
    Number(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count) > 0;
  const preservedRows = Object.fromEntries(applicationTables
    .filter((table) => table !== "audit_events")
    .map((table) => [table, database.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]));
  const auditFields = database.prepare(`
    SELECT id, actor_id, actor_role, event_type, entity_type, entity_id, expediente_id, created_at
    FROM audit_events ORDER BY id
  `).all();
  database.prepare("DELETE FROM schema_migrations WHERE filename = ?").run(migration);
  database.close();
  database = undefined;

  return { allTablesHaveData, preservedRows, auditFields, legacyRows };
}

try {
  runTsx("scripts/db-migrate.ts");
  runTsx("scripts/db-seed.ts");
  const before = populateAllTables();
  ok("la base previa a la migración tiene datos en todas las tablas de aplicación", before.allTablesHaveData);

  runTsx("scripts/db-migrate.ts");
  database = new DatabaseSync(databasePath, { readOnly: true });
  const preserved = Object.entries(before.preservedRows).every(([table, rows]) =>
    JSON.stringify(database.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()) === JSON.stringify(rows));
  const auditFieldsAfter = database.prepare(`
    SELECT id, actor_id, actor_role, event_type, entity_type, entity_id, expediente_id, created_at
    FROM audit_events ORDER BY id
  `).all();
  const auditFieldsPreserved = JSON.stringify(auditFieldsAfter) === JSON.stringify(before.auditFields);
  const schemaVersion = Number(database.prepare("SELECT MAX(CAST(substr(filename, 1, 3) AS INTEGER)) AS version FROM schema_migrations").get().version);
  const readMetadata = database.prepare("SELECT metadata_json FROM audit_events WHERE id = ?");
  const firstMetadata = new Map(before.legacyRows.map((row) => [row.id, String(readMetadata.get(row.id)?.metadata_json ?? "")]));
  const metadataCorrect = JSON.parse(firstMetadata.get("fixture-audit-unknown"))?.email === "le***@example.invalid" &&
    JSON.parse(firstMetadata.get("fixture-audit-unknown"))?.ip === "192.168.56.x" &&
    !Object.hasOwn(JSON.parse(firstMetadata.get("fixture-audit-unknown")), "user_agent") &&
    !Object.hasOwn(JSON.parse(firstMetadata.get("fixture-audit-known")), "email") &&
    JSON.parse(firstMetadata.get("fixture-audit-known"))?.ip === "2001:x" &&
    !Object.hasOwn(JSON.parse(firstMetadata.get("fixture-audit-known")), "user_agent") &&
    JSON.parse(firstMetadata.get("fixture-audit-third"))?.email === "le***@example.invalid" &&
    JSON.parse(firstMetadata.get("fixture-audit-third"))?.ip === "203.0.113.x" &&
    before.legacyRows.every((row) => JSON.parse(firstMetadata.get(row.id)).retained === row.metadata.retained);
  database.close();
  database = undefined;

  runTsx("scripts/db-migrate.ts");
  database = new DatabaseSync(databasePath, { readOnly: true });
  const repeatedRead = database.prepare("SELECT metadata_json FROM audit_events WHERE id = ?");
  const idempotent = before.legacyRows.every((row) => String(repeatedRead.get(row.id)?.metadata_json ?? "") === firstMetadata.get(row.id));
  const hasMigration = Number(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE filename = ?").get(migration).count) === 1;
  database.close();
  database = undefined;

  ok("la migración 010 preserva las filas de todas las demás tablas y los campos del evento", preserved && auditFieldsPreserved);
  ok("la migración 010 aplica las reglas de correo, IP y user-agent; schemaVersion llega a 11", metadataCorrect && schemaVersion === 11 && hasMigration);
  ok("la segunda ejecución de db:migrate deja iguales los metadatos minimizados", idempotent);
} catch (error) {
  console.error("Error en migration-010-with-data:", error instanceof Error ? error.message : "fallo desconocido");
  process.exitCode = 1;
} finally {
  try { database?.close(); } catch {}
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {
    console.error("No se pudo limpiar la base temporal de migration-010.");
    process.exitCode = 1;
  }
  console.log(`\nRESULTADO: ${pass} ✅ / ${fail} ❌`);
  if (fail) process.exitCode = 1;
}
