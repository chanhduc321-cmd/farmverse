process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://farmverse:farmverse_local@127.0.0.1:55431/farmverse';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { leaderboardWeekStart } from '../../shared/community.mts';
import type { WeeklyLeaderboard } from '../../shared/community.mts';
import { communityRoutes } from '../src/community-routes.ts';
import { createFarm } from '../src/farm.ts';
import { queryFarmDatabase } from '../src/farm-store.ts';
import { readWeeklyLeaderboard } from '../src/leaderboard-store.ts';

const HOUR = 3_600_000;
// A fixed week far in the future keeps these rows apart from every other test's activity.
const NOW = Date.UTC(2090, 5, 14, 5);
const WEEK_START = leaderboardWeekStart(NOW);

async function createAccount(prefix: string, pet = 'dog') {
  const farmId = randomUUID();
  const username = `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
  await queryFarmDatabase('INSERT INTO farm_guest_progress (session_id, claimed, state) VALUES ($1, true, $2::jsonb)', [farmId, { ...createFarm(), pet }]);
  await queryFarmDatabase("INSERT INTO farm_accounts (farm_id, username, password_hash) VALUES ($1, $2, 'dummy_hash')", [farmId, username]);
  return { farmId, username };
}

let plantedAt = 1;
async function record(type: 'steal' | 'pet_block' | 'visit', host: { farmId: string }, visitor: { farmId: string }, at: number) {
  await queryFarmDatabase(`
    INSERT INTO farm_activities (host_id, visitor_id, type, plot_index, crop_id, planted_at, amount, created_at)
    VALUES ($1, $2, $3, 0, 1, $4, $5, to_timestamp($6::double precision / 1000))
  `, [host.farmId, visitor.farmId, type, plantedAt++, type === 'steal' ? 1 : 0, at]);
}

test('leaderboard week starts on Monday 00:00 Vietnam time', () => {
  // Sunday 14 June 2026, 23:30 in Vietnam is still the week that began Monday 8 June.
  const sundayNight = Date.UTC(2026, 5, 14, 16, 30);
  assert.equal(leaderboardWeekStart(sundayNight), Date.UTC(2026, 5, 7, 17));
  // Thirty minutes later it is Monday 15 June in Vietnam.
  assert.equal(leaderboardWeekStart(sundayNight + HOUR), Date.UTC(2026, 5, 14, 17));
  assert.equal(leaderboardWeekStart(Date.UTC(2026, 5, 14, 17)), Date.UTC(2026, 5, 14, 17));
});

test('weekly leaderboard ranks by distinct farms and ignores other weeks', async () => {
  // This week belongs to the test alone; clear what an earlier run left in it.
  await queryFarmDatabase(`
    DELETE FROM farm_activities
    WHERE created_at >= to_timestamp($1::double precision / 1000) - interval '8 days'
      AND created_at < to_timestamp($1::double precision / 1000) + interval '8 days'
  `, [WEEK_START]);
  const [ace, bob, hostA, hostB, hostC] = await Promise.all([
    createAccount('lb_ace'), createAccount('lb_bob'),
    createAccount('lb_hosta', 'goose'), createAccount('lb_hostb', 'cat'), createAccount('lb_hostc'),
  ]);
  const inWeek = WEEK_START + HOUR;
  // Ace robs three different farms once each. Bob robs one farm four times.
  await record('steal', hostA, ace, inWeek);
  await record('steal', hostB, ace, inWeek);
  await record('steal', hostC, ace, inWeek);
  for (let raid = 0; raid < 4; raid++) await record('steal', hostA, bob, inWeek + raid);
  // The week before does not count, and neither do plain visits.
  await record('steal', hostC, bob, WEEK_START - HOUR);
  await record('visit', hostC, bob, inWeek);
  // Host A's goose turns Bob away twice and Ace once.
  await record('pet_block', hostA, bob, inWeek);
  await record('pet_block', hostA, bob, inWeek + 1);
  await record('pet_block', hostA, ace, inWeek);

  const board = await readWeeklyLeaderboard(NOW);
  assert.equal(board.weekStart, WEEK_START);
  assert.equal(board.weekEnd, WEEK_START + 7 * 24 * HOUR);

  assert.deepEqual(board.thieves, [
    { username: ace.username, farms: 3, fruit: 3 },
    { username: bob.username, farms: 1, fruit: 4 },
  ]);
  assert.deepEqual(board.robbed, [
    { username: hostA.username, thieves: 2, fruit: 5 },
    ...[hostB, hostC].map(host => ({ username: host.username, thieves: 1, fruit: 1 }))
      .sort((left, right) => left.username.localeCompare(right.username)),
  ]);
  assert.deepEqual(board.guards, [
    { username: hostA.username, pet: 'goose', blockedVisitors: 2, blocks: 3 },
  ]);
});

test('leaderboard route is public and returns the current week', async () => {
  const routes = communityRoutes(async () => undefined, () => undefined);
  const response = await routes.request('/community/leaderboard');
  assert.equal(response.status, 200);
  const board = await response.json() as WeeklyLeaderboard;
  assert.equal(board.weekStart, leaderboardWeekStart(board.generatedAt));
  for (const list of [board.thieves, board.robbed, board.guards]) {
    assert.ok(Array.isArray(list) && list.length <= 5);
  }
});
