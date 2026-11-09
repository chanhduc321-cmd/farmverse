import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Pool } from 'pg';
import { MERCHANT_API, MERCHANT_ERROR_STATUS, isMerchantOfferRequest } from '../../shared/merchant.mts';
import type { MerchantErrorCode, MerchantErrorResponse } from '../../shared/merchant.mts';
import { guestId } from './farm-routes.js';
import { applyMerchantAction, readMerchant } from './merchant-store.js';

const errorMessages: Record<MerchantErrorCode, string> = {
  INVALID_REQUEST: 'Invalid merchant action.',
  SESSION_REQUIRED: 'Open the Farm to start a guest session.',
  OFFER_NOT_FOUND: 'Offer not found for this guest.',
  STALE_FARM: 'Farm state changed. Refresh and try again.',
  STALE_MERCHANT: 'Merchant state changed. Refresh and try again.',
  OFFER_NOT_ACTIVE: 'This offer has already ended. Refresh the merchant.',
  COOLDOWN: 'The merchant is resting. Wait for the next offer.',
  OUT_OF_BUSINESS: 'The merchant is out of business for this session. Quick Sell is still available.',
  CROP_UNAVAILABLE: 'You do not have this crop to sell.',
  SILO_FULL: 'Your silo is full. Sell a crop before buying.',
  INSUFFICIENT_GOLD: 'You need more GOLD to buy this crop.',
  MERCHANT_FULL: 'The merchant has no room for another crop.',
  MERCHANT_CROP_UNAVAILABLE: 'The merchant no longer owns this crop.',
  MERCHANT_INSUFFICIENT_GOLD: 'The merchant cannot afford this quote.',
  INTERNAL_ERROR: 'The merchant request could not be completed.',
  SERVICE_UNAVAILABLE: 'The merchant database is unavailable.',
};

function failure(context: Context, code: MerchantErrorCode) {
  const response: MerchantErrorResponse = { error: { code, message: errorMessages[code] } };
  return context.json(response, MERCHANT_ERROR_STATUS[code]);
}

export function createMerchantRoutes(database: Pool | undefined, clock = Date.now) {
  const routes = new Hono();
  routes.use('/merchant/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    await next();
  });
  routes.onError((error, context) => {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    const connectionFailure = code.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P03'].includes(code)
      || /timed?\s*out|timeout/i.test(error.message);
    console.error('Merchant request failed', code || error.name);
    return failure(context, connectionFailure ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR');
  });

  routes.get(MERCHANT_API.read.path, async (context) => {
    if (!database) return failure(context, 'SERVICE_UNAVAILABLE');
    const id = guestId(context);
    if (!id) return failure(context, 'SESSION_REQUIRED');
    const result = await readMerchant(database, id, clock);
    if ('error' in result) return failure(context, result.error);
    return context.json(result);
  });

  for (const kind of ['accept', 'reject'] as const) {
    routes.post(MERCHANT_API[kind].path, async (context) => {
      if (!database) return failure(context, 'SERVICE_UNAVAILABLE');
      const id = guestId(context);
      if (!id) return failure(context, 'SESSION_REQUIRED');
      const mediaType = context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
      if (mediaType !== 'application/json') return failure(context, 'INVALID_REQUEST');
      const body: unknown = await context.req.json().catch(() => undefined);
      if (!isMerchantOfferRequest(body)) return failure(context, 'INVALID_REQUEST');
      const action = {
        kind, offerId: body.offerId, expectedRevision: body.expectedRevision, expectedMerchantRevision: body.expectedMerchantRevision,
      };
      const result = await applyMerchantAction(database, id, action, clock);
      if ('error' in result) return failure(context, result.error);
      return context.json(result);
    });
  }
  return routes;
}
