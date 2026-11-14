import type { PaymentAsset, PaymentResult } from '../payments.mts';
import type { TradeDemoOrder, TradeDemoSnapshot } from '../trade-demo.mts';

const usdc: PaymentAsset = { id: 'usdc-testnet', symbol: 'USDC', decimals: 6 };
const near: PaymentAsset = { id: 'near-testnet-native', symbol: 'NEAR', decimals: 24 };
const now = '2026-11-14T00:00:00+07:00';
const runId = '20000000-0000-4000-8000-000000000001';
const itemId = '20000000-0000-4000-8000-000000000002';
const sellerOfferId = '20000000-0000-4000-8000-000000000003';
const buyerOfferId = '20000000-0000-4000-8000-000000000004';

const sellerOffer = {
  id: sellerOfferId, kind: 'sell_to_npc', itemId, quantity: 1,
  amount: { asset: usdc, amountAtomic: '1000000' }, canAccept: true, unavailableReason: null,
} as const;
const buyerOffer = {
  id: buyerOfferId, kind: 'buy_from_npc', itemId, quantity: 1,
  amount: { asset: usdc, amountAtomic: '1500000' }, canAccept: true, unavailableReason: null,
} as const;

const sellerStart: TradeDemoSnapshot = {
  runId, revision: 0, serverTime: Date.parse(now), role: 'seller', stage: 'awaiting_seller',
  wallet: {
    identity: { providerId: 'near', network: 'testnet', accountId: '11'.repeat(32) },
    status: 'ready', balance: { asset: usdc, amountAtomic: '0' },
  },
  item: { id: itemId, cropId: 1, name: 'Dâu tây', owner: 'seller', reservedByOrderId: null },
  offer: sellerOffer, offerDismissed: false, activeOrder: null,
  basket: { filled: 2, required: 3, badge: null },
  pnl: {
    inventoryQuantity: 0, costBasis: { asset: usdc, amountAtomic: '0' },
    revenue: { asset: usdc, amountAtomic: '0' }, grossProfit: null,
    sponsorGas: { asset: near, amountAtomic: '0' },
  },
};

const buyerWaiting: TradeDemoSnapshot = {
  ...sellerStart, role: 'buyer', offer: null,
  wallet: {
    identity: { providerId: 'near', network: 'testnet', accountId: '22'.repeat(32) },
    status: 'ready', balance: { asset: usdc, amountAtomic: '1500000' },
  },
};

const sellerOrder: TradeDemoOrder = {
  id: '20000000-0000-4000-8000-000000000005', runId, offerId: sellerOfferId,
  kind: 'sell_to_npc', status: 'verifying', amount: sellerOffer.amount,
  payment: {
    reference: { providerId: 'near', network: 'testnet', paymentId: 'fixture-seller-payment' },
    status: 'pending', transactionId: '20000000-0000-4000-8000-000000000007',
    transactionHash: 'fixture-seller-transfer', explorerUrl: null, requiredAction: null, errorCode: null,
  },
  createdAt: now, updatedAt: now, expiresAt: null, fulfilledAt: null, error: null,
};

const buyerPayment: PaymentResult = {
  reference: { providerId: 'near', network: 'testnet', paymentId: 'fixture-buyer-payment' },
  status: 'awaiting_approval', transactionId: null, transactionHash: null, explorerUrl: null,
  requiredAction: { type: 'redirect', url: 'https://example.invalid/fixture/approval' }, errorCode: null,
};

const buyerOrder: TradeDemoOrder = {
  id: '20000000-0000-4000-8000-000000000006', runId, offerId: buyerOfferId,
  kind: 'buy_from_npc', status: 'awaiting_approval', amount: buyerOffer.amount, payment: buyerPayment,
  createdAt: now, updatedAt: now, expiresAt: '2026-11-14T00:05:00+07:00', fulfilledAt: null, error: null,
};

const sellerPaid: TradeDemoSnapshot = {
  ...sellerStart, revision: 2, stage: 'awaiting_buyer', offer: null,
  wallet: { ...sellerStart.wallet, balance: { asset: usdc, amountAtomic: '1000000' } },
  item: { ...sellerStart.item, owner: 'npc' },
  activeOrder: {
    ...sellerOrder, status: 'succeeded', fulfilledAt: now,
    payment: { ...sellerOrder.payment!, status: 'confirmed' },
  },
  pnl: {
    ...sellerStart.pnl, inventoryQuantity: 1, costBasis: { asset: usdc, amountAtomic: '1000000' },
    sponsorGas: { asset: near, amountAtomic: '100000000000000000000' },
  },
};

const buyerReady: TradeDemoSnapshot = {
  ...buyerWaiting, revision: 2, stage: 'awaiting_buyer',
  item: sellerPaid.item, pnl: sellerPaid.pnl, offer: buyerOffer,
};

