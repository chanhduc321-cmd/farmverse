CREATE TABLE IF NOT EXISTS farm_friendships (
  sender_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  confirmed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (sender_id, recipient_id),
  CHECK (sender_id <> recipient_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_friendships_pair
  ON farm_friendships (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id));
CREATE INDEX IF NOT EXISTS farm_friendships_recipient ON farm_friendships (recipient_id, sender_id);

CREATE TABLE IF NOT EXISTS farm_crop_steals (
  host_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  plot_index smallint NOT NULL CHECK (plot_index BETWEEN 0 AND 5),
  planted_at bigint NOT NULL,
  visitor_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  PRIMARY KEY (host_id, plot_index, planted_at, visitor_id),
  CHECK (host_id <> visitor_id)
);
