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

class MockDatabaseAdapter implements DatabaseAdapter {
  readonly kind = "mock" as const;
  private readonly records: Record<TableName, Map<string, DataRecord>>;

  constructor() {
    this.records = {
      users: new Map(),
      account_requests: new Map(),
      sessions: new Map(),
      expedientes: new Map(),
      expediente_assignments: new Map(),
      requirement_catalog: new Map(),
      expediente_requirements: new Map(),
      documents: new Map(),
      document_versions: new Map(),
      observations: new Map(),
      gates: new Map(),
      external_events: new Map(),
      notifications: new Map(),
      audit_events: new Map(),
      export_jobs: new Map(),
      password_setup_tokens: new Map(),
    };
    this.seedFromMockData();
  }

  async health(): Promise<AdapterHealth> {
    return { ok: true };
  }

  async schemaVersion(): Promise<number> {
    return 0;
  }

  async tableCounts(): Promise<Partial<Record<TableName, number>>> {
    return Object.fromEntries(
      Object.entries(this.records).map(([table, records]) => [table, records.size]),
    ) as Partial<Record<TableName, number>>;
  }

  async initialize(): Promise<void> {}
  async close(): Promise<void> {}

  async find(table: TableName, id: string): Promise<DataRecord | null> {
    return this.records[table].get(id) ?? null;
  }

  async list(table: TableName): Promise<DataRecord[]> {
    return [...this.records[table].values()].map((record) => ({ ...record }));
  }

  async insert(table: TableName, record: DataRecord): Promise<DataRecord> {
    const key = record.id ?? String(record.code ?? "");
    if (!key) throw new Error(`El registro de ${table} necesita id o code.`);
    if (this.records[table].has(key)) {
      throw new Error(`El registro ${key} ya existe en ${table}.`);
    }
    this.records[table].set(key, { ...record, id: record.id ?? key });
    return { ...record };
  }

  async update(table: TableName, id: string, record: DataRecord): Promise<DataRecord> {
    if (!this.records[table].has(id)) {
      throw new Error(`El registro ${id} no existe en ${table}.`);
    }
    const updated = { ...record, id };
    this.records[table].set(id, updated);
    return { ...updated };
  }

  async appendAudit(record: DataRecord): Promise<void> {
    await this.insert("audit_events", record);
  }

  private seedFromMockData() {
    const users = [
      { id: "u1", nombre: "Prudencio Villa Buenaventura", role: "cliente", estado: "pendiente" },
      { id: "u2", nombre: "Olegario Serenes Souza", role: "coordinador_idc", estado: "activo" },
      { id: "u3", nombre: "Crecencio Chaparro Moreno", role: "gestor_tramites_cfe", estado: "bloqueado" },
    ];
    for (const user of users) this.records.users.set(user.id, user);
    this.records.expedientes.set("exp-demo", {
      id: "exp-demo",
      folio: "IDC-2026-021",
      tramite: "Interconexión FV MT",
      status: "demo",
    });
    this.records.notifications.set("n1", {
      id: "n1",
      title: "Falta información en acta constitutiva",
      expediente_id: "exp-demo",
    });
  }
}

class MockStorageAdapter implements StorageAdapter {
  readonly kind = "mock" as const;

  async health(): Promise<AdapterHealth> {
    return { ok: true };
  }

  async put(file: Buffer, metadata: Omit<StoredFile, "sizeBytes" | "sha256">): Promise<StoredFile> {
    void file;
    void metadata;
    throw new Error("El almacenamiento mock no admite archivos en este paso.");
  }

  async remove(storageKey: string): Promise<void> {
    void storageKey;
    throw new Error("El almacenamiento mock no admite archivos en este paso.");
  }

  async getPath(storageKey: string): Promise<string> {
    void storageKey;
    throw new Error("El almacenamiento mock no admite archivos en este paso.");
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
