import type { FarmResponse } from './farm.mts';

export const MERCHANT_API = {
  read: { method: 'GET', path: '/merchant' },
  accept: { method: 'POST', path: '/merchant/accept' },
  reject: { method: 'POST', path: '/merchant/reject' },
} as const;

export const MERCHANT_CROP_IDS = { NORMAL: 1, GOLDEN: 2 } as const;
export type MerchantCrop = keyof typeof MERCHANT_CROP_IDS;
export type MerchantStatus = 'ACTIVE' | 'OUT_OF_BUSINESS';
export type MerchantSide = 'BUY' | 'SELL';
export type MerchantOfferBlockReason =
  | 'CROP_UNAVAILABLE' | 'SILO_FULL' | 'INSUFFICIENT_GOLD'
  | 'MERCHANT_FULL' | 'MERCHANT_CROP_UNAVAILABLE' | 'MERCHANT_INSUFFICIENT_GOLD';

export interface MerchantQuote {
  id: string;
  side: MerchantSide;
  crop: MerchantCrop;
  quantity: 1;
  currency: 'GOLD';
  priceGold: number;
  expiresAtMs: number;
}

export type MerchantOffer = MerchantQuote & (
  | { canAccept: true; unavailableReason: null }
  | { canAccept: false; unavailableReason: MerchantOfferBlockReason }
);

export type MerchantRecoveryEvent = { id: string; occurredAtMs: number } & (
  | { kind: 'LIQUIDATION'; crop: MerchantCrop; goldAdded: number }
  | { kind: 'OPERATING_GRANT'; goldAdded: 60 }
  | { kind: 'OUT_OF_BUSINESS' }
);

export interface MerchantSnapshot {
  revision: number;
  status: MerchantStatus;
  goldBudget: number;
  referenceBudget: 300;
  inventory: { capacity: 10; counts: Record<MerchantCrop, number> };
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

export interface MerchantResponse extends FarmResponse {
  merchant: MerchantSnapshot;
}

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
