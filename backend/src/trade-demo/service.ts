import { randomUUID } from 'node:crypto';
import type { PaymentAmount, PaymentAsset, PaymentIntent, PaymentResult, PaymentWallet } from '../../../shared/payments.mts';
import { TRADE_DEMO_PRICES } from '../../../shared/trade-demo.mts';
import type {
  TradeDemoActionRequest, TradeDemoActionResponse, TradeDemoBlockReason, TradeDemoErrorCode, TradeDemoOffer,
  TradeDemoOrder, TradeDemoOrderResponse, TradeDemoOrderStatus, TradeDemoPnl, TradeDemoPnlResponse, TradeDemoRole, TradeDemoSnapshot,
} from '../../../shared/trade-demo.mts';
import { withDatabaseLock } from '../database-lock.ts';
import { tradePayments } from '../payments/provider.ts';
import { PaymentPreparationRefused } from '../payments/trade-payments.ts';
import type { TradePayments, TradeWalletState } from '../payments/trade-payments.ts';
import { applyDemoAction, isDismissed, offerAvailable, offerIdFor, orderPending, readDemoOrder, readDemoState, settleDemoOrder } from './store.ts';
import type { DemoOrderRow, DemoState } from './store.ts';

const messages: Record<TradeDemoErrorCode, string> = {
  INVALID_REQUEST: 'Yêu cầu giao dịch không hợp lệ.',
  SESSION_REQUIRED: 'Hãy đăng nhập để tham gia giao dịch.',
  RUN_REQUIRED: 'Nông trại này chưa được chọn vào vòng giao dịch.',
  STALE_RUN: 'Vòng giao dịch vừa thay đổi. Hãy tải lại lời mời.',
  OFFER_NOT_ACTIVE: 'Lời mời này không còn hiệu lực.',
  REQUEST_CONFLICT: 'Mã yêu cầu đã được dùng cho thao tác khác.',
  WALLET_NOT_READY: 'Ví giao dịch chưa sẵn sàng.',
  INSUFFICIENT_USDC: 'Ví của bạn chưa đủ USDC testnet.',
  NPC_INSUFFICIENT_USDC: 'NPC chưa đủ USDC testnet.',
  ITEM_RESERVED: 'Quả dâu đang được giữ cho một lệnh.',
  ORDER_NOT_FOUND: 'Không tìm thấy lệnh giao dịch.',
  PAYMENT_FAILED: 'Thanh toán thất bại. Bạn có thể thử lời mời lại.',
  PAYMENT_UNCONFIRMED: 'Đang xác minh thanh toán. Hãy kiểm tra lại cùng lệnh.',
  SERVICE_UNAVAILABLE: 'Chưa kết nối được dịch vụ giao dịch.',
};

export class TradeDemoError extends Error {
  constructor(readonly code: TradeDemoErrorCode, readonly orderId?: string) {
    super(messages[code]);
    this.name = 'TradeDemoError';
  }
}

const kindFor = (role: TradeDemoRole) => role === 'seller' ? 'sell_to_npc' : 'buy_from_npc';
const priceFor = (role: TradeDemoRole) => role === 'seller' ? TRADE_DEMO_PRICES.sellerPayoutAtomic : TRADE_DEMO_PRICES.buyerPriceAtomic;
const amount = (asset: PaymentAsset, amountAtomic: string): PaymentAmount => ({ asset, amountAtomic });
const walletFor = (state: DemoState) => state.role === 'seller' ? state.run.seller_wallet : state.run.buyer_wallet;
const tradeOrderLockNamespace = 9810627;

function sameWallet(left: PaymentWallet | undefined, right: PaymentWallet) {
  return left?.accountId === right.accountId && left.providerId === right.providerId && left.network === right.network;
}

function orderView(state: DemoState, row: DemoOrderRow): TradeDemoOrder {
  return {
    id: row.id, runId: row.run_id, offerId: offerIdFor(state.run, row.role), kind: kindFor(row.role),
    status: row.status, amount: row.intent.amount, payment: row.payment,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null, fulfilledAt: row.fulfilled_at?.toISOString() ?? null,
    error: row.error_code ? { code: row.error_code, message: messages[row.error_code] } : null,
  };
}

function pnlView(state: DemoState, payments: TradePayments): TradeDemoPnl {
  const { item_owner: owner } = state.run;
  return {
    inventoryQuantity: owner === 'npc' ? 1 : 0,
    costBasis: amount(payments.asset, state.costBasisAtomic),
    revenue: amount(payments.asset, state.revenueAtomic),
    grossProfit: owner === 'basket'
      ? amount(payments.asset, String(BigInt(state.revenueAtomic) - BigInt(state.costBasisAtomic)))
      : null,
    sponsorGas: amount(payments.gasAsset, state.sponsorFeeAtomic),
  };
}

