import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { ACCOUNT_API, FARM_API } from '../../shared/farm.mts';
import type { Farm, FarmSessionResponse } from '../../shared/farm.mts';
import { MERCHANT_API, MERCHANT_ERROR_STATUS, isMerchantOfferRequest } from '../../shared/merchant.mts';
import type { MerchantErrorCode, MerchantErrorResponse } from '../../shared/merchant.mts';
import { accountLifetimeSeconds, findAccountSession, hashToken, loginAccount, logoutAccount, parseCredentials, registerAccount } from './account-store.ts';
import { crops } from './catalog.ts';
import { FarmError, parseAction } from './farm.ts';
import { checkFarmStorage, farmStorageMode, FarmStorageError, mutateFarm, readFarm, registerFarm, requestMerchant } from './farm-store.ts';
import type { MerchantAction } from './merchant.ts';

const app = new Hono();
const guestCookie = 'happyfarm_guest';
const accountCookie = 'farmverse_account';
const accountsAvailable = farmStorageMode === 'PostgreSQL';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;
let credentialWindowEndsAt = 0;
let credentialAttempts = 0;
let activeCredentialRequests = 0;

function guestId(context: Context): string | undefined {
  const id = getCookie(context, guestCookie);
  return id && uuidPattern.test(id) ? id : undefined;
}

function accountTokenHash(token: string | undefined): string | undefined {
  return accountsAvailable && token && tokenPattern.test(token) ? hashToken(token) : undefined;
}

async function farmSession(context: Context): Promise<{ id: string; tokenHash?: string } | undefined> {
  const token = getCookie(context, accountCookie);
  if (accountsAvailable && token !== undefined) {
    const tokenHash = accountTokenHash(token);
    const account = tokenHash ? await findAccountSession(tokenHash) : undefined;
    return account ? { id: account.farm_id, tokenHash } : undefined;
  }
  const id = guestId(context);
  return id ? { id } : undefined;
}

function setSessionCookie(context: Context, name: string, value: string, maxAge?: number): void {
  setCookie(context, name, value, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: new URL(context.req.url).protocol === 'https:',
    maxAge,
  });
}

function sessionResponse(farm: Farm, username?: string): FarmSessionResponse {
  return { farm, serverTime: Date.now(), accountsAvailable, account: username ? { username } : null };
}

function isJson(context: Context): boolean {
  return context.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/json';
}

const merchantErrors: Record<MerchantErrorCode, string> = {
  INVALID_REQUEST: 'Yêu cầu giao dịch không hợp lệ.',
  SESSION_REQUIRED: 'Hãy mở Farm để bắt đầu phiên chơi.',
  STALE_FARM: 'Nông trại vừa thay đổi. Hãy tải lại báo giá.',
  STALE_MERCHANT: 'Cửa hàng vừa thay đổi. Hãy tải lại báo giá.',
  OFFER_NOT_ACTIVE: 'Báo giá này đã kết thúc.',
  COOLDOWN: 'NPC đang nghỉ. Hãy đợi báo giá tiếp theo.',
  OUT_OF_BUSINESS: 'NPC đã đóng cửa. Bạn vẫn có thể bán trong Kho.',
  CROP_UNAVAILABLE: 'Kho chưa có nông sản này để bán.',
  SILO_FULL: 'Bán bớt Dâu tây hoặc Ngô trong Kho trước khi mua thêm từ NPC.',
  INSUFFICIENT_GOLD: 'Không đủ Gold để mua nông sản này.',
  MERCHANT_FULL: 'Kho NPC đã đầy.',
  MERCHANT_CROP_UNAVAILABLE: 'NPC đã hết nông sản này.',
  MERCHANT_INSUFFICIENT_GOLD: 'NPC không đủ Gold cho báo giá này.',
  INTERNAL_ERROR: 'Chưa xử lý được giao dịch.',
  SERVICE_UNAVAILABLE: 'Chưa kết nối được cửa hàng.',
};

function merchantFailure(context: Context, code: MerchantErrorCode) {
  const response: MerchantErrorResponse = { error: { code, message: merchantErrors[code] } };
  return context.json(response, MERCHANT_ERROR_STATUS[code]);
}

app.use('*', async (context, next) => {
  context.header('Cache-Control', 'no-store');
  await next();
});

app.onError((error, context) => {
  if (/^\/merchant(?:\/|$)/.test(context.req.path)) {
    if (error instanceof FarmStorageError) return merchantFailure(context, 'SERVICE_UNAVAILABLE');
    console.error('Lỗi backend FarmVerse.', error.name);
    return merchantFailure(context, 'INTERNAL_ERROR');
  }
  if (error instanceof FarmStorageError) return context.json({ error: error.message }, 503);
  if (error instanceof FarmError) return context.json({ error: error.message }, 409);
  console.error('Lỗi backend FarmVerse.', error.name);
  return context.json({ error: 'Máy chủ gặp lỗi. Hãy thử lại.' }, 500);
});

