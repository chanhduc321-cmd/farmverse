import { randomInt, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { PaymentIntent, PaymentResult, PaymentWallet } from '../../../shared/payments.mts';
import type { TradeDemoActionRequest, TradeDemoBlockReason, TradeDemoErrorCode, TradeDemoOrderStatus, TradeDemoRole } from '../../../shared/trade-demo.mts';
import { queryFarmDatabase, transactFarm } from '../farm-store.ts';

export const demoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pendingStatuses = new Set<TradeDemoOrderStatus>(['processing', 'verifying', 'awaiting_approval']);
export const orderPending = (order: DemoOrderRow) => pendingStatuses.has(order.status);

interface RunRow {
  id: string;
  seller_farm_id: string;
  buyer_farm_id: string;
  seller_wallet: PaymentWallet;
  buyer_wallet: PaymentWallet;
  item_id: string;
  seller_offer_id: string;
  buyer_offer_id: string;
  revision: number;
  item_owner: 'seller' | 'npc' | 'basket';
  seller_dismissed: boolean;
  buyer_dismissed: boolean;
  badge_awarded_at: Date | null;
  seller_visit_at: Date | null;
  buyer_visit_at: Date | null;
}

export interface DemoOrderRow {
  id: string;
  run_id: string;
  role: TradeDemoRole;
  intent: PaymentIntent;
  status: TradeDemoOrderStatus;
  payment: PaymentResult | null;
  sponsor_fee_atomic: string;
  error_code: TradeDemoErrorCode | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
  fulfilled_at: Date | null;
}

export interface DemoState {
  run: RunRow;
  role: TradeDemoRole;
  latest: DemoOrderRow | undefined;
  reservation: DemoOrderRow | undefined;
  sponsorFeeAtomic: string;
  costBasisAtomic: string;
  revenueAtomic: string;
}

function roleOf(run: RunRow, farmId: string): TradeDemoRole {
  return run.seller_farm_id === farmId ? 'seller' : 'buyer';
}

export function offerIdFor(run: RunRow, role: TradeDemoRole) {
  return role === 'seller' ? run.seller_offer_id : run.buyer_offer_id;
}

export function isDismissed(run: RunRow, role: TradeDemoRole) {
  return role === 'seller' ? run.seller_dismissed : run.buyer_dismissed;
}

export function offerAvailable(run: RunRow, role: TradeDemoRole) {
  return !isDismissed(run, role) && run.item_owner === (role === 'seller' ? 'seller' : 'npc');
}

export function visitTime(run: RunRow, role: TradeDemoRole) {
  return role === 'seller' ? run.seller_visit_at : run.buyer_visit_at;
}

async function activeRun(client: PoolClient, farmId: string, lock: 'share' | 'update') {
  const { rows: [run] } = await client.query<RunRow>(`
    SELECT * FROM farm_trade_demo_runs
    WHERE active AND $1 IN (seller_farm_id, buyer_farm_id)
    ${lock === 'update' ? 'FOR UPDATE' : 'FOR SHARE'}
  `, [farmId]);
  return run;
}

async function hasReservation(client: PoolClient, runId: string) {
  const { rowCount } = await client.query(`SELECT 1 FROM farm_trade_demo_orders WHERE run_id=$1
    AND status IN ('processing','verifying','awaiting_approval')`, [runId]);
  return Boolean(rowCount);
}

export async function scheduleDemoVisit(farmId: string, runId: string, role: TradeDemoRole) {
  return transactFarm(async client => {
    const run = await activeRun(client, farmId, 'update');
    if (!run || run.id !== runId || !offerAvailable(run, role) || await hasReservation(client, run.id)) return null;
    const existing = visitTime(run, role);
    if (existing) return existing;
    const arrivesAt = new Date(Date.now() + randomInt(6, 13) * 1_000);
    const column = role === 'seller' ? 'seller_visit_at' : 'buyer_visit_at';
    await client.query(`UPDATE farm_trade_demo_runs SET ${column}=$2 WHERE id=$1`, [run.id, arrivesAt]);
    return arrivesAt;
  });
}

export async function readDemoState(farmId: string): Promise<DemoState | undefined> {
  return transactFarm(async client => {
    const run = await activeRun(client, farmId, 'share');
    if (!run) return;
    const { rows } = await client.query<DemoOrderRow>(`
      SELECT DISTINCT ON (role) * FROM farm_trade_demo_orders
      WHERE run_id=$1 ORDER BY role, created_revision DESC
    `, [run.id]);
    const { rows: [total] } = await client.query<{ fee: string; cost: string; revenue: string }>(`
      SELECT COALESCE(sum(sponsor_fee_atomic), 0)::text AS fee,
        COALESCE(sum((intent #>> '{amount,amountAtomic}')::numeric) FILTER (WHERE role='seller' AND status='succeeded'), 0)::text AS cost,
        COALESCE(sum((intent #>> '{amount,amountAtomic}')::numeric) FILTER (WHERE role='buyer' AND status='succeeded'), 0)::text AS revenue
      FROM farm_trade_demo_orders WHERE run_id=$1
    `, [run.id]);
    const role = roleOf(run, farmId);
    return { run, role, latest: rows.find(order => order.role === role), reservation: rows.find(orderPending),
      sponsorFeeAtomic: total.fee, costBasisAtomic: total.cost, revenueAtomic: total.revenue };
  });
}

export async function readDemoOrder(farmId: string, orderId: string) {
  if (!demoUuid.test(orderId)) return;
  const { rows: [order] } = await queryFarmDatabase<DemoOrderRow>(`
    SELECT o.* FROM farm_trade_demo_orders o JOIN farm_trade_demo_runs r ON r.id=o.run_id
    WHERE o.id=$1 AND r.active AND
      ((o.role='seller' AND r.seller_farm_id=$2) OR (o.role='buyer' AND r.buyer_farm_id=$2))
  `, [orderId, farmId]);
  return order;
}

type Action = 'accept' | 'skip';
type ApplyActionResult = { error: TradeDemoErrorCode } | { orderId: string | null } | { checkWallets: true };

export async function applyDemoAction(
  farmId: string,
  action: Action,
  request: TradeDemoActionRequest,
  checked?: { intent: PaymentIntent } | { reason: TradeDemoBlockReason },
): Promise<ApplyActionResult> {
  return transactFarm(async client => {
    const run = await activeRun(client, farmId, 'update');
    if (!run) return { error: 'RUN_REQUIRED' };
    const { rows: [old] } = await client.query<{
      run_id: string; offer_id: string; action: Action; expected_revision: number; order_id: string | null;
    }>('SELECT * FROM farm_trade_demo_requests WHERE farm_id=$1 AND request_id=$2', [farmId, request.requestId]);
    if (old) {
      if (old.run_id !== request.runId || old.offer_id !== request.offerId || old.action !== action ||
          old.expected_revision !== request.expectedRevision) return { error: 'REQUEST_CONFLICT' };
      if (run.id !== old.run_id) return { error: 'STALE_RUN' };
      return { orderId: old.order_id };
    }
    if (run.id !== request.runId || run.revision !== request.expectedRevision) return { error: 'STALE_RUN' };
    const role = roleOf(run, farmId);
    if (offerIdFor(run, role) !== request.offerId || !offerAvailable(run, role)) return { error: 'OFFER_NOT_ACTIVE' };
    if (await hasReservation(client, run.id)) return { error: 'ITEM_RESERVED' };

    let orderId: string | null = null;
    if (action === 'accept') {
      if (!checked) return { checkWallets: true };
      if ('reason' in checked) return { error: checked.reason };
      orderId = checked.intent.orderId;
      await client.query(`INSERT INTO farm_trade_demo_orders(id, run_id, role, created_revision, intent, status)
        VALUES ($1,$2,$3,$4,$5,'processing')`, [orderId, run.id, role, run.revision + 1, checked.intent]);
    }
    await client.query(`INSERT INTO farm_trade_demo_requests(farm_id, request_id, run_id, offer_id, expected_revision, action, order_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [farmId, request.requestId, run.id, request.offerId, request.expectedRevision, action, orderId]);
    await client.query(`UPDATE farm_trade_demo_runs SET revision=revision+1,
      seller_dismissed=seller_dismissed OR $2, buyer_dismissed=buyer_dismissed OR $3 WHERE id=$1`,
    [run.id, action === 'skip' && role === 'seller', action === 'skip' && role === 'buyer']);
    return { orderId };
  });
}

export async function settleDemoOrder(order: DemoOrderRow, update: {
  payment: PaymentResult | null;
  status: TradeDemoOrderStatus;
  feeAtomic: string;
  expiresAt: Date | null;
  errorCode: TradeDemoErrorCode | null;
}) {
  return transactFarm(async client => {
    // Use the same run-first lock order as acceptance and read snapshots.
    const { rows: [run] } = await client.query<RunRow>('SELECT * FROM farm_trade_demo_runs WHERE id=$1 AND active FOR UPDATE', [order.run_id]);
    if (!run) throw new Error('Demo run is not active');
    const { rows: [current] } = await client.query<DemoOrderRow>('SELECT * FROM farm_trade_demo_orders WHERE id=$1', [order.id]);
    if (!current) throw new Error('Demo order missing');
    if (!orderPending(current)) return current;
    if (current.status === update.status
        && current.payment?.reference.paymentId === update.payment?.reference.paymentId
        && current.payment?.status === update.payment?.status
        && current.payment?.transactionId === update.payment?.transactionId
        && current.payment?.transactionHash === update.payment?.transactionHash
        && current.payment?.errorCode === update.payment?.errorCode
        && current.payment?.explorerUrl === update.payment?.explorerUrl
        && current.payment?.requiredAction?.url === update.payment?.requiredAction?.url
        && current.sponsor_fee_atomic === update.feeAtomic && current.error_code === update.errorCode
        && current.expires_at?.getTime() === update.expiresAt?.getTime()) return current;
    if (update.status === 'succeeded' && !offerAvailable(run, order.role)) throw new Error('Reserved demo item changed');
    const { rows: [saved] } = await client.query<DemoOrderRow>(`
      UPDATE farm_trade_demo_orders SET payment=$2, status=$3, sponsor_fee_atomic=$4, expires_at=$5, error_code=$6,
        updated_at=now(), fulfilled_at=CASE WHEN $3='succeeded' THEN now() ELSE NULL END
      WHERE id=$1 RETURNING *
    `, [order.id, update.payment, update.status, update.feeAtomic, update.expiresAt, update.errorCode]);
    if (saved.status === 'succeeded') {
      await client.query(`
        UPDATE farm_trade_demo_runs SET revision=revision+1, item_owner=$2, badge_awarded_at=$3 WHERE id=$1
      `, [run.id, order.role === 'seller' ? 'npc' : 'basket', order.role === 'buyer' ? saved.fulfilled_at : null]);
    } else {
      await client.query('UPDATE farm_trade_demo_runs SET revision=revision+1 WHERE id=$1', [run.id]);
    }
    return saved;
  });
}

export async function initializeDemoRun(
  seller: { farmId: string; wallet: PaymentWallet },
  buyer: { farmId: string; wallet: PaymentWallet },
  replace: boolean,
) {
  if (seller.farmId === buyer.farmId || seller.wallet.accountId === buyer.wallet.accountId) {
    throw new Error('Demo requires distinct farms and wallets');
  }
  const result = await transactFarm(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('farmverse:trade-demo-setup', 0))");
    const { rows: [run] } = await client.query<RunRow>('SELECT * FROM farm_trade_demo_runs WHERE active FOR UPDATE');
    if (run) {
      if (!replace) {
        if (run.seller_farm_id !== seller.farmId || run.buyer_farm_id !== buyer.farmId ||
          run.seller_wallet.accountId !== seller.wallet.accountId || run.buyer_wallet.accountId !== buyer.wallet.accountId) {
          return { error: 'Existing run has different participants. Use --new-run to replace it.' };
        }
        return { runId: run.id, created: false };
      }
      const { rowCount } = await client.query(`SELECT 1 FROM farm_trade_demo_orders WHERE run_id=$1
        AND status IN ('awaiting_approval','processing','verifying')`, [run.id]);
      if (rowCount) return { error: 'Resolve the active payment before starting a new run.' };
      await client.query('UPDATE farm_trade_demo_runs SET active=false WHERE id=$1', [run.id]);
    }
    const runId = randomUUID();
    await client.query(`INSERT INTO farm_trade_demo_runs
      (id, seller_farm_id, buyer_farm_id, seller_wallet, buyer_wallet, item_id, seller_offer_id, buyer_offer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [runId, seller.farmId, buyer.farmId, seller.wallet, buyer.wallet, randomUUID(), randomUUID(), randomUUID()]);
    return { runId, created: true };
  });
  if ('error' in result) throw new Error(result.error);
  return result;
}
