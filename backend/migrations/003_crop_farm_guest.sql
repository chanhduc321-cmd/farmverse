CREATE TABLE IF NOT EXISTS farm_guest_progress (
  session_id uuid PRIMARY KEY,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object')
);
