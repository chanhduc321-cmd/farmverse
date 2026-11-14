import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { COMMUNITY_API, COMMUNITY_RESULT_LIMIT, COMMUNITY_SEARCH_MIN } from '../../shared/community.mts';
import { confirmFriend, inviteFriend, listPlayers, stealFruit, visitFarm } from './community-store.ts';

interface AccountSession { id: string; tokenHash: string }
const directoryWindowMs = 30_000;
const directoryRequestLimit = 18;
const directorySessionLimit = 1024;

export function communityRoutes(
  sessionFor: (context: Context) => Promise<AccountSession | undefined>,
  sessionToken: (context: Context) => string | undefined,
) {
  const routes = new Hono<{ Variables: { session: AccountSession } }>();
  const directoryRequests = new Map<string, { count: number; expiresAt: number }>();
  routes.get(COMMUNITY_API.players, async (context) => {
    const list = context.req.query('list') ?? 'residents';
    const search = (context.req.query('q') ?? '').trim().toLowerCase();
    const offset = Number(context.req.query('offset') ?? 0);
    if ((list !== 'residents' && list !== 'friends' && list !== 'invitations')
      || !/^[a-z0-9_]{0,24}$/.test(search) || (search.length > 0 && search.length < COMMUNITY_SEARCH_MIN)
      || !Number.isSafeInteger(offset) || offset < 0 || offset >= COMMUNITY_RESULT_LIMIT) {
      return context.json({ error: 'Bộ lọc người chơi không hợp lệ.' }, 400);
    }

    const token = sessionToken(context);
    if (!token) return context.json({ error: 'Hãy đăng nhập để thăm ruộng.' }, 401);
    const now = Date.now();
    let window = directoryRequests.get(token);
    if (!window || window.expiresAt <= now) {
      directoryRequests.delete(token);
      if (directoryRequests.size >= directorySessionLimit) directoryRequests.delete(directoryRequests.keys().next().value!);
      window = { count: 0, expiresAt: now + directoryWindowMs };
      directoryRequests.set(token, window);
    }
    if (window.count >= directoryRequestLimit) {
      context.header('Retry-After', String(Math.ceil((window.expiresAt - now) / 1000)));
      return context.json({ error: 'Bạn đang xem danh sách quá nhanh. Thử lại sau ít giây nhé.' }, 429);
    }
    window.count++;

    const session = await sessionFor(context);
    if (!session) return context.json({ error: 'Hãy đăng nhập để thăm ruộng.' }, 401);
    return context.json(await listPlayers(session.id, list, search, offset));
  });

  routes.use('/community/*', async (context, next) => {
    const session = await sessionFor(context);
    if (!session) return context.json({ error: 'Hãy đăng nhập để thăm ruộng.' }, 401);
    context.set('session', session);
    await next();
  });
  routes.use('/community/*', async (context, next) => {
    if (context.req.method === 'POST') {
      if (context.req.header('Sec-Fetch-Site') === 'cross-site') {
        return context.json({ error: 'Yêu cầu không hợp lệ.' }, 403);
      }
      if (context.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return context.json({ error: 'Yêu cầu cần JSON.' }, 400);
      }
    }
    await next();
  });

  for (const [path, handle] of [[COMMUNITY_API.invite, inviteFriend], [COMMUNITY_API.confirm, confirmFriend]] as const) {
    routes.post(path, async (context) => {
      const username = context.req.param('username').toLowerCase();
      if (!/^[a-z0-9_]{3,24}$/.test(username)) return context.json({ error: 'Tên người chơi không hợp lệ.' }, 400);
      const failure = await handle(context.get('session').id, username);
      return failure ? context.json({ error: failure.error }, failure.status) : context.body(null, 204);
    });
  }

  routes.get(COMMUNITY_API.visit, async (context) => {
    const username = context.req.param('username').toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return context.json({ error: 'Tên người chơi không hợp lệ.' }, 400);
    const visit = await visitFarm(context.get('session').id, username);
    return visit ? context.json(visit) : context.json({ error: 'Không tìm thấy ruộng.' }, 404);
  });

  routes.post(COMMUNITY_API.steal, bodyLimit({
    maxSize: 512, onError: context => context.json({ error: 'Yêu cầu quá dài.' }, 413),
  }), async (context) => {
    const username = context.req.param('username').toLowerCase();
    const data = await context.req.json().catch(() => null);
    const { plot, plantedAt } = data ?? {};
    if (!/^[a-z0-9_]{3,24}$/.test(username)
      || !Number.isInteger(plot) || plot < 0 || plot > 5
      || !Number.isSafeInteger(plantedAt) || plantedAt < 0) {
      return context.json({ error: 'Lượt lấy quả không hợp lệ.' }, 400);
    }
    const { id, tokenHash } = context.get('session');
    const result = await stealFruit(id, tokenHash, username, { plot, plantedAt });
    return 'error' in result ? context.json({ error: result.error }, result.status) : context.json(result);
  });
  return routes;
}
