export type AppMode = "demo" | "local";

export type AdapterHealth = {
  ok: boolean;
  detail?: string;
};

export type DataRecord = {
  id: string;
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
  initialize(): Promise<void>;
  close(): Promise<void>;
  find(table: string, id: string): Promise<DataRecord | null>;
  list(table: string): Promise<DataRecord[]>;
  insert(table: string, record: DataRecord): Promise<DataRecord>;
  update(table: string, id: string, record: DataRecord): Promise<DataRecord>;
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
