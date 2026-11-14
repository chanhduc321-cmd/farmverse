import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Hono } from 'hono';
import type { PaymentIntent, PaymentResult, PaymentStatus, PaymentWallet } from '../../shared/payments.mts';
import type { TradeDemoActionRequest, TradeDemoSnapshot } from '../../shared/trade-demo.mts';
import app from '../src/app.ts';
import { findAccountSession, hashToken } from '../src/account-store.ts';
import { signInSocial } from '../src/auth/social-store.ts';
import { queryFarmDatabase, readFarm } from '../src/farm-store.ts';
import { tradeDemoRoutes } from '../src/trade-demo/routes.ts';
import { createTradeDemoService } from '../src/trade-demo/service.ts';
import { initializeDemoRun, readDemoState } from '../src/trade-demo/store.ts';
import type { TradePayments } from '../src/payments/trade-payments.ts';

const issuer = 'https://trade-demo.test.invalid/';
const asset = { id: 'usdc-testnet', symbol: 'USDC', decimals: 6 };
const gasAsset = { id: 'near-testnet-native', symbol: 'NEAR', decimals: 24 };
const identity = (accountId: string): PaymentWallet => ({ providerId: 'fake', network: 'testnet', accountId });

async function participant() {
  const subject = randomUUID();
  const wallet = identity(subject);
  const session = await signInSocial({ issuer, subject, network: wallet.network, walletId: wallet.accountId });
  assert.ok(session);
  const account = await findAccountSession(hashToken(session.token));
  assert.ok(account);
  return { farmId: account.farm_id, wallet, token: session.token };
}

test('NEAR demo is private by default and exposes capability only when enabled', async () => {
  const previousFlag = process.env.NEAR_DEMO_ENABLED;
  const previousCallback = process.env.NEAR_AUTH_CALLBACK_URL;
  process.env.NEAR_AUTH_CALLBACK_URL = 'http://localhost:3000/';
  try {
    delete process.env.NEAR_DEMO_ENABLED;
    const disabled = await app.request('/farm');
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json()).nearDemoAvailable, false);
    const routes = [
      ['/account/social/near', 'GET'],
      ['/account/social/near/callback', 'GET'],
      ['/account/social/near/test-signature', 'GET'],
      ['/account/transactions', 'GET'],
      ['/account/payments/near/example/authorize', 'GET'],
      ['/trade-demo', 'GET'],
      ['/trade-demo/visit', 'POST'],
      ['/trade-demo/accept', 'POST'],
    ];
    for (const [path, method] of routes) assert.equal((await app.request(path, { method })).status, 404, path);

    process.env.NEAR_DEMO_ENABLED = 'true';
    const enabled = await app.request('/farm', { headers: { Cookie: disabled.headers.get('set-cookie')!.split(';')[0] } });
    assert.equal((await enabled.json()).nearDemoAvailable, true);
    const login = await app.request('/account/social/near');
    assert.equal(login.status, 303);
    assert.equal(new URL(login.headers.get('location')!).searchParams.get('redirect_uri'), 'http://localhost:3000/');
    const response = await app.request('/trade-demo');
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'SESSION_REQUIRED');
  } finally {
    if (previousFlag === undefined) delete process.env.NEAR_DEMO_ENABLED; else process.env.NEAR_DEMO_ENABLED = previousFlag;
    if (previousCallback === undefined) delete process.env.NEAR_AUTH_CALLBACK_URL; else process.env.NEAR_AUTH_CALLBACK_URL = previousCallback;
  }
});

