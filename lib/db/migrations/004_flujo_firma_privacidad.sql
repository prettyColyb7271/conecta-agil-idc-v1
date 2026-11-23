ALTER TABLE expedientes ADD COLUMN privacy_accepted_at TEXT;
ALTER TABLE expedientes ADD COLUMN privacy_accepted_version TEXT;
ALTER TABLE expedientes ADD COLUMN privacy_accepted_by TEXT REFERENCES users(id);

ALTER TABLE document_versions ADD COLUMN source_version_id TEXT REFERENCES document_versions(id);

CREATE TABLE expediente_requirements_new (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  requirement_code TEXT NOT NULL REFERENCES requirement_catalog(code),
  status TEXT NOT NULL CHECK (status IN ('requerido', 'en_captura', 'cargado', 'pdf_generado', 'pendiente_firma_presencial', 'escaneo_recibido', 'escaneo_verificado_idc', 'en_revision_idc', 'observado', 'validado_idc', 'no_aplica_justificado', 'vencido', 'archivado', 'invalidado_por_cambio')) DEFAULT 'requerido',
  document_id TEXT,
  version_id TEXT,
  observed_reason TEXT,
  validated_by TEXT REFERENCES users(id),
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (expediente_id, requirement_code)
);

INSERT INTO expediente_requirements_new
  SELECT id, expediente_id, requirement_code, status, document_id, version_id, observed_reason, validated_by, validated_at, updated_at
  FROM expediente_requirements;
DROP TABLE expediente_requirements;
ALTER TABLE expediente_requirements_new RENAME TO expediente_requirements;
CREATE INDEX IF NOT EXISTS idx_expediente_requirements_expediente_id ON expediente_requirements(expediente_id);
