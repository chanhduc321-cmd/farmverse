ALTER TABLE farm_accounts ADD COLUMN IF NOT EXISTS last_activity_read_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00';

CREATE TABLE IF NOT EXISTS farm_activities (
  id bigserial PRIMARY KEY,
  host_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  type varchar(16) NOT NULL CHECK (type IN ('visit', 'steal')),
  plot_index smallint CHECK (plot_index BETWEEN 0 AND 5),
  crop_id smallint,
  planted_at bigint,
  amount smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_activities_steal_unique
  ON farm_activities (host_id, visitor_id, plot_index, planted_at)
  WHERE type = 'steal';

CREATE INDEX IF NOT EXISTS farm_activities_host_created
  ON farm_activities (host_id, created_at DESC, id DESC);
