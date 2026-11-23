ALTER TABLE expediente_requirements ADD COLUMN workflow_status TEXT;

CREATE TABLE external_events_new (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'firma_presencial', 'ingreso_acuse', 'cfe_incompleto', 'resolucion_cfe',
    'contrato', 'uiie', 'visita_uiie', 'certificado_uiie', 'medidor',
    'interconexion', 'alta_comercial', 'cierre'
  )),
  event_date TEXT NOT NULL,
  description TEXT NOT NULL,
  document_id TEXT REFERENCES documents(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  medio TEXT,
  solicitud_numero TEXT,
  vigencia_meses INTEGER,
  vence_at TEXT,
  resultado TEXT CHECK (resultado IS NULL OR resultado IN ('favorable', 'condicionado', 'no_favorable')),
  subgate_requerido INTEGER NOT NULL DEFAULT 0 CHECK (subgate_requerido IN (0, 1)),
  subgate_document_id TEXT REFERENCES documents(id),
  reinicio_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

INSERT INTO external_events_new (
  id, expediente_id, event_type, event_date, description, document_id,
  created_by, created_at
)
SELECT id, expediente_id, event_type, event_date, description, document_id,
       created_by, created_at
FROM external_events;

DROP TABLE external_events;
ALTER TABLE external_events_new RENAME TO external_events;
CREATE INDEX idx_external_events_expediente_id ON external_events(expediente_id);
CREATE INDEX idx_external_events_expiry ON external_events(vence_at);