app.get('/health', async (context) => {
  try {
    await checkFarmStorage();
    return context.json({ status: 'ok' });
  } catch (error) {
    if (error instanceof FarmStorageError) return context.json({ status: 'unavailable' }, 503);
    throw error;
  }
});
app.get(FARM_API.catalog.path, (context) => context.json(crops));
app.get(FARM_API.read.path, async (context) => {
  const token = getCookie(context, accountCookie);
  const tokenHash = accountTokenHash(token);
  if (tokenHash) {
    const account = await findAccountSession(tokenHash);
    const farm = account ? await readFarm(account.farm_id, true) : undefined;
    if (farm && account) return context.json(sessionResponse(farm, account.username));
  }
  if (accountsAvailable && token !== undefined) setSessionCookie(context, accountCookie, '', 0);

  const cookie = guestId(context);
  let farm = cookie ? await readFarm(cookie) : undefined;
  if (!farm) {
    const id = randomUUID();
    farm = await registerFarm(id);
    setSessionCookie(context, guestCookie, id, accountsAvailable ? accountLifetimeSeconds : undefined);
  }
  return context.json(sessionResponse(farm));
});

app.use('/account/*', bodyLimit({
  maxSize: 2_048,
  onError: (context) => context.json({ error: 'Yêu cầu tài khoản quá dài.' }, 413),
}));

app.use('/account/*', async (context, next) => {
  if (!accountsAvailable) return context.json({ error: 'Chế độ tài khoản cần PostgreSQL.' }, 503);
  if (context.req.header('Sec-Fetch-Site') === 'cross-site') {
    return context.json({ error: 'Yêu cầu tài khoản không hợp lệ.' }, 403);
  }
  if (!isJson(context)) return context.json({ error: 'Yêu cầu tài khoản cần JSON.' }, 400);
  await next();
});

for (const type of ['register', 'login'] as const) {
  app.post(ACCOUNT_API[type].path, async (context) => {
    const credentials = parseCredentials(await context.req.json().catch(() => null));
    if (!credentials) return context.json({ error: 'Tên đăng nhập cần 3–24 chữ cái không dấu, chữ số hoặc dấu gạch dưới. Mật khẩu cần 15–128 ký tự.' }, 400);
    const tokenHash = accountTokenHash(getCookie(context, accountCookie));
    if (tokenHash && await findAccountSession(tokenHash)) {
      return context.json({ error: 'Hãy đăng xuất trước khi đổi tài khoản.' }, 409);
    }
    const guest = type === 'register' ? guestId(context) : undefined;
    if (type === 'register' && (!guest || !await readFarm(guest))) {
      return context.json({ error: 'Hãy mở Farm bằng Guest trước khi tạo tài khoản.' }, 401);
    }

    const now = Date.now();
    if (now >= credentialWindowEndsAt) {
      credentialWindowEndsAt = now + 60_000;
      credentialAttempts = 0;
    }
    if (credentialAttempts >= 40 || activeCredentialRequests >= 2) {
      return context.json({ error: 'Có quá nhiều yêu cầu. Hãy thử lại sau.' }, 429);
    }
    credentialAttempts += 1;
    activeCredentialRequests += 1;
    try {
      const result = guest ? await registerAccount(guest, credentials) : await loginAccount(credentials);
      if (!result) {
        if (type === 'register') return context.json({ error: 'Tên đã được dùng hoặc ruộng Guest vừa thay đổi.' }, 409);
        return context.json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, 401);
      }
      setSessionCookie(context, accountCookie, result.token, accountLifetimeSeconds);
      if (guest) setSessionCookie(context, guestCookie, '', 0);
      return context.json(sessionResponse(result.farm, result.username), type === 'register' ? 201 : 200);
    } finally {
      activeCredentialRequests -= 1;
    }
  });
}

app.post(ACCOUNT_API.logout.path, async (context) => {
  const tokenHash = accountTokenHash(getCookie(context, accountCookie));
  if (tokenHash) await logoutAccount(tokenHash);
  setSessionCookie(context, accountCookie, '', 0);
  return context.body(null, 204);
});

for (const type of ['buy', 'sell', 'plant', 'harvest', 'clear', 'theme'] as const) {
  app.post(FARM_API[type].path, async (context) => {
    const session = await farmSession(context);
    if (!session) return context.json({ error: 'Phiên chơi đã hết. Hãy tải lại trang.' }, 401);
    if (!isJson(context)) return context.json({ error: 'Thao tác không hợp lệ.' }, 400);
    const action = parseAction(type, await context.req.json().catch(() => null));
    if (!action) return context.json({ error: 'Thao tác không hợp lệ.' }, 400);
    const result = await mutateFarm(session.id, action, session.tokenHash);
    if (!result) return context.json({ error: 'Phiên chơi đã hết. Hãy tải lại trang.' }, 401);
    return context.json(result);
  });
}

async function merchantRequest(context: Context, action?: MerchantAction) {
  const session = await farmSession(context);
  if (!session) return merchantFailure(context, 'SESSION_REQUIRED');
  const result = await requestMerchant(session.id, session.tokenHash, action);
  return 'error' in result ? merchantFailure(context, result.error) : context.json(result);
}

app.get(MERCHANT_API.read.path, (context) => merchantRequest(context));
for (const kind of ['accept', 'reject'] as const) {
  app.post(MERCHANT_API[kind].path, async (context) => {
    if (!isJson(context)) return merchantFailure(context, 'INVALID_REQUEST');
    const body: unknown = await context.req.json().catch(() => null);
    if (!isMerchantOfferRequest(body)) return merchantFailure(context, 'INVALID_REQUEST');
    return merchantRequest(context, { ...body, kind });
  });
}

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 8092) },
  ({ address, port }) => console.log(`FarmVerse API listening at http://${address}:${port} (${farmStorageMode})`));
