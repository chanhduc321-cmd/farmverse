-- FV-INVITE-01: who invited an account, and when its one-time reward was settled.
ALTER TABLE farm_accounts
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES farm_accounts (farm_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_rewarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_inviter_paid boolean NOT NULL DEFAULT false;

ALTER TABLE farm_accounts DROP CONSTRAINT IF EXISTS farm_accounts_no_self_referral;
ALTER TABLE farm_accounts ADD CONSTRAINT farm_accounts_no_self_referral CHECK (referred_by <> farm_id);

-- Daily cap lookup: an inviter's settled invites by time.
CREATE INDEX IF NOT EXISTS farm_accounts_referral_settled
  ON farm_accounts (referred_by, referral_rewarded_at)
  WHERE referral_rewarded_at IS NOT NULL;

ALTER TABLE farm_activities DROP CONSTRAINT IF EXISTS farm_activities_type_check;
ALTER TABLE farm_activities ADD CONSTRAINT farm_activities_type_check
  CHECK (type IN ('visit', 'steal', 'pet_block', 'invite'));