async function getState(farmId: string) {
  const state = await readDemoState(farmId);
  if (!state) throw new TradeDemoError('RUN_REQUIRED');
  return state;
}

async function getOrder(farmId: string, orderId: string) {
  const order = await readDemoOrder(farmId, orderId);
  if (!order) throw new TradeDemoError('ORDER_NOT_FOUND');
  return order;
}

async function readWallet(farmId: string, identity: PaymentWallet, payments: TradePayments): Promise<TradeWalletState> {
  if (!sameWallet(await payments.findWallet(farmId), identity)) return { identity, status: 'unavailable', balance: null };
  return payments.readWallet(identity);
}

async function offerReason(role: TradeDemoRole, wallet: TradeWalletState, payments: TradePayments): Promise<TradeDemoBlockReason | null> {
  if (wallet.status !== 'ready' || !wallet.balance) return 'WALLET_NOT_READY';
  const npc = await payments.readWallet(payments.npc);
  if (npc.status !== 'ready' || !npc.balance) return 'WALLET_NOT_READY';
  const payer = role === 'seller' ? npc.balance : wallet.balance;
  if (BigInt(payer.amountAtomic) < BigInt(priceFor(role))) {
    return role === 'seller' ? 'NPC_INSUFFICIENT_USDC' : 'INSUFFICIENT_USDC';
  }
  return null;
}

async function snapshotView(farmId: string, state: DemoState, payments: TradePayments): Promise<TradeDemoSnapshot> {
  const { run, role, latest, reservation } = state;
  const wallet = await readWallet(farmId, walletFor(state), payments);
  const offerDismissed = isDismissed(run, role);
  let offer: TradeDemoOffer | null = null;
  if (offerAvailable(run, role) && !reservation) {
    const reason = await offerReason(role, wallet, payments);
    offer = {
      id: offerIdFor(run, role), kind: kindFor(role), itemId: run.item_id, quantity: 1,
      amount: amount(payments.asset, priceFor(role)),
      ...(reason ? { canAccept: false, unavailableReason: reason } : { canAccept: true, unavailableReason: null }),
    };
  }
  const complete = run.item_owner === 'basket';
  const stage = run.item_owner === 'seller' ? (reservation ? 'paying_seller' : 'awaiting_seller')
    : complete ? 'completed' : reservation ? 'paying_buyer' : 'awaiting_buyer';
  return {
    runId: run.id, revision: run.revision, serverTime: Date.now(), role, stage, wallet,
    item: { id: run.item_id, cropId: 1, name: 'Dâu tây', owner: run.item_owner, reservedByOrderId: reservation?.id ?? null },
    offer, offerDismissed, activeOrder: latest ? orderView(state, latest) : null,
    basket: { filled: complete ? 3 : 2, required: 3,
      badge: run.badge_awarded_at ? { id: 'seasonal-basket', name: 'Mâm quả mùa vụ', awardedAt: run.badge_awarded_at.toISOString() } : null },
    pnl: pnlView(state, payments),
  };
}

function orderStatus(payment: PaymentResult): TradeDemoOrderStatus {
  switch (payment.status) {
    case 'confirmed': return 'succeeded';
    case 'pending': return payment.transactionHash ? 'verifying' : 'processing';
    case 'awaiting_approval': return 'awaiting_approval';
    default: return payment.status;
  }
}

function assertPayment(intent: PaymentIntent, result: PaymentResult, previous?: PaymentResult | null) {
  const { reference } = result;
  if (!reference.paymentId || reference.providerId !== intent.sender.providerId || reference.network !== intent.sender.network ||
      (previous && previous.reference.paymentId !== reference.paymentId) ||
      (previous?.transactionHash && previous.transactionHash !== result.transactionHash) ||
      (result.status === 'confirmed' && (!result.transactionId || !result.transactionHash))) {
    throw new Error('Payment evidence does not match this demo order');
  }
}

