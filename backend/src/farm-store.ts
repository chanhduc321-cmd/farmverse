import type { Pool, PoolClient } from 'pg';
import type {
  CropVariant, FarmErrorCode, FarmPlot, FarmSnapshot, PlotActionRequest, QuickSellRequest,
} from '../../shared/farm.mts';

const GROW_TIME_MS = 10_000;
const GOLDEN_CHANCE = 0.1;
const SILO_CAPACITY = 10;
const QUICK_SELL_GOLD = { NORMAL: 10, GOLDEN: 30 };
const PLOT_UNLOCK_COSTS = [0, 0, 20, 20, 20, 20];

interface FarmRow {
  revision: number;
  gold: number;
  normal_count: number;
  golden_count: number;
}

interface PlotRow {
  id: number;
  unlocked: boolean;
  unlock_cost_gold: number;
  ready_at: Date | null;
}

export type FarmAction =
  | ({ kind: 'plant' | 'harvest' | 'unlock' } & PlotActionRequest)
  | ({ kind: 'quickSell' } & QuickSellRequest);

type MutationResult = { farm: FarmSnapshot; harvested?: CropVariant } | { error: FarmErrorCode };

async function transact<T>(database: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

function snapshot(farm: FarmRow, plots: PlotRow[], now: number): FarmSnapshot {
  return {
    revision: farm.revision,
    serverTimeMs: now,
    gold: farm.gold,
    silo: { capacity: SILO_CAPACITY, counts: { NORMAL: farm.normal_count, GOLDEN: farm.golden_count } },
    quickSellPriceGold: QUICK_SELL_GOLD,
    plots: plots.map((plot): FarmPlot => {
      if (!plot.unlocked) return { id: plot.id, state: 'LOCKED', unlockCostGold: plot.unlock_cost_gold };
      if (!plot.ready_at) return { id: plot.id, state: 'EMPTY' };
      const readyAtMs = plot.ready_at.getTime();
      if (readyAtMs <= now) return { id: plot.id, state: 'READY' };
      return { id: plot.id, state: 'GROWING', readyAtMs };
    }),
  };
}

export async function readFarm(database: Pool, id: string, clock: () => number): Promise<FarmSnapshot | undefined> {
  const { rows } = await database.query<FarmRow & PlotRow>(`
    SELECT f.revision, f.gold, f.normal_count, f.golden_count,
           p.id, p.unlocked, p.unlock_cost_gold, p.ready_at
    FROM farm_sessions AS f JOIN farm_plots AS p ON p.session_id = f.id
    WHERE f.id = $1 ORDER BY p.id
  `, [id]);
  return rows[0] && snapshot(rows[0], rows, clock());
}

export function createFarm(database: Pool, id: string, clock: () => number): Promise<FarmSnapshot> {
  return transact(database, async (client) => {
    const { rows: [farm] } = await client.query<FarmRow>(`
      INSERT INTO farm_sessions (id) VALUES ($1)
      RETURNING revision, gold, normal_count, golden_count
    `, [id]);
    const { rows: plots } = await client.query<PlotRow>(`
      INSERT INTO farm_plots (session_id, id, unlocked, unlock_cost_gold)
      SELECT $1, position, position <= 2, cost
      FROM unnest($2::integer[]) WITH ORDINALITY AS initial(cost, position)
      RETURNING id, unlocked, unlock_cost_gold, ready_at
    `, [id, PLOT_UNLOCK_COSTS]);
    return snapshot(farm, plots.sort((left, right) => left.id - right.id), clock());
  });
}

export function applyFarmAction(
  database: Pool, id: string, action: FarmAction, clock: () => number, random: () => number,
): Promise<MutationResult> {
  return transact(database, async (client) => {
    const { rows: [farm] } = await client.query<FarmRow>(`
      SELECT revision, gold, normal_count, golden_count
      FROM farm_sessions WHERE id = $1 FOR UPDATE
    `, [id]);
    if (!farm) return { error: 'SESSION_REQUIRED' };
    if (farm.revision !== action.expectedRevision) return { error: 'STALE_FARM' };

    const { rows: plots } = await client.query<PlotRow>(`
      SELECT id, unlocked, unlock_cost_gold, ready_at
      FROM farm_plots WHERE session_id = $1 ORDER BY id
    `, [id]);
    const now = clock();
    let harvested: CropVariant | undefined;

    if (action.kind === 'quickSell') {
      const count = action.crop === 'NORMAL' ? 'normal_count' : 'golden_count';
      if (farm[count] === 0) return { error: 'CROP_UNAVAILABLE' };
      farm[count]--;
      farm.gold += QUICK_SELL_GOLD[action.crop];
    } else {
      const plot = plots.find(({ id: plotId }) => plotId === action.plotId);
      if (!plot) return { error: 'PLOT_NOT_FOUND' };

      switch (action.kind) {
        case 'plant':
          if (!plot.unlocked || plot.ready_at) return { error: 'PLOT_NOT_EMPTY' };
          plot.ready_at = new Date(now + GROW_TIME_MS);
          break;
        case 'harvest':
          if (!plot.ready_at || plot.ready_at.getTime() > now) return { error: 'PLOT_NOT_READY' };
          if (farm.normal_count + farm.golden_count >= SILO_CAPACITY) return { error: 'SILO_FULL' };
          harvested = random() < GOLDEN_CHANCE ? 'GOLDEN' : 'NORMAL';
          farm[harvested === 'NORMAL' ? 'normal_count' : 'golden_count']++;
          plot.ready_at = null;
          break;
        case 'unlock':
          if (plot.unlocked) return { error: 'PLOT_NOT_LOCKED' };
          if (farm.gold < plot.unlock_cost_gold) return { error: 'INSUFFICIENT_GOLD' };
          farm.gold -= plot.unlock_cost_gold;
          plot.unlocked = true;
          break;
      }

      await client.query(`
        UPDATE farm_plots SET unlocked = $3, ready_at = $4 WHERE session_id = $1 AND id = $2
      `, [id, plot.id, plot.unlocked, plot.ready_at]);
    }

    farm.revision++;
    await client.query(`
      UPDATE farm_sessions SET revision = $2, gold = $3, normal_count = $4, golden_count = $5
      WHERE id = $1
    `, [id, farm.revision, farm.gold, farm.normal_count, farm.golden_count]);
    return { farm: snapshot(farm, plots, now), ...(harvested && { harvested }) };
  });
}
