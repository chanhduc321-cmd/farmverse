ALTER TABLE farm_accounts ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS farm_social_identities (
  issuer text NOT NULL,
  subject text NOT NULL,
  farm_id uuid NOT NULL REFERENCES farm_accounts (farm_id) ON DELETE CASCADE,
  wallet_network text NOT NULL,
  wallet_account_id text NOT NULL,
  PRIMARY KEY (issuer, subject),
  UNIQUE (wallet_network, wallet_account_id)
);

ALTER TABLE public.farm_social_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.farm_social_identities FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.farm_social_identities FROM %I', api_role);
  END LOOP;
END $$;
