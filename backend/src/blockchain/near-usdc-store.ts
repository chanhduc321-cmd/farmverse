import { queryFarmDatabase } from '../farm-store.ts';
import type { TransactionRecord } from './transaction-store.ts';

export interface NearUsdcRecord extends TransactionRecord {
  order_id: string;
  intent_hash: string;
  public_key: string | null;
  delegate_nonce: string | null;
  max_block_height: string | null;
  authorization_state_hash: string | null;
  expires_at: Date;
}

const select = `SELECT t.*, p.order_id, p.intent_hash, p.public_key, p.delegate_nonce,
  p.max_block_height, p.authorization_state_hash, p.expires_at
  FROM farm_near_usdc_payments p JOIN farm_blockchain_transactions t ON t.id = p.transaction_id`;

export async function readNearUsdcPayment(id: string, farmId: string) {
  const { rows: [record] } = await queryFarmDatabase<NearUsdcRecord>(`${select} WHERE t.id=$1 AND t.farm_id=$2`, [id, farmId]);
  return record;
}

export async function findNearUsdcPayment(farmId: string, requestKey: string, orderId: string) {
  const { rows } = await queryFarmDatabase<NearUsdcRecord>(
    `${select} WHERE t.farm_id=$1 AND (t.request_key=$2 OR p.order_id=$3)`, [farmId, requestKey, orderId],
  );
  if (rows.length > 1) throw new Error('Conflicting payment identities');
  return rows[0];
}

export async function readNearUsdcAuthorization(stateHash: string, farmId: string) {
  const { rows: [record] } = await queryFarmDatabase<NearUsdcRecord>(
    `${select} WHERE p.authorization_state_hash=$1 AND t.farm_id=$2`, [stateHash, farmId],
  );
  return record;
}

export async function insertNearUsdcPayment(transactionId: string, orderId: string, intentHash: string) {
  await queryFarmDatabase(`INSERT INTO farm_near_usdc_payments(transaction_id, order_id, intent_hash)
    VALUES ($1,$2,$3) ON CONFLICT (transaction_id) DO NOTHING`, [transactionId, orderId, intentHash]);
}

export async function saveNearUsdcDelegate(id: string, publicKey: string, nonce: bigint, height: bigint) {
  const { rowCount } = await queryFarmDatabase(`UPDATE farm_near_usdc_payments
    SET public_key=$2, delegate_nonce=$3, max_block_height=$4
    WHERE transaction_id=$1 AND delegate_nonce IS NULL`, [id, publicKey, String(nonce), String(height)]);
  if (rowCount !== 1) throw new Error('Delegate already prepared');
}

export async function saveNearUsdcAuthorization(id: string, stateHash: string) {
  await queryFarmDatabase('UPDATE farm_near_usdc_payments SET authorization_state_hash=$2 WHERE transaction_id=$1', [id, stateHash]);
}

export async function nearUsdcWalletBusy(senderId: string, exceptId?: string) {
  await queryFarmDatabase(`UPDATE farm_blockchain_transactions t SET status='expired',updated_at=now()
    FROM farm_near_usdc_payments p WHERE p.transaction_id=t.id AND t.sender_account_id=$1
      AND t.status IN ('awaiting_signature','prepared') AND t.transaction_hash IS NULL AND p.expires_at<=now()`, [senderId]);
  const { rows } = await queryFarmDatabase(`SELECT t.id FROM farm_near_usdc_payments p
    JOIN farm_blockchain_transactions t ON t.id=p.transaction_id
    WHERE t.sender_account_id=$1 AND ($2::uuid IS NULL OR t.id<>$2)
      AND t.status IN ('awaiting_signature','signing','prepared','submitted') LIMIT 1`, [senderId, exceptId ?? null]);
  return rows.length > 0;
}

export async function expireNearUsdcPayment(id: string) {
  await queryFarmDatabase(`UPDATE farm_blockchain_transactions SET status='expired',updated_at=now()
    WHERE id=$1 AND transaction_hash IS NULL AND status IN ('awaiting_signature','signing','prepared')`, [id]);
}

export async function setNearUsdcError(id: string, code: string, failed = false) {
  await queryFarmDatabase(`UPDATE farm_blockchain_transactions SET error_code=$2, updated_at=now(),
    status=CASE WHEN $3 AND transaction_hash IS NULL THEN 'failed' ELSE status END
    WHERE id=$1 AND status IN ('awaiting_signature','signing','prepared','submitted')`, [id, code, failed]);
}
