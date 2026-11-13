import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { ACTIVITY_API } from '../../shared/activity.mts';
import { countUnreadActivities, getActivityPage, getActivityVersion, markActivitiesRead } from './activity-store.ts';

interface AccountSession { id: string; username: string }

function isActivityId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n;
}

export function activityRoutes(sessionFor: (context: Context) => Promise<AccountSession | undefined>) {
  const routes = new Hono<{ Variables: { session: AccountSession } }>();

  routes.use('/activity*', async (context, next) => {
    context.header('Cache-Control', 'private, no-store');
    const session = await sessionFor(context);
    if (!session) return context.json({ error: 'Hãy đăng nhập để xem nhật ký.' }, 401);
    const expectedAccount = context.req.header('X-Farm-Account');
    if (expectedAccount !== undefined && expectedAccount !== session.username) {
      return context.json({ error: 'Phiên nông trại đã thay đổi. Hãy tải lại trang.' }, 401);
    }
    context.set('session', session);
    await next();
  });

  routes.get(ACTIVITY_API.read, async (context) => {
    const offset = Number(context.req.query('offset') ?? 0);
    const limit = Number(context.req.query('limit') ?? 20);
    const through = context.req.query('through');
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50
      || (through !== undefined && !isActivityId(through))) {
      return context.json({ error: 'Trang nhật ký không hợp lệ.' }, 400);
    }
    const hostId = context.get('session').id;
    if (offset === 0 && through === undefined) {
      const version = await getActivityVersion(hostId);
      if (!version) return context.json({ error: 'Hãy đăng nhập để xem nhật ký.' }, 401);
      const hash = createHash('sha256')
        .update(JSON.stringify([hostId, limit, version.newest_id, version.last_read_at]))
        .digest('base64url');
      const etag = `"${hash}"`;
      context.header('ETag', etag);
      const validators = context.req.header('If-None-Match')?.split(',') ?? [];
      if (validators.some(value => ['*', etag, `W/${etag}`].includes(value.trim()))) {
        return context.body(null, 304);
      }
    }
    const page = await getActivityPage(hostId, offset, limit, through);
    return context.json(page);
  });

  routes.post(ACTIVITY_API.markRead, async (context) => {
    if (context.req.header('Sec-Fetch-Site') === 'cross-site'
      || context.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return context.json({ error: 'Yêu cầu nhật ký không hợp lệ.' }, 400);
    }
    const body = await context.req.json().catch(() => null) as { through?: unknown } | null;
    if (!isActivityId(body?.through)) return context.json({ error: 'Thiếu mốc đã đọc.' }, 400);
    const hostId = context.get('session').id;
    await markActivitiesRead(hostId, body.through);
    const unreadCount = await countUnreadActivities(hostId);
    return context.json({ ok: true, unreadCount });
  });

  return routes;
}
