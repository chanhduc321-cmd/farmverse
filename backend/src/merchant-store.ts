import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { CropVariant } from '../../shared/farm.mts';
import type {
  MerchantActionResponse, MerchantErrorCode, MerchantOffer, MerchantOfferRequest,
  MerchantRecoveryEvent, MerchantResponse,
} from '../../shared/merchant.mts';
import { readFarm, transact } from './farm-store.js';
import type { FarmRow } from './farm-store.js';
import {
  ACCEPT_COOLDOWN_MS, BASE_GOLD, OFFER_WINDOW_MS, createMerchantState, cropColumn,
  declineOffer, insertOffer, merchantPricing, nextQuote, offerBlockReason,
} from './merchant-state.js';
import type { MerchantRow, OfferRow } from './merchant-state.js';

type RecoveryRow = { id: string; occurred_at: Date } & (
  | { kind: 'LIQUIDATION'; crop: CropVariant; gold_added: number }
  | { kind: 'OPERATING_GRANT'; gold_added: 60 }
  | { kind: 'OUT_OF_BUSINESS' }
);
type MerchantAction = MerchantOfferRequest & { kind: 'accept' | 'reject' };
type MerchantResult = MerchantResponse | MerchantActionResponse | { error: MerchantErrorCode };

async function saveMerchant(client: PoolClient, id: string, merchant: MerchantRow) {
  await client.query(`
    UPDATE merchant_states SET revision = $2, gold_budget = $3, normal_count = $4, golden_count = $5,
      demand = $6, sell_fail_streak = $7, grant_used = $8, is_self_sustaining = $9,
      status = $10, cooldown_until = $11, next_offer_at = $12
    WHERE session_id = $1
  `, [id, merchant.revision, merchant.gold_budget, merchant.normal_count, merchant.golden_count,
    merchant.demand, merchant.sell_fail_streak, merchant.grant_used, merchant.is_self_sustaining,
    merchant.status, merchant.cooldown_until, merchant.next_offer_at]);
}

