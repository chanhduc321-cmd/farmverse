import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ripeAt, stageAt } from '../../shared/farm.mts';
import { ripeYield } from '../../shared/farm-rules.mts';
import { crops } from '../src/catalog.ts';
import { applyAction, createFarm, parseAction } from '../src/farm.ts';

test('Pet selection validates species and uses the Farm revision', () => {
  const farm = createFarm();
  assert.equal(farm.pet, 'dog');
  for (const pet of ['cat', 'goose', 'dog'] as const) {
    const action = parseAction('selectPet', { pet, expectedRevision: farm.revision })!;
    applyAction(farm, action, 0);
    assert.equal(farm.pet, pet);
    assert.throws(() => applyAction(farm, action, 0), /vừa thay đổi/);
  }
  for (const pet of ['fox', null, {}, 0]) {
    assert.equal(parseAction('selectPet', { pet, expectedRevision: farm.revision }), undefined);
  }
});

test('all varieties reach every frame and ripen at the catalog time', () => {
  const expected = [30, 180, 150, 160, 270, 285, 300, 330, 360, 390, 588, 450, 672, 510, 756, 510];
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
  assert.equal(crops[4].name, 'Khoai tây');
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
  applyAction(farm, { type: 'plant', plot: 0, cropId: 1, expectedRevision: 1 }, 0, () => 0);
  assert.equal(farm.seeds[1], 1);
  assert.equal(farm.xp, 5);
  const harvest = { type: 'harvest', plot: 0, expectedRevision: 2 } as const;
  assert.throws(() => applyAction(farm, harvest, 29_999), /chưa chín/);
  assert.throws(() => applyAction(farm, { type: 'clear', plot: 0, expectedRevision: 2 }, 30_000), /Chỉ dọn/);
  applyAction(farm, harvest, 30_000);
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
  applyAction(farm, { type: 'plant', plot: 0, cropId: 1, expectedRevision: 5 }, 30_000, () => 0.9999);
  applyAction(farm, { type: 'harvest', plot: 0, expectedRevision: 6 }, 60_000);
  assert.equal(farm.produce[1], 37);
});

test('ripe crop yield survives serialization and old saves harvest without rerolling', () => {
  const farm = createFarm();
  farm.seeds[1] = 1;
  applyAction(farm, { type: 'plant', plot: 0, cropId: 1, expectedRevision: 0 }, 100, () => 0.5);
  farm.plots[1] = { cropId: 1, plantedAt: 200, harvested: false };
  const saved = JSON.stringify(farm);
  const restored: typeof farm = JSON.parse(saved);
  const crop = crops[0];
  assert.equal(ripeYield(crop, restored.plots[0]!, 0, 30_099), undefined);
  assert.equal(ripeYield(crop, restored.plots[0]!, 0, 30_100), 20);
  const legacyYield = ripeYield(crop, restored.plots[1]!, 1, 30_200)!;
  assert.ok(legacyYield >= 10 && legacyYield <= 29);
  assert.equal(ripeYield(crop, farm.plots[1], 1, 90_000), legacyYield);
  const unexpectedRoll = () => { throw new Error('Harvest rerolled yield'); };
  applyAction(restored, { type: 'harvest', plot: 0, expectedRevision: 1 }, 60_000, unexpectedRoll);
  applyAction(restored, { type: 'harvest', plot: 1, expectedRevision: 2 }, 60_000, unexpectedRoll);
  assert.equal(restored.produce[1], 20 + legacyYield);
  assert.equal(ripeYield(crop, restored.plots[0]!, 0, 60_000), undefined);
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
  assert.ok(parseAction('buy', { ...order, cropId: 16 }));
  assert.equal(parseAction('buy', { ...order, cropId: 17 }), undefined);
  assert.equal(parseAction('plant', { ...order, plot: 6 }), undefined);
  assert.equal(parseAction('clear', { plot: 0 }), undefined);
});

test('water and fertilizer shorten one crop lifecycle without changing its identity or yield', () => {
  const farm = createFarm();
  const plantedAt = 100_000;
  farm.plots[0] = { cropId: 1, plantedAt, harvested: false, yieldRoll: 0 };
  applyAction(farm, { type: 'buyFertilizer', quantity: 2, expectedRevision: 0 }, plantedAt);
  const crop = crops[0];
  const run = (type: 'water' | 'fertilize' | 'harvest', now: number) =>
    applyAction(farm, { type, plot: 0, expectedRevision: farm.revision }, now);

  run('water', plantedAt + 1_000);
  assert.equal(ripeAt(crop, farm.plots[0]!), plantedAt + 27_000);
  assert.equal(farm.gold, 190);
  assert.equal(farm.fertilizer, 2);
  assert.throws(() => run('water', plantedAt + 2_000), /đã tưới/);
  run('fertilize', plantedAt + 2_000);
  assert.equal(farm.gold, 190);
  assert.throws(() => run('fertilize', plantedAt + 3_000), /đã bón/);
  const saved: typeof farm = JSON.parse(JSON.stringify(farm));
  assert.equal(saved.fertilizer, 1);
  assert.equal(saved.plots[0]!.plantedAt, plantedAt);
  assert.equal(ripeAt(crop, saved.plots[0]!), plantedAt + 21_000);
  assert.equal(stageAt(crop, saved.plots[0]!, plantedAt + 20_999), 4);
  assert.equal(stageAt(crop, saved.plots[0]!, plantedAt + 21_000), 5);
  run('harvest', plantedAt + 21_000);
  assert.equal(farm.produce[1], 10);
  assert.equal(farm.xp, 1);
  assert.equal(farm.revision, 4);
});

test('growth boosts validate stock, crop state and plot range', () => {
  const farm = createFarm();
  assert.equal(parseAction('water', { plot: 6, expectedRevision: 0 }), undefined);
  const action = { type: 'fertilize', plot: 0, expectedRevision: 0 } as const;
  assert.throws(() => applyAction(farm, action, 1), /cây đang lớn/);
  farm.plots[0] = { cropId: 1, plantedAt: 0, harvested: false };
  delete farm.fertilizer;
  assert.throws(() => applyAction(farm, action, 1), /hết phân/);
  assert.equal(farm.plots[0]!.fertilized, undefined);
  assert.equal(farm.gold, 200);
  applyAction(farm, { type: 'buyFertilizer', quantity: 1, expectedRevision: 0 }, 2);
  farm.gold = 0;
  assert.match(applyAction(farm, { ...action, expectedRevision: 1 }, 25_000), /đã chín/);
  assert.equal(ripeAt(crops[0], farm.plots[0]!), 24_000);
  assert.throws(() => applyAction(farm, { type: 'water', plot: 0, expectedRevision: 2 }, 25_000), /đã chín/);
  assert.equal(farm.fertilizer, 0);
  assert.equal(farm.gold, 0);
});

test('fertilizer orders validate quantity and change stock and Gold once', () => {
  const farm = createFarm();
  const order = { quantity: 2, expectedRevision: 0 };
  for (const quantity of [0, 1.5, 100]) {
    assert.equal(parseAction('buyFertilizer', { ...order, quantity }), undefined);
  }
  const purchase = parseAction('buyFertilizer', order)!;
  applyAction(farm, purchase, 0);
  assert.throws(() => applyAction(farm, purchase, 0), /vừa thay đổi/);
  assert.throws(() => applyAction(farm, { type: 'buyFertilizer', quantity: 99, expectedRevision: 1 }, 0), /Không đủ Gold/);
  assert.equal(farm.fertilizer, 2);
  assert.equal(farm.gold, 190);
  assert.equal(farm.revision, 1);
});