test('HTTP trade demo reserves, recovers, settles and awards once on PostgreSQL', async () => {
  const seller = await participant();
  const buyer = await participant();
  const outside = await participant();
  const participants = [seller, buyer, outside];
  const sellerFarm = await readFarm(seller.farmId, true);
  const buyerFarm = await readFarm(buyer.farmId, true);
  const npc = identity('npc.testnet');
  const sponsor = identity('sponsor.testnet');
  const records = new Map<string, PaymentResult>();
  const intents = new Map<string, PaymentIntent>();
  const balances = new Map([[seller.wallet.accountId, '0'], [buyer.wallet.accountId, '1500000'], [npc.accountId, '2000000']]);
  const fees = new Map<string, string>();
  let losePrepareResponse = true;
  let loseSubmitResponse = true;
  let submitCount = 0;

  function makePayment(intent: PaymentIntent, status: PaymentStatus): PaymentResult {
    const paymentId = `payment-${intent.orderId}`;
    return {
      reference: { providerId: 'fake', network: 'testnet', paymentId },
      status, transactionId: paymentId, transactionHash: status === 'confirmed' ? `hash-${paymentId}` : null,
      explorerUrl: null, requiredAction: status === 'awaiting_approval' ? { type: 'redirect', url: '/mock-approve' } : null,
      errorCode: null,
    };
  }
  function setPayment(orderId: string, status: PaymentStatus) {
    const intent = intents.get(orderId)!;
    const payment = makePayment(intent, status);
    records.set(payment.reference.paymentId, payment);
  }

  const payments: TradePayments = {
    asset, gasAsset, npc, sponsor,
    async findWallet(farmId) { return participants.find(person => person.farmId === farmId)?.wallet; },
    async readWallet(wallet) {
      return { identity: wallet, status: 'ready', balance: { asset, amountAtomic: balances.get(wallet.accountId) ?? '0' } };
    },
    async details(_farmId, intent) { return { feeAtomic: fees.get(intent.orderId) ?? '0', expiresAt: null }; },
    async providerFor(farmId) {
      return {
        id: 'fake',
        async prepare(intent) {
          const state = await readDemoState(farmId);
          assert.equal(state?.reservation?.id, intent.orderId);
          const existing = records.get(`payment-${intent.orderId}`);
          if (existing) return existing;
          intents.set(intent.orderId, intent);
          const isPayout = intent.sender.accountId === npc.accountId;
          const payment = makePayment(intent, isPayout ? 'pending' : 'awaiting_approval');
          records.set(payment.reference.paymentId, payment);
          if (isPayout && losePrepareResponse) {
            losePrepareResponse = false;
            throw new Error('Interrupted after storing adapter intent');
          }
          return payment;
        },
        async submit(intent, authorization) {
          assert.equal(farmId, seller.farmId);
          assert.equal(authorization, null);
          submitCount++;
          const payment = { ...makePayment(intent, 'pending'), transactionHash: `hash-payment-${intent.orderId}` };
          records.set(payment.reference.paymentId, payment);
          if (loseSubmitResponse) {
            loseSubmitResponse = false;
            throw new Error('Interrupted after broadcast');
          }
          return payment;
        },
        async getStatus(ref) { return records.get(ref.paymentId)!; },
      };
    },
  };
  function http() {
    return new Hono().route('/', tradeDemoRoutes(async context => {
      const token = context.req.header('Cookie')?.match(/^farmverse_account=([a-f0-9]{64})$/)?.[1];
      if (token) return (await findAccountSession(hashToken(token)))?.farm_id;
    }, () => payments));
  }
  let server = http();
  const get = (person: typeof seller, path = '/trade-demo') =>
    server.request(path, { headers: { Cookie: `farmverse_account=${person.token}` } });
  const visit = (person: typeof seller, extraHeaders = {}) => server.request('/trade-demo/visit', {
    method: 'POST', headers: { Cookie: `farmverse_account=${person.token}`, ...extraHeaders },
  });
  const act = (person: typeof seller, action: 'accept' | 'skip', body: TradeDemoActionRequest, extraHeaders = {}) =>
    server.request(`/trade-demo/${action}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `farmverse_account=${person.token}`, ...extraHeaders },
      body: JSON.stringify(body) });
  const requestFor = (snapshot: TradeDemoSnapshot) => ({
    runId: snapshot.runId, offerId: snapshot.offer!.id, requestId: randomUUID(), expectedRevision: snapshot.revision,
  });

  try {
    const run = await initializeDemoRun(seller, buyer, false);
    assert.equal(run.created, true);
    assert.deepEqual(await initializeDemoRun(seller, buyer, false), { runId: run.runId, created: false });
    assert.equal((await get(outside)).status, 409);
    assert.equal((await visit(outside)).status, 409);
    assert.equal((await visit(seller, { 'Sec-Fetch-Site': 'cross-site' })).status, 400);
    assert.equal((await (await visit(buyer)).json()).visit, null);
    const first = await (await get(seller)).json() as TradeDemoSnapshot;
    assert.equal(first.offer?.amount.amountAtomic, '1000000');
    const waiting = await (await get(buyer)).json();
    assert.equal(waiting.offer, null);
    assert.equal(waiting.basket.filled, 2);
    const request = requestFor(first);
    const invalid = await act(seller, 'accept', request, { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(invalid.status, 400);
    assert.equal((await act(buyer, 'accept', request)).status, 409);

    balances.set(npc.accountId, '0');
    const blocked = await (await get(seller)).json();
    assert.equal(blocked.offer.unavailableReason, 'NPC_INSUFFICIENT_USDC');
    assert.equal((await (await visit(seller)).json()).visit, null);
    assert.equal((await act(seller, 'accept', request)).status, 409);
    assert.equal(intents.size, 0);
    balances.set(npc.accountId, '2000000');
    const visits = await Promise.all([visit(seller), visit(seller)]);
    const sameVisit = await Promise.all(visits.map(response => response.json()));
    assert.ok(sameVisit[0].visit);
    assert.deepEqual(sameVisit[0].visit, sameVisit[1].visit);
    assert.equal(sameVisit[0].visit.kind, 'sell_to_npc');
    assert.equal(sameVisit[0].visit.offerId, first.offer?.id);
    assert.ok(sameVisit[0].visit.arrivesAt > sameVisit[0].serverTime);
    assert.ok(sameVisit[0].visit.arrivesAt <= sameVisit[0].serverTime + 12_000);
    assert.equal(sameVisit[0].canRevisitStall, false);
    server = http();
    assert.deepEqual((await (await visit(seller)).json()).visit, sameVisit[0].visit);

    const interrupted = await act(seller, 'accept', request);
    assert.equal(interrupted.status, 503);
    const err = (await interrupted.json()).error;
    assert.equal(err.code, 'PAYMENT_UNCONFIRMED');
    const orderPath = `/trade-demo/orders/${err.orderId}`;
    assert.equal((await get(buyer, orderPath)).status, 404);
    assert.equal((await get(outside, orderPath)).status, 404);
    assert.equal((await act(seller, 'skip', request)).status, 409);
    assert.equal((await act(seller, 'accept', { ...request, requestId: randomUUID() })).status, 409);
    await assert.rejects(initializeDemoRun(seller, buyer, true), /Resolve the active payment/);

    // Recreate HTTP routes to recover from the durable order and the same adapter reference.
    server = http();
    const lostBroadcast = await act(seller, 'accept', request);
    assert.equal(lostBroadcast.status, 503);
    assert.equal((await lostBroadcast.json()).error.orderId, err.orderId);
    const pending = await act(seller, 'accept', request);
    assert.equal(pending.status, 202);
    const pendingBody = await pending.json();
    assert.equal(pendingBody.order.id, err.orderId);
    assert.equal(pendingBody.order.status, 'verifying');
    assert.equal(pendingBody.snapshot.item.reservedByOrderId, err.orderId);
    assert.equal(pendingBody.snapshot.item.owner, 'seller');
    assert.equal(submitCount, 1);
    assert.equal(intents.size, 1);
    assert.equal((await (await get(buyer)).json()).offer, null);

    setPayment(err.orderId, 'confirmed');
    fees.set(err.orderId, '338073369761700000000');
    const afterA = await (await get(buyer)).json() as TradeDemoSnapshot;
    assert.equal(afterA.offer?.kind, 'buy_from_npc');
    assert.equal(afterA.item.owner, 'npc');
    assert.equal(afterA.pnl.costBasis.amountAtomic, '1000000');
    assert.equal(afterA.pnl.grossProfit, null);
    assert.equal(afterA.basket.badge, null);
    const buyerVisit = await (await visit(buyer)).json();
    assert.equal(buyerVisit.visit?.kind, 'buy_from_npc');
    assert.equal(buyerVisit.visit?.offerId, afterA.offer?.id);
    assert.equal((await (await visit(seller)).json()).visit, null);
    assert.equal((await act(seller, 'accept', request)).status, 200);

    const bids = await Promise.all([act(buyer, 'accept', requestFor(afterA)), act(buyer, 'accept', requestFor(afterA))]);
    assert.deepEqual(bids.map(response => response.status).sort(), [202, 409]);
    const awaiting = await bids.find(response => response.status === 202)!.json();
    assert.equal(awaiting.order.status, 'awaiting_approval');
    assert.equal(awaiting.order.amount.amountAtomic, '1500000');
    assert.equal(awaiting.order.payment.requiredAction.url, '/mock-approve');
    assert.equal(awaiting.snapshot.basket.filled, 2);
    assert.equal(awaiting.snapshot.pnl.revenue.amountAtomic, '0');
    assert.equal(submitCount, 1);
    const reservedVisit = await (await visit(buyer)).json();
    assert.equal(reservedVisit.visit, null);
    assert.equal(reservedVisit.canRevisitStall, true);

    setPayment(awaiting.order.id, 'cancelled');
    const cancelled = await (await get(buyer, `/trade-demo/orders/${awaiting.order.id}`)).json();
    assert.equal(cancelled.order.status, 'cancelled');
    assert.equal(cancelled.snapshot.item.reservedByOrderId, null);
    assert.equal(cancelled.snapshot.basket.badge, null);
    assert.deepEqual((await (await visit(buyer)).json()).visit, buyerVisit.visit);
    const retryRequest = requestFor(cancelled.snapshot);
    const resumed = await (await act(buyer, 'accept', retryRequest)).json();
    assert.notEqual(resumed.order.id, awaiting.order.id);
    setPayment(resumed.order.id, 'expired');
    const expired = await (await get(buyer, `/trade-demo/orders/${resumed.order.id}`)).json();
    assert.equal(expired.order.status, 'expired');
    assert.equal(expired.snapshot.item.reservedByOrderId, null);
    const finalRequest = requestFor(expired.snapshot);
    const accepted = await (await act(buyer, 'accept', finalRequest)).json();
    const buyerOrder = accepted.order.id;
    setPayment(buyerOrder, 'confirmed');
    fees.set(buyerOrder, '3970525434934200000000');
    const service = createTradeDemoService(payments);
    await service.afterPayment(seller.farmId, buyerOrder);
    assert.equal((await readDemoState(buyer.farmId))?.run.badge_awarded_at, null);
    await Promise.all([service.afterPayment(buyer.farmId, buyerOrder), service.afterPayment(buyer.farmId, buyerOrder)]);
    const committed = await readDemoState(buyer.farmId);
    assert.equal(committed?.run.item_owner, 'basket');
    assert.ok(committed?.run.badge_awarded_at);
    const confirmed = await Promise.all([
      get(buyer, `/trade-demo/orders/${buyerOrder}`), act(buyer, 'accept', finalRequest), get(seller, '/trade-demo/pnl'),
    ]);
    assert.deepEqual(confirmed.map(response => response.status), [200, 200, 200]);
    const bodies = await Promise.all(confirmed.map(response => response.json()));
    assert.equal(bodies[0].order.fulfilledAt, bodies[1].order.fulfilledAt);
    const complete = bodies[0].snapshot;
    assert.equal(complete.stage, 'completed');
    assert.equal(complete.basket.filled, 3);
    assert.equal(complete.basket.badge.id, 'seasonal-basket');
    assert.equal(complete.basket.badge.awardedAt, bodies[1].snapshot.basket.badge.awardedAt);
    assert.equal(complete.basket.badge.awardedAt, committed.run.badge_awarded_at.toISOString());
    assert.equal(complete.item.owner, 'basket');
    assert.equal(complete.pnl.inventoryQuantity, 0);
    assert.equal(complete.pnl.costBasis.amountAtomic, '1000000');
    assert.equal(complete.pnl.revenue.amountAtomic, '1500000');
    assert.equal(complete.pnl.grossProfit.amountAtomic, '500000');
    const completedVisit = await (await visit(buyer)).json();
    assert.equal(completedVisit.visit, null);
    assert.equal(completedVisit.checkAgain, false);
    assert.equal(completedVisit.canRevisitStall, true);
    assert.equal(bodies[2].pnl.sponsorGas.amountAtomic, '4308598804695900000000');
    assert.deepEqual(await readFarm(seller.farmId, true), sellerFarm);
    assert.deepEqual(await readFarm(buyer.farmId, true), buyerFarm);

    const newRun = await initializeDemoRun(seller, buyer, true);
    assert.notEqual(newRun.runId, run.runId);
    assert.equal((await get(buyer, `/trade-demo/orders/${buyerOrder}`)).status, 404);
    const fresh = await (await get(seller)).json();
    const skipRequest = requestFor(fresh);
    const skipped = await (await act(seller, 'skip', skipRequest)).json();
    assert.equal(skipped.snapshot.offerDismissed, true);
    assert.equal(skipped.snapshot.offer, null);
    assert.equal(skipped.snapshot.item.owner, 'seller');
    assert.equal(skipped.snapshot.pnl.costBasis.amountAtomic, '0');
    const skippedVisit = await (await visit(seller)).json();
    assert.equal(skippedVisit.visit, null);
    assert.equal(skippedVisit.checkAgain, false);
    const repeatedSkip = await (await act(seller, 'skip', skipRequest)).json();
    assert.equal(repeatedSkip.snapshot.revision, skipped.snapshot.revision);
    assert.equal(submitCount, 1);
  } finally {
    await queryFarmDatabase('DELETE FROM farm_trade_demo_requests WHERE farm_id IN ($1,$2)', [seller.farmId, buyer.farmId]);
    await queryFarmDatabase(`DELETE FROM farm_trade_demo_orders WHERE run_id IN
      (SELECT id FROM farm_trade_demo_runs WHERE seller_farm_id=$1 AND buyer_farm_id=$2)`, [seller.farmId, buyer.farmId]);
    await queryFarmDatabase('DELETE FROM farm_trade_demo_runs WHERE seller_farm_id=$1 AND buyer_farm_id=$2', [seller.farmId, buyer.farmId]);
    for (const person of participants) {
      await queryFarmDatabase('DELETE FROM farm_accounts WHERE farm_id=$1', [person.farmId]);
      await queryFarmDatabase('DELETE FROM farm_guest_progress WHERE session_id=$1', [person.farmId]);
    }
  }
});
