import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTradeDemoFixture } from '../../shared/fixtures/trade-demo.mts';
import { isTradeDemoActionRequest, TRADE_DEMO_PRICES } from '../../shared/trade-demo.mts';

test('trade action validates idempotency identity and revision before accepting input', () => {
  const snapshot = getTradeDemoFixture('sellerOffer');
  const request = {
    runId: snapshot.runId, offerId: snapshot.offer!.id,
    requestId: '30000000-0000-4000-8000-000000000001', expectedRevision: 0,
  };
  assert.equal(isTradeDemoActionRequest(request), true);
  for (const value of [null, [], {},
    { ...request, requestId: '' }, { ...request, requestId: 'not-a-uuid' },
    { ...request, runId: ' ' }, { ...request, offerId: 'x'.repeat(129) },
    { ...request, expectedRevision: -1 }, { ...request, expectedRevision: 0.5 },
    { ...request, expectedRevision: '0' }, { ...request, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.equal(isTradeDemoActionRequest(value), false);
});

test('UI fixtures keep paid and fulfilled separate and reconcile the completed USDC loop', () => {
  const paid = getTradeDemoFixture('buyerPaymentConfirmed');
  assert.equal(paid.activeOrder?.payment?.status, 'confirmed');
  assert.equal(paid.activeOrder?.status, 'processing');
  assert.equal(paid.item.owner, 'npc');
  assert.equal(paid.item.reservedByOrderId, paid.activeOrder.id);
  assert.equal(paid.basket.filled, 2);
  assert.equal(paid.basket.badge, null);
  assert.equal(paid.pnl.grossProfit, null);

  const seller = getTradeDemoFixture('sellerPaid');
  const done = getTradeDemoFixture('buyerCompleted');
  assert.equal(seller.wallet.balance?.amountAtomic, TRADE_DEMO_PRICES.sellerPayoutAtomic);
  assert.equal(done.activeOrder?.status, 'succeeded');
  assert.equal(done.item.owner, 'basket');
  assert.equal(done.item.reservedByOrderId, null);
  assert.equal(done.basket.filled, done.basket.required);
  assert.ok(done.basket.badge);
  assert.equal(done.pnl.inventoryQuantity, 0);
  const profit = BigInt(done.pnl.revenue.amountAtomic) - BigInt(done.pnl.costBasis.amountAtomic);
  assert.equal(profit.toString(), TRADE_DEMO_PRICES.grossProfitAtomic);
  assert.equal(done.pnl.grossProfit?.amountAtomic, profit.toString());
  assert.equal(done.pnl.revenue.asset.decimals, 6);
  assert.equal(done.pnl.sponsorGas.asset.symbol, 'NEAR');
  assert.equal(done.pnl.sponsorGas.asset.decimals, 24);
});

test('uncertain payment retains reservation while cancellation and skip keep rewards unapplied', () => {
  const pending = getTradeDemoFixture('buyerPaymentUncertain');
  assert.equal(pending.activeOrder?.status, 'verifying');
  assert.equal(pending.item.reservedByOrderId, pending.activeOrder.id);
  for (const name of ['buyerCancelled', 'buyerPaymentFailed', 'buyerExpired', 'buyerSkipped'] as const) {
    const snapshot = getTradeDemoFixture(name);
    assert.equal(snapshot.item.owner, 'npc');
    assert.equal(snapshot.item.reservedByOrderId, null);
    assert.equal(snapshot.basket.badge, null);
    assert.equal(snapshot.pnl.revenue.amountAtomic, '0');
    assert.equal(snapshot.pnl.grossProfit, null);
  }
  const copy = getTradeDemoFixture('buyerOffer');
  copy.pnl.costBasis.amountAtomic = '0';
  copy.item.owner = 'basket';
  assert.equal(getTradeDemoFixture('buyerOffer').pnl.costBasis.amountAtomic, '1000000');
  assert.equal(getTradeDemoFixture('sellerPaid').item.owner, 'npc');
});
