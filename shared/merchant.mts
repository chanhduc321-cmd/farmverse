import type { CropVariant, FarmSnapshot } from './farm.mjs';

/** Hono routes. The browser prefixes these paths with /api. */
export const MERCHANT_API = {
  read: { method: 'GET', path: '/merchant' },
  accept: { method: 'POST', path: '/merchant/accept' },
  reject: { method: 'POST', path: '/merchant/reject' },
} as const;

export type MerchantStatus = 'ACTIVE' | 'OUT_OF_BUSINESS';

/** BUY means the NPC buys a player crop. SELL means the player buys an NPC crop. */
export type MerchantSide = 'BUY' | 'SELL';

export type MerchantOfferBlockReason =
  | 'CROP_UNAVAILABLE' | 'SILO_FULL' | 'INSUFFICIENT_GOLD'
  | 'MERCHANT_FULL' | 'MERCHANT_CROP_UNAVAILABLE' | 'MERCHANT_INSUFFICIENT_GOLD';

/** Only active offers appear in a snapshot. Prices are the server's quoted GOLD amounts. */
export type MerchantOffer = {
  id: string;
  side: MerchantSide;
  crop: CropVariant;
  quantity: 1;
  currency: 'GOLD';
  priceGold: number;
  expiresAtMs: number;
} & (
  | { canAccept: true; unavailableReason: null }
  | { canAccept: false; unavailableReason: MerchantOfferBlockReason }
);

export type MerchantRecoveryEvent = { id: string; occurredAtMs: number } & (
  | { kind: 'LIQUIDATION'; crop: CropVariant; goldAdded: number }
  | { kind: 'OPERATING_GRANT'; goldAdded: 60 }
  | { kind: 'OUT_OF_BUSINESS' }
);

export interface MerchantSnapshot {
  /** Increment when offers, merchant balances, demand, cooldown, or recovery state change. */
  revision: number;
  status: MerchantStatus;
  goldBudget: number;
  referenceBudget: 300;
  inventory: { capacity: 10; counts: Record<CropVariant, number> };
  demand: number;
  sellFailStreak: number;
  grantUsed: boolean;
  isSelfSustaining: boolean;
  pricing: { buyMultiplier: number; sellMultiplier: number };
  cooldownUntilMs: number | null;
  nextOfferAtMs: number | null;
  offers: MerchantOffer[];
  recoveryEvents: MerchantRecoveryEvent[];
}

/** All successes return 200 with both snapshots from a consistent database transaction. */
export interface MerchantResponse {
  farm: FarmSnapshot;
  merchant: MerchantSnapshot;
}

/** POST body. Send the offer ID and the revisions from the latest merchant response. */
export interface MerchantOfferRequest {
  offerId: string;
  expectedRevision: number;
  expectedMerchantRevision: number;
}

export interface MerchantActionResponse extends MerchantResponse {
  resolvedOffer: { id: string; status: 'ACCEPTED' | 'REJECTED' };
}

export const MERCHANT_ERROR_STATUS = {
  INVALID_REQUEST: 400,
  SESSION_REQUIRED: 401,
  OFFER_NOT_FOUND: 404,
  STALE_FARM: 409,
  STALE_MERCHANT: 409,
  OFFER_NOT_ACTIVE: 409,
  COOLDOWN: 409,
  OUT_OF_BUSINESS: 409,
  CROP_UNAVAILABLE: 409,
  SILO_FULL: 409,
  INSUFFICIENT_GOLD: 409,
  MERCHANT_FULL: 409,
  MERCHANT_CROP_UNAVAILABLE: 409,
  MERCHANT_INSUFFICIENT_GOLD: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type MerchantErrorCode = keyof typeof MERCHANT_ERROR_STATUS;

/** Refresh Farm and merchant state after 401 or 409 before the player retries. */
export interface MerchantErrorResponse {
  error: { code: MerchantErrorCode; message: string };
}

export function isMerchantOfferRequest(value: unknown): value is MerchantOfferRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { offerId, expectedRevision, expectedMerchantRevision } = value as Record<string, unknown>;
  return typeof offerId === 'string' && offerId.length > 0 && offerId.length <= 128
    && offerId.trim() === offerId
    && typeof expectedRevision === 'number' && Number.isSafeInteger(expectedRevision) && expectedRevision >= 0
    && typeof expectedMerchantRevision === 'number' && Number.isSafeInteger(expectedMerchantRevision) && expectedMerchantRevision >= 0;
}
