import bs58 from 'bs58';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SOCIAL_AUTH_API } from '../../../shared/social-auth.mts';

export const nearAuthIssuer = 'https://login.testnet.fast-auth.com/';
const issuer = nearAuthIssuer;
const sharedClientId = 'np8paqIpMWmNbzT4xAvOOapZBjsOpptl';
const callbackPath = `/api${SOCIAL_AUTH_API.near.callback}`;
const localDemoCallback = 'http://localhost:3000/';
const jwks = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer));

export function nearAuthConfig() {
  const configured = process.env.NEAR_AUTH_CALLBACK_URL;
  if (!configured) return;
  const callback = URL.parse(configured);
  const isLoopback = callback?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(callback.hostname);
  if (!callback || (callback.protocol !== 'https:' && !isLoopback) || callback.username || callback.password ||
      callback.search || callback.hash || (callback.pathname !== callbackPath && callback.href !== localDemoCallback)) return;
  return { callback, clientId: process.env.NEAR_AUTH_CLIENT_ID || sharedClientId };
}

export async function exchangeNearCode(
  config: NonNullable<ReturnType<typeof nearAuthConfig>>, code: string, verifier: string, nonce: string,
) {
  const token = await fetch(new URL('oauth/token', issuer), {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: config.clientId, code,
      code_verifier: verifier, redirect_uri: config.callback.href,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!token.ok) throw new Error('NEAR Auth token exchange failed');
  const { id_token: idToken, access_token: accessToken } = await token.json() as { id_token?: unknown; access_token?: unknown };
  if (typeof idToken !== 'string') throw new Error('NEAR Auth ID token missing');
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer, audience: config.clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
  });
  if (payload.nonce !== nonce || !payload.sub?.startsWith('google-oauth2|')) throw new Error('NEAR Auth identity mismatch');
  return { subject: payload.sub, accessToken };
}

export async function verifyNearSigningToken(token: string) {
  return (await jwtVerify(token, jwks, {
    issuer, audience: 'auth0.jwt.fast-auth.testnet', algorithms: ['RS256'], requiredClaims: ['sub', 'exp'],
  })).payload;
}

export async function authenticateNear(
  config: NonNullable<ReturnType<typeof nearAuthConfig>>, code: string, verifier: string, nonce: string,
) {
  const { subject } = await exchangeNearCode(config, code, verifier, nonce);

  // Derive the same Ed25519 key as the official NEAR Auth Browser SDK.
  const args = { path: `jwt#${issuer}#${subject}`, predecessor: 'fast-auth.testnet', domain_id: 1 };
  const rpc = await fetch('https://test.rpc.fastnear.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'near-auth', method: 'query', params: {
      request_type: 'call_function', finality: 'final', account_id: 'v1.signer-prod.testnet',
      method_name: 'derived_public_key', args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!rpc.ok) throw new Error('NEAR RPC unavailable');
  const { result } = await rpc.json() as { result?: { result?: number[] } };
  const publicKey: unknown = JSON.parse(Buffer.from(result?.result ?? []).toString('utf8'));
  if (typeof publicKey !== 'string' || !publicKey.startsWith('ed25519:')) throw new Error('Invalid NEAR public key');
  const bytes = bs58.decode(publicKey.slice('ed25519:'.length));
  if (bytes.length !== 32) throw new Error('Invalid NEAR public key length');
  return { issuer, subject, network: 'testnet', walletId: Buffer.from(bytes).toString('hex') };
}

export function nearAuthorizationUrl(config: NonNullable<ReturnType<typeof nearAuthConfig>>, state: string, nonce: string, challenge: string, delegateAction?: Uint8Array) {
  const url = new URL('authorize', issuer);
  url.search = new URLSearchParams({
    client_id: config.clientId, response_type: 'code', redirect_uri: config.callback.href,
    scope: 'openid', state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
    connection: 'google-oauth2', prompt: 'login',
  }).toString();
  if (delegateAction) {
    url.searchParams.set('audience', 'auth0.jwt.fast-auth.testnet');
    url.searchParams.set('scope', 'openid transaction:sign');
    url.searchParams.set('delegateAction', delegateAction.join(','));
    url.searchParams.delete('prompt');
  }
  return url;
}
