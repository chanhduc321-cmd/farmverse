import { randomUUID } from 'node:crypto';
import type { BlockchainTransactionStatus } from '../../../shared/blockchain.mts';
import { queryFarmDatabase } from '../farm-store.ts';

export { withDatabaseLock as withBlockchainLock } from '../database-lock.ts';

export interface TransactionRecord {
  id: string;
  farm_id: string | null;
  request_key: string;
  provider: string;
  network: string;
  operation: string;
  status: BlockchainTransactionStatus;
  sender_account_id: string;
  receiver_account_id: string;
  sponsor_account_id: string;
  asset: string;
  asset_decimals: number;
  token_contract_id: string | null;
  amount_atomic: string;
  transaction_hash: string | null;
  gas_burnt: string | null;
  fee_atomic: string | null;
  error_code: string | null;
  created_at: Date;
  updated_at: Date;
  confirmed_at: Date | null;
}

type NewTransaction = Pick<TransactionRecord,
  'farm_id' | 'request_key' | 'provider' | 'network' | 'operation' | 'status' |
  'sender_account_id' | 'receiver_account_id' | 'sponsor_account_id' | 'asset' | 'amount_atomic'>
  & Partial<Pick<TransactionRecord, 'asset_decimals' | 'token_contract_id'>>;

export async function createTransactionRecord(record: NewTransaction) {
  const { rows: [created] } = await queryFarmDatabase<TransactionRecord>(`
    INSERT INTO farm_blockchain_transactions
      (id, farm_id, request_key, provider, network, operation, status,
       sender_account_id, receiver_account_id, sponsor_account_id, asset, amount_atomic, asset_decimals, token_contract_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (request_key) DO NOTHING RETURNING *
  `, [randomUUID(), record.farm_id, record.request_key, record.provider, record.network,
    record.operation, record.status, record.sender_account_id, record.receiver_account_id,
    record.sponsor_account_id, record.asset, record.amount_atomic, record.asset_decimals ?? 24, record.token_contract_id ?? null]);
  const result = created ?? await readTransactionRecord(record.request_key);
  if (!result) throw new Error('Transaction record unavailable');
  return result;
}

export async function readTransactionRecord(requestKey: string) {
  const { rows: [record] } = await queryFarmDatabase<TransactionRecord>(`
    SELECT * FROM farm_blockchain_transactions WHERE request_key = $1
  `, [requestKey]);
  return record;
}

export async function readTransactionRecordById(id: string) {
  const { rows: [record] } = await queryFarmDatabase<TransactionRecord>(
    'SELECT * FROM farm_blockchain_transactions WHERE id = $1', [id],
  );
  return record;
}

export async function claimTransactionRecord(requestKey: string, farmId: string, status: 'signing' | 'cancelled' | 'failed') {
  const { rows: [record] } = await queryFarmDatabase<TransactionRecord>(`
    UPDATE farm_blockchain_transactions SET status = $3, updated_at = now()
    WHERE request_key = $1 AND farm_id = $2 AND status = 'awaiting_signature'
    RETURNING *
  `, [requestKey, farmId, status]);
  return record;
}

export async function setTransactionError(id: string, errorCode: string) {
  await queryFarmDatabase(`
    UPDATE farm_blockchain_transactions SET
      status = CASE WHEN transaction_hash IS NULL THEN 'failed' ELSE status END,
      error_code = $2, updated_at = now()
    WHERE id = $1 AND status IN ('awaiting_signature', 'signing', 'prepared', 'submitted')
  `, [id, errorCode]);
}

export async function prepareTransactionBroadcast(id: string, hash: string) {
  const { rowCount } = await queryFarmDatabase(`
    UPDATE farm_blockchain_transactions SET transaction_hash = $2, status = 'prepared', updated_at = now()
    WHERE id = $1 AND transaction_hash IS NULL AND status IN ('prepared', 'signing')
  `, [id, hash]);
  if (rowCount !== 1) throw new Error('Transaction already prepared');
}

export async function markTransactionSubmitted(id: string) {
  await queryFarmDatabase(`
    UPDATE farm_blockchain_transactions SET status = 'submitted', updated_at = now()
    WHERE id = $1 AND status = 'prepared' AND transaction_hash IS NOT NULL
  `, [id]);
}

export async function recordTransactionOutcome(
  id: string, hash: string, succeeded: boolean, gasBurnt: string, feeAtomic: string,
) {
  await queryFarmDatabase(`
    UPDATE farm_blockchain_transactions SET status = $3, gas_burnt = $4, fee_atomic = $5,
      error_code = $6, confirmed_at = CASE WHEN $3 = 'confirmed' THEN now() ELSE NULL END, updated_at = now()
    WHERE id = $1 AND transaction_hash = $2 AND status IN ('prepared', 'submitted')
  `, [id, hash, succeeded ? 'confirmed' : 'failed', gasBurnt, feeAtomic, succeeded ? null : 'CHAIN_EXECUTION_FAILED']);
}

export async function listTransactionRecords(farmId: string, limit: number) {
  await queryFarmDatabase(`
    UPDATE farm_blockchain_transactions SET status = 'expired', updated_at = now()
    WHERE farm_id = $1 AND status = 'awaiting_signature' AND created_at < now() - interval '5 minutes'
  `, [farmId]);
  const { rows } = await queryFarmDatabase<TransactionRecord>(`
    SELECT * FROM farm_blockchain_transactions WHERE farm_id = $1
    ORDER BY created_at DESC, id DESC LIMIT $2
  `, [farmId, limit]);
  return rows;
}
