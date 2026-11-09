BEGIN;

CREATE TABLE IF NOT EXISTS farm_sessions (
  id uuid PRIMARY KEY,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  gold integer NOT NULL DEFAULT 0 CHECK (gold >= 0),
  normal_count integer NOT NULL DEFAULT 0 CHECK (normal_count BETWEEN 0 AND 10),
  golden_count integer NOT NULL DEFAULT 0 CHECK (golden_count BETWEEN 0 AND 10),
  CHECK (normal_count + golden_count <= 10)
);

CREATE TABLE IF NOT EXISTS farm_plots (
  session_id uuid NOT NULL REFERENCES farm_sessions (id) ON DELETE CASCADE,
  id smallint NOT NULL CHECK (id > 0),
  unlocked boolean NOT NULL,
  unlock_cost_gold integer NOT NULL CHECK (unlock_cost_gold >= 0),
  ready_at timestamptz,
  CHECK (unlocked OR ready_at IS NULL),
  PRIMARY KEY (session_id, id)
);

COMMIT;
