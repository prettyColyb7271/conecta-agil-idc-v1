import type { TableName } from "@/lib/adapters/types";

export const TABLE_COLUMNS: Record<TableName, readonly string[]> = {
  users: ["id", "email", "display_name", "role", "status", "password_hash", "email_verified_at", "created_at", "updated_at", "last_login_at"],
  account_requests: ["id", "email", "display_name", "status", "reviewed_by", "reviewed_at", "reason", "created_at", "user_id", "requested_role"],
  sessions: ["id", "user_id", "session_token_hash", "expires_at", "revoked_at", "created_at", "last_seen_at"],
  expedientes: ["id", "folio", "tramite", "nivel_tension", "habilitado", "cliente_id", "gestor_id", "coordinador_id", "status", "data_json", "privacy_accepted_at", "privacy_accepted_version", "privacy_accepted_by", "created_at", "updated_at"],
  expediente_assignments: ["id", "expediente_id", "user_id", "assignment_type", "assigned_by", "starts_at", "ends_at", "created_at"],
  requirement_catalog: ["code", "group_code", "name", "source_ref", "required", "created_at", "tipo", "integra", "formato_code", "firma_fisica", "sensible", "reutiliza_code", "condicional", "validaciones"],
  expediente_requirements: ["id", "expediente_id", "requirement_code", "status", "document_id", "version_id", "observed_reason", "validated_by", "validated_at", "updated_at"],
  documents: ["id", "expediente_id", "requirement_id", "document_type", "source", "sensitivity", "status", "created_by", "created_at", "updated_at"],
  document_versions: ["id", "document_id", "version_number", "storage_key", "original_filename", "mime_type", "size_bytes", "sha256", "author_id", "origin", "template_version", "change_reason", "derived_from_version_id", "source_version_id", "created_at"],
  observations: ["id", "expediente_id", "requirement_id", "document_version_id", "author_id", "visibility", "body", "status", "resolved_by", "resolved_at", "created_at"],
  gates: ["id", "expediente_id", "gate_code", "status", "document_id", "closed_by", "closed_at", "reopened_at", "reopen_reason", "created_at"],
  external_events: ["id", "expediente_id", "event_type", "event_date", "description", "document_id", "created_by", "created_at"],
  notifications: ["id", "user_id", "expediente_id", "type", "priority", "title", "body", "read_at", "created_at"],
  audit_events: ["id", "actor_id", "actor_role", "expediente_id", "event_type", "entity_type", "entity_id", "metadata_json", "created_at"],
  export_jobs: ["id", "requested_by", "export_type", "status", "manifest_path", "created_at", "completed_at", "error_message"],
  password_setup_tokens: ["id", "user_id", "token_hash", "expires_at", "used_at", "created_by", "created_at"],
};

export const TABLE_PRIMARY_KEYS: Record<TableName, string> = {
  users: "id",
  account_requests: "id",
  sessions: "id",
  expedientes: "id",
  expediente_assignments: "id",
  requirement_catalog: "code",
  expediente_requirements: "id",
  documents: "id",
  document_versions: "id",
  observations: "id",
  gates: "id",
  external_events: "id",
  notifications: "id",
  audit_events: "id",
  export_jobs: "id",
  password_setup_tokens: "id",
};

export function assertTableName(table: string): asserts table is TableName {
  if (!(table in TABLE_COLUMNS)) {
    throw new Error(`Tabla no permitida: ${table}`);
  }
}

export function assertColumnName(table: TableName, column: string): void {
  if (!TABLE_COLUMNS[table].includes(column)) {
    throw new Error(`Columna no permitida: ${table}.${column}`);
  }
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
