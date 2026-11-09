import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { after, before, test } from 'node:test';
import { Hono } from 'hono';
import pg from 'pg';
import { FARM_API } from '../../shared/farm.mts';
import type { FarmResponse } from '../../shared/farm.mts';
import { MERCHANT_API } from '../../shared/merchant.mts';
import type { MerchantActionResponse, MerchantErrorCode, MerchantResponse } from '../../shared/merchant.mts';
import { createFarmRoutes } from '../src/farm-routes.js';
import { createMerchantRoutes } from '../src/merchant-routes.js';
import { merchantPricing, nextQuote } from '../src/merchant-state.js';
import type { MerchantRow } from '../src/merchant-state.js';

if (existsSync('.env')) loadEnvFile('.env');
const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, 'Set DATABASE_URL or copy backend/.env.example to .env.');
const schema = `merchant_test_${randomUUID().replaceAll('-', '')}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
const admin = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
const database = new pg.Pool({ connectionString: isolatedUrl.toString(), connectionTimeoutMillis: 2_000 });
let schemaCreated = false;

before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  for (const migration of ['001_farm.sql', '002_merchant.sql']) {
    await database.query(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
  // Both migrations are safe to apply again without replacing existing data.
  await database.query(await readFile(new URL('../migrations/002_merchant.sql', import.meta.url), 'utf8'));
});

after(async () => {
  try {
    await database.end();
    if (schemaCreated) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  } finally {
    await admin.end();
  }
});

function createApp(clock: () => number) {
  return new Hono().route('/', createFarmRoutes(database, clock, () => 0.5)).route('/', createMerchantRoutes(database, clock));
}
type App = ReturnType<typeof createApp>;

async function success<T = MerchantResponse>(response: Response): Promise<T> {
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return await response.json() as T;
}
async function expectError(response: Response, status: number, code: MerchantErrorCode) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json() as { error: { code: string } }).error.code, code);
}
async function openFarm(app: App) {
  const response = await app.request(FARM_API.read.path);
  const { farm } = await success<FarmResponse>(response);
  const session = response.headers.get('set-cookie');
  assert.ok(session);
  const cookie = session.split(';', 1)[0];
  return { cookie, id: cookie.split('=')[1], farm };
}
async function read(app: App, cookie: string) {
  return success<MerchantResponse>(await app.request(MERCHANT_API.read.path, { headers: { Cookie: cookie } }));
}
function post(app: App, cookie: string, path: string, body: unknown) {
  return app.request(path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function requestFor(state: MerchantResponse, offer = state.merchant.offers[0]) {
  assert.ok(offer);
  return { offerId: offer.id, expectedRevision: state.farm.revision, expectedMerchantRevision: state.merchant.revision };
}

async function fixture(values: {
  farmGold?: number; farmNormal?: number; farmGolden?: number; budget?: number;
  normal?: number; golden?: number; demand?: number; failures?: number; grantUsed?: boolean;
} = {}) {
  let now = 1_800_000_000_000;
  const app = createApp(() => now);
  const { cookie, id } = await openFarm(app);
  await database.query('DELETE FROM merchant_offers WHERE session_id = $1', [id]);
  await database.query('UPDATE farm_sessions SET gold = $2, normal_count = $3, golden_count = $4 WHERE id = $1',
    [id, values.farmGold ?? 0, values.farmNormal ?? 0, values.farmGolden ?? 0]);
  await database.query(`
    UPDATE merchant_states SET gold_budget = $2, normal_count = $3, golden_count = $4, demand = $5,
      sell_fail_streak = $6, grant_used = $7, is_self_sustaining = NOT $7, next_offer_at = $8 WHERE session_id = $1
  `, [id, values.budget ?? 200, values.normal ?? 3, values.golden ?? 1,
    values.demand ?? 5, values.failures ?? 0, values.grantUsed ?? false, new Date(now)]);
  return { app, cookie, id, advance: (ms: number) => { now += ms; }, read: () => read(app, cookie) };
}

test('C02 pricing is deterministic, clamps only normalization, and rounds decimal ties correctly', () => {
  for (const gold_budget of [0, 10, 30, 100, 200, 300, 350]) {
    for (let normal_count = 0; normal_count <= 10; normal_count++) {
      for (let demand = 0; demand <= 10; demand++) {
        const input = { gold_budget, normal_count, golden_count: 0, demand };
        const prices = merchantPricing(input);
        assert.deepEqual(merchantPricing(input), prices);
        assert.ok(prices.buyMultiplier >= 1 && prices.buyMultiplier <= 2.5);
        assert.ok(prices.sellMultiplier >= 1 && prices.sellMultiplier <= 2.5);
        if (gold_budget >= 300) assert.equal(prices.sellMultiplier, 1);
        if (normal_count === 10) assert.deepEqual(prices, { buyMultiplier: 1, sellMultiplier: 1 });
      }
    }
  }
  assert.deepEqual(merchantPricing({ gold_budget: 350, normal_count: 0, golden_count: 0, demand: 10 }),
    { buyMultiplier: 2.5, sellMultiplier: 1 });
  assert.deepEqual(merchantPricing({ gold_budget: 200, normal_count: 3, golden_count: 1, demand: 5 }),
    { buyMultiplier: 1.3, sellMultiplier: 1.15 });
  assert.equal(merchantPricing({ gold_budget: 100, normal_count: 9, golden_count: 0, demand: 1 }).buyMultiplier, 1.01);
  const merchant: MerchantRow = {
    revision: 0, status: 'ACTIVE', gold_budget: 300, normal_count: 0, golden_count: 0, demand: 7,
    sell_fail_streak: 0, grant_used: false, is_self_sustaining: true, cooldown_until: null, next_offer_at: null,
  };
  assert.equal(nextQuote({ revision: 0, gold: 0, normal_count: 0, golden_count: 1 }, merchant)?.price_gold, 62);
});

test('new Farm creates onboarding at entry; reads preserve ID, quote, revision, and independent guests', async () => {
  let now = 1_800_000_000_000;
  const app = createApp(() => now);
  const { cookie, id } = await openFarm(app);
  const { rows: [created] } = await database.query('SELECT * FROM merchant_offers WHERE session_id = $1', [id]);
  assert.equal(created.side, 'BUY');
  assert.equal(created.expires_at.getTime(), now + 20_000);
  now += 10_000;
  const first = await read(app, cookie);
  assert.equal(first.merchant.goldBudget, 200);
  assert.deepEqual(first.merchant.inventory.counts, { NORMAL: 3, GOLDEN: 1 });
  assert.equal(first.merchant.demand, 5);
  assert.equal(first.merchant.grantUsed, false);
  assert.equal(first.merchant.isSelfSustaining, true);
  assert.deepEqual(first.merchant.offers[0], {
    id: created.id, side: 'BUY', crop: 'NORMAL', quantity: 1, currency: 'GOLD', priceGold: 15,
    expiresAtMs: now + 10_000, canAccept: false, unavailableReason: 'CROP_UNAVAILABLE',
  });
  assert.deepEqual(await read(app, cookie), first);
  assert.deepEqual(await read(createApp(() => now), cookie), first);
  await expectError(await post(app, cookie, MERCHANT_API.accept.path, requestFor(first)), 409, 'CROP_UNAVAILABLE');
  const other = await openFarm(app);
  assert.notEqual((await read(app, other.cookie)).merchant.offers[0].id, created.id);
  await expectError(await post(app, other.cookie, MERCHANT_API.accept.path, requestFor(first)), 404, 'OFFER_NOT_FOUND');

  // An existing Farm save without a merchant is bootstrapped without replacing Farm assets.
  await database.query('DELETE FROM merchant_states WHERE session_id = $1', [id]);
  const bootstrapped = await read(app, cookie);
  assert.deepEqual(bootstrapped.farm, first.farm);
  assert.equal(bootstrapped.merchant.offers[0].priceGold, 15);
});

test('BUY and SELL transfer one crop and quoted GOLD atomically; repeated actions and cooldown cannot transfer twice', async () => {
  const f = await fixture({ farmNormal: 1, failures: 2 });
  const before = await f.read();
  const quote = before.merchant.offers[0];
  assert.equal(quote.side, 'BUY');
  const body = { ...requestFor(before), priceGold: 99999, crop: 'GOLDEN', quantity: 10 };
  const results = await Promise.all([
    post(f.app, f.cookie, MERCHANT_API.accept.path, body),
    post(f.app, f.cookie, MERCHANT_API.accept.path, body),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const accepted = await success<MerchantActionResponse>(results.find(({ status }) => status === 200)!);
  assert.deepEqual(accepted.resolvedOffer, { id: quote.id, status: 'ACCEPTED' });
  assert.equal(accepted.farm.gold, quote.priceGold);
  assert.deepEqual(accepted.farm.silo.counts, { NORMAL: 0, GOLDEN: 0 });
  assert.equal(accepted.merchant.goldBudget, 200 - quote.priceGold);
  assert.deepEqual(accepted.merchant.inventory.counts, { NORMAL: 4, GOLDEN: 1 });
  assert.equal(accepted.merchant.demand, 3);
  assert.equal(accepted.merchant.sellFailStreak, 0);
  assert.equal(accepted.merchant.offers.length, 0);
  assert.equal(accepted.merchant.cooldownUntilMs, accepted.farm.serverTimeMs + 5_000);
  await expectError(await post(f.app, f.cookie, MERCHANT_API.reject.path, requestFor(accepted, quote)), 409, 'COOLDOWN');
  f.advance(4_999);
  assert.equal((await f.read()).merchant.offers.length, 0);
  f.advance(1);
  let selling = await f.read();
  const sell = selling.merchant.offers[0];
  assert.equal(sell.side, 'SELL');
  assert.ok(sell.priceGold >= 30 && sell.priceGold > 25 && sell.priceGold > 10);
  await expectError(await post(f.app, f.cookie, MERCHANT_API.accept.path, requestFor(selling)), 409, 'INSUFFICIENT_GOLD');
  // Give this test guest enough GOLD, as if it had earned it through Farm.
  await database.query('UPDATE farm_sessions SET gold = 100, revision = revision + 1 WHERE id = $1', [f.id]);
  selling = await f.read();
  const bought = await success<MerchantActionResponse>(await post(f.app, f.cookie, MERCHANT_API.accept.path, requestFor(selling)));
  assert.equal(bought.farm.gold, 100 - sell.priceGold);
  assert.deepEqual(bought.farm.silo.counts, { NORMAL: 1, GOLDEN: 0 });
  assert.equal(bought.merchant.goldBudget, selling.merchant.goldBudget + sell.priceGold);
  assert.deepEqual(bought.merchant.inventory.counts, { NORMAL: 3, GOLDEN: 1 });
  assert.equal(bought.merchant.demand, 4);
  assert.deepEqual(await f.read(), boughtWithoutResolution(bought));
  f.advance(5_000);
  const resumed = await f.read();
  await expectError(await post(f.app, f.cookie, MERCHANT_API.accept.path, requestFor(resumed, quote)), 409, 'OFFER_NOT_ACTIVE');
});

function boughtWithoutResolution(response: MerchantActionResponse): MerchantResponse {
  return { farm: response.farm, merchant: response.merchant };
}

test('Golden priority, affordable BUY reduction, full NPC inventory, and Golden SELL retain crop identity', async () => {
  const golden = await fixture({ farmNormal: 1, farmGolden: 1, budget: 30 });
  const buy = await golden.read();
  assert.equal(buy.merchant.offers[0].crop, 'GOLDEN');
  assert.equal(buy.merchant.offers[0].priceGold, 30);
  const sold = await success<MerchantActionResponse>(await post(golden.app, golden.cookie, MERCHANT_API.accept.path, requestFor(buy)));
  assert.deepEqual(sold.farm.silo.counts, { NORMAL: 1, GOLDEN: 0 });
  assert.deepEqual(sold.merchant.inventory.counts, { NORMAL: 3, GOLDEN: 2 });
  assert.equal(sold.merchant.goldBudget, 0);

  const full = await fixture({ farmGold: 200, farmNormal: 1, normal: 0, golden: 10, budget: 350 });
  const sell = await full.read();
  assert.equal(sell.merchant.goldBudget, 350);
  assert.equal(sell.merchant.pricing.sellMultiplier, 1);
  assert.equal(sell.merchant.offers[0].side, 'SELL');
  assert.equal(sell.merchant.offers[0].crop, 'GOLDEN');
  assert.equal(sell.merchant.offers[0].priceGold, 90);
  const bought = await success<MerchantActionResponse>(await post(full.app, full.cookie, MERCHANT_API.accept.path, requestFor(sell)));
  assert.equal(bought.merchant.goldBudget, 440);
  assert.deepEqual(bought.farm.silo.counts, { NORMAL: 1, GOLDEN: 1 });
  assert.deepEqual(bought.merchant.inventory.counts, { NORMAL: 0, GOLDEN: 9 });
});

test('reject/expiry effects happen once; rejects wait for the current window and expired requests never trade', async () => {
  const f = await fixture({ farmNormal: 1 });
  const initial = await f.read();
  const firstOffer = initial.merchant.offers[0];
  const results = await Promise.all([
    post(f.app, f.cookie, MERCHANT_API.reject.path, requestFor(initial)),
    post(f.app, f.cookie, MERCHANT_API.reject.path, requestFor(initial)),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const rejected = await success<MerchantActionResponse>(results.find(({ status }) => status === 200)!);
  assert.equal(rejected.merchant.demand, 6);
  assert.deepEqual(rejected.farm, initial.farm);
  await expectError(await post(f.app, f.cookie, MERCHANT_API.reject.path, requestFor(rejected, firstOffer)), 409, 'OFFER_NOT_ACTIVE');
  f.advance(19_999);
  assert.equal((await f.read()).merchant.offers.length, 0);
  f.advance(1);
  const renewed = await f.read();
  assert.notEqual(renewed.merchant.offers[0].id, firstOffer.id);
  assert.equal(renewed.merchant.demand, 6);
  f.advance(20_000);
  await expectError(await post(f.app, f.cookie, MERCHANT_API.accept.path, requestFor(renewed)), 409, 'STALE_MERCHANT');
  const expired = await f.read();
  assert.equal(expired.merchant.demand, 7);
  assert.deepEqual(expired.farm.silo.counts, initial.farm.silo.counts);
  assert.equal(expired.farm.gold, initial.farm.gold);
  assert.equal(expired.merchant.goldBudget, initial.merchant.goldBudget);
  assert.deepEqual(await f.read(), expired);
  // Long offline time expires only the one persisted offer, without draining stock.
  f.advance(86_400_000);
  const offline = await f.read();
  assert.equal(offline.merchant.demand, 8);
  assert.deepEqual(offline.merchant.inventory, initial.merchant.inventory);
});

test('SELL rejection and timeout clamp demand and count failures once per offer', async () => {
  const f = await fixture({ demand: 1 });
  const first = await f.read();
  assert.equal(first.merchant.offers[0].side, 'SELL');
  const rejected = await success<MerchantActionResponse>(await post(f.app, f.cookie, MERCHANT_API.reject.path, requestFor(first)));
  assert.equal(rejected.merchant.demand, 1);
  assert.equal(rejected.merchant.sellFailStreak, 1);
  f.advance(20_000);
  await f.read();
  f.advance(20_000);
  const timedOut = await f.read();
  assert.equal(timedOut.merchant.demand, 1);
  assert.equal(timedOut.merchant.sellFailStreak, 2);
  assert.deepEqual(timedOut.merchant.inventory.counts, { NORMAL: 3, GOLDEN: 1 });
  assert.deepEqual(await f.read(), timedOut);
});

test('concurrent read/accept/reject at the exact expiry apply one timeout and no trade', async () => {
  const f = await fixture({ farmNormal: 1, demand: 10 });
  const initial = await f.read();
  f.advance(20_000);
  const results = await Promise.all([
    f.app.request(MERCHANT_API.read.path, { headers: { Cookie: f.cookie } }),
    post(f.app, f.cookie, MERCHANT_API.accept.path, requestFor(initial)),
    post(f.app, f.cookie, MERCHANT_API.reject.path, requestFor(initial)),
  ]);
  assert.deepEqual(results.map(({ status }) => status), [200, 409, 409]);
  const final = await f.read();
  assert.equal(final.merchant.revision, initial.merchant.revision + 1);
  assert.equal(final.merchant.demand, 10);
  assert.equal(final.merchant.goldBudget, initial.merchant.goldBudget);
  assert.deepEqual(final.merchant.inventory, initial.merchant.inventory);
  assert.equal(final.farm.gold, initial.farm.gold);
  assert.equal(final.farm.revision, initial.farm.revision);
  assert.deepEqual(final.farm.silo, initial.farm.silo);
  const { rows: [ended] } = await database.query('SELECT status FROM merchant_offers WHERE id = $1', [initial.merchant.offers[0].id]);
  assert.equal(ended.status, 'EXPIRED');
});

test('recovery liquidates one named owned crop; grant happens once and the second empty trigger closes the merchant', async () => {
  for (const crop of ['NORMAL', 'GOLDEN'] as const) {
    const f = await fixture({ budget: 20, normal: crop === 'NORMAL' ? 2 : 0, golden: crop === 'GOLDEN' ? 2 : 0, failures: 3 });
    const recovered = await f.read();
    assert.equal(recovered.merchant.goldBudget, crop === 'NORMAL' ? 30 : 50);
    assert.equal(recovered.merchant.inventory.counts[crop], 1);
    assert.equal(recovered.merchant.sellFailStreak, 0);
    assert.deepEqual(recovered.merchant.recoveryEvents, [{
      id: recovered.merchant.recoveryEvents[0].id, occurredAtMs: recovered.farm.serverTimeMs,
      kind: 'LIQUIDATION', crop, goldAdded: crop === 'NORMAL' ? 10 : 30,
    }]);
    assert.deepEqual(await f.read(), recovered);
  }
  const empty = await fixture({ budget: 0, normal: 0, golden: 0 });
  const granted = await empty.read();
  assert.equal(granted.merchant.goldBudget, 60);
  assert.equal(granted.merchant.grantUsed, true);
  assert.equal(granted.merchant.isSelfSustaining, false);
  assert.equal(granted.merchant.recoveryEvents[0].kind, 'OPERATING_GRANT');
  assert.equal(granted.merchant.offers.length, 0);
  await database.query('UPDATE merchant_states SET gold_budget = 0 WHERE session_id = $1', [empty.id]);
  empty.advance(20_000);
  const closed = await empty.read();
  assert.equal(closed.merchant.status, 'OUT_OF_BUSINESS');
  assert.equal(closed.merchant.goldBudget, 0);
  assert.equal(closed.merchant.nextOfferAtMs, null);
  assert.equal(closed.merchant.cooldownUntilMs, null);
  assert.deepEqual(closed.merchant.recoveryEvents.map(({ kind }) => kind), ['OPERATING_GRANT', 'OUT_OF_BUSINESS']);
  assert.equal(closed.merchant.offers.length, 0);
  await expectError(await post(empty.app, empty.cookie, MERCHANT_API.accept.path, {
    offerId: 'ended', expectedRevision: closed.farm.revision, expectedMerchantRevision: closed.merchant.revision,
  }), 409, 'OUT_OF_BUSINESS');
  empty.advance(60_000);
  const persisted = await empty.read();
  assert.deepEqual(persisted.merchant, closed.merchant);
  // NPC closure does not disable Farm's independent Quick Sell.
  await database.query('UPDATE farm_sessions SET normal_count = 1 WHERE id = $1', [empty.id]);
  const quickSold = await success<FarmResponse>(await post(empty.app, empty.cookie, FARM_API.quickSell.path, { crop: 'NORMAL', expectedRevision: 0 }));
  assert.equal(quickSold.farm.gold, 10);
});

test('Farm and merchant writes share a lock; full silo, stale revisions, and changed inventory cannot create assets', async () => {
  const f = await fixture({ farmNormal: 1 });
  const first = await f.read();
  const results = await Promise.all([
    post(f.app, f.cookie, FARM_API.quickSell.path, { crop: 'NORMAL', expectedRevision: first.farm.revision }),
    post(f.app, f.cookie, MERCHANT_API.accept.path, requestFor(first)),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const final = await f.read();
  assert.equal(final.farm.silo.counts.NORMAL, 0);
  assert.equal(final.farm.revision, first.farm.revision + 1);
  assert.equal(final.farm.gold + final.merchant.goldBudget,
    first.merchant.goldBudget + (results[0].status === 200 ? 10 : 0));

  const full = await fixture({ farmGold: 200 });
  const offered = await full.read();
  await database.query('UPDATE farm_sessions SET normal_count = 10, revision = revision + 1 WHERE id = $1', [full.id]);
  await expectError(await post(full.app, full.cookie, MERCHANT_API.accept.path, requestFor(offered)), 409, 'STALE_FARM');
  const fullSilo = await full.read();
  assert.equal(fullSilo.merchant.offers[0].unavailableReason, 'SILO_FULL');
  await expectError(await post(full.app, full.cookie, MERCHANT_API.accept.path, requestFor(fullSilo)), 409, 'SILO_FULL');
  assert.deepEqual(await full.read(), fullSilo);
});

test('invalid JSON, revisions, session and foreign/unknown IDs use the shared error contract', async () => {
  const f = await fixture();
  const state = await f.read();
  await expectError(await f.app.request(MERCHANT_API.read.path), 401, 'SESSION_REQUIRED');
  await expectError(await f.app.request(MERCHANT_API.read.path, { headers: { Cookie: 'farmverse_guest=bad-id' } }), 401, 'SESSION_REQUIRED');
  await expectError(await f.app.request(MERCHANT_API.read.path, { headers: { Cookie: `farmverse_guest=${randomUUID()}` } }), 401, 'SESSION_REQUIRED');
  const unavailable = createMerchantRoutes(undefined);
  await expectError(await unavailable.request(MERCHANT_API.read.path), 503, 'SERVICE_UNAVAILABLE');
  for (const body of [null, [], {}, { ...requestFor(state), expectedMerchantRevision: -1 },
    { ...requestFor(state), expectedRevision: 0.5 }, { ...requestFor(state), offerId: ' ' }]) {
    await expectError(await post(f.app, f.cookie, MERCHANT_API.accept.path, body), 400, 'INVALID_REQUEST');
  }
  for (const [media, body] of [['application/json', '{'], ['text/plain', '{}']]) {
    await expectError(await f.app.request(MERCHANT_API.reject.path, {
      method: 'POST', headers: { Cookie: f.cookie, 'Content-Type': media }, body,
    }), 400, 'INVALID_REQUEST');
  }
  await expectError(await post(f.app, f.cookie, MERCHANT_API.accept.path, { ...requestFor(state), offerId: 'not-a-uuid' }), 404, 'OFFER_NOT_FOUND');
  await expectError(await post(f.app, f.cookie, MERCHANT_API.reject.path, { ...requestFor(state), expectedMerchantRevision: state.merchant.revision + 1 }), 409, 'STALE_MERCHANT');
  assert.deepEqual(await f.read(), state);
});

test('a database failure after the Farm update rolls the entire trade back', async () => {
  const f = await fixture({ farmNormal: 1 });
  const initial = await f.read();
  await database.query(`
    CREATE FUNCTION fail_merchant_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Test rollback'; END; $$;
    CREATE TRIGGER fail_merchant_update BEFORE UPDATE ON merchant_states
      FOR EACH ROW EXECUTE FUNCTION fail_merchant_update();
  `);
  try {
    await expectError(await post(f.app, f.cookie, MERCHANT_API.accept.path, requestFor(initial)), 500, 'INTERNAL_ERROR');
    assert.deepEqual(await f.read(), initial);
    const { rows: [offer] } = await database.query('SELECT status FROM merchant_offers WHERE id = $1', [initial.merchant.offers[0].id]);
    assert.equal(offer.status, 'ACTIVE');
  } finally {
    await database.query('DROP TRIGGER fail_merchant_update ON merchant_states; DROP FUNCTION fail_merchant_update()');
  }
});
