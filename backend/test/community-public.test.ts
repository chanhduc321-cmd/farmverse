process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://farmverse:farmverse_local@127.0.0.1:55431/farmverse';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { FarmVisit } from '../../shared/community.mts';
import { communityRoutes } from '../src/community-routes.ts';
import { getActivityPage } from '../src/activity-store.ts';
import { createFarm } from '../src/farm.ts';
import { queryFarmDatabase } from '../src/farm-store.ts';

async function createHost() {
  const farmId = randomUUID();
  const username = `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const farm = createFarm();
  // Strawberries planted long ago are ripe with at least 10 fruit.
  farm.plots[0] = { cropId: 1, plantedAt: 1, harvested: false, yieldRoll: 0.5 };
  await queryFarmDatabase('INSERT INTO farm_guest_progress (session_id, claimed, state) VALUES ($1, true, $2::jsonb)', [farmId, farm]);
  await queryFarmDatabase("INSERT INTO farm_accounts (farm_id, username, password_hash) VALUES ($1, $2, 'dummy_hash')", [farmId, username]);
  return { farmId, username };
}

// No account session at all: this is a guest opening a shared link.
const routes = communityRoutes(async () => undefined, () => undefined);

test('shared farm link shows the farm to a visitor with no account and records no visit', async () => {
  const host = await createHost();
  const response = await routes.request(`/community/public/farms/${host.username}`);
  assert.equal(response.status, 200);
  const visit = await response.json() as FarmVisit;
  assert.equal(visit.username, host.username);
  assert.equal(visit.plots.length, 6);
  assert.equal(visit.plots[0]?.cropId, 1);
  assert.equal(visit.plots[0]?.canSteal, true);
  assert.equal(visit.plots[1], null);
  assert.equal((await getActivityPage(host.farmId)).events.length, 0);
});

test('shared farm link rejects malformed names and reports unknown players in Vietnamese', async () => {
  const malformed = await routes.request('/community/public/farms/ab');
  assert.equal(malformed.status, 400);
  const missing = await routes.request('/community/public/farms/khong_co_ai_ten_nay');
  assert.equal(missing.status, 404);
  assert.match((await missing.json() as { error: string }).error, /Không tìm thấy/);
});

test('the account-only visit route still requires signing in', async () => {
  const host = await createHost();
  const response = await routes.request(`/community/farms/${host.username}`);
  assert.equal(response.status, 401);
});
