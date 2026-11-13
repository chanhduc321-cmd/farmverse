import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { ACCOUNT_API, FARM_API } from '../../shared/farm.mts';
import type { FarmAction, FarmResponse, FarmSessionResponse } from '../../shared/farm.mts';
import app from '../src/app.ts';
import { queryFarmDatabase } from '../src/farm-store.ts';

function cookieFrom(response: Response): string {
  const cookie = response.headers.getSetCookie()[0];
  assert.ok(cookie);
  return cookie.split(';')[0];
}

function read(cookie?: string): Promise<Response> {
  return Promise.resolve(app.request(FARM_API.read.path, { headers: cookie ? { cookie } : {} }));
}

function post(path: string, cookie: string, body: unknown): Promise<Response> {
  return Promise.resolve(app.request(path, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

test('batch commits once, rolls back on failure, and stays with its original session', async () => {
  const initial = await read();
  assert.equal(initial.status, 200);
  const guestCookie = cookieFrom(initial);
  const farmId = guestCookie.split('=')[1];
  const guest = await initial.json() as FarmSessionResponse;
  const buy: FarmAction = { type: 'buy', cropId: 1, quantity: 1 };
  const batch = { sessionKey: guest.sessionKey, expectedRevision: 0, actions: [buy] };
  const credentials = {
    username: `batch_${randomBytes(6).toString('hex')}`,
    password: randomBytes(24).toString('hex'),
  };

  try {
    const invalid = await post(FARM_API.batch.path, guestCookie, {
      ...batch, actions: [buy, { type: 'plant', plot: 0, cropId: 2 }],
    });
    assert.equal(invalid.status, 409);
    assert.deepEqual((await (await read(guestCookie)).json() as FarmResponse).farm, guest.farm);

    const concurrent = await Promise.all([
      post(FARM_API.batch.path, guestCookie, batch),
      post(FARM_API.batch.path, guestCookie, batch),
    ]);
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
    const saved = await concurrent.find(result => result.ok)!.json() as FarmResponse;
    assert.equal(saved.farm.gold, guest.farm.gold - 10);
    assert.equal(saved.farm.seeds[1], 1);
    assert.equal(saved.farm.revision, 1);
    const { rows } = await queryFarmDatabase<{ state: FarmResponse['farm'] }>(
      'SELECT state FROM farm_guest_progress WHERE session_id = $1', [farmId],
    );
    assert.deepEqual(rows[0].state, saved.farm);

    const registration = await post(ACCOUNT_API.register.path, guestCookie, credentials);
    assert.equal(registration.status, 201);
    const accountCookie = cookieFrom(registration);
    const account = await registration.json() as FarmSessionResponse;
    const stale = await post(FARM_API.batch.path, accountCookie, { ...batch, expectedRevision: 1 });
    assert.equal(stale.status, 401);
    const plant = await post(FARM_API.batch.path, accountCookie, {
      sessionKey: account.sessionKey,
      expectedRevision: 1,
      actions: [{ type: 'plant', plot: 0, cropId: 1 }],
    });
    assert.equal(plant.status, 200);
    const planted = await plant.json() as FarmResponse;
    assert.equal(planted.farm.plots[0]?.plantedAt, planted.serverTime);
    assert.equal((await post(ACCOUNT_API.logout.path, accountCookie, {})).status, 204);
    const login = await post(ACCOUNT_API.login.path, '', credentials);
    assert.equal(login.status, 200);
    assert.deepEqual((await login.json() as FarmSessionResponse).farm, planted.farm);
  } finally {
    await queryFarmDatabase('DELETE FROM farm_accounts WHERE farm_id = $1', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_guest_progress WHERE session_id = $1', [farmId]);
  }
});
