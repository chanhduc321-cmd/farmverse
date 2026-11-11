ALTER TABLE farm_guest_progress
ADD COLUMN IF NOT EXISTS merchant_state jsonb CHECK (jsonb_typeof(merchant_state) = 'object');
