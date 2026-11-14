import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getTradeDemoFixture } from '../../../shared/fixtures/trade-demo.mts';
import type { PaymentAmount } from '../../../shared/payments.mts';
import { createFixtureTradeDemoClient } from './fixtures.ts';
import {
  formatGrossProfit,
  formatPaymentAmount,
  getOrderStatusText,
  getUnavailableReasonText,
  truncateAccountId,
} from './helpers.ts';

const usdc = { id: 'usdc-testnet', symbol: 'USDC', decimals: 6 };
const near = { id: 'near-testnet-native', symbol: 'NEAR', decimals: 24 };

describe('Trade Demo Helpers (T-18 / T-62)', () => {
  it('formats USDC amounts with Vietnamese comma separator', () => {
    const oneUsdc: PaymentAmount = { asset: usdc, amountAtomic: '1000000' };
    assert.equal(formatPaymentAmount(oneUsdc), '1 USDC');

    const oneAndHalfUsdc: PaymentAmount = { asset: usdc, amountAtomic: '1500000' };
    assert.equal(formatPaymentAmount(oneAndHalfUsdc), '1,5 USDC');

    const halfUsdc: PaymentAmount = { asset: usdc, amountAtomic: '500000' };
    assert.equal(formatPaymentAmount(halfUsdc), '0,5 USDC');

    const zeroUsdc: PaymentAmount = { asset: usdc, amountAtomic: '0' };
    assert.equal(formatPaymentAmount(zeroUsdc), '0 USDC');
  });

  it('formats NEAR sponsor gas amounts accurately', () => {
    // 0.0001 NEAR = 10^20 yoctoNEAR
    const sponsorGas1: PaymentAmount = { asset: near, amountAtomic: '100000000000000000000' };
    assert.equal(formatPaymentAmount(sponsorGas1), '0,0001 NEAR');

    // 0.0002 NEAR = 2 * 10^20 yoctoNEAR
    const sponsorGas2: PaymentAmount = { asset: near, amountAtomic: '200000000000000000000' };
    assert.equal(formatPaymentAmount(sponsorGas2), '0,0002 NEAR');

    const zeroGas: PaymentAmount = { asset: near, amountAtomic: '0' };
    assert.equal(formatPaymentAmount(zeroGas), '0 NEAR');
    assert.equal(formatPaymentAmount({ asset: near, amountAtomic: '1' }), '0,000000000000000000000001 NEAR');
  });

  it('formats Gross Profit according to T-62 specifications', () => {
    // grossProfit=null hiển thị dấu gạch ngang
    assert.equal(formatGrossProfit(null), '—');
    assert.equal(formatGrossProfit(undefined), '—');

    // Sau bán thành công hiện +0,5 USDC
    const profit: PaymentAmount = { asset: usdc, amountAtomic: '500000' };
    assert.equal(formatGrossProfit(profit), '+0,5 USDC');

    // 0 USDC không có dấu +
    const zeroProfit: PaymentAmount = { asset: usdc, amountAtomic: '0' };
    assert.equal(formatGrossProfit(zeroProfit), '0 USDC');
  });

  it('translates unavailable reasons into clear Vietnamese messages', () => {
    assert.match(getUnavailableReasonText('WALLET_NOT_READY'), /Ví chưa sẵn sàng/);
    assert.match(getUnavailableReasonText('INSUFFICIENT_USDC'), /Số dư USDC không đủ/);
    assert.match(getUnavailableReasonText('NPC_INSUFFICIENT_USDC'), /NPC hiện chưa đủ USDC/);
    assert.match(getUnavailableReasonText('ITEM_RESERVED'), /đang được giữ/);
  });

  it('translates order statuses correctly', () => {
    assert.equal(getOrderStatusText('awaiting_approval'), 'Chờ người dùng xác nhận giao dịch');
    assert.equal(getOrderStatusText('processing'), 'Hệ thống đang xử lý giao dịch');
    assert.equal(getOrderStatusText('verifying'), 'Đang xác minh giao dịch trên blockchain');
    assert.equal(getOrderStatusText('succeeded'), 'Giao dịch thành công');
    assert.equal(getOrderStatusText('failed'), 'Giao dịch thất bại');
    assert.equal(getOrderStatusText('cancelled'), 'Giao dịch đã bị hủy');
    assert.equal(getOrderStatusText('expired'), 'Yêu cầu giao dịch đã hết hạn');
  });

  it('truncates account IDs safely', () => {
    const fullId = '1111111111111111111111111111111111111111111111111111111111111111';
    const truncated = truncateAccountId(fullId, 6);
    assert.equal(truncated, '111111...111111');
    assert.equal(truncateAccountId(null), '—');
  });
});

