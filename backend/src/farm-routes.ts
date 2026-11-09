import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Pool } from 'pg';
import {
  FARM_API, FARM_ERROR_STATUS, isPlotActionRequest, isQuickSellRequest,
} from '../../shared/farm.mts';
import type { FarmErrorCode, FarmErrorResponse, FarmResponse } from '../../shared/farm.mts';
import { applyFarmAction, createFarm, readFarm } from './farm-store.js';
import type { FarmAction } from './farm-store.js';

const FARM_COOKIE = 'farmverse_guest';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorMessages: Record<FarmErrorCode, string> = {
  INVALID_REQUEST: 'Invalid Farm action.',
  SESSION_REQUIRED: 'Open the Farm to start a guest session.',
  PLOT_NOT_FOUND: 'Plot not found.',
  STALE_FARM: 'Farm state changed. Refresh and try again.',
  PLOT_NOT_EMPTY: 'This plot is not available for planting.',
  PLOT_NOT_READY: 'This crop is not ready to harvest.',
  PLOT_NOT_LOCKED: 'This plot is already unlocked.',
  SILO_FULL: 'Your silo is full. Sell a crop before harvesting.',
  CROP_UNAVAILABLE: 'You do not have this crop to sell.',
  INSUFFICIENT_GOLD: 'You need more GOLD to unlock this plot.',
  INTERNAL_ERROR: 'The Farm request could not be completed.',
  SERVICE_UNAVAILABLE: 'The Farm database is unavailable.',
};

function guestId(context: Context): string | undefined {
  const id = getCookie(context, FARM_COOKIE);
  return id && UUID_V4.test(id) ? id : undefined;
}

function failure(context: Context, code: FarmErrorCode) {
  const response: FarmErrorResponse = { error: { code, message: errorMessages[code] } };
  return context.json(response, FARM_ERROR_STATUS[code]);
}

export function createFarmRoutes(database: Pool | undefined, clock = Date.now, random = Math.random) {
  const routes = new Hono();

  routes.use('/farm/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    await next();
  });

  routes.onError((error, context) => {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    const connectionFailure = code.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P03'].includes(code)
      || /timed?\s*out|timeout/i.test(error.message);
    console.error('Farm request failed', code || error.name);
    return failure(context, connectionFailure ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR');
  });

  routes.get(FARM_API.read.path, async (context) => {
    if (!database) return failure(context, 'SERVICE_UNAVAILABLE');
    const id = guestId(context);
    const existing = id && await readFarm(database, id, clock);
    if (existing) return context.json({ farm: existing } satisfies FarmResponse);

    const created = randomUUID();
    const farm = await createFarm(database, created, clock);
    setCookie(context, FARM_COOKIE, created, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: new URL(context.req.url).protocol === 'https:',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });
    return context.json({ farm } satisfies FarmResponse);
  });

  async function mutate(context: Context, parse: (body: unknown) => FarmAction | undefined) {
    if (!database) return failure(context, 'SERVICE_UNAVAILABLE');
    const id = guestId(context);
    if (!id) return failure(context, 'SESSION_REQUIRED');

    const mediaType = context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/json') return failure(context, 'INVALID_REQUEST');
    const action = parse(await context.req.json().catch(() => undefined));
    if (!action) return failure(context, 'INVALID_REQUEST');

    const result = await applyFarmAction(database, id, action, clock, random);
    if ('error' in result) return failure(context, result.error);
    return context.json(result);
  }

  for (const kind of ['plant', 'harvest', 'unlock'] as const) {
    routes.post(FARM_API[kind].path, (context) => mutate(context, (body) => isPlotActionRequest(body)
      ? { kind, plotId: body.plotId, expectedRevision: body.expectedRevision }
      : undefined));
  }
  routes.post(FARM_API.quickSell.path, (context) => mutate(context, (body) => isQuickSellRequest(body)
    ? { kind: 'quickSell', crop: body.crop, expectedRevision: body.expectedRevision }
    : undefined));

  return routes;
}