async function reconcile(farmId: string, orderId: string, payments: TradePayments) {
  return withDatabaseLock(`trade-demo-order:${orderId}`, async () => {
    const current = await getOrder(farmId, orderId);
    if (!orderPending(current)) return { order: current, uncertain: false };
    const { intent } = current;
    const identity = current.role === 'seller' ? intent.receiver : intent.sender;
    let payment: PaymentResult;
    try {
      const provider = sameWallet(await payments.findWallet(farmId), identity) && await payments.providerFor(farmId);
      if (!provider || provider.id !== intent.sender.providerId) return { order: current, uncertain: true };
      payment = current.payment ? await provider.getStatus(current.payment.reference) : await provider.prepare(intent);
      assertPayment(intent, payment, current.payment);
      // Seller accepted a payout from the NPC. Buyer submission requires the existing OAuth callback.
      if (current.role === 'seller' && payment.status === 'pending' && !payment.transactionHash) {
        const submitted = await provider.submit(intent, null);
        assertPayment(intent, submitted, payment);
        payment = submitted;
      }
    } catch (error) {
      if (error instanceof PaymentPreparationRefused && !current.payment) {
        const order = await settleDemoOrder(current, { payment: null, status: 'failed', feeAtomic: '0',
          expiresAt: null, errorCode: error.reason });
        return { order, uncertain: false };
      }
      // The adapter may have persisted or broadcast a payment before losing the response.
      return { order: current, uncertain: true };
    }

    const status = orderStatus(payment);
    try {
      const details = await payments.details(farmId, intent);
      const order = await settleDemoOrder(current, { payment, status, ...details,
        errorCode: status === 'failed' ? 'PAYMENT_FAILED' : status === 'verifying' && payment.errorCode ? 'PAYMENT_UNCONFIRMED' : null });
      return { order, uncertain: false };
    } catch {
      return { order: current, uncertain: true };
    }
  }, tradeOrderLockNamespace);
}

export function createTradeDemoService(payments: TradePayments) {
  async function action(farmId: string, kind: 'accept' | 'skip', request: TradeDemoActionRequest): Promise<TradeDemoActionResponse> {
    let result = await applyDemoAction(farmId, kind, request);
    if ('checkWallets' in result) {
      const state = await getState(farmId);
      const identity = walletFor(state);
      const wallet = await readWallet(farmId, identity, payments);
      const reason = await offerReason(state.role, wallet, payments);
      const intent: PaymentIntent = {
        orderId: randomUUID(), idempotencyKey: request.requestId,
        sender: state.role === 'seller' ? payments.npc : identity,
        receiver: state.role === 'seller' ? identity : payments.npc,
        sponsor: payments.sponsor, amount: amount(payments.asset, priceFor(state.role)),
      };
      // Recheck the offer and revision after RPC, without holding a database transaction across the network.
      result = await applyDemoAction(farmId, kind, request, reason ? { reason } : { intent });
    }
    if ('error' in result) throw new TradeDemoError(result.error);
    if ('checkWallets' in result) throw new TradeDemoError('SERVICE_UNAVAILABLE');
    if (result.orderId) return readOrder(farmId, result.orderId);
    const state = await getState(farmId);
    if (state.run.id !== request.runId) throw new TradeDemoError('STALE_RUN');
    return { snapshot: await snapshotView(farmId, state, payments), order: null };
  }

  async function readOrder(farmId: string, orderId: string): Promise<TradeDemoOrderResponse> {
    const initial = await getOrder(farmId, orderId);
    const result = orderPending(initial) ? await reconcile(farmId, orderId, payments) : { order: initial, uncertain: false };
    if (result.uncertain) throw new TradeDemoError('PAYMENT_UNCONFIRMED', orderId);
    const state = await getState(farmId);
    if (state.run.id !== result.order.run_id) throw new TradeDemoError('ORDER_NOT_FOUND');
    const order = state.latest?.id === orderId ? state.latest : result.order;
    return { snapshot: await snapshotView(farmId, state, payments), order: orderView(state, order) };
  }

  async function currentState(farmId: string) {
    let state = await getState(farmId);
    if (state.reservation) {
      const ownerFarm = state.reservation.role === 'seller' ? state.run.seller_farm_id : state.run.buyer_farm_id;
      await reconcile(ownerFarm, state.reservation.id, payments);
      state = await getState(farmId);
    }
    return state;
  }

  return {
    async afterPayment(farmId: string, orderId: string) {
      const order = await readDemoOrder(farmId, orderId);
      if (order && orderPending(order)) await reconcile(farmId, orderId, payments);
    },
    async read(farmId: string) { return snapshotView(farmId, await currentState(farmId), payments); },
    async pnl(farmId: string): Promise<TradeDemoPnlResponse> {
      const state = await currentState(farmId);
      return { runId: state.run.id, revision: state.run.revision, serverTime: Date.now(), pnl: pnlView(state, payments) };
    },
    action, readOrder,
  };
}

export async function reconcileTradeDemoCallback(farmId: string, orderId: string) {
  const payments = tradePayments();
  if (payments) await createTradeDemoService(payments).afterPayment(farmId, orderId);
}