async function logRecovery(
  client: PoolClient, id: string, now: number, kind: RecoveryRow['kind'], crop: CropVariant | null, gold: number | null,
) {
  await client.query(`
    INSERT INTO merchant_recovery_events (id, session_id, occurred_at, kind, crop, gold_added)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [randomUUID(), id, new Date(now), kind, crop, gold]);
}

async function recoverMerchant(client: PoolClient, id: string, merchant: MerchantRow, now: number) {
  if (merchant.gold_budget < 30 && merchant.normal_count + merchant.golden_count > 0 && merchant.sell_fail_streak >= 3) {
    const crop = merchant.normal_count > 0 ? 'NORMAL' : 'GOLDEN';
    merchant[cropColumn(crop)]--;
    merchant.gold_budget += BASE_GOLD[crop];
    merchant.sell_fail_streak = 0;
    await logRecovery(client, id, now, 'LIQUIDATION', crop, BASE_GOLD[crop]);
  }
  if (merchant.gold_budget < 30 && merchant.normal_count + merchant.golden_count === 0) {
    if (!merchant.grant_used) {
      merchant.gold_budget += 60;
      merchant.grant_used = true;
      merchant.is_self_sustaining = false;
      await logRecovery(client, id, now, 'OPERATING_GRANT', null, 60);
    } else {
      merchant.status = 'OUT_OF_BUSINESS';
      merchant.cooldown_until = null;
      merchant.next_offer_at = null;
      await logRecovery(client, id, now, 'OUT_OF_BUSINESS', null, null);
    }
  }
}

/** Advance persisted timers once on a request; never synthesize unseen offline offers. */
async function advanceMerchant(
  client: PoolClient, id: string, farm: FarmRow, merchant: MerchantRow, now: number,
): Promise<OfferRow | undefined> {
  const { rows: [current] } = await client.query<OfferRow>(`
    SELECT id, side, crop, price_gold, expires_at, status FROM merchant_offers
    WHERE session_id = $1 AND status = 'ACTIVE'
  `, [id]);
  let offer: OfferRow | undefined = current;
  let changed = false;
  if (offer && offer.expires_at.getTime() <= now) {
    await client.query(`UPDATE merchant_offers SET status = 'EXPIRED', resolved_at = expires_at WHERE id = $1`, [offer.id]);
    declineOffer(merchant, offer);
    offer = undefined;
    changed = true;
  }
  if (merchant.cooldown_until && merchant.cooldown_until.getTime() <= now) {
    merchant.cooldown_until = null;
    changed = true;
  }
  if (!offer && merchant.status === 'ACTIVE' && merchant.next_offer_at && merchant.next_offer_at.getTime() <= now) {
    await recoverMerchant(client, id, merchant, now);
    if (merchant.status === 'ACTIVE') {
      merchant.next_offer_at = new Date(now + OFFER_WINDOW_MS);
      const quote = nextQuote(farm, merchant);
      if (quote) offer = await insertOffer(client, id, quote, now);
    }
    changed = true;
  }
  if (changed) {
    merchant.revision++;
    await saveMerchant(client, id, merchant);
  }
  return offer;
}

async function snapshots(
  client: PoolClient, id: string, farm: FarmRow, merchant: MerchantRow, offer: OfferRow | undefined, now: number,
): Promise<MerchantResponse> {
  const currentFarm = await readFarm(client, id, () => now);
  if (!currentFarm) throw new Error('Locked Farm session disappeared.');
  const offers: MerchantOffer[] = [];
  if (offer) {
    const reason = offerBlockReason(farm, merchant, offer);
    offers.push({
      id: offer.id, side: offer.side, crop: offer.crop, quantity: 1, currency: 'GOLD',
      priceGold: offer.price_gold, expiresAtMs: offer.expires_at.getTime(),
      ...(reason ? { canAccept: false, unavailableReason: reason } : { canAccept: true, unavailableReason: null }),
    });
  }
  const { rows: events } = await client.query<RecoveryRow>(`
    SELECT id, occurred_at, kind, crop, gold_added FROM merchant_recovery_events
    WHERE session_id = $1 ORDER BY occurred_at, id
  `, [id]);
  const recoveryEvents = events.map((event): MerchantRecoveryEvent => {
    const common = { id: event.id, occurredAtMs: event.occurred_at.getTime() };
    switch (event.kind) {
      case 'LIQUIDATION': return { ...common, kind: event.kind, crop: event.crop, goldAdded: event.gold_added };
      case 'OPERATING_GRANT': return { ...common, kind: event.kind, goldAdded: event.gold_added };
      case 'OUT_OF_BUSINESS': return { ...common, kind: event.kind };
    }
  });
  return {
    farm: currentFarm,
    merchant: {
      revision: merchant.revision, status: merchant.status, goldBudget: merchant.gold_budget, referenceBudget: 300,
      inventory: { capacity: 10, counts: { NORMAL: merchant.normal_count, GOLDEN: merchant.golden_count } },
      demand: merchant.demand, sellFailStreak: merchant.sell_fail_streak,
      grantUsed: merchant.grant_used, isSelfSustaining: merchant.is_self_sustaining,
      pricing: merchantPricing(merchant), cooldownUntilMs: merchant.cooldown_until?.getTime() ?? null,
      nextOfferAtMs: merchant.next_offer_at?.getTime() ?? null, offers, recoveryEvents,
    },
  };
}

function merchantRequest(
  database: Pool, id: string, clock: () => number, action?: MerchantAction,
): Promise<MerchantResult> {
  return transact(database, async (client) => {
    // Farm and merchant writes take the same session lock, including Quick Sell and harvest.
    const { rows: [farm] } = await client.query<FarmRow>(`
      SELECT revision, gold, normal_count, golden_count FROM farm_sessions WHERE id = $1 FOR UPDATE
    `, [id]);
    if (!farm) return { error: 'SESSION_REQUIRED' };
    const now = clock();
    // Saves created before migration 002 receive their initial merchant on first access.
    await createMerchantState(client, id, now);
    const { rows: [merchant] } = await client.query<MerchantRow>(`
      SELECT * FROM merchant_states WHERE session_id = $1 FOR UPDATE
    `, [id]);
    let activeOffer = await advanceMerchant(client, id, farm, merchant, now);
    if (!action) return snapshots(client, id, farm, merchant, activeOffer, now);

    if (farm.revision !== action.expectedRevision) return { error: 'STALE_FARM' };
    if (merchant.revision !== action.expectedMerchantRevision) return { error: 'STALE_MERCHANT' };
    if (merchant.status === 'OUT_OF_BUSINESS') return { error: 'OUT_OF_BUSINESS' };
    const { rows: [offer] } = await client.query<OfferRow>(`
      SELECT id, side, crop, price_gold, expires_at, status FROM merchant_offers WHERE session_id = $1 AND id = $2
    `, [id, action.offerId]);
    if (!offer) return { error: 'OFFER_NOT_FOUND' };
    if (merchant.cooldown_until && merchant.cooldown_until.getTime() > now) return { error: 'COOLDOWN' };
    if (offer.status !== 'ACTIVE') return { error: 'OFFER_NOT_ACTIVE' };

    const status = action.kind === 'accept' ? 'ACCEPTED' : 'REJECTED';
    if (action.kind === 'accept') {
      const reason = offerBlockReason(farm, merchant, offer);
      if (reason) return { error: reason };
      const column = cropColumn(offer.crop);
      if (offer.side === 'BUY') {
        farm[column]--;
        farm.gold += offer.price_gold;
        merchant[column]++;
        merchant.gold_budget -= offer.price_gold;
        merchant.demand = Math.max(1, merchant.demand - 2);
      } else {
        farm[column]++;
        farm.gold -= offer.price_gold;
        merchant[column]--;
        merchant.gold_budget += offer.price_gold;
        merchant.demand = Math.min(10, merchant.demand + 1);
      }
      merchant.sell_fail_streak = 0;
      merchant.cooldown_until = new Date(now + ACCEPT_COOLDOWN_MS);
      merchant.next_offer_at = merchant.cooldown_until;
      farm.revision++;
      await client.query(`
        UPDATE farm_sessions SET revision = $2, gold = $3, normal_count = $4, golden_count = $5 WHERE id = $1
      `, [id, farm.revision, farm.gold, farm.normal_count, farm.golden_count]);
    } else {
      declineOffer(merchant, offer);
    }
    await client.query(`UPDATE merchant_offers SET status = $2, resolved_at = $3 WHERE id = $1`, [offer.id, status, new Date(now)]);
    activeOffer = undefined;
    merchant.revision++;
    await saveMerchant(client, id, merchant);
    return { ...await snapshots(client, id, farm, merchant, activeOffer, now), resolvedOffer: { id: offer.id, status } };
  });
}

export function readMerchant(database: Pool, id: string, clock: () => number) {
  return merchantRequest(database, id, clock);
}

export function applyMerchantAction(database: Pool, id: string, action: MerchantAction, clock: () => number) {
  return merchantRequest(database, id, clock, action);
}
