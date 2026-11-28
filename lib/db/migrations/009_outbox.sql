CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  expediente_id TEXT NOT NULL REFERENCES expedientes(id),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'enviando', 'enviado', 'fallido')) DEFAULT 'pendiente',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_attempt_at TEXT,
  zoho_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_expediente_created ON outbox(expediente_id, created_at);
