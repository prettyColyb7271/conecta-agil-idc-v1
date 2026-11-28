CREATE TABLE users_a8b (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  apellidos TEXT,
  telefono_contacto TEXT,
  role TEXT NOT NULL CHECK (role IN ('cliente', 'gestor_tramites_cfe', 'coordinador_idc', 'admin_seguridad')),
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'activo', 'bloqueado', 'baja')) DEFAULT 'pendiente',
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1))
);

INSERT INTO users_a8b (
  id, email, display_name, role, status, password_hash, email_verified_at,
  created_at, updated_at, last_login_at, must_change_password
)
SELECT
  id, email, display_name, role, status, password_hash, email_verified_at,
  created_at, updated_at, last_login_at, must_change_password
FROM users;

DROP TABLE users;
ALTER TABLE users_a8b RENAME TO users;

ALTER TABLE sessions ADD COLUMN mfa_recent_verified_at TEXT;
ALTER TABLE password_recovery_requests
  ADD COLUMN account_exists INTEGER NOT NULL DEFAULT 0 CHECK (account_exists IN (0, 1));

UPDATE password_recovery_requests
SET account_exists = CASE WHEN EXISTS (
  SELECT 1 FROM users WHERE lower(users.email) = lower(password_recovery_requests.email)
) THEN 1 ELSE 0 END;

CREATE TABLE password_recovery_codes (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES password_recovery_requests(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 6),
  status TEXT NOT NULL CHECK (status IN ('activo', 'usado', 'vencido', 'agotado', 'reemplazado')) DEFAULT 'activo',
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX idx_recovery_codes_request_id ON password_recovery_codes(request_id);
CREATE INDEX idx_recovery_codes_user_id ON password_recovery_codes(user_id);

CREATE TABLE recovery_rate_limits (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('email', 'ip')),
  key_hash TEXT NOT NULL,
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  UNIQUE (scope, key_hash, window_start)
);
