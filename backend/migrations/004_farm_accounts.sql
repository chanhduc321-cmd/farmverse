ALTER TABLE farm_guest_progress ADD COLUMN IF NOT EXISTS claimed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS farm_accounts (
  farm_id uuid PRIMARY KEY REFERENCES farm_guest_progress (session_id),
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  password_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS farm_account_sessions (
  token_hash text PRIMARY KEY,
  farm_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS farm_account_sessions_expiry ON farm_account_sessions (expires_at);