describe('Trade Demo Fixture Transitions (T-18 / T-62)', () => {
  it('covers all required scenarios from shared fixtures', () => {
    const scenarios = [
      'sellerOffer',
      'buyerWaitingForStock',
      'sellerPaymentPending',
      'sellerPaid',
      'buyerOffer',
      'buyerAwaitingApproval',
      'buyerPaymentPending',
      'buyerPaymentConfirmed',
      'buyerCompleted',
      'buyerCancelled',
      'buyerInsufficientFunds',
      'buyerPaymentFailed',
      'buyerPaymentUncertain',
      'buyerExpired',
      'sellerSkipped',
      'buyerSkipped',
      'buyerWalletPreparing',
    ] as const;

    for (const name of scenarios) {
      const fix = getTradeDemoFixture(name);
      assert.ok(fix, `Fixture ${name} should exist`);
      assert.ok(fix.runId, `Fixture ${name} must have runId`);
    }
  });

  it('simulates Farmer A flow: offer -> accept -> verifying -> paid', async () => {
    const client = createFixtureTradeDemoClient({ initialScenario: 'sellerOffer' });
    const initial = await client.read();
    assert.equal(initial.role, 'seller');
    assert.equal(initial.offer?.kind, 'sell_to_npc');
    assert.equal(initial.offer?.canAccept, true);
    assert.equal(formatPaymentAmount(initial.offer?.amount), '1 USDC');

    const acceptRes = await client.accept({
      runId: initial.runId,
      offerId: initial.offer!.id,
      requestId: '30000000-0000-4000-8000-000000000001',
      expectedRevision: initial.revision,
    });

    assert.equal(acceptRes.snapshot.stage, 'paying_seller');
    assert.equal(acceptRes.order?.status, 'verifying');

    const orderRes = await client.readOrder(acceptRes.order!.id);
    assert.equal(orderRes.order.status, 'succeeded');
    assert.equal(orderRes.snapshot.wallet.balance?.amountAtomic, '1000000');
    assert.equal(formatPaymentAmount(orderRes.snapshot.wallet.balance), '1 USDC');
  });

  it('simulates Farmer A skip', async () => {
    const client = createFixtureTradeDemoClient({ initialScenario: 'sellerOffer' });
    const initial = await client.read();
    const skipRes = await client.skip({
      runId: initial.runId,
      offerId: initial.offer!.id,
      requestId: '30000000-0000-4000-8000-000000000002',
      expectedRevision: initial.revision,
    });

    assert.equal(skipRes.snapshot.offerDismissed, true);
    assert.equal(skipRes.snapshot.offer, null);
    assert.equal(skipRes.order, null);
  });

  it('simulates Farmer B flow: waiting for stock -> offer -> accept -> completed with badge & PnL', async () => {
    const client = createFixtureTradeDemoClient({ initialScenario: 'buyerWaitingForStock' });
    const waiting = await client.read();
    assert.equal(waiting.role, 'buyer');
    assert.equal(waiting.offer, null);
    assert.equal(waiting.basket.filled, 2);
    assert.equal(waiting.basket.required, 3);

    // Stock arrives
    client.setScenario('buyerOffer');
    const offerSnap = await client.read();
    assert.equal(offerSnap.offer?.kind, 'buy_from_npc');
    assert.equal(formatPaymentAmount(offerSnap.offer?.amount), '1,5 USDC');

    const acceptRes = await client.accept({
      runId: offerSnap.runId,
      offerId: offerSnap.offer!.id,
      requestId: '30000000-0000-4000-8000-000000000003',
      expectedRevision: offerSnap.revision,
    });
    assert.equal(acceptRes.order?.kind, 'buy_from_npc');

    const completedRes = await client.readOrder(acceptRes.order!.id);
    assert.equal(completedRes.order.status, 'succeeded');
    assert.equal(completedRes.snapshot.basket.filled, 3);
    assert.ok(completedRes.snapshot.basket.badge);
    assert.equal(completedRes.snapshot.basket.badge.name, 'Mâm quả mùa vụ');

    // Check PnL after B purchase
    const pnl = completedRes.snapshot.pnl;
    assert.equal(formatPaymentAmount(pnl.costBasis), '1 USDC');
    assert.equal(formatPaymentAmount(pnl.revenue), '1,5 USDC');
    assert.equal(formatGrossProfit(pnl.grossProfit), '+0,5 USDC');
    assert.equal(formatPaymentAmount(pnl.sponsorGas), '0,0002 NEAR');
  });

  it('rejects accept when canAccept is false', async () => {
    const client = createFixtureTradeDemoClient({ initialScenario: 'buyerInsufficientFunds' });
    const snap = await client.read();
    assert.equal(snap.offer?.canAccept, false);
    assert.equal(snap.offer?.unavailableReason, 'INSUFFICIENT_USDC');

    await assert.rejects(
      async () => {
        await client.accept({
          runId: snap.runId,
          offerId: snap.offer!.id,
          requestId: '30000000-0000-4000-8000-000000000004',
          expectedRevision: snap.revision,
        });
      },
      /INSUFFICIENT_USDC/
    );
  });
});
