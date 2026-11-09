import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { FARM_API } from '../../shared/farm.mts';
import type { FarmErrorCode, FarmResponse, HarvestResponse, PlotActionRequest, QuickSellRequest } from '../../shared/farm.mts';
import { createFarmRoutes } from '../src/farm-routes.js';

if (existsSync('.env')) loadEnvFile('.env');
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'Set DATABASE_URL or copy backend/.env.example to .env.');

const schema = `farm_test_${randomUUID().replaceAll('-', '')}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
const admin = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
const database = new pg.Pool({
  connectionString: isolatedUrl.toString(),
  connectionTimeoutMillis: 2_000,
});
let schemaCreated = false;

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  await database.query(await readFile(new URL('../migrations/001_farm.sql', import.meta.url), 'utf8'));
});

after(async () => {
  try {
    await database.end();
    if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  } finally {
    await admin.end();
  }
});

type App = ReturnType<typeof createFarmRoutes>;

async function openFarm(app: App) {
  const response = await app.request(FARM_API.read.path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const session = response.headers.get('set-cookie');
  assert.ok(session);
  assert.match(session, /;\s*HttpOnly/i);
  const { farm } = await response.json() as FarmResponse;
  return { cookie: session.split(';', 1)[0], farm };
}

function act(app: App, cookie: string, path: string, body: PlotActionRequest | QuickSellRequest) {
  return app.request(path, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function success<T extends FarmResponse = FarmResponse>(response: Response): Promise<T> {
  assert.equal(response.status, 200);
  return await response.json() as T;
}

async function expectError(response: Response, status: number, code: FarmErrorCode) {
  assert.equal(response.status, status);
  assert.equal((await response.json() as { error: { code: FarmErrorCode } }).error.code, code);
}

test('guest resumes after reload, harvest and unlock are atomic, and the 10% threshold selects the variant', async () => {
  let now = 1_800_000_000_000;
  const rolls = [0.1, 0.0999];
  const app = createFarmRoutes(database, () => now, () => {
    const roll = rolls.shift();
    assert.ok(roll !== undefined);
    return roll;
  });
  const { cookie, farm: initial } = await openFarm(app);
  assert.equal(initial.gold, 0);
  assert.deepEqual(initial.silo, { capacity: 10, counts: { NORMAL: 0, GOLDEN: 0 } });
  assert.deepEqual(initial.plots.map(({ state }) => state), ['EMPTY', 'EMPTY', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED']);
  await expectError(await act(app, cookie, FARM_API.unlock.path, { plotId: 3, expectedRevision: 0 }), 409, 'INSUFFICIENT_GOLD');

  const first = await success(await act(app, cookie, FARM_API.plant.path, { plotId: 1, expectedRevision: 0 }));
  assert.deepEqual(first.farm.plots[0], { id: 1, state: 'GROWING', readyAtMs: now + 10_000 });
  const second = await success(await act(app, cookie, FARM_API.plant.path, { plotId: 2, expectedRevision: 1 }));
  now += 9_999;
  await expectError(await act(app, cookie, FARM_API.harvest.path, { plotId: 1, expectedRevision: second.farm.revision }), 409, 'PLOT_NOT_READY');
  now++;

  const harvest = { plotId: 1, expectedRevision: second.farm.revision };
  const results = await Promise.all([act(app, cookie, FARM_API.harvest.path, harvest), act(app, cookie, FARM_API.harvest.path, harvest)]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const [accepted, rejected] = results.sort((left, right) => left.status - right.status);
  const normal = await success<HarvestResponse>(accepted);
  assert.equal(normal.harvested, 'NORMAL');
  assert.deepEqual(normal.farm.silo.counts, { NORMAL: 1, GOLDEN: 0 });
  await expectError(rejected, 409, 'STALE_FARM');

  const golden = await success<HarvestResponse>(await act(app, cookie, FARM_API.harvest.path, { plotId: 2, expectedRevision: normal.farm.revision }));
  assert.equal(golden.harvested, 'GOLDEN');
  assert.deepEqual(golden.farm.silo.counts, { NORMAL: 1, GOLDEN: 1 });
  assert.equal(rolls.length, 0);
  const sold = await success(await act(app, cookie, FARM_API.quickSell.path, { crop: 'GOLDEN', expectedRevision: golden.farm.revision }));
  assert.equal(sold.farm.gold, 30);
  const unlock = { plotId: 3, expectedRevision: sold.farm.revision };
  const unlocked = await success(await act(app, cookie, FARM_API.unlock.path, unlock));
  assert.equal(unlocked.farm.gold, 10);
  assert.deepEqual(unlocked.farm.plots[2], { id: 3, state: 'EMPTY' });
  await expectError(await act(app, cookie, FARM_API.unlock.path, unlock), 409, 'STALE_FARM');
  await expectError(await act(app, cookie, FARM_API.unlock.path, { ...unlock, expectedRevision: unlocked.farm.revision }), 409, 'PLOT_NOT_LOCKED');

  const reload = await app.request(FARM_API.read.path, { headers: { Cookie: cookie } });
  assert.equal(reload.headers.get('set-cookie'), null);
  assert.deepEqual((await success(reload)).farm, unlocked.farm);
  assert.equal((await openFarm(app)).farm.gold, 0);
});

test('a full silo keeps the crop READY until Quick Sell frees a slot', async () => {
  let now = 1_800_000_000_000;
  const app = createFarmRoutes(database, () => now, () => 0.5);
  const { cookie, farm } = await openFarm(app);
  let revision = farm.revision;
  for (let count = 0; count < 10; count++) {
    const planted = await success(await act(app, cookie, FARM_API.plant.path, { plotId: 1, expectedRevision: revision }));
    now += 10_000;
    const harvested = await success(await act(app, cookie, FARM_API.harvest.path, { plotId: 1, expectedRevision: planted.farm.revision }));
    revision = harvested.farm.revision;
  }

  const planted = await success(await act(app, cookie, FARM_API.plant.path, { plotId: 1, expectedRevision: revision }));
  now += 10_000;
  await expectError(await act(app, cookie, FARM_API.harvest.path, { plotId: 1, expectedRevision: planted.farm.revision }), 409, 'SILO_FULL');
  const ready = await success(await app.request(FARM_API.read.path, { headers: { Cookie: cookie } }));
  assert.deepEqual(ready.farm.plots[0], { id: 1, state: 'READY' });
  assert.equal(ready.farm.silo.counts.NORMAL, 10);
  assert.equal(ready.farm.revision, planted.farm.revision);

  const sold = await success(await act(app, cookie, FARM_API.quickSell.path, { crop: 'NORMAL', expectedRevision: ready.farm.revision }));
  assert.equal(sold.farm.gold, 10);
  const harvested = await success(await act(app, cookie, FARM_API.harvest.path, { plotId: 1, expectedRevision: sold.farm.revision }));
  assert.deepEqual(harvested.farm.plots[0], { id: 1, state: 'EMPTY' });
  assert.equal(harvested.farm.silo.counts.NORMAL, 10);
});
