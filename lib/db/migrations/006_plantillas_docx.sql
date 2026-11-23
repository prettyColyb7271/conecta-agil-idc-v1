CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, filename TEXT NOT NULL, version INTEGER NOT NULL,
  sha256 TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size_bytes INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL,
  UNIQUE(code, version)
);
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates(code, active);
INSERT OR IGNORE INTO templates (id, code, filename, version, sha256, storage_key, size_bytes, active, created_at)
VALUES
 ('default-f02', 'F-02', 'F-02_carta_poder.docx', 1, 'e7131edecf5b001784a37e075a044d89036adff2dcb03f0944898652c5952432', 'templates/F-02_carta_poder.docx', 1900, 1, '2026-01-01T00:00:00.000Z'),
 ('default-f03', 'F-03', 'F-03_carta_poder_uiie.docx', 1, 'a293ac88ef18376ee1e737df65cf381cb5e48c0feffe9eca775b0f95c6220e51', 'templates/F-03_carta_poder_uiie.docx', 1802, 1, '2026-01-01T00:00:00.000Z'),
 ('default-f04', 'F-04', 'F-04_ficha.docx', 1, '7b1b59162f4707885e3bc5892fdd64933f3b7f67754cddbd1fb72538aa1f1ad5', 'templates/F-04_ficha.docx', 1794, 1, '2026-01-01T00:00:00.000Z'),
 ('default-f06', 'F-06', 'F-06_caratula.docx', 1, '84d2c11ac4eb2285028b0bcf142ca6f4d7ff4c9fd564a417cf62cbf578edd5ac', 'templates/F-06_caratula.docx', 1715, 1, '2026-01-01T00:00:00.000Z');
