import { createHash, randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import { Account, actions, buildDelegateAction, encodeDelegateAction, JsonRpcProvider, PublicKey, Signature } from 'near-api-js';
import type { KeyPairString } from 'near-api-js';
import { AccessKeyDoesNotExistError, AccountDoesNotExistError } from 'near-api-js/rpc-errors';
import { queryFarmDatabase } from '../farm-store.ts';
import { createTransactionRecord, withBlockchainLock } from '../blockchain/transaction-store.ts';
import { readNearTransactionHistory, sendLoggedNearTransaction } from '../blockchain/near-transaction-log.ts';
import { exchangeNearCode, nearAuthConfig, nearAuthIssuer, verifyNearSigningToken } from './near.ts';

const sponsorId = 'farmverse-demo-payer.testnet';
const npcId = 'farmverse-demo-npc.testnet';
const contractId = 'fast-auth.testnet';
const rpcUrl = 'https://test.rpc.fastnear.com';
const provider = new JsonRpcProvider({ url: rpcUrl });

export function nearSigningDemoConfig() {
  const auth = nearAuthConfig();
  const secret = process.env.NEAR_TEST_SIGNING_SPONSOR_KEY;
  if (auth?.callback.href !== 'http://localhost:3000/' || !secret) return;
  return { auth, secret };
}

type DemoConfig = NonNullable<ReturnType<typeof nearSigningDemoConfig>>;

export async function findNearTestWallet(farmId: string) {
  const { rows: [wallet] } = await queryFarmDatabase<{ farm_id: string; subject: string; wallet_account_id: string }>(`
    SELECT farm_id, subject, wallet_account_id FROM farm_social_identities
    WHERE farm_id = $1 AND issuer = $2 AND wallet_network = 'testnet'
  `, [farmId, nearAuthIssuer]);
  if (wallet && /^[a-f0-9]{64}$/.test(wallet.wallet_account_id)) return wallet;
}

type Wallet = NonNullable<Awaited<ReturnType<typeof findNearTestWallet>>>;

function walletPublicKey(wallet: Wallet) {
  return PublicKey.fromString(`ed25519:${bs58.encode(Buffer.from(wallet.wallet_account_id, 'hex'))}`);
}

function sponsorAccount(config: DemoConfig) {
  return new Account(sponsorId, provider, config.secret as KeyPairString);
}

export async function ensureNearTestWallet(config: DemoConfig, wallet: Wallet) {
  const accountId = wallet.wallet_account_id;
  const getAccessKey = () => provider.viewAccessKey({
    accountId, publicKey: walletPublicKey(wallet), finalityQuery: { finality: 'final' },
  });
  try {
    return await getAccessKey();
  } catch (error) {
    if (!(error instanceof AccessKeyDoesNotExistError || error instanceof AccountDoesNotExistError)) throw error;
  }

  return withBlockchainLock(`near-wallet:${accountId}`, async () => {
    // Recheck under the wallet lock so concurrent requests do not submit two activations.
    try {
      await provider.viewAccount({ accountId, blockQuery: { finality: 'final' } });
    } catch (error) {
      if (!(error instanceof AccountDoesNotExistError)) throw error;
      const receipt = await sendLoggedNearTransaction({
        sponsor: sponsorAccount(config), farmId: wallet.farm_id, requestKey: `activation:${randomUUID()}`,
        operation: 'account_activation', amountAtomic: '0',
        receiverId: accountId,
        actions: [actions.transfer(0n)],
      });
      successValue(receipt.status);
    }
    return getAccessKey();
  });
}

function testDelegate(wallet: Wallet, nonce: bigint, maxBlockHeight: bigint) {
  return buildDelegateAction({
    senderId: wallet.wallet_account_id,
    receiverId: npcId,
    actions: [actions.transfer(0n)],
    nonce, maxBlockHeight,
    publicKey: walletPublicKey(wallet),
  });
}

export async function prepareNearTestSignature(config: DemoConfig, wallet: Wallet, requestKey: string) {
  const access = await ensureNearTestWallet(config, wallet);
  const block = await provider.viewBlock({ finality: 'final' });
  const nonce = BigInt(access.nonce) + 1n;
  const maxBlockHeight = BigInt(block.header.height) + 300n;
  await createTransactionRecord({
    farm_id: wallet.farm_id, request_key: requestKey, provider: 'near', network: 'testnet',
    operation: 'transfer', status: 'awaiting_signature', sender_account_id: wallet.wallet_account_id,
    receiver_account_id: npcId, sponsor_account_id: sponsorId, asset: 'NEAR', amount_atomic: '0',
  });
  return { nonce, maxBlockHeight, payload: encodeDelegateAction(testDelegate(wallet, nonce, maxBlockHeight)) };
}

export function nearTestTransactionHistory(farmId: string, limit: number) {
  return readNearTransactionHistory(provider, farmId, limit);
}

function successValue(status: unknown): string {
  if (status && typeof status === 'object' && 'SuccessValue' in status && typeof status.SuccessValue === 'string') return status.SuccessValue;
  throw new Error('NEAR transaction did not succeed');
}

export async function finishNearTestSignature(
  config: DemoConfig, wallet: Wallet, code: string, verifier: string, nonce: string, actionNonce: bigint, maxBlockHeight: bigint,
  requestKey: string,
) {
  const { subject, accessToken } = await exchangeNearCode(config.auth, code, verifier, nonce);
  if (subject !== wallet.subject || typeof accessToken !== 'string') throw new Error('NEAR signing identity mismatch');
  const claims = await verifyNearSigningToken(accessToken);
  const delegate = testDelegate(wallet, actionNonce, maxBlockHeight);
  const payload = Array.from(encodeDelegateAction(delegate));
  const approved = claims.fatxn;
  if (claims.sub !== subject || !Array.isArray(approved) || approved.length !== payload.length ||
      !payload.every((byte, index) => byte === approved[index])) {
    throw new Error('NEAR signing payload mismatch');
  }

  const sponsor = sponsorAccount(config);
  const sign = await sendLoggedNearTransaction({
    sponsor, farmId: wallet.farm_id, requestKey: `${requestKey}:signature`, operation: 'signature', amountAtomic: '1',
    receiverId: contractId,
    actions: [actions.functionCall('sign', {
      guard_id: `jwt#${nearAuthIssuer}`, verify_payload: accessToken, sign_payload: payload, algorithm: 'eddsa',
    }, 300_000_000_000_000n, 1n)],
  });
  const { signature } = JSON.parse(Buffer.from(successValue(sign.status), 'base64').toString()) as { signature?: unknown };
  if (!Array.isArray(signature) || signature.length !== 64 || !signature.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error('NEAR MPC signature missing');
  }
  const bytes = Uint8Array.from(signature);
  const hash = createHash('sha256').update(Uint8Array.from(payload)).digest();
  if (!delegate.publicKey.verify(hash, bytes)) throw new Error('NEAR MPC signature mismatch');

  const transaction = await sendLoggedNearTransaction({
    sponsor, farmId: wallet.farm_id, requestKey, operation: 'transfer', amountAtomic: '0',
    receiverId: delegate.senderId,
    recipientId: delegate.receiverId, senderId: delegate.senderId,
    actions: [actions.signedDelegate({ delegateAction: delegate, signature: new Signature({ keyType: 0, data: bytes }) })],
  });
  successValue(transaction.status);
  return transaction.transaction.hash;
}
