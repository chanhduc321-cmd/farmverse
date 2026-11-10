import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Farm } from '../../shared/farm.mts';
import { applyAction, createFarm, crops, FarmError, parseAction } from './farm.ts';

const app = new Hono();
const farms = new Map<string, Farm>();
const cookieName = 'happyfarm_guest';

function getFarm(context: Context): Farm {
  const id = getCookie(context, cookieName);
  const existing = id && farms.get(id);
  if (existing) return existing;
  const newId = randomUUID();
  const farm = createFarm();
  farms.set(newId, farm);
  setCookie(context, cookieName, newId, { httpOnly: true, sameSite: 'Lax', path: '/' });
  return farm;
}

app.use('*', async (context, next) => {
  context.header('Cache-Control', 'no-store');
  await next();
});

app.get('/health', (context) => context.json({ status: 'ok' }));
app.get('/crops', (context) => context.json(crops));
app.get('/farm', (context) => context.json({ farm: getFarm(context), serverTime: Date.now() }));

app.post('/farm/actions', async (context) => {
  const action = parseAction(await context.req.json().catch(() => null));
  if (!action) return context.json({ error: 'Thao tác không hợp lệ.' }, 400);
  const id = getCookie(context, cookieName);
  const farm = id && farms.get(id);
  if (!farm) return context.json({ error: 'Phiên chơi đã hết. Hãy tải lại trang.' }, 401);
  const now = Date.now();
  try {
    const message = applyAction(farm, action, now);
    return context.json({ farm, serverTime: now, message });
  } catch (error) {
    if (error instanceof FarmError) return context.json({ error: error.message }, 409);
    throw error;
  }
});

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 8092) },
  ({ address, port }) => console.log(`HappyFarm API listening at http://${address}:${port}`));
