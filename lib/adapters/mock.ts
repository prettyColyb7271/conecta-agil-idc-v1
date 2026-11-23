import type {
  AdapterHealth,
  DataRecord,
  DatabaseAdapter,
  ExportAdapter,
  ExportResult,
  StorageAdapter,
  StoredFile,
} from "./types";

class MockDatabaseAdapter implements DatabaseAdapter {
  readonly kind = "mock" as const;

  async health(): Promise<AdapterHealth> {
    return { ok: true };
  }

  async initialize(): Promise<void> {}
  async close(): Promise<void> {}

  async find(table: string, id: string): Promise<DataRecord | null> {
    void table; void id;
    throw new Error("La persistencia mock todavía no está habilitada.");
  }

  async list(table: string): Promise<DataRecord[]> {
    void table;
    throw new Error("La persistencia mock todavía no está habilitada.");
  }

  async insert(table: string, record: DataRecord): Promise<DataRecord> {
    void table; void record;
    throw new Error("La persistencia mock todavía no está habilitada.");
  }

  async update(table: string, id: string, record: DataRecord): Promise<DataRecord> {
    void table; void id; void record;
    throw new Error("La persistencia mock todavía no está habilitada.");
  }

  async appendAudit(record: DataRecord): Promise<void> {
    void record;
    throw new Error("La auditoría mock todavía no está habilitada.");
  }
}

class MockStorageAdapter implements StorageAdapter {
  readonly kind = "mock" as const;

  async health(): Promise<AdapterHealth> {
    return { ok: true };
  }

  async put(file: Buffer, metadata: Omit<StoredFile, "sizeBytes" | "sha256">): Promise<StoredFile> {
    void file; void metadata;
    throw new Error("El almacenamiento mock todavía no está habilitado.");
  }

  async remove(storageKey: string): Promise<void> {
    void storageKey;
    throw new Error("El almacenamiento mock todavía no está habilitado.");
  }

  async getPath(storageKey: string): Promise<string> {
    void storageKey;
    throw new Error("El almacenamiento mock todavía no está habilitado.");
  }
}

class MockExportAdapter implements ExportAdapter {
  readonly kind = "mock" as const;

  async exportMigration(): Promise<ExportResult> {
    throw new Error("La exportación mock todavía no está habilitada.");
  }

  async exportZoho(): Promise<ExportResult> {
    throw new Error("La exportación Zoho todavía no está habilitada.");
  }

  async exportSupabase(): Promise<ExportResult> {
    throw new Error("La exportación Supabase todavía no está habilitada.");
  }
}

export function createMockAdapters() {
  return {
    db: new MockDatabaseAdapter(),
    storage: new MockStorageAdapter(),
    exports: new MockExportAdapter(),
  };
}
