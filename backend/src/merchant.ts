import { randomUUID } from 'node:crypto';
import { MERCHANT_CROP_IDS } from '../../shared/merchant.mts';
import type { Farm } from '../../shared/farm.mts';
import type {
  MerchantActionResponse, MerchantCrop, MerchantErrorCode, MerchantOffer, MerchantOfferBlockReason,
  MerchantOfferRequest, MerchantQuote, MerchantResponse, MerchantSide, MerchantSnapshot,
} from '../../shared/merchant.mts';

const OFFER_WINDOW_MS = 20_000;
const ACCEPT_COOLDOWN_MS = 5_000;
const BASE_GOLD = { NORMAL: 10, GOLDEN: 30 };

export type MerchantState = Omit<MerchantSnapshot, 'referenceBudget' | 'pricing' | 'offers'> & {
  offer: MerchantQuote | null;
};
export type MerchantAction = MerchantOfferRequest & { kind: 'accept' | 'reject' };
export type MerchantResult = MerchantResponse | MerchantActionResponse | { error: MerchantErrorCode };

function quote(side: MerchantSide, crop: MerchantCrop, priceGold: number, now: number): MerchantQuote {
  return { id: randomUUID(), side, crop, quantity: 1, currency: 'GOLD', priceGold, expiresAtMs: now + OFFER_WINDOW_MS };
}

export function createMerchant(now: number): MerchantState {
  return {
    revision: 0, status: 'ACTIVE', goldBudget: 200, inventory: { capacity: 10, counts: { NORMAL: 3, GOLDEN: 1 } },
    demand: 5, sellFailStreak: 0, grantUsed: false, isSelfSustaining: true, cooldownUntilMs: null,
    nextOfferAtMs: now + OFFER_WINDOW_MS, offer: quote('BUY', 'NORMAL', 15, now), recoveryEvents: [],
  };
}

function inventorySize(merchant: MerchantState): number {
  return merchant.inventory.counts.NORMAL + merchant.inventory.counts.GOLDEN;
}

function cropCount(farm: Farm, crop: MerchantCrop): number {
  return farm.produce[MERCHANT_CROP_IDS[crop]] ?? 0;
}

function canReceiveCrop(farm: Farm): boolean {
  return cropCount(farm, 'NORMAL') + cropCount(farm, 'GOLDEN') < 10;
}

export function merchantPricing(merchant: MerchantState) {
  const budget = Math.min(Math.max(merchant.goldBudget, 0), 300);
  const pressure = merchant.demand * (10 - inventorySize(merchant));
  // Integer numerators preserve the contract's rounding at .005 boundaries.
  return {
    buyMultiplier: Math.round((20_000 + pressure * budget) / 200) / 100,
    sellMultiplier: Math.round((20_000 + pressure * (300 - budget)) / 200) / 100,
  };
}

function nextQuote(farm: Farm, merchant: MerchantState, now: number): MerchantQuote | null {
  const pricing = merchantPricing(merchant);
  if (inventorySize(merchant) < merchant.inventory.capacity) {
    for (const crop of ['GOLDEN', 'NORMAL'] as const) {
      if (cropCount(farm, crop) === 0 || merchant.goldBudget < BASE_GOLD[crop]) continue;
      const price = Math.round(BASE_GOLD[crop] * Math.round(pricing.buyMultiplier * 100) / 100);
      return quote('BUY', crop, Math.min(price, merchant.goldBudget), now);
    }
  }
  if (canReceiveCrop(farm)) {
    for (const crop of ['NORMAL', 'GOLDEN'] as const) {
      if (merchant.inventory.counts[crop] > 0) {
        const price = Math.round(3 * BASE_GOLD[crop] * Math.round(pricing.sellMultiplier * 100) / 100);
        return quote('SELL', crop, price, now);
      }
    }
  }
  return null;
}

function offerBlockReason(farm: Farm, merchant: MerchantState, offer: MerchantQuote): MerchantOfferBlockReason | undefined {
  if (offer.side === 'BUY') {
    if (cropCount(farm, offer.crop) === 0) return 'CROP_UNAVAILABLE';
    if (inventorySize(merchant) >= merchant.inventory.capacity) return 'MERCHANT_FULL';
    if (merchant.goldBudget < offer.priceGold) return 'MERCHANT_INSUFFICIENT_GOLD';
  } else {
    if (merchant.inventory.counts[offer.crop] === 0) return 'MERCHANT_CROP_UNAVAILABLE';
    if (!canReceiveCrop(farm)) return 'SILO_FULL';
    if (farm.gold < offer.priceGold) return 'INSUFFICIENT_GOLD';
  }
}

function declineOffer(merchant: MerchantState, offer: MerchantQuote): void {
  if (offer.side === 'BUY') {
    merchant.demand = Math.min(10, merchant.demand + 1);
  } else {
    merchant.demand = Math.max(1, merchant.demand - 1);
    merchant.sellFailStreak++;
  }
  merchant.offer = null;
}