const buyerApproving: TradeDemoSnapshot = {
  ...buyerReady, revision: 3, stage: 'paying_buyer', offer: null, activeOrder: buyerOrder,
  item: { ...buyerReady.item, reservedByOrderId: buyerOrder.id },
};

const buyerPending: TradeDemoSnapshot = {
  ...buyerApproving,
  activeOrder: {
    ...buyerOrder, status: 'verifying',
    payment: {
      ...buyerPayment, status: 'pending', requiredAction: null,
      transactionId: '20000000-0000-4000-8000-000000000008', transactionHash: 'fixture-buyer-transfer',
    },
  },
};

const buyerCompleted: TradeDemoSnapshot = {
  ...buyerReady, revision: 4, stage: 'completed', offer: null,
  wallet: { ...buyerReady.wallet, balance: { asset: usdc, amountAtomic: '0' } },
  item: { ...buyerReady.item, owner: 'basket', reservedByOrderId: null },
  activeOrder: {
    ...buyerPending.activeOrder!, status: 'succeeded', fulfilledAt: now,
    payment: { ...buyerPending.activeOrder!.payment!, status: 'confirmed' },
  },
  basket: { filled: 3, required: 3, badge: { id: 'seasonal-basket', name: 'Mâm quả mùa vụ', awardedAt: now } },
  pnl: {
    inventoryQuantity: 0, costBasis: { asset: usdc, amountAtomic: '1000000' },
    revenue: { asset: usdc, amountAtomic: '1500000' }, grossProfit: { asset: usdc, amountAtomic: '500000' },
    sponsorGas: { asset: near, amountAtomic: '200000000000000000000' },
  },
};

/** Synthetic UI data. Copy a scenario before editing it or simulating transitions. */
export const TRADE_DEMO_FIXTURES = {
  sellerOffer: sellerStart,
  buyerWaitingForStock: buyerWaiting,
  sellerPaymentPending: {
    ...sellerStart, revision: 1, stage: 'paying_seller', offer: null, activeOrder: sellerOrder,
    item: { ...sellerStart.item, reservedByOrderId: sellerOrder.id },
  },
  sellerPaid,
  buyerOffer: buyerReady,
  buyerAwaitingApproval: buyerApproving,
  buyerPaymentPending: buyerPending,
  buyerPaymentConfirmed: {
    ...buyerPending,
    wallet: { ...buyerReady.wallet, balance: { asset: usdc, amountAtomic: '0' } },
    activeOrder: {
      ...buyerPending.activeOrder!, status: 'processing',
      payment: { ...buyerPending.activeOrder!.payment!, status: 'confirmed' },
    },
  },
  buyerCompleted,
  buyerCancelled: {
    ...buyerReady, revision: 4,
    activeOrder: { ...buyerOrder, status: 'cancelled', payment: { ...buyerPayment, status: 'cancelled', requiredAction: null } },
  },
  buyerInsufficientFunds: {
    ...buyerReady,
    wallet: { ...buyerReady.wallet, balance: { asset: usdc, amountAtomic: '1000000' } },
    offer: { ...buyerOffer, canAccept: false, unavailableReason: 'INSUFFICIENT_USDC' },
  },
  buyerPaymentFailed: {
    ...buyerReady, revision: 4,
    activeOrder: {
      ...buyerOrder, status: 'failed',
      payment: { ...buyerPayment, status: 'failed', requiredAction: null, errorCode: 'CHAIN_EXECUTION_FAILED' },
      error: { code: 'PAYMENT_FAILED', message: 'Thanh toán thất bại. Hãy kiểm tra số dư và thử lại.' },
    },
  },
  buyerPaymentUncertain: {
    ...buyerPending,
    activeOrder: {
      ...buyerPending.activeOrder!,
      error: { code: 'PAYMENT_UNCONFIRMED', message: 'Đang xác minh thanh toán. Vui lòng chờ.' },
    },
  },
  buyerExpired: {
    ...buyerReady, revision: 4,
    activeOrder: { ...buyerOrder, status: 'expired', payment: { ...buyerPayment, status: 'expired', requiredAction: null } },
  },
  sellerSkipped: { ...sellerStart, revision: 1, offer: null, offerDismissed: true },
  buyerSkipped: { ...buyerReady, revision: 3, offer: null, offerDismissed: true },
  buyerWalletPreparing: {
    ...buyerReady,
    wallet: { ...buyerReady.wallet, status: 'initializing', balance: null },
    offer: { ...buyerOffer, canAccept: false, unavailableReason: 'WALLET_NOT_READY' },
  },
} satisfies Record<string, TradeDemoSnapshot>;

export type TradeDemoFixtureName = keyof typeof TRADE_DEMO_FIXTURES;

export function getTradeDemoFixture(name: TradeDemoFixtureName): TradeDemoSnapshot {
  return structuredClone(TRADE_DEMO_FIXTURES[name]);
}
