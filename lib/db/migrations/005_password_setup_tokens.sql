CREATE TABLE password_setup_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX password_setup_tokens_user_idx ON password_setup_tokens(user_id, created_at);
CREATE INDEX password_setup_tokens_expiry_idx ON password_setup_tokens(expires_at, used_at);
