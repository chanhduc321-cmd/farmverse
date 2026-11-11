import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { COMMUNITY_API } from '../../shared/community.mts';
import { confirmFriend, inviteFriend, listPlayers, stealFruit, visitFarm } from './community-store.ts';

interface AccountSession { id: string; tokenHash: string }

export function communityRoutes(sessionFor: (context: Context) => Promise<AccountSession | undefined>) {
  const routes = new Hono<{ Variables: { session: AccountSession } }>();
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

  routes.get(COMMUNITY_API.players, async (context) => {
    const list = context.req.query('list') ?? 'residents';
    const search = (context.req.query('q') ?? '').trim().toLowerCase();
    const offset = Number(context.req.query('offset') ?? 0);
    if ((list !== 'residents' && list !== 'friends' && list !== 'invitations')
      || !/^[a-z0-9_]{0,24}$/.test(search) || !Number.isSafeInteger(offset) || offset < 0) {
      return context.json({ error: 'Bộ lọc người chơi không hợp lệ.' }, 400);
    }
    return context.json(await listPlayers(context.get('session').id, list, search, offset));
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
