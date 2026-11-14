CREATE TABLE IF NOT EXISTS farm_blockchain_transactions (
  id uuid PRIMARY KEY,
  farm_id uuid REFERENCES farm_accounts (farm_id) ON DELETE SET NULL,
  request_key text NOT NULL UNIQUE,
  provider text NOT NULL,
  network text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'awaiting_signature', 'signing', 'prepared', 'submitted',
    'confirmed', 'failed', 'cancelled', 'expired'
  )),
  sender_account_id text NOT NULL,
  receiver_account_id text NOT NULL,
  sponsor_account_id text NOT NULL,
  asset text NOT NULL,
  amount_atomic numeric(78, 0) NOT NULL CHECK (amount_atomic >= 0),
  transaction_hash text,
  gas_burnt numeric(78, 0),
  fee_atomic numeric(78, 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (provider, network, transaction_hash),
  CHECK (status <> 'confirmed' OR (transaction_hash IS NOT NULL AND confirmed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS farm_blockchain_transactions_history
  ON farm_blockchain_transactions (farm_id, created_at DESC, id DESC);

ALTER TABLE farm_blockchain_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE farm_blockchain_transactions FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE farm_blockchain_transactions FROM %I', api_role);
  END LOOP;
END $$;
