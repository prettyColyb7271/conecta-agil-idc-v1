import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import { getLocalDataDir } from "./config";
import { getDatabase, getSchemaVersion } from "@/lib/db/sqlite";
import { assertColumnName, assertTableName, quoteIdentifier, TABLE_PRIMARY_KEYS } from "@/lib/db/schema";
import type {
  AdapterHealth,
  DataRecord,
  DatabaseAdapter,
  ExportAdapter,
  ExportResult,
  StorageAdapter,
  StoredFile,
  TableName,
} from "./types";
import { TABLE_NAMES } from "./types";

const notReady = (name: string) => new Error(`${name} aún no está habilitado; corresponde a un paso posterior.`);

class SQLiteDatabaseAdapter implements DatabaseAdapter {
  readonly kind = "sqlite" as const;
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async health(): Promise<AdapterHealth> {
    getDatabase();
    return { ok: true, detail: "SQLite local activo." };
  }

  async schemaVersion(): Promise<number> {
    return getSchemaVersion();
  }

  async tableCounts(): Promise<Partial<Record<TableName, number>>> {
    const database = getDatabase();
    const counts: Partial<Record<TableName, number>> = {};
    for (const table of TABLE_NAMES) {
      const exists = database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ).get(table);
      counts[table] = exists
        ? Number((database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get() ?? {}).count ?? 0)
        : 0;
    }
    return counts;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    getDatabase();
  }

  async close(): Promise<void> {}

  async find(table: TableName, id: string): Promise<DataRecord | null> {
    assertTableName(table);
    const key = TABLE_PRIMARY_KEYS[table];
    return (getDatabase().prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(key)} = ?`).get(id) as DataRecord | undefined) ?? null;
  }

  async list(table: TableName): Promise<DataRecord[]> {
    assertTableName(table);
    return getDatabase().prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as DataRecord[];
  }

  async insert(table: TableName, record: DataRecord): Promise<DataRecord> {
    assertTableName(table);
    const entries = Object.entries(record);
    if (!entries.length) throw new Error("No se puede insertar un registro vacío.");
    for (const [column] of entries) assertColumnName(table, column);
    const columns = entries.map(([column]) => quoteIdentifier(column)).join(", ");
    const placeholders = entries.map(() => "?").join(", ");
    getDatabase().prepare(
      `INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders})`,
    ).run(...entries.map(([, value]) => value));
    return { ...record };
  }

  async update(table: TableName, id: string, record: DataRecord): Promise<DataRecord> {
    assertTableName(table);
    const key = TABLE_PRIMARY_KEYS[table];
    const entries = Object.entries(record).filter(([column]) => column !== key);
    for (const [column] of entries) assertColumnName(table, column);
    if (!entries.length) return (await this.find(table, id)) ?? { id };
    const assignments = entries.map(([column]) => `${quoteIdentifier(column)} = ?`).join(", ");
    getDatabase().prepare(
      `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE ${quoteIdentifier(key)} = ?`,
    ).run(...entries.map(([, value]) => value), id);
    return (await this.find(table, id)) ?? { id, ...record };
  }

  async appendAudit(record: DataRecord): Promise<void> {
    await this.insert("audit_events", { id: record.id ?? randomUUID(), ...record });
  }
}

class LocalStorageAdapter implements StorageAdapter {
  readonly kind = "local" as const;
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async health(): Promise<AdapterHealth> {
    return { ok: true, detail: "Almacenamiento local preparado." };
  }

  async put(file: Buffer, metadata: Omit<StoredFile, "sizeBytes" | "sha256">): Promise<StoredFile> {
    const storageKey = metadata.storageKey.replaceAll("\\", "/");
    const resolvedRoot = path.resolve(this.root);
    const target = path.resolve(this.root, storageKey);
    if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("storageKey inválida.");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file, { flag: "wx" });
    return {
      ...metadata,
      storageKey,
      sizeBytes: file.byteLength,
      sha256: crypto.createHash("sha256").update(file).digest("hex"),
    };
  }

  async remove(storageKey: string): Promise<void> {
    const resolvedRoot = path.resolve(this.root);
    const target = path.resolve(this.root, storageKey.replaceAll("\\", "/"));
    if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("storageKey inválida.");
    await fs.unlink(target);
  }

  async getPath(storageKey: string): Promise<string> {
    const resolvedRoot = path.resolve(this.root);
    const target = path.resolve(this.root, storageKey.replaceAll("\\", "/"));
    if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("storageKey inválida.");
    return target;
  }
}

class LocalExportAdapter implements ExportAdapter {
  readonly kind = "local" as const;

  async exportMigration(): Promise<ExportResult> { throw notReady("Exportación local"); }
  async exportZoho(): Promise<ExportResult> { throw notReady("Exportación Zoho"); }
  async exportSupabase(): Promise<ExportResult> { throw notReady("Exportación Supabase"); }
}

export function createLocalAdapters() {
  const dataDir = getLocalDataDir();
  return {
    db: new SQLiteDatabaseAdapter(dataDir),
    storage: new LocalStorageAdapter(path.join(dataDir, "documents")),
    exports: new LocalExportAdapter(),
  };
}
