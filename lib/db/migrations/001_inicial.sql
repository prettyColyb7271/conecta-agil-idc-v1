CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('cliente', 'gestor_tramites_cfe', 'coordinador_idc', 'admin_seguridad')),
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'activo', 'bloqueado')) DEFAULT 'pendiente',
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS account_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'aprobada', 'rechazada')) DEFAULT 'pendiente',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expedientes (
  id TEXT PRIMARY KEY,
  folio TEXT NOT NULL UNIQUE,
  tramite TEXT NOT NULL,
  nivel_tension TEXT NOT NULL CHECK (nivel_tension IN ('BT', 'MT')),
  habilitado INTEGER NOT NULL CHECK (habilitado IN (0, 1)),
  cliente_id TEXT NOT NULL REFERENCES users(id),
  gestor_id TEXT REFERENCES users(id),
  coordinador_id TEXT REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('borrador', 'activo', 'observado', 'cerrado', 'archivado')) DEFAULT 'borrador',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expediente_assignments (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('cliente', 'gestor_tramites_cfe', 'coordinador_idc')),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requirement_catalog (
  code TEXT PRIMARY KEY CHECK (code GLOB 'R[0-9][0-9]' OR code GLOB 'U[0-9][0-9]'),
  group_code TEXT NOT NULL CHECK (group_code IN ('R', 'U')),
  name TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expediente_requirements (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  requirement_code TEXT NOT NULL REFERENCES requirement_catalog(code),
  status TEXT NOT NULL CHECK (status IN ('requerido', 'en_captura', 'cargado', 'en_revision_idc', 'observado', 'validado_idc', 'no_aplica_justificado', 'vencido', 'archivado', 'invalidado_por_cambio')) DEFAULT 'requerido',
  document_id TEXT,
  version_id TEXT,
  observed_reason TEXT,
  validated_by TEXT REFERENCES users(id),
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (expediente_id, requirement_code)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  requirement_id TEXT REFERENCES expediente_requirements(id),
  document_type TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cliente', 'idc', 'externo', 'generado')),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('normal', 'sensible')),
  status TEXT NOT NULL CHECK (status IN ('requerido', 'en_captura', 'cargado', 'en_revision_idc', 'observado', 'validado_idc', 'pdf_generado', 'pendiente_firma_presencial', 'escaneo_recibido', 'escaneo_verificado_idc', 'listo_para_ingreso', 'ingresado_con_acuse', 'en_revision_cfe', 'observado_cfe', 'resuelto_favorable', 'resuelto_condicionado', 'no_favorable', 'no_aplica_justificado', 'vencido', 'archivado', 'invalidado_por_cambio')) DEFAULT 'requerido',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  origin TEXT NOT NULL CHECK (origin IN ('captura', 'carga', 'generado')),
  template_version TEXT,
  change_reason TEXT,
  derived_from_version_id TEXT REFERENCES document_versions(id),
  created_at TEXT NOT NULL,
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  requirement_id TEXT REFERENCES expediente_requirements(id),
  document_version_id TEXT REFERENCES document_versions(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  visibility TEXT NOT NULL CHECK (visibility IN ('cliente', 'interno_idc')),
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('abierta', 'resuelta')) DEFAULT 'abierta',
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gates (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  gate_code TEXT NOT NULL CHECK (gate_code IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7')),
  status TEXT NOT NULL CHECK (status IN ('abierto', 'bloqueado', 'pendiente', 'cerrado', 'observado')) DEFAULT 'bloqueado',
  document_id TEXT REFERENCES documents(id),
  closed_by TEXT REFERENCES users(id),
  closed_at TEXT,
  reopened_at TEXT,
  reopen_reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (expediente_id, gate_code)
);

CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('firma_presencial', 'ingreso_acuse', 'resolucion_cfe', 'contrato', 'uiie', 'medidor', 'cierre')),
  event_date TEXT NOT NULL,
  description TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expediente_id TEXT REFERENCES expedientes(id),
  type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('baja', 'normal', 'alta', 'urgente')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  actor_role TEXT,
  expediente_id TEXT REFERENCES expedientes(id),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL REFERENCES users(id),
  export_type TEXT NOT NULL CHECK (export_type IN ('migration', 'zoho', 'supabase')),
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'en_proceso', 'completado', 'error')),
  manifest_path TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_requests_reviewed_by ON account_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_cliente_id ON expedientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_gestor_id ON expedientes(gestor_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_coordinador_id ON expedientes(coordinador_id);
CREATE INDEX IF NOT EXISTS idx_assignments_expediente_id ON expediente_assignments(expediente_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON expediente_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_expediente_requirements_expediente_id ON expediente_requirements(expediente_id);
CREATE INDEX IF NOT EXISTS idx_documents_expediente_id ON documents(expediente_id);
CREATE INDEX IF NOT EXISTS idx_documents_requirement_id ON documents(requirement_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_observations_expediente_id ON observations(expediente_id);
CREATE INDEX IF NOT EXISTS idx_gates_expediente_id ON gates(expediente_id);
CREATE INDEX IF NOT EXISTS idx_external_events_expediente_id ON external_events(expediente_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_expediente_id ON notifications(expediente_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_expediente_id ON audit_events(expediente_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_requested_by ON export_jobs(requested_by);

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
