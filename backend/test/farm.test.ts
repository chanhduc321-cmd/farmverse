import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ripeAt, stageAt } from '../../shared/farm.mts';
import { crops } from '../src/catalog.ts';
import { applyAction, createFarm, parseAction } from '../src/farm.ts';

test('all 15 varieties reach every frame and ripen at the approved time', () => {
  const expected = [30, 180, 150, 160, 270, 285, 300, 330, 360, 390, 588, 450, 672, 510, 756];
  assert.equal(crops.length, expected.length);
  for (const crop of crops) {
    const plot = { cropId: crop.id, plantedAt: 100, harvested: false };
    assert.equal(ripeAt(crop, plot), 100 + expected[crop.id - 1] * 1_000);
    for (let stage = 1; stage <= crop.stages; stage++) {
      const time = 100 + crop.unitSeconds * stage * (stage + 1) * 500;
      assert.equal(stageAt(crop, plot, time - 1), stage - 1);
      assert.equal(stageAt(crop, plot, time), stage);
    }
  }
  assert.equal(crops[2].readyFrame, 5);
  assert.equal(crops[3].readyFrame, 5);
  assert.equal(crops[4].name, 'Khoai lang');
});

test('buy, plant, harvest, sell, and clear preserve GOLD, inventory, XP, and revision', () => {
  const farm = createFarm();
  assert.deepEqual(farm.plots, Array(6).fill(null));
  assert.equal(farm.gold, 200);
  assert.throws(() => applyAction(farm, { type: 'plant', plot: 0, cropId: 1, expectedRevision: 0 }, 0), /hết hạt/);
  const buy = { type: 'buy', cropId: 1, quantity: 2, expectedRevision: 0 } as const;
  applyAction(farm, buy, 0);
  assert.throws(() => applyAction(farm, buy, 0), /vừa thay đổi/);
  assert.equal(farm.gold, 180);
  applyAction(farm, { type: 'plant', plot: 0, cropId: 1, expectedRevision: 1 }, 0);
  assert.equal(farm.seeds[1], 1);
  assert.equal(farm.xp, 5);
  const harvest = { type: 'harvest', plot: 0, expectedRevision: 2 } as const;
  assert.throws(() => applyAction(farm, harvest, 29_999), /chưa chín/);
  assert.throws(() => applyAction(farm, { type: 'clear', plot: 0, expectedRevision: 2 }, 30_000), /Chỉ dọn/);
  applyAction(farm, harvest, 30_000, () => 0);
  assert.throws(() => applyAction(farm, { ...harvest, expectedRevision: 3 }, 30_000), /đã thu hoạch/);
  assert.throws(() => applyAction(farm, { type: 'plant', plot: 0, cropId: 1, expectedRevision: 3 }, 30_000), /đất trống/);
  assert.equal(farm.produce[1], 10);
  assert.equal(farm.xp, 6);
  const sell = { type: 'sell', cropId: 1, quantity: 11, expectedRevision: 3 } as const;
  assert.throws(() => applyAction(farm, sell, 30_000), /không đủ/);
  applyAction(farm, { ...sell, quantity: 0 }, 30_000);
  assert.equal(farm.revision, 3);
  applyAction(farm, { ...sell, quantity: 2 }, 30_000);
  assert.equal(farm.produce[1], 8);
  assert.equal(farm.gold, 220);
  applyAction(farm, { type: 'clear', plot: 0, expectedRevision: 4 }, 30_000);
  assert.equal(farm.plots[0], null);
  assert.equal(farm.xp, 9);
  applyAction(farm, { type: 'plant', plot: 0, cropId: 1, expectedRevision: 5 }, 30_000);
  applyAction(farm, { type: 'harvest', plot: 0, expectedRevision: 6 }, 60_000, () => 0.9999);
  assert.equal(farm.produce[1], 37);
});

test('shop level is advisory, XP carries over, and mutation inputs enforce limits', () => {
  const farm = createFarm();
  farm.xp = 198;
  applyAction(farm, { type: 'buy', cropId: 15, quantity: 1, expectedRevision: 0 }, 0);
  applyAction(farm, { type: 'plant', plot: 5, cropId: 15, expectedRevision: 1 }, 0);
  assert.equal(farm.level, 2);
  assert.equal(farm.xp, 3);
  const order = { cropId: 1, quantity: 1, expectedRevision: 0 };
  assert.equal(parseAction('buy', { ...order, quantity: 0 }), undefined);
  assert.equal(parseAction('buy', { ...order, quantity: 100 }), undefined);
  assert.equal(parseAction('sell', { ...order, quantity: 1_000 }), undefined);
  assert.equal(parseAction('sell', { ...order, quantity: 0 })?.type, 'sell');
  assert.equal(parseAction('buy', { ...order, cropId: 16 }), undefined);
  assert.equal(parseAction('plant', { ...order, plot: 6 }), undefined);
  assert.equal(parseAction('clear', { plot: 0 }), undefined);
});