CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, filename TEXT NOT NULL, version INTEGER NOT NULL,
  sha256 TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size_bytes INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL,
  UNIQUE(code, version)
);
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates(code, active);
INSERT OR IGNORE INTO templates (id, code, filename, version, sha256, storage_key, size_bytes, active, created_at)
VALUES
 ('default-f02', 'F-02', 'F-02_carta_poder.docx', 1, 'c720696195e647017d9670919433848d0ef911de3ee19087addf3d41f46ebbc4', 'templates/F-02_carta_poder.docx', 11981, 1, '2026-01-01T00:00:00.000Z'),
 ('default-f03', 'F-03', 'F-03_carta_poder_uiie.docx', 1, '4fb90dc0f9a20fcbfe49c36342466010abf6a25b9378f8556c427da02505ddb3', 'templates/F-03_carta_poder_uiie.docx', 12129, 1, '2026-01-01T00:00:00.000Z'),
 ('default-f04', 'F-04', 'F-04_ficha.docx', 1, '0fe6a0152e8ca8897550951a4c79a3dac1ce36b88d2cb36c236c777df1a13a8c', 'templates/F-04_ficha.docx', 12387, 1, '2026-01-01T00:00:00.000Z'),
 ('default-f06', 'F-06', 'F-06_caratula.docx', 1, 'e9717ef06db8101b5f8dcd0bf10fba5eb1f2b72a978f13a6488eaa6e011d9368', 'templates/F-06_caratula.docx', 12396, 1, '2026-01-01T00:00:00.000Z');
