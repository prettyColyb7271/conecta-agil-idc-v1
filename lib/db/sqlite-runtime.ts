import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getLocalDataDir } from "@/lib/adapters/runtime-config";
import { maskEmail, truncateIp } from "@/lib/audit-privacy";

let singleton: DatabaseSync | null = null;
let singletonPath: string | null = null;

export function getDatabase(): DatabaseSync {
  const dataDir = getLocalDataDir();
  const databasePath = path.join(dataDir, "conecta-agil.sqlite");
  if (singleton && singletonPath === databasePath) return singleton;
  if (singleton) singleton.close();
  fs.mkdirSync(dataDir, { recursive: true });
  singleton = new DatabaseSync(databasePath);
  singleton.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  singletonPath = databasePath;
  return singleton;
}

export function getDatabasePath(): string {
  return path.join(getLocalDataDir(), "conecta-agil.sqlite");
}

export function closeDatabase(): void {
  singleton?.close();
  singleton = null;
  singletonPath = null;
}

export function migrateDatabase(): number {
  const database = getDatabase();
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);");
  const migrationsDir = path.join(process.cwd(), "lib", "db", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  const applied = new Set(database.prepare("SELECT filename FROM schema_migrations").all().map((row) => String(row.filename)));
  const insertMigration = database.prepare("INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES (?, ?, ?)");
  database.exec("BEGIN");
  try {
    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
      insertMigration.run(filename, crypto.createHash("sha256").update(sql).digest("hex"), new Date().toISOString());
      if (filename === "004_flujo_firma_privacidad.sql" || filename === "007_paso7_eventos_externos.sql") {
        database.exec("COMMIT");
        database.exec("PRAGMA foreign_keys = OFF;");
        database.exec(sql);
        database.exec("PRAGMA foreign_key_check;");
        database.exec("PRAGMA foreign_keys = ON;");
        database.exec("BEGIN");
      } else {
        database.exec(sql);
      }
      if (filename === "010_audit_events_privacidad.sql") {
        database.exec("DROP TRIGGER IF EXISTS audit_events_append_only_update; DROP TRIGGER IF EXISTS audit_events_append_only_delete;");
        const minimizedRows = minimizeLegacyAuditMetadata(database);
        database.exec(`
          CREATE TRIGGER IF NOT EXISTS audit_events_append_only_update
          BEFORE UPDATE ON audit_events
          BEGIN
            SELECT RAISE(ABORT, 'audit_events es append-only');
          END;
          CREATE TRIGGER IF NOT EXISTS audit_events_append_only_delete
          BEFORE DELETE ON audit_events
          BEGIN
            SELECT RAISE(ABORT, 'audit_events es append-only');
          END;
        `);
        console.log(`Migración 010: ${minimizedRows} filas de bitácora minimizadas.`);
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return getSchemaVersion(database);
}

function minimizeLegacyAuditMetadata(database: DatabaseSync): number {
  const rows = database.prepare("SELECT id, actor_id, metadata_json FROM audit_events").all() as Array<{
    id: string;
    actor_id: string | null;
    metadata_json: string;
  }>;
  const updateMetadata = database.prepare("UPDATE audit_events SET metadata_json = ? WHERE id = ?");
  let updatedRows = 0;

  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.metadata_json);
    } catch {
      throw new Error("Migración 010 cancelada: metadata_json contiene un valor inválido.");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Migración 010 cancelada: metadata_json no es un objeto.");
    }

    const metadata = parsed as Record<string, unknown>;
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(metadata, "email")) {
      if (row.actor_id !== null) {
        delete metadata.email;
        changed = true;
      } else {
        const email = maskEmail(typeof metadata.email === "string" ? metadata.email : null);
        if (email) {
          if (metadata.email !== email) {
            metadata.email = email;
            changed = true;
          }
        } else {
          delete metadata.email;
          changed = true;
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(metadata, "ip")) {
      const ip = truncateIp(typeof metadata.ip === "string" ? metadata.ip : null);
      if (ip) {
        if (metadata.ip !== ip) {
          metadata.ip = ip;
          changed = true;
        }
      } else {
        delete metadata.ip;
        changed = true;
      }
    }

    if (Object.prototype.hasOwnProperty.call(metadata, "user_agent")) {
      delete metadata.user_agent;
      changed = true;
    }

    if (changed) {
      updateMetadata.run(JSON.stringify(metadata), row.id);
      updatedRows += 1;
    }
  }

  return updatedRows;
}

export function getSchemaVersion(database = getDatabase()): number {
  const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("schema_migrations");
  if (!table) return 0;
  return database.prepare("SELECT filename FROM schema_migrations").all()
    .reduce((max, row) => Math.max(max, Number.parseInt(String(row.filename).slice(0, 3), 10) || 0), 0);
}

export function resetDatabase(): void {
  const databasePath = getDatabasePath();
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${databasePath}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target);
  }
}
