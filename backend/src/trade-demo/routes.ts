import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { isTradeDemoActionRequest, TRADE_DEMO_API, TRADE_DEMO_ERROR_STATUS } from '../../../shared/trade-demo.mts';
import type { TradeDemoErrorResponse } from '../../../shared/trade-demo.mts';
import { tradePayments } from '../payments/provider.ts';
import type { TradePayments } from '../payments/trade-payments.ts';
import { createTradeDemoService, TradeDemoError } from './service.ts';

function failure(context: Context, error: TradeDemoError) {
  const body: TradeDemoErrorResponse = {
    error: { code: error.code, message: error.message, ...(error.orderId ? { orderId: error.orderId } : {}) },
  };
  return context.json(body, TRADE_DEMO_ERROR_STATUS[error.code]);
}

type DemoContext = { Variables: { farmId: string; service: ReturnType<typeof createTradeDemoService> } };

export function tradeDemoRoutes(
  resolveFarm: (context: Context) => Promise<string | undefined>,
  paymentsFor: () => TradePayments | undefined = tradePayments,
) {
  const routes = new Hono<DemoContext>();
  routes.onError((error, context) => {
    if (error instanceof TradeDemoError) return failure(context, error);
    console.warn('Không xử lý được giao dịch demo.', error.name);
    return failure(context, new TradeDemoError('SERVICE_UNAVAILABLE'));
  });
  routes.use('/trade-demo*', async (context, next) => {
    context.header('Cache-Control', 'private, no-store');
    const farmId = await resolveFarm(context);
    if (!farmId) return failure(context, new TradeDemoError('SESSION_REQUIRED'));
    const payments = paymentsFor();
    if (!payments) return failure(context, new TradeDemoError('SERVICE_UNAVAILABLE'));
    context.set('farmId', farmId);
    context.set('service', createTradeDemoService(payments));
    await next();
  });

  routes.get(TRADE_DEMO_API.read.path, async context =>
    context.json(await context.get('service').read(context.get('farmId'))));
  routes.post(TRADE_DEMO_API.visit.path, async context => {
    if (context.req.header('Sec-Fetch-Site') === 'cross-site') {
      return failure(context, new TradeDemoError('INVALID_REQUEST'));
    }
    return context.json(await context.get('service').visit(context.get('farmId')));
  });
  routes.get(TRADE_DEMO_API.pnl.path, async context =>
    context.json(await context.get('service').pnl(context.get('farmId'))));
  routes.get(TRADE_DEMO_API.order.path, async context =>
    context.json(await context.get('service').readOrder(context.get('farmId'), context.req.param('orderId'))));

  for (const action of ['accept', 'skip'] as const) {
    routes.post(TRADE_DEMO_API[action].path, bodyLimit({ maxSize: 2048,
      onError: context => failure(context, new TradeDemoError('INVALID_REQUEST')) }), async context => {
      if (context.req.header('Sec-Fetch-Site') === 'cross-site' ||
          context.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        return failure(context, new TradeDemoError('INVALID_REQUEST'));
      }
      const body: unknown = await context.req.json().catch(() => null);
      if (!isTradeDemoActionRequest(body)) return failure(context, new TradeDemoError('INVALID_REQUEST'));
      const result = await context.get('service').action(context.get('farmId'), action, body);
      const pending = result.order && ['awaiting_approval', 'processing', 'verifying'].includes(result.order.status);
      return context.json(result, pending ? 202 : 200);
    });
  }
  return routes;
}
