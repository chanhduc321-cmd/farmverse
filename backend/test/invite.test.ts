process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://farmverse:farmverse_local@127.0.0.1:55431/farmverse';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Farm } from '../../shared/farm.mts';
import { INVITE_REWARD } from '../../shared/invite.mts';
import { registerAccount } from '../src/account-store.ts';
import { getActivityPage } from '../src/activity-store.ts';
import { createFarm } from '../src/farm.ts';
import { queryFarmDatabase } from '../src/farm-store.ts';
import { settleInviteReward } from '../src/invite-store.ts';

// A throwaway credential generated per run; these accounts exist only in the test database.
const password = randomUUID();
const name = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

async function createGuest(prepare?: (farm: Farm) => void): Promise<string> {
  const id = randomUUID();
  const farm = createFarm();
  prepare?.(farm);
  await queryFarmDatabase('INSERT INTO farm_guest_progress (session_id, state) VALUES ($1, $2::jsonb)', [id, farm]);
  return id;
}

async function createInviter() {
  const id = await createGuest();
  const username = name('inv_host');
  assert.ok(await registerAccount(id, { username, password }));
  return { id, username };
}

async function farmOf(id: string): Promise<Farm> {
  const { rows } = await queryFarmDatabase<{ state: Farm }>('SELECT state FROM farm_guest_progress WHERE session_id = $1', [id]);
  return rows[0].state;
}

const harvested = (farm: Farm) => { farm.produce[1] = 12; };
const { inviteeSeeds, inviterGold, inviterDailyCap } = INVITE_REWARD;

test('invite reward waits for the first harvest, then pays both players exactly once', async () => {
  const inviter = await createInviter();
  const guest = await createGuest();
  const invitee = await registerAccount(guest, { username: name('inv_new'), password }, inviter.username);
  assert.ok(invitee);

  // An account alone earns nothing.
  assert.equal(await settleInviteReward(guest, false), undefined);
  assert.equal((await farmOf(guest)).seeds[inviteeSeeds.cropId] ?? 0, 0);
  assert.equal((await farmOf(inviter.id)).gold, 200);

  // The harvest that has just been applied settles it.
  const before = await farmOf(guest);
  const settled = await settleInviteReward(guest, true);
  assert.ok(settled);
  assert.equal(settled.farm.seeds[inviteeSeeds.cropId], inviteeSeeds.amount);
  assert.equal(settled.farm.revision, before.revision + 1);
  assert.equal((await farmOf(guest)).seeds[inviteeSeeds.cropId], inviteeSeeds.amount);
  assert.equal((await farmOf(inviter.id)).gold, 200 + inviterGold);

  // Later harvests and concurrent retries add nothing.
  const repeats = await Promise.all(Array.from({ length: 4 }, () => settleInviteReward(guest, true)));
  assert.ok(repeats.every(result => result === undefined));
  assert.equal((await farmOf(guest)).seeds[inviteeSeeds.cropId], inviteeSeeds.amount);
  assert.equal((await farmOf(inviter.id)).gold, 200 + inviterGold);

  // The inviter sees it in their journal.
  const journal = await getActivityPage(inviter.id);
  assert.equal(journal.events.filter(event => event.type === 'invite').length, 1);
  assert.equal(journal.events.find(event => event.type === 'invite')?.visitorName, invitee.username);
});

test('a guest who harvested before signing up is rewarded when the account is created', async () => {
  const inviter = await createInviter();
  const guest = await createGuest(harvested);
  assert.ok(await registerAccount(guest, { username: name('inv_late'), password }, inviter.username));
  const settled = await settleInviteReward(guest, false);
  assert.ok(settled);
  assert.equal(settled.farm.seeds[inviteeSeeds.cropId], inviteeSeeds.amount);
  assert.equal((await farmOf(inviter.id)).gold, 200 + inviterGold);
});

test('unknown referrers, self referrals and accounts without a referrer earn nothing', async () => {
  const unknownGuest = await createGuest(harvested);
  assert.ok(await registerAccount(unknownGuest, { username: name('inv_unk'), password }, 'khong_co_nguoi_nay'));
  assert.equal(await settleInviteReward(unknownGuest, true), undefined);

  const selfGuest = await createGuest(harvested);
  const selfName = name('inv_self');
  assert.ok(await registerAccount(selfGuest, { username: selfName, password }, selfName));
  assert.equal(await settleInviteReward(selfGuest, true), undefined);

  const plainGuest = await createGuest(harvested);
  assert.ok(await registerAccount(plainGuest, { username: name('inv_plain'), password }));
  assert.equal(await settleInviteReward(plainGuest, true), undefined);

  for (const id of [unknownGuest, selfGuest, plainGuest]) {
    assert.equal((await farmOf(id)).seeds[inviteeSeeds.cropId] ?? 0, 0);
  }
});

test('an inviter is paid for at most the daily cap, while every invited player still gets seeds', async () => {
  const inviter = await createInviter();
  const guests = await Promise.all(Array.from({ length: inviterDailyCap + 2 }, () => createGuest(harvested)));
  for (const guest of guests) {
    assert.ok(await registerAccount(guest, { username: name('inv_cap'), password }, inviter.username));
  }
  // Settle all at once to exercise the cap under concurrency.
  const results = await Promise.all(guests.map(guest => settleInviteReward(guest, false)));
  assert.ok(results.every(Boolean));
  for (const guest of guests) {
    assert.equal((await farmOf(guest)).seeds[inviteeSeeds.cropId], inviteeSeeds.amount);
  }
  assert.equal((await farmOf(inviter.id)).gold, 200 + inviterGold * inviterDailyCap);
  assert.equal(results.filter(result => result?.inviterPaid).length, inviterDailyCap);
});
