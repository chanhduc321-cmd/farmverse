import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { CropVariant } from '../../shared/farm.mts';
import type { MerchantOfferBlockReason, MerchantSide, MerchantStatus } from '../../shared/merchant.mts';
import type { FarmRow } from './farm-store.js';

export const OFFER_WINDOW_MS = 20_000;
export const ACCEPT_COOLDOWN_MS = 5_000;
export const BASE_GOLD = { NORMAL: 10, GOLDEN: 30 };

export interface MerchantRow {
  revision: number;
  gold_budget: number;
  normal_count: number;
  golden_count: number;
  demand: number;
  sell_fail_streak: number;
  grant_used: boolean;
  is_self_sustaining: boolean;
  status: MerchantStatus;
  cooldown_until: Date | null;
  next_offer_at: Date | null;
}

export interface OfferRow {
  id: string;
  side: MerchantSide;
  crop: CropVariant;
  price_gold: number;
  expires_at: Date;
  status: 'ACTIVE' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
}

export function cropColumn(crop: CropVariant): 'normal_count' | 'golden_count' {
  return crop === 'NORMAL' ? 'normal_count' : 'golden_count';
}

export function merchantPricing(merchant: Pick<MerchantRow, 'gold_budget' | 'normal_count' | 'golden_count' | 'demand'>) {
  const budget = Math.min(Math.max(merchant.gold_budget, 0), 300);
  const pressure = merchant.demand * (10 - merchant.normal_count - merchant.golden_count);
  // Integer numerators preserve the contract's decimal rounding at .005 boundaries.
  return {
    buyMultiplier: Math.round((20_000 + pressure * budget) / 200) / 100,
    sellMultiplier: Math.round((20_000 + pressure * (300 - budget)) / 200) / 100,
  };
}

/** One offer per window: prefer buying an owned player crop, then selling owned stock. */
export function nextQuote(farm: FarmRow, merchant: MerchantRow): Pick<OfferRow, 'side' | 'crop' | 'price_gold'> | undefined {
  const pricing = merchantPricing(merchant);
  if (merchant.normal_count + merchant.golden_count < 10) {
    for (const crop of ['GOLDEN', 'NORMAL'] as const) {
      if (farm[cropColumn(crop)] === 0 || merchant.gold_budget < BASE_GOLD[crop]) continue;
      const price = Math.round(BASE_GOLD[crop] * Math.round(pricing.buyMultiplier * 100) / 100);
      return { side: 'BUY', crop, price_gold: Math.min(price, merchant.gold_budget) };
    }
  }
  if (farm.normal_count + farm.golden_count < 10) {
    for (const crop of ['NORMAL', 'GOLDEN'] as const) {
      if (merchant[cropColumn(crop)] > 0) {
        return { side: 'SELL', crop, price_gold: Math.round(3 * BASE_GOLD[crop] * Math.round(pricing.sellMultiplier * 100) / 100) };
      }
    }
  }
}

export function offerBlockReason(farm: FarmRow, merchant: MerchantRow, offer: OfferRow): MerchantOfferBlockReason | undefined {
  const column = cropColumn(offer.crop);
  if (offer.side === 'BUY') {
    if (farm[column] === 0) return 'CROP_UNAVAILABLE';
    if (merchant.normal_count + merchant.golden_count >= 10) return 'MERCHANT_FULL';
    if (merchant.gold_budget < offer.price_gold) return 'MERCHANT_INSUFFICIENT_GOLD';
  } else {
    if (merchant[column] === 0) return 'MERCHANT_CROP_UNAVAILABLE';
    if (farm.normal_count + farm.golden_count >= 10) return 'SILO_FULL';
    if (farm.gold < offer.price_gold) return 'INSUFFICIENT_GOLD';
  }
}

export function declineOffer(merchant: MerchantRow, offer: OfferRow) {
  if (offer.side === 'BUY') {
    merchant.demand = Math.min(10, merchant.demand + 1);
  } else {
    merchant.demand = Math.max(1, merchant.demand - 1);
    merchant.sell_fail_streak++;
  }
}

export async function insertOffer(
  client: PoolClient, sessionId: string, quote: Pick<OfferRow, 'side' | 'crop' | 'price_gold'>, now: number,
): Promise<OfferRow> {
  const { rows: [offer] } = await client.query<OfferRow>(`
    INSERT INTO merchant_offers (id, session_id, side, crop, price_gold, created_at, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, side, crop, price_gold, expires_at, status
  `, [randomUUID(), sessionId, quote.side, quote.crop, quote.price_gold, new Date(now), new Date(now + OFFER_WINDOW_MS)]);
  return offer;
}

/** New games start with the scripted 1.5x Normal BUY, even before their first harvest. */
export async function createMerchantState(client: PoolClient, sessionId: string, now: number) {
  const { rowCount } = await client.query(`
    INSERT INTO merchant_states (session_id, next_offer_at) VALUES ($1, $2)
    ON CONFLICT (session_id) DO NOTHING
  `, [sessionId, new Date(now + OFFER_WINDOW_MS)]);
  if (rowCount) await insertOffer(client, sessionId, { side: 'BUY', crop: 'NORMAL', price_gold: 15 }, now);
}
