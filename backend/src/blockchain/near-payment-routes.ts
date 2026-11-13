import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { nearAuthConfig, nearAuthorizationUrl } from '../auth/near.ts';
import { createNearUsdcProvider, paymentStateHash } from './near-usdc.ts';
import type { NearUsdcPaymentProvider } from './near-usdc.ts';
import { readNearUsdcAuthorization } from './near-usdc-store.ts';

const cookie = 'farmverse_near_payment';
const flowPattern = /^(pay-[A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

function clearCookie(context: Context) {
  const config = nearAuthConfig();
  if (config) setCookie(context, cookie, '', { httpOnly: true, sameSite: 'Lax',
    secure: config.callback.protocol === 'https:', path: config.callback.pathname, maxAge: 0 });
}

function returnToFarm(context: Context) {
  context.header('Referrer-Policy', 'no-referrer');
  return context.redirect('/', 303);
}

type ResolveFarm = (context: Context) => Promise<string | undefined>;
type Factory = (farmId: string) => Promise<NearUsdcPaymentProvider | undefined>;

export function nearPaymentRoutes(resolveFarm: ResolveFarm, factory: Factory = createNearUsdcProvider) {
  const routes = new Hono();
  routes.get('/account/payments/near/:paymentId/authorize', async context => {
    const farmId = await resolveFarm(context);
    if (!farmId) return context.json({ error: 'Hãy đăng nhập bằng Google trước khi thanh toán.' }, 401);
    if (context.req.header('Sec-Fetch-Site') === 'cross-site') return context.json({ error: 'Yêu cầu không hợp lệ.' }, 403);
    const config = nearAuthConfig();
    const adapter = config ? await factory(farmId) : undefined;
    if (!config || !adapter) return context.notFound();
    try {
      const state = `pay-${randomBytes(32).toString('base64url')}`;
      const payload = await adapter.authorize(context.req.param('paymentId'), state);
      const nonce = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      setCookie(context, cookie, `${state}.${nonce}.${verifier}`, { httpOnly: true, sameSite: 'Lax',
        secure: config.callback.protocol === 'https:', path: config.callback.pathname, maxAge: 300 });
      context.header('Referrer-Policy', 'no-referrer');
      return context.redirect(nearAuthorizationUrl(config, state, nonce, challenge, payload).href, 303);
    } catch {
      // The farm snapshot is authoritative for pending, expired and completed orders.
      return returnToFarm(context);
    }
  });
  return routes;
}

export async function completeNearPayment(context: Context, farmId: string | undefined, factory: Factory = createNearUsdcProvider) {
  const state = context.req.query('state');
  const flow = flowPattern.exec(getCookie(context, cookie) ?? '');
  // Do not clear a different tab's in-progress authorization on a mismatched callback.
  if (!state || !flow || flow[1] !== state || !farmId) return returnToFarm(context);
  clearCookie(context);
  const record = await readNearUsdcAuthorization(paymentStateHash(state), farmId);
  const adapter = record ? await factory(farmId) : undefined;
  if (!record || !adapter) return returnToFarm(context);
  try {
    const code = context.req.query('code');
    await adapter.submit(adapter.intentFor(record), {
      state, nonce: flow[2], verifier: flow[3],
      code, cancelled: Boolean(context.req.query('error')),
    });
  } catch {
    // Never convert an uncertain chain outcome into a second payment.
  }
  return returnToFarm(context);
}
