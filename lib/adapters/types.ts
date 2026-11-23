export type AppMode = "demo" | "local";

export const TABLE_NAMES = [
  "users",
  "account_requests",
  "sessions",
  "expedientes",
  "expediente_assignments",
  "requirement_catalog",
  "expediente_requirements",
  "documents",
  "document_versions",
  "observations",
  "gates",
  "external_events",
  "notifications",
  "audit_events",
  "export_jobs",
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export type AdapterHealth = {
  ok: boolean;
  detail?: string;
};

export type DataRecord = {
  id?: string;
  [key: string]: unknown;
};

export type StoredFile = {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export type ExportResult = {
  exportId: string;
  path: string;
  format: "migration" | "zoho" | "supabase";
};

export interface DatabaseAdapter {
  readonly kind: "mock" | "sqlite";
  health(): Promise<AdapterHealth>;
  schemaVersion(): Promise<number>;
  tableCounts(): Promise<Partial<Record<TableName, number>>>;
  initialize(): Promise<void>;
  close(): Promise<void>;
  find(table: TableName, id: string): Promise<DataRecord | null>;
  list(table: TableName): Promise<DataRecord[]>;
  insert(table: TableName, record: DataRecord): Promise<DataRecord>;
  update(table: TableName, id: string, record: DataRecord): Promise<DataRecord>;
  appendAudit(record: DataRecord): Promise<void>;
}

export interface StorageAdapter {
  readonly kind: "mock" | "local";
  health(): Promise<AdapterHealth>;
  put(file: Buffer, metadata: Omit<StoredFile, "sizeBytes" | "sha256">): Promise<StoredFile>;
  remove(storageKey: string): Promise<void>;
  getPath(storageKey: string): Promise<string>;
}

export interface ExportAdapter {
  readonly kind: "mock" | "local";
  exportMigration(): Promise<ExportResult>;
  exportZoho(): Promise<ExportResult>;
  exportSupabase(): Promise<ExportResult>;
}

export type AppAdapters = {
  mode: AppMode;
  db: DatabaseAdapter;
  storage: StorageAdapter;
  exports: ExportAdapter;
};
