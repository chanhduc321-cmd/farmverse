import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MERCHANT_CROP_IDS } from '../../shared/merchant.mts';
import type { MerchantResponse } from '../../shared/merchant.mts';
import { crops } from '../src/catalog.ts';
import { createFarm } from '../src/farm.ts';
import { createMerchant, merchantPricing, resolveMerchant } from '../src/merchant.ts';
import type { MerchantResult } from '../src/merchant.ts';

function success(result: MerchantResult): MerchantResponse {
  assert.ok(!('error' in result));
  return result;
}

function offerRequest(response: MerchantResponse, kind: 'accept' | 'reject' = 'accept') {
  return {
    kind, offerId: response.merchant.offers[0].id,
    expectedRevision: response.farm.revision, expectedMerchantRevision: response.merchant.revision,
  };
}

test('C02 uses strawberry and corn, respects full NPC inventory, and has no immediate arbitrage', () => {
  assert.equal(crops[MERCHANT_CROP_IDS.NORMAL - 1].name, 'Dâu tây');
  assert.equal(crops[MERCHANT_CROP_IDS.GOLDEN - 1].name, 'Ngô');
  const farm = createFarm();
  farm.produce[1] = 1;
  const merchant = createMerchant(0);
  merchant.goldBudget = 350;
  assert.deepEqual(merchantPricing(merchant), { buyMultiplier: 1.45, sellMultiplier: 1 });
  merchant.inventory.counts.NORMAL = 9;
  const response = success(resolveMerchant(farm, merchant, 20_000));
  const offer = response.merchant.offers[0];
  assert.equal(offer.side, 'SELL');
  assert.equal(offer.priceGold, 30);
  assert.ok(offer.priceGold > 25 && offer.priceGold > crops[0].sellPrice);
  merchant.inventory.counts = { NORMAL: 0, GOLDEN: 10 };
  const corn = success(resolveMerchant(farm, merchant, 40_000)).merchant.offers[0];
  assert.equal(corn.crop, 'GOLDEN');
  assert.equal(corn.priceGold, 90);
  assert.ok(corn.priceGold > 75 && corn.priceGold > crops[1].sellPrice);
  farm.produce[2] = 9;
  const full = success(resolveMerchant(farm, merchant, 40_001));
  assert.equal(full.merchant.offers[0].unavailableReason, 'SILO_FULL');
  assert.deepEqual(resolveMerchant(farm, merchant, 40_001, offerRequest(full)), { error: 'SILO_FULL' });
});

test('NPC transfers one item and exact Gold in each direction, with cooldown and replay guards', () => {
  const farm = createFarm();
  const merchant = createMerchant(0);
  const onboarding = success(resolveMerchant(farm, merchant, 0));
  assert.equal(onboarding.merchant.offers[0].priceGold, 15);
  assert.equal(onboarding.merchant.offers[0].canAccept, false);

  const sell = success(resolveMerchant(farm, merchant, 20_000));
  const buyFromNpc = offerRequest(sell);
  const price = sell.merchant.offers[0].priceGold;
  success(resolveMerchant(farm, merchant, 20_001, buyFromNpc));
  assert.equal(farm.produce[1], 1);
  assert.equal(farm.gold, 200 - price);
  assert.equal(merchant.goldBudget, 200 + price);
  assert.equal(merchant.inventory.counts.NORMAL, 2);
  assert.equal(merchant.demand, 7);
  assert.deepEqual(resolveMerchant(farm, merchant, 20_002, buyFromNpc), { error: 'STALE_FARM' });
  assert.equal(success(resolveMerchant(farm, merchant, 25_000)).merchant.offers.length, 0);

  farm.produce[2] = 1;
  const buy = success(resolveMerchant(farm, merchant, 25_001));
  assert.equal(buy.merchant.offers[0].side, 'BUY');
  assert.equal(buy.merchant.offers[0].crop, 'GOLDEN');
  const cornPrice = buy.merchant.offers[0].priceGold;
  success(resolveMerchant(farm, merchant, 25_001, offerRequest(buy)));
  assert.deepEqual(farm.produce, { 1: 1, 2: 0 });
  assert.equal(farm.gold, 200 - price + cornPrice);
  assert.equal(merchant.goldBudget, 200 + price - cornPrice);
  assert.equal(merchant.inventory.counts.GOLDEN, 2);
  assert.equal(merchant.demand, 5);
  assert.equal(farm.revision, 2);
});

test('expiry and rejection count once, then liquidation, grant and closure preserve their accounting', () => {
  const farm = createFarm();
  const merchant = createMerchant(0);
  const opening = success(resolveMerchant(farm, merchant, 0));
  const openingAction = offerRequest(opening);
  assert.deepEqual(resolveMerchant(farm, merchant, 20_000, openingAction), { error: 'STALE_MERCHANT' });
  assert.equal(merchant.demand, 6);
  assert.deepEqual(resolveMerchant(farm, merchant, 20_000, openingAction), { error: 'STALE_MERCHANT' });
  assert.equal(merchant.demand, 6);
  const sell = success(resolveMerchant(farm, merchant, 20_000));
  const rejection = offerRequest(sell, 'reject');
  success(resolveMerchant(farm, merchant, 20_001, rejection));
  assert.deepEqual(resolveMerchant(farm, merchant, 20_002, rejection), { error: 'STALE_MERCHANT' });
  assert.equal(merchant.demand, 5);
  assert.equal(merchant.sellFailStreak, 1);

  merchant.goldBudget = 5;
  merchant.inventory.counts = { NORMAL: 1, GOLDEN: 0 };
  merchant.sellFailStreak = 3;
  success(resolveMerchant(farm, merchant, 40_000));
  assert.equal(merchant.goldBudget, 75);
  assert.deepEqual(merchant.inventory.counts, { NORMAL: 0, GOLDEN: 0 });
  assert.equal(merchant.isSelfSustaining, false);
  assert.deepEqual(merchant.recoveryEvents.map(event => event.kind), ['LIQUIDATION', 'OPERATING_GRANT']);
  const [liquidation] = merchant.recoveryEvents;
  assert.ok(liquidation.kind === 'LIQUIDATION');
  assert.equal(liquidation.crop, 'NORMAL');
  assert.equal(liquidation.goldAdded, 10);
  merchant.goldBudget = 5;
  success(resolveMerchant(farm, merchant, 60_000));
  success(resolveMerchant(farm, merchant, 80_000));
  assert.equal(merchant.status, 'OUT_OF_BUSINESS');
  assert.equal(merchant.goldBudget, 5);
  assert.deepEqual(merchant.recoveryEvents.map(event => event.kind), ['LIQUIDATION', 'OPERATING_GRANT', 'OUT_OF_BUSINESS']);
});
