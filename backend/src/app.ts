import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { html } from 'hono/html';
import { ACCOUNT_API, FARM_API } from '../../shared/farm.mts';
import type { Farm, FarmSessionResponse } from '../../shared/farm.mts';
import { SOCIAL_AUTH_API } from '../../shared/social-auth.mts';
import { BLOCKCHAIN_API } from '../../shared/blockchain.mts';
import type { SocialAuthResult } from '../../shared/social-auth.mts';
import { MERCHANT_API, MERCHANT_ERROR_STATUS, isMerchantOfferRequest } from '../../shared/merchant.mts';
import type { MerchantErrorCode, MerchantErrorResponse } from '../../shared/merchant.mts';
import { accountLifetimeSeconds, findAccountSession, hashToken, loginAccount, logoutAccount, parseCredentials, registerAccount } from './account-store.ts';
import { activityRoutes } from './activity-routes.ts';
import { authenticateNear, nearAuthConfig, nearAuthorizationUrl } from './auth/near.ts';
import { findNearTestWallet, finishNearTestSignature, nearSigningDemoConfig, nearTestTransactionHistory, prepareNearTestSignature } from './auth/near-test-signing.ts';
import { signInSocial } from './auth/social-store.ts';
import { completeNearPayment, nearPaymentRoutes } from './blockchain/near-payment-routes.ts';
import { claimTransactionRecord, readTransactionRecord, setTransactionError } from './blockchain/transaction-store.ts';
import { tradeDemoRoutes } from './trade-demo/routes.ts';
import { reconcileTradeDemoCallback } from './trade-demo/service.ts';
import type { TransactionRecord } from './blockchain/transaction-store.ts';
import { crops } from './catalog.ts';
import { communityRoutes } from './community-routes.ts';
import { FarmError, parseAction, parseBatch } from './farm.ts';
import { checkFarmStorage, farmStorageMode, FarmStorageError, mutateFarm, mutateFarmBatch, readFarm, registerFarm, requestMerchant } from './farm-store.ts';
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

function farmSessionKey(kind: 'account' | 'guest', identity: string): string {
  return createHash('sha256').update(`${kind}:${identity}`).digest('hex');
}

function sessionResponse(farm: Farm, sessionKey: string, username?: string): FarmSessionResponse {
  return { farm, serverTime: Date.now(), accountsAvailable, account: username ? { username } : null, sessionKey };
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
    if (farm && account) return context.json(sessionResponse(farm, farmSessionKey('account', tokenHash), account.username));
  }
  if (accountsAvailable && token !== undefined) setSessionCookie(context, accountCookie, '', 0);

  const cookie = guestId(context);
  if (cookie) {
    const farm = await readFarm(cookie);
    if (farm) return context.json(sessionResponse(farm, farmSessionKey('guest', cookie)));
  }
  const id = randomUUID();
  const farm = await registerFarm(id);
  setSessionCookie(context, guestCookie, id, accountsAvailable ? accountLifetimeSeconds : undefined);
  return context.json(sessionResponse(farm, farmSessionKey('guest', id)));
});

