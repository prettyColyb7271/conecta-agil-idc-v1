import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getLocalDataDir } from "@/lib/adapters/runtime-config";

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
      database.exec(sql);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return getSchemaVersion(database);
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