function recoverMerchant(merchant: MerchantState, now: number): void {
  if (merchant.goldBudget >= 30) return;
  if (inventorySize(merchant) > 0 && merchant.sellFailStreak >= 3) {
    const crop = merchant.inventory.counts.NORMAL > 0 ? 'NORMAL' : 'GOLDEN';
    merchant.inventory.counts[crop]--;
    merchant.goldBudget += BASE_GOLD[crop];
    merchant.sellFailStreak = 0;
    merchant.recoveryEvents.push({
      id: randomUUID(), occurredAtMs: now, kind: 'LIQUIDATION', crop, goldAdded: BASE_GOLD[crop],
    });
  }
  if (merchant.goldBudget >= 30 || inventorySize(merchant) > 0) return;
  if (!merchant.grantUsed) {
    merchant.goldBudget += 60;
    merchant.grantUsed = true;
    merchant.isSelfSustaining = false;
    merchant.recoveryEvents.push({ id: randomUUID(), occurredAtMs: now, kind: 'OPERATING_GRANT', goldAdded: 60 });
  } else {
    merchant.status = 'OUT_OF_BUSINESS';
    merchant.cooldownUntilMs = null;
    merchant.nextOfferAtMs = null;
    merchant.recoveryEvents.push({ id: randomUUID(), occurredAtMs: now, kind: 'OUT_OF_BUSINESS' });
  }
}

function advanceMerchant(farm: Farm, merchant: MerchantState, now: number): void {
  let changed = false;
  if (merchant.offer && merchant.offer.expiresAtMs <= now) {
    declineOffer(merchant, merchant.offer);
    changed = true;
  }
  if (merchant.cooldownUntilMs !== null && merchant.cooldownUntilMs <= now) {
    merchant.cooldownUntilMs = null;
    changed = true;
  }
  if (!merchant.offer && merchant.status === 'ACTIVE' && merchant.nextOfferAtMs !== null && merchant.nextOfferAtMs <= now) {
    recoverMerchant(merchant, now);
    if (merchant.status === 'ACTIVE') {
      merchant.nextOfferAtMs = now + OFFER_WINDOW_MS;
      merchant.offer = nextQuote(farm, merchant, now);
    }
    changed = true;
  }
  if (changed) merchant.revision++;
}

function snapshot(farm: Farm, merchant: MerchantState, now: number): MerchantResponse {
  const { offer, ...state } = merchant;
  const offers: MerchantOffer[] = [];
  if (offer) {
    const reason = offerBlockReason(farm, merchant, offer);
    offers.push(reason ? { ...offer, canAccept: false, unavailableReason: reason }
      : { ...offer, canAccept: true, unavailableReason: null });
  }
  return { farm, serverTime: now, merchant: { ...state, referenceBudget: 300, pricing: merchantPricing(merchant), offers } };
}

export function resolveMerchant(farm: Farm, merchant: MerchantState, now: number, action?: MerchantAction): MerchantResult {
  advanceMerchant(farm, merchant, now);
  if (!action) return snapshot(farm, merchant, now);
  if (farm.revision !== action.expectedRevision) return { error: 'STALE_FARM' };
  if (merchant.revision !== action.expectedMerchantRevision) return { error: 'STALE_MERCHANT' };
  if (merchant.status === 'OUT_OF_BUSINESS') return { error: 'OUT_OF_BUSINESS' };
  if (merchant.cooldownUntilMs !== null) return { error: 'COOLDOWN' };
  const offer = merchant.offer;
  if (!offer || offer.id !== action.offerId) return { error: 'OFFER_NOT_ACTIVE' };

  if (action.kind === 'accept') {
    const reason = offerBlockReason(farm, merchant, offer);
    if (reason) return { error: reason };
    const direction = offer.side === 'BUY' ? 1 : -1;
    const cropId = MERCHANT_CROP_IDS[offer.crop];
    farm.produce[cropId] = cropCount(farm, offer.crop) - direction;
    farm.gold += direction * offer.priceGold;
    farm.revision++;
    merchant.inventory.counts[offer.crop] += direction;
    merchant.goldBudget -= direction * offer.priceGold;
    merchant.demand = offer.side === 'BUY' ? Math.max(1, merchant.demand - 2) : Math.min(10, merchant.demand + 1);
    merchant.sellFailStreak = 0;
    merchant.cooldownUntilMs = now + ACCEPT_COOLDOWN_MS;
    merchant.nextOfferAtMs = merchant.cooldownUntilMs;
    merchant.offer = null;
  } else {
    declineOffer(merchant, offer);
  }
  merchant.revision++;
  return {
    ...snapshot(farm, merchant, now),
    resolvedOffer: { id: offer.id, status: action.kind === 'accept' ? 'ACCEPTED' : 'REJECTED' },
  };
}
