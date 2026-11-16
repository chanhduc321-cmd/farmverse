-- Weekly leaderboard scans steals and pet blocks by time across all farms.
CREATE INDEX IF NOT EXISTS farm_activities_created_type
  ON farm_activities (created_at, type)
  WHERE type IN ('steal', 'pet_block');
