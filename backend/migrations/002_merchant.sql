BEGIN;

CREATE TABLE IF NOT EXISTS merchant_states (
  session_id uuid PRIMARY KEY REFERENCES farm_sessions (id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  gold_budget integer NOT NULL DEFAULT 200 CHECK (gold_budget >= 0),
  normal_count integer NOT NULL DEFAULT 3 CHECK (normal_count BETWEEN 0 AND 10),
  golden_count integer NOT NULL DEFAULT 1 CHECK (golden_count BETWEEN 0 AND 10),
  demand smallint NOT NULL DEFAULT 5 CHECK (demand BETWEEN 0 AND 10),
  sell_fail_streak integer NOT NULL DEFAULT 0 CHECK (sell_fail_streak >= 0),
  grant_used boolean NOT NULL DEFAULT false,
  is_self_sustaining boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'OUT_OF_BUSINESS')),
  cooldown_until timestamptz,
  next_offer_at timestamptz,
  CHECK (normal_count + golden_count <= 10),
  CHECK (NOT grant_used OR NOT is_self_sustaining),
  CHECK ((status = 'ACTIVE' AND next_offer_at IS NOT NULL)
    OR (status = 'OUT_OF_BUSINESS' AND next_offer_at IS NULL AND cooldown_until IS NULL))
);

CREATE TABLE IF NOT EXISTS merchant_offers (
  id text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES merchant_states (session_id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  crop text NOT NULL CHECK (crop IN ('NORMAL', 'GOLDEN')),
  price_gold integer NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
  resolved_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((status = 'ACTIVE' AND resolved_at IS NULL) OR (status <> 'ACTIVE' AND resolved_at IS NOT NULL)),
  CHECK ((side = 'BUY' AND price_gold BETWEEN
      CASE crop WHEN 'NORMAL' THEN 10 ELSE 30 END AND CASE crop WHEN 'NORMAL' THEN 25 ELSE 75 END)
    OR (side = 'SELL' AND price_gold BETWEEN
      CASE crop WHEN 'NORMAL' THEN 30 ELSE 90 END AND CASE crop WHEN 'NORMAL' THEN 75 ELSE 225 END))
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_one_active_offer
  ON merchant_offers (session_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS merchant_recovery_events (
  id text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES merchant_states (session_id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('LIQUIDATION', 'OPERATING_GRANT', 'OUT_OF_BUSINESS')),
  crop text CHECK (crop IN ('NORMAL', 'GOLDEN')),
  gold_added integer,
  CHECK ((kind = 'LIQUIDATION' AND crop IS NOT NULL AND gold_added IS NOT NULL
      AND gold_added = CASE crop WHEN 'NORMAL' THEN 10 ELSE 30 END)
    OR (kind = 'OPERATING_GRANT' AND crop IS NULL AND gold_added IS NOT NULL AND gold_added = 60)
    OR (kind = 'OUT_OF_BUSINESS' AND crop IS NULL AND gold_added IS NULL))
);

CREATE INDEX IF NOT EXISTS merchant_recovery_session ON merchant_recovery_events (session_id);

COMMIT;
