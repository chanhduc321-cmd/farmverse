ALTER TABLE farm_blockchain_transactions
  ADD COLUMN IF NOT EXISTS asset_decimals integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS token_contract_id text;

CREATE TABLE IF NOT EXISTS farm_near_usdc_payments (
  transaction_id uuid PRIMARY KEY REFERENCES farm_blockchain_transactions(id),
  order_id uuid NOT NULL,
  intent_hash text NOT NULL,
  public_key text,
  delegate_nonce numeric(20, 0),
  max_block_height numeric(20, 0),
  authorization_state_hash text UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  UNIQUE(order_id),
  CHECK (delegate_nonce IS NULL OR delegate_nonce > 0),
  CHECK (max_block_height IS NULL OR max_block_height > 0)
);

ALTER TABLE farm_near_usdc_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE farm_near_usdc_payments FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE farm_near_usdc_payments FROM %I', api_role);
  END LOOP;
END $$;
