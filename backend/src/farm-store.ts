import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import type { Farm, FarmBatchMutation, FarmMutation, FarmResponse } from '../../shared/farm.mts';
import { applyAction, applyBatch, createFarm, FarmError } from './farm.ts';
import { createMerchant, resolveMerchant } from './merchant.ts';
import type { MerchantAction, MerchantResult, MerchantState } from './merchant.ts';

const connectionString = process.env.DATABASE_URL;
const pool = connectionString ? new pg.Pool({
  connectionString,
  connectionTimeoutMillis: 5_000,
  query_timeout: 10_000,
  max: process.env.VERCEL ? 1 : 5,
  idleTimeoutMillis: 10_000,
}) : undefined;
pool?.on('error', () => console.warn('Kết nối PostgreSQL đang rảnh bị ngắt.'));

export const farmStorageMode = 'PostgreSQL';

export class FarmStorageError extends Error {}

export async function transactFarm<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) throw new FarmStorageError('Chưa cấu hình kết nối PostgreSQL.');
  let client: PoolClient | undefined;
  let discard = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
    }
    console.warn('Giao dịch lưu tiến độ thất bại.', (error as { code?: string }).code ?? '');
    throw new FarmStorageError('Chưa lưu được tiến độ Farm.');
  } finally {
    client?.release(discard);
  }
}

export async function queryFarmDatabase<Row extends QueryResultRow>(sql: string, values: unknown[] = []) {
  if (!pool) throw new FarmStorageError('Chưa cấu hình kết nối PostgreSQL.');
  try {
    return await pool.query<Row>(sql, values);
  } catch (error) {
    console.warn('Truy vấn lưu tiến độ thất bại.', (error as { code?: string }).code ?? '');
    throw new FarmStorageError('Chưa lưu được tiến độ Farm.');
  }
}

export async function checkFarmStorage(): Promise<void> {
  await queryFarmDatabase(`
    SELECT
      (SELECT claimed FROM farm_guest_progress LIMIT 1),
      (SELECT merchant_state IS NOT NULL FROM farm_guest_progress LIMIT 1),
      (SELECT username FROM farm_accounts LIMIT 1),
      (SELECT token_hash FROM farm_account_sessions LIMIT 1),
      (SELECT confirmed FROM farm_friendships LIMIT 1),
      (SELECT planted_at FROM farm_crop_steals LIMIT 1),
      (SELECT last_activity_read_at FROM farm_accounts LIMIT 1),
      (SELECT created_at FROM farm_activities LIMIT 1)
  `);
}

export async function readFarm(id: string, claimed = false): Promise<Farm | undefined> {
  const result = await queryFarmDatabase<{ state: Farm }>(
    'SELECT state FROM farm_guest_progress WHERE session_id = $1 AND claimed = $2', [id, claimed],
  );
  return result.rows[0]?.state;
}

export async function registerFarm(id: string): Promise<Farm> {
  const farm = createFarm();
  const merchant = createMerchant(Date.now());
  await queryFarmDatabase(
    'INSERT INTO farm_guest_progress (session_id, state, merchant_state) VALUES ($1, $2, $3)', [id, farm, merchant],
  );
  return farm;
}

export function mutateFarm(id: string, action: FarmMutation, tokenHash?: string): Promise<FarmResponse | undefined> {
  return updateFarm(id, tokenHash, (farm, now) => applyAction(farm, action, now));
}

export function mutateFarmBatch(id: string, batch: FarmBatchMutation, tokenHash?: string): Promise<FarmResponse | undefined> {
  return updateFarm(id, tokenHash, (farm, now) => applyBatch(farm, batch, now).at(-1));
}

async function updateFarm(
  id: string,
  tokenHash: string | undefined,
  apply: (farm: Farm, now: number) => string | undefined,
): Promise<FarmResponse | undefined> {
  const farm = await readFarm(id, tokenHash !== undefined);
  if (!farm) return;
  const revision = farm.revision;
  const now = Date.now();
  const message = apply(farm, now);
  if (farm.revision !== revision) {
    // A single revision-checked write commits the complete batch across API instances.
    const result = await queryFarmDatabase(`
      UPDATE farm_guest_progress
      SET state = $2
      WHERE session_id = $1 AND state->>'revision' = $3
        AND claimed = ($4::text IS NOT NULL)
        AND ($4 IS NULL OR EXISTS (
          SELECT 1 FROM farm_account_sessions
          WHERE token_hash = $4 AND farm_id = $1 AND expires_at > now()
        ))
    `, [id, farm, String(revision), tokenHash ?? null]);
    if (result.rowCount !== 1) throw new FarmError('Nông trại vừa thay đổi. Hãy thử lại.');
  }
  return { farm, serverTime: now, message };
}

export async function requestMerchant(id: string, tokenHash?: string, action?: MerchantAction): Promise<MerchantResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { rows: [record] } = await queryFarmDatabase<{ state: Farm; merchant_state: MerchantState | null }>(`
      SELECT state, merchant_state FROM farm_guest_progress
      WHERE session_id = $1 AND claimed = ($2::text IS NOT NULL)
        AND ($2 IS NULL OR EXISTS (
          SELECT 1 FROM farm_account_sessions
          WHERE token_hash = $2 AND farm_id = $1 AND expires_at > now()
        ))
    `, [id, tokenHash ?? null]);
    if (!record) return { error: 'SESSION_REQUIRED' };

    const now = Date.now();
    const farm = record.state;
    const previousFarmRevision = farm.revision;
    const previousMerchantRevision = record.merchant_state?.revision;
    const merchant = record.merchant_state ?? createMerchant(now);
    const result = resolveMerchant(farm, merchant, now, action);
    if (merchant.revision === previousMerchantRevision) return result;

    // One conditional update commits both inventories, Gold balances and the offer.
    const { rowCount } = await queryFarmDatabase(`
      UPDATE farm_guest_progress SET state = $3, merchant_state = $4
      WHERE session_id = $1 AND claimed = ($2::text IS NOT NULL)
        AND state->>'revision' = $5
        AND (merchant_state->>'revision') IS NOT DISTINCT FROM $6::text
        AND ($2 IS NULL OR EXISTS (
          SELECT 1 FROM farm_account_sessions
          WHERE token_hash = $2 AND farm_id = $1 AND expires_at > now()
        ))
    `, [id, tokenHash ?? null, farm, merchant, String(previousFarmRevision), previousMerchantRevision?.toString() ?? null]);
    if (rowCount === 1) return result;
  }
  return { error: 'STALE_MERCHANT' };
}
