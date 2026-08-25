CREATE TABLE IF NOT EXISTS auth_login_attempts (
  username VARCHAR(120) NOT NULL,
  client_ip VARCHAR(64) NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (username, client_ip)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_blocked_until
  ON auth_login_attempts(blocked_until);
