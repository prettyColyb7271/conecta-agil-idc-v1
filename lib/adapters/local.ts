import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "./config";
import type {
  AdapterHealth,
  DataRecord,
  DatabaseAdapter,
  ExportAdapter,
  ExportResult,
  StorageAdapter,
  StoredFile,
} from "./types";

const notReady = (name: string) => new Error(`${name} aún no está habilitado; corresponde al PASO 2 o posterior.`);

class SQLiteDatabaseAdapter implements DatabaseAdapter {
  readonly kind = "sqlite" as const;
  readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async health(): Promise<AdapterHealth> {
    return { ok: true, detail: "SQLite local preparado; la conexión se habilita en el PASO 2." };
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async close(): Promise<void> {}
  async find(table: string, id: string): Promise<DataRecord | null> {
    void table; void id;
    throw notReady("SQLite");
  }
  async list(table: string): Promise<DataRecord[]> {
    void table;
    throw notReady("SQLite");
  }
  async insert(table: string, record: DataRecord): Promise<DataRecord> {
    void table; void record;
    throw notReady("SQLite");
  }
  async update(table: string, id: string, record: DataRecord): Promise<DataRecord> {
    void table; void id; void record;
    throw notReady("SQLite");
  }
  async appendAudit(record: DataRecord): Promise<void> {
    void record;
    throw notReady("SQLite");
  }
}

class LocalStorageAdapter implements StorageAdapter {
  readonly kind = "local" as const;
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async health(): Promise<AdapterHealth> {
    return { ok: true, detail: "Almacenamiento local preparado; la escritura se habilita en el PASO 5." };
  }

  async put(file: Buffer, metadata: Omit<StoredFile, "sizeBytes" | "sha256">): Promise<StoredFile> {
    void file; void metadata;
    throw notReady("Almacenamiento local");
  }

  async remove(storageKey: string): Promise<void> {
    void storageKey;
    throw notReady("Almacenamiento local");
  }

  async getPath(storageKey: string): Promise<string> {
    return path.join(this.root, storageKey);
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
