import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FarmAction } from '../../shared/farm.mts';
import { missionDay, missionStatus } from '../../shared/progression.mts';
import { applyAction, createFarm, parseAction } from '../src/farm.ts';

test('vụ đầu và nhiệm vụ ngày chỉ tính thao tác thành công và trả thưởng một lần', () => {
  const farm = createFarm();
  const now = Date.parse('2026-11-11T10:00:00+07:00');
  const run = (action: FarmAction, time = now) =>
    applyAction(farm, { ...action, expectedRevision: farm.revision }, time, () => 0);
  assert.throws(() => run({ type: 'claimMission', mission: 'first' }), /chưa sẵn sàng/);
  run({ type: 'buy', cropId: 1, quantity: 1 });
  run({ type: 'plant', cropId: 1, plot: 0 });
  assert.throws(() => run({ type: 'harvest', plot: 0 }), /chưa chín/);
  assert.equal(missionStatus(farm, now).firstStep, 2);
  run({ type: 'harvest', plot: 0 }, now + 30_000);
  run({ type: 'sell', cropId: 1, quantity: 0 }, now + 30_000);
  assert.equal(missionStatus(farm, now).firstStep, 3);
  run({ type: 'sell', cropId: 1, quantity: 1 }, now + 30_000);
  run({ type: 'sell', cropId: 1, quantity: 2 }, now + 30_000);
  assert.equal(missionStatus(farm, now).streak, 0);
  assert.equal(missionStatus(farm, now).checkedIn, false);
  run({ type: 'claimMission', mission: 'first' });
  run({ type: 'claimMission', mission: 'daily', day: missionDay(now) });
  assert.equal(farm.gold, 280);
  assert.throws(() => run({ type: 'claimMission', mission: 'first' }), /đã nhận/);
  assert.throws(() => run({ type: 'claimMission', mission: 'daily', day: missionDay(now) }), /đã nhận/);
  assert.equal(farm.gold, 280);
  assert.equal(parseAction('claimMission', { mission: 'daily', expectedRevision: 0 }), undefined);
});

test('đổi ngày theo giờ Việt Nam và giữ thưởng nhiệm vụ chưa nhận', () => {
  const farm = createFarm();
  const midnight = Date.parse('2026-11-12T00:00:00+07:00');
  function completeDay(now: number, plot: number) {
    farm.plots[plot] = { cropId: 1, plantedAt: now - 30_000, harvested: false, yieldRoll: 0 };
    applyAction(farm, { type: 'harvest', plot, expectedRevision: farm.revision }, now);
    applyAction(farm, { type: 'sell', cropId: 1, quantity: 3, expectedRevision: farm.revision }, now);
  }
  completeDay(midnight - 1, 0);
  const yesterday = missionDay(midnight - 1);
  assert.equal(missionStatus(farm, midnight).daily.sold, 0);
  assert.equal(missionStatus(farm, midnight).rewardDay, yesterday);
  completeDay(midnight, 1);
  assert.equal(missionStatus(farm, midnight).rewardDay, yesterday);
  applyAction(farm, { type: 'claimMission', mission: 'daily', day: yesterday, expectedRevision: farm.revision }, midnight);
  assert.equal(missionStatus(farm, midnight).rewardDay, missionDay(midnight));
});

test('điểm danh độc lập, chỉ một lần mỗi ngày và bắt đầu lại khi bỏ ngày', () => {
  const farm = createFarm();
  const gold = farm.gold;
  const midnight = Date.parse('2026-11-12T00:00:00+07:00');
  const dayMs = 86_400_000;
  const check = (now: number) => applyAction(farm, { type: 'checkIn', expectedRevision: farm.revision }, now);
  check(midnight - 1);
  assert.throws(() => check(midnight - 1), /đã điểm danh/i);
  assert.equal(missionStatus(farm, midnight).checkedIn, false);
  for (let day = 0; day < 6; day++) check(midnight + day * dayMs);
  const lastDay = midnight + 5 * dayMs;
  const saved = missionStatus(JSON.parse(JSON.stringify(farm)), lastDay);
  assert.equal(saved.streak, 7);
  assert.equal(saved.checkedIn, true);
  assert.equal(saved.daily.sold, 0);
  assert.equal(saved.rewardDay, undefined);
  assert.equal(farm.gold, gold);
  const afterGap = lastDay + 2 * dayMs;
  assert.equal(missionStatus(farm, afterGap).streak, 0);
  check(afterGap);
  assert.equal(missionStatus(farm, afterGap).streak, 1);
});
