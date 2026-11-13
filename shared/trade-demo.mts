import type { PaymentAmount, PaymentResult, PaymentWallet } from './payments.mts';

export const TRADE_DEMO_API = {
  read: { method: 'GET', path: '/trade-demo' },
  accept: { method: 'POST', path: '/trade-demo/accept' },
  skip: { method: 'POST', path: '/trade-demo/skip' },
  order: { method: 'GET', path: '/trade-demo/orders/:orderId' },
  pnl: { method: 'GET', path: '/trade-demo/pnl' },
} as const;

export const TRADE_DEMO_PRICES = {
  sellerPayoutAtomic: '1000000',
  buyerPriceAtomic: '1500000',
  grossProfitAtomic: '500000',
} as const;

export type TradeDemoRole = 'seller' | 'buyer';
export type TradeDemoStage = 'awaiting_seller' | 'paying_seller' | 'awaiting_buyer' | 'paying_buyer' | 'completed';
export type TradeDemoOfferKind = 'sell_to_npc' | 'buy_from_npc';
export type TradeDemoOrderStatus = 'awaiting_approval' | 'processing' | 'verifying' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
export type TradeDemoBlockReason = 'WALLET_NOT_READY' | 'INSUFFICIENT_USDC' | 'NPC_INSUFFICIENT_USDC' | 'ITEM_RESERVED';

export type TradeDemoOffer = {
  id: string;
  kind: TradeDemoOfferKind;
  itemId: string;
  quantity: 1;
  amount: PaymentAmount;
} & (
  | { canAccept: true; unavailableReason: null }
  | { canAccept: false; unavailableReason: TradeDemoBlockReason }
);

export interface TradeDemoOrder {
  id: string;
  runId: string;
  offerId: string;
  kind: TradeDemoOfferKind;
  status: TradeDemoOrderStatus;
  amount: PaymentAmount;
  payment: PaymentResult | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  fulfilledAt: string | null;
  error: { code: TradeDemoErrorCode; message: string } | null;
}

export interface TradeDemoPnl {
  inventoryQuantity: 0 | 1;
  costBasis: PaymentAmount;
  revenue: PaymentAmount;
  grossProfit: PaymentAmount | null;
  sponsorGas: PaymentAmount;
}

export interface TradeDemoSnapshot {
  runId: string;
  revision: number;
  serverTime: number;
  role: TradeDemoRole;
  stage: TradeDemoStage;
  wallet: {
    identity: PaymentWallet;
    status: 'initializing' | 'ready' | 'unavailable';
    balance: PaymentAmount | null;
  };
  item: {
    id: string;
    cropId: 1;
    name: 'Dâu tây';
    owner: 'seller' | 'npc' | 'basket';
    reservedByOrderId: string | null;
  };
  offer: TradeDemoOffer | null;
  offerDismissed: boolean;
  activeOrder: TradeDemoOrder | null;
  basket: {
    filled: 2 | 3;
    required: 3;
    badge: { id: string; name: string; awardedAt: string } | null;
  };
  pnl: TradeDemoPnl;
}

export interface TradeDemoActionRequest {
  runId: string;
  offerId: string;
  requestId: string;
  expectedRevision: number;
}

export interface TradeDemoActionResponse {
  snapshot: TradeDemoSnapshot;
  order: TradeDemoOrder | null;
}

export interface TradeDemoOrderResponse extends TradeDemoActionResponse {
  order: TradeDemoOrder;
}

export interface TradeDemoPnlResponse {
  runId: string;
  revision: number;
  serverTime: number;
  pnl: TradeDemoPnl;
}

export interface TradeDemoClient {
  read(): Promise<TradeDemoSnapshot>;
  accept(request: TradeDemoActionRequest): Promise<TradeDemoActionResponse>;
  skip(request: TradeDemoActionRequest): Promise<TradeDemoActionResponse>;
  readOrder(orderId: string): Promise<TradeDemoOrderResponse>;
}

export const TRADE_DEMO_ERROR_STATUS = {
  INVALID_REQUEST: 400,
  SESSION_REQUIRED: 401,
  RUN_REQUIRED: 409,
  STALE_RUN: 409,
  OFFER_NOT_ACTIVE: 409,
  REQUEST_CONFLICT: 409,
  WALLET_NOT_READY: 409,
  INSUFFICIENT_USDC: 409,
  NPC_INSUFFICIENT_USDC: 409,
  ITEM_RESERVED: 409,
  ORDER_NOT_FOUND: 404,
  PAYMENT_FAILED: 409,
  PAYMENT_UNCONFIRMED: 503,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type TradeDemoErrorCode = keyof typeof TRADE_DEMO_ERROR_STATUS;

export interface TradeDemoErrorResponse {
  error: { code: TradeDemoErrorCode; message: string; orderId?: string };
}

export function isTradeDemoActionRequest(value: unknown): value is TradeDemoActionRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { runId, offerId, requestId, expectedRevision } = value as Record<string, unknown>;
  return typeof runId === 'string' && runId.length > 0 && runId.length <= 128 && runId.trim() === runId
    && typeof offerId === 'string' && offerId.length > 0 && offerId.length <= 128 && offerId.trim() === offerId
    && typeof requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
    && typeof expectedRevision === 'number' && Number.isSafeInteger(expectedRevision) && expectedRevision >= 0;
}
