process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://farmverse:farmverse_local@127.0.0.1:55431/farmverse';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { getActivityPage, markActivitiesRead, recordActivity } from '../src/activity-store.ts';
import { hashToken } from '../src/account-store.ts';
import { stealFruit, visitFarm } from '../src/community-store.ts';
import { createFarm } from '../src/farm.ts';
import { queryFarmDatabase } from '../src/farm-store.ts';

async function createTestAccount(prefix: string) {
  const farmId = randomUUID();
  const username = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const token = (randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')).slice(0, 64);
  const tokenHash = hashToken(token);
  const farm = createFarm();

  await queryFarmDatabase(`
    INSERT INTO farm_guest_progress (session_id, claimed, state)
    VALUES ($1, true, $2::jsonb)
  `, [farmId, farm]);

  await queryFarmDatabase(`
    INSERT INTO farm_accounts (farm_id, username, password_hash)
    VALUES ($1, $2, 'dummy_hash')
  `, [farmId, username]);

  await queryFarmDatabase(`
    INSERT INTO farm_account_sessions (token_hash, farm_id, expires_at)
    VALUES ($1, $2, clock_timestamp() + interval '1 hour')
  `, [tokenHash, farmId]);

  return { farmId, username, token, tokenHash, farm };
}

test('recordActivity: ignores self-visit and debounces repeated visits within 10 minutes', async () => {
  const host = await createTestAccount('act_host1');
  const visitor = await createTestAccount('act_vis1');

  // Self visit should be ignored
  await recordActivity(undefined, { hostId: host.farmId, visitorId: host.farmId, type: 'visit' });
  let page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 0);

  // First visit by visitor
  await Promise.all(Array.from({ length: 4 }, () =>
    recordActivity(undefined, { hostId: host.farmId, visitorId: visitor.farmId, type: 'visit' })));
  page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].type, 'visit');
  assert.equal(page.events[0].visitorName, visitor.username);
  assert.equal(page.unreadCount, 1);

  // Immediate second visit should be debounced
  await recordActivity(undefined, { hostId: host.farmId, visitorId: visitor.farmId, type: 'visit' });
  page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 1, 'Repeated visit within 10 minutes should be debounced');
});

test('recordActivity: records steal and ignores duplicate steal attempts', async () => {
  const host = await createTestAccount('act_host2');
  const visitor = await createTestAccount('act_vis2');

  const plantedAt = Date.now() - 100_000;
  await recordActivity(undefined, {
    hostId: host.farmId,
    visitorId: visitor.farmId,
    type: 'steal',
    plotIndex: 2,
    cropId: 1, // Dâu tây
    plantedAt,
    amount: 1,
  });

  let page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].type, 'steal');
  assert.equal(page.events[0].cropName, 'Dâu tây');
  assert.equal(page.events[0].plot, 3); // 1-indexed for display
  assert.equal(page.events[0].amount, 1);
  assert.equal(page.summary.recentStolenFruit, 1);

  // Duplicate steal for same host, visitor, plot, plantedAt is ignored
  await recordActivity(undefined, {
    hostId: host.farmId,
    visitorId: visitor.farmId,
    type: 'steal',
    plotIndex: 2,
    cropId: 1,
    plantedAt,
    amount: 1,
  });

  page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 1, 'Duplicate steal should not insert duplicate activity');
});

test('markActivitiesRead: marks unread activities as read', async () => {
  const host = await createTestAccount('act_host3');
  const visitor1 = await createTestAccount('act_vis3a');
  const visitor2 = await createTestAccount('act_vis3b');

  await recordActivity(undefined, { hostId: host.farmId, visitorId: visitor1.farmId, type: 'visit' });
  await recordActivity(undefined, {
    hostId: host.farmId,
    visitorId: visitor2.farmId,
    type: 'steal',
    plotIndex: 0,
    cropId: 3, // Dâu tây
    plantedAt: 12345,
    amount: 1,
  });

  let page = await getActivityPage(host.farmId);
  assert.equal(page.unreadCount, 2);
  assert.equal(page.summary.recentStolenFruit, 1);
  assert.deepEqual(page.summary.recentVisitors, [visitor1.username]);
  assert.equal(page.events[0].isUnread, true);
  assert.equal(page.events[1].isUnread, true);

  const through = page.events[0].id;
  await recordActivity(undefined, { hostId: host.farmId, visitorId: visitor2.farmId, type: 'visit' });
  await markActivitiesRead(host.farmId, through);

  const nextPage = await getActivityPage(host.farmId, 1, 1, through);
  assert.equal(nextPage.events[0].visitorName, visitor1.username);
  page = await getActivityPage(host.farmId);
  assert.equal(page.unreadCount, 1, 'A visit after the rendered page remains unread');
  assert.equal(page.events[0].isUnread, true);
  await markActivitiesRead(host.farmId, page.events[0].id);

  page = await getActivityPage(host.farmId);
  assert.equal(page.unreadCount, 0);
  assert.equal(page.summary.unreadCount, 0);
  assert.equal(page.summary.recentStolenFruit, 0);
  assert.equal(page.summary.recentVisitors.length, 0);
  assert.equal(page.events[0].isUnread, false);
  assert.equal(page.events[1].isUnread, false);
});

test('community integration: visitFarm and stealFruit trigger activities atomically', async () => {
  const host = await createTestAccount('act_host4');
  const visitor = await createTestAccount('act_vis4');

  // Plant a ripe crop on host farm
  const now = Date.now();
  host.farm.plots[1] = {
    cropId: 1, // Lúa mì (unitSeconds = 10, stages = 2, ripens in 30s)
    plantedAt: now - 60_000,
    harvested: false,
  };
  await queryFarmDatabase(`
    UPDATE farm_guest_progress SET state = $1::jsonb WHERE session_id = $2
  `, [host.farm, host.farmId]);

  // Visitor visits host farm
  const visitResult = await visitFarm(visitor.farmId, host.username);
  assert.ok(visitResult);
  assert.equal(visitResult.username, host.username);

  let page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].type, 'visit');

  // Visitor steals fruit from plot 1
  const stealResult = await stealFruit(visitor.farmId, visitor.tokenHash, host.username, {
    plot: 1,
    plantedAt: host.farm.plots[1]!.plantedAt,
  });

  assert.ok(!('error' in stealResult));
  assert.equal(stealResult.farm.produce[1], 1);

  page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 2);
  assert.equal(page.events[0].type, 'steal');
  assert.equal(page.events[0].cropName, 'Dâu tây');
  assert.equal(page.events[0].plot, 2);

  // Trying to steal again from the same plot fails and does not create an activity
  const duplicateSteal = await stealFruit(visitor.farmId, visitor.tokenHash, host.username, {
    plot: 1,
    plantedAt: host.farm.plots[1]!.plantedAt,
  });
  assert.ok('error' in duplicateSteal);

  page = await getActivityPage(host.farmId);
  assert.equal(page.events.length, 2);
});
