ALTER TABLE farm_activities DROP CONSTRAINT IF EXISTS farm_activities_type_check;
ALTER TABLE farm_activities ADD CONSTRAINT farm_activities_type_check
  CHECK (type IN ('visit', 'steal', 'pet_block'));

CREATE UNIQUE INDEX IF NOT EXISTS farm_activities_pet_block_unique
  ON farm_activities (host_id, visitor_id, plot_index, planted_at)
  WHERE type = 'pet_block';