const nearFlowCookie = 'farmverse_near_login';
const nearTestCookie = 'farmverse_near_test_signing';
const nearFlowPattern = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;
const nearTestPattern = /^(test-[A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.([0-9]{1,20})\.([0-9]{1,20})$/;

function nearTestPage(context: Context, message: string, hash?: string) {
  context.header('Referrer-Policy', 'no-referrer');
  return context.html(html`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Thử ký NEAR testnet</title><main><h1>Thử ký NEAR testnet</h1><p>${message}</p>
    ${hash ? html`<p><a href="https://explorer.testnet.near.org/transactions/${hash}">Xem giao dịch trên NEAR Explorer</a></p>` : ''}
    <p><a href="/">Về nông trại</a></p></main></html>`);
}

function nearTestRecordedResult(context: Context, record: TransactionRecord) {
  if (record.status === 'confirmed') return nearTestPage(context, 'Giao dịch 0 NEAR đã xác nhận trên testnet. Ví demo FarmVerse đã trả phí.', record.transaction_hash ?? undefined);
  if (record.status === 'failed') return nearTestPage(context, 'Lượt thử ký đã thất bại. Chi tiết đã được lưu vào lịch sử giao dịch.');
  if (record.status === 'cancelled') return nearTestPage(context, 'Yêu cầu ký đã được hủy.');
  if (record.status === 'expired') return nearTestPage(context, 'Yêu cầu ký đã hết hạn. Hãy bắt đầu lượt mới.');
  return nearTestPage(context, 'Giao dịch đang chờ xác nhận. Xem lại trong lịch sử giao dịch.', record.transaction_hash ?? undefined);
}

app.get(SOCIAL_AUTH_API.nearTest.path, async (context) => {
  const config = nearSigningDemoConfig();
  if (!config) return context.notFound();
  if (context.req.header('Sec-Fetch-Site') === 'cross-site') return nearTestPage(context, 'Hãy mở đường dẫn trực tiếp từ localhost.');
  const session = await farmSession(context);
  const wallet = session?.tokenHash ? await findNearTestWallet(session.id) : undefined;
  if (!wallet) return nearTestPage(context, 'Hãy đăng nhập FarmVerse bằng Google trước khi thử ký.');

  try {
    const state = `test-${randomBytes(32).toString('base64url')}`;
    const action = await prepareNearTestSignature(config, wallet, `near-test:${hashToken(state)}`);
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    setCookie(context, nearTestCookie, `${state}.${nonce}.${verifier}.${action.nonce}.${action.maxBlockHeight}`, {
      httpOnly: true, sameSite: 'Lax', path: config.auth.callback.pathname, maxAge: 300,
    });
    return context.redirect(nearAuthorizationUrl(config.auth, state, nonce, challenge, action.payload).href, 303);
  } catch (error) {
    console.warn('Chuẩn bị ký NEAR testnet thất bại.', error instanceof Error ? error.name : 'UnknownError');
    return nearTestPage(context, 'Chưa chuẩn bị được giao dịch testnet. Hãy thử lại.');
  }
});

async function completeNearTest(context: Context, state: string) {
  const config = nearSigningDemoConfig();
  if (!config) return context.notFound();
  const session = await farmSession(context);
  const wallet = session?.tokenHash ? await findNearTestWallet(session.id) : undefined;
  if (!wallet) return nearTestPage(context, 'Phiên FarmVerse đã hết hạn. Hãy đăng nhập lại bằng Google.');
  const requestKey = `near-test:${hashToken(state)}`;
  const record = await readTransactionRecord(requestKey);
  if (record && record.farm_id !== wallet.farm_id) return nearTestPage(context, 'Phiên thử ký không khớp.');
  if (record && record.status !== 'awaiting_signature') return nearTestRecordedResult(context, record);
  const flow = nearTestPattern.exec(getCookie(context, nearTestCookie) ?? '');
  if (!flow || flow[1] !== state) return nearTestPage(context, 'Phiên thử ký đã hết hạn hoặc không khớp.');
  setCookie(context, nearTestCookie, '', { httpOnly: true, sameSite: 'Lax', path: config.auth.callback.pathname, maxAge: 0 });
  const code = context.req.query('code');
  const cancelled = Boolean(context.req.query('error'));
  const validCode = Boolean(code && code.length <= 1024);
  const claimed = await claimTransactionRecord(requestKey, wallet.farm_id, cancelled ? 'cancelled' : validCode ? 'signing' : 'failed');
  if (!claimed) return nearTestPage(context, 'Lượt thử ký đã được xử lý. Xem lại trong lịch sử giao dịch.');
  if (cancelled || !validCode) return nearTestRecordedResult(context, claimed);

  try {
    const hash = await finishNearTestSignature(config, wallet, code!, flow[3], flow[2], BigInt(flow[4]), BigInt(flow[5]), requestKey);
    return nearTestPage(context, 'Giao dịch 0 NEAR đã xác nhận trên testnet. Ví demo FarmVerse đã trả phí.', hash);
  } catch (error) {
    await setTransactionError(claimed.id, 'SIGNING_UNCONFIRMED');
    console.warn('Ký NEAR testnet thất bại.', error instanceof Error ? error.name : 'UnknownError');
    return nearTestPage(context, 'Chưa xác nhận được giao dịch trên NEAR testnet.');
  }
}

app.get(BLOCKCHAIN_API.history.path, async context => {
  const session = await farmSession(context);
  if (!session?.tokenHash) return context.json({ error: 'Hãy đăng nhập để xem lịch sử giao dịch.' }, 401);
  const limit = context.req.query('limit') ?? '25';
  if (!/^(?:[1-9]|[1-4][0-9]|50)$/.test(limit)) return context.json({ error: 'Giới hạn phải từ 1 đến 50.' }, 400);
  return context.json(await nearTestTransactionHistory(session.id, Number(limit)));
});

function returnFromNear(context: Context, result: SocialAuthResult) {
  context.header('Referrer-Policy', 'no-referrer');
  return context.redirect(`/?${SOCIAL_AUTH_API.resultParam}=${result}`, 303);
}

app.get(SOCIAL_AUTH_API.near.path, (context) => {
  const config = nearAuthConfig();
  if (!config) return returnFromNear(context, 'unavailable');
  if (context.req.header('Sec-Fetch-Site') === 'cross-site') return returnFromNear(context, 'failed');
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  setCookie(context, nearFlowCookie, `${state}.${nonce}.${verifier}`, {
    httpOnly: true, sameSite: 'Lax', secure: config.callback.protocol === 'https:',
    path: config.callback.pathname, maxAge: 600,
  });
  return context.redirect(nearAuthorizationUrl(config, state, nonce, challenge).href, 303);
});

app.get(SOCIAL_AUTH_API.near.callback, async (context) => {
  const state = context.req.query('state');
  if (state?.startsWith('test-')) return completeNearTest(context, state);
  if (state?.startsWith('pay-')) {
    const session = await farmSession(context);
    return completeNearPayment(context, session?.tokenHash ? session.id : undefined, undefined, reconcileTradeDemoCallback);
  }
  const config = nearAuthConfig();
  if (!config) return returnFromNear(context, 'unavailable');
  const flow = nearFlowPattern.exec(getCookie(context, nearFlowCookie) ?? '');
  const code = context.req.query('code');
  if (!flow || flow[1] !== state) return returnFromNear(context, 'failed');
  const secure = config.callback.protocol === 'https:';
  setCookie(context, nearFlowCookie, '', { httpOnly: true, sameSite: 'Lax', secure, path: config.callback.pathname, maxAge: 0 });
  if (!code || code.length > 1024 || context.req.query('error')) return returnFromNear(context, 'failed');
  try {
    const identity = await authenticateNear(config, code, flow[3], flow[2]);
    const session = await signInSocial(identity, guestId(context));
    if (!session) return returnFromNear(context, 'failed');
    setCookie(context, accountCookie, session.token, { httpOnly: true, sameSite: 'Lax', secure, path: '/', maxAge: accountLifetimeSeconds });
    if (session.claimedGuest) setSessionCookie(context, guestCookie, '', 0);
    return returnFromNear(context, 'success');
  } catch (error) {
    console.warn('Đăng nhập NEAR Auth thất bại.', error instanceof Error ? error.name : 'UnknownError');
    return returnFromNear(context, 'failed');
  }
});

app.route('/', nearPaymentRoutes(async context => {
  const session = await farmSession(context);
  return session?.tokenHash ? session.id : undefined;
}));

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
      const sessionKey = farmSessionKey('account', hashToken(result.token));
      return context.json(sessionResponse(result.farm, sessionKey, result.username), type === 'register' ? 201 : 200);
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

app.post(FARM_API.batch.path, bodyLimit({
  maxSize: 4_096,
  onError: (context) => context.json({ error: 'Yêu cầu đồng bộ quá dài.' }, 413),
}), async (context) => {
  if (!isJson(context)) return context.json({ error: 'Thao tác không hợp lệ.' }, 400);
  const body = await context.req.json().catch(() => null) as { sessionKey?: unknown } | null;
  const batch = parseBatch(body);
  if (!batch || typeof body?.sessionKey !== 'string' || !tokenPattern.test(body.sessionKey)) {
    return context.json({ error: 'Thao tác không hợp lệ.' }, 400);
  }
  const session = await farmSession(context);
  if (!session) return context.json({ error: 'Phiên chơi đã hết. Hãy tải lại trang.' }, 401);
  const sessionKey = session.tokenHash ? farmSessionKey('account', session.tokenHash) : farmSessionKey('guest', session.id);
  if (body.sessionKey !== sessionKey) {
    return context.json({ error: 'Phiên chơi đã thay đổi. Hãy thử lại.' }, 401);
  }
  const result = await mutateFarmBatch(session.id, batch, session.tokenHash);
  if (!result) return context.json({ error: 'Phiên chơi đã hết. Hãy tải lại trang.' }, 401);
  return context.json(result);
});

for (const type of ['buy', 'buyFertilizer', 'sell', 'plant', 'harvest', 'clear', 'water', 'fertilize', 'theme', 'claimMission', 'checkIn', 'selectPet'] as const) {
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

app.route('/', communityRoutes(async (context) => {
  const session = await farmSession(context);
  if (session?.tokenHash) return { id: session.id, tokenHash: session.tokenHash };
}));

app.route('/', tradeDemoRoutes(async (context) => {
  const session = await farmSession(context);
  return session?.tokenHash ? session.id : undefined;
}));

app.route('/', activityRoutes(async (context) => {
  const tokenHash = accountTokenHash(getCookie(context, accountCookie));
  const account = tokenHash ? await findAccountSession(tokenHash) : undefined;
  if (account) return { id: account.farm_id, username: account.username };
}));

export default app;
