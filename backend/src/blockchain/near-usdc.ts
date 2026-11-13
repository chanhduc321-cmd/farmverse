import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import { Account, actions, buildDelegateAction, encodeDelegateAction, JsonRpcProvider, PublicKey, Signature } from 'near-api-js';
import type { DelegateAction, KeyPairString } from 'near-api-js';
import type { PaymentIntent, PaymentProvider, PaymentReference, PaymentResult } from '../../../shared/payments.mts';
import { exchangeNearCode, nearAuthConfig, nearAuthIssuer, verifyNearSigningToken } from '../auth/near.ts';
import { findNearTestWallet } from '../auth/near-test-signing.ts';
import { claimTransactionRecord, createTransactionRecord, readTransactionRecord, withBlockchainLock } from './transaction-store.ts';
import { saveNearOutcome, sendLoggedNearTransaction } from './near-transaction-log.ts';
import { NEAR_USDC_ASSET, NEAR_USDC_CONTRACT } from './near-usdc-receipt.ts';
import type { NearOutcome } from './near-usdc-receipt.ts';
import {
  expireNearUsdcPayment, findNearUsdcPayment, insertNearUsdcPayment, nearUsdcWalletBusy,
  readNearUsdcPayment, saveNearUsdcAuthorization, saveNearUsdcDelegate, setNearUsdcError,
} from './near-usdc-store.ts';
import type { NearUsdcRecord } from './near-usdc-store.ts';

export const NEAR_TESTNET_RPC = 'https://test.rpc.fastnear.com';
export const NEAR_SPONSOR_ID = 'farmverse-demo-payer.testnet';
export const NEAR_NPC_ID = 'farmverse-demo-npc.testnet';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terminal = new Set(['confirmed', 'failed', 'cancelled', 'expired']);
const delegateBlockTtl = 900;

export class NearPaymentError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'NearPaymentError'; }
}

export function nearUsdcConfig() {
  const auth = nearAuthConfig();
  const sponsorKey = process.env.NEAR_TEST_SIGNING_SPONSOR_KEY;
  const npcKey = process.env.NEAR_USDC_NPC_KEY;
  if (process.env.NEAR_USDC_ENABLED !== 'true' || !auth || !sponsorKey || !npcKey) return;
  return { auth, sponsorKey, npcKey };
}

type AuthConfig = NonNullable<ReturnType<typeof nearAuthConfig>>;
type Wallet = { wallet_account_id: string; subject: string };
export interface NearUsdcOptions {
  farmId: string;
  wallet: Wallet;
  provider: JsonRpcProvider;
  sponsor: Account;
  npc: Account;
  auth: AuthConfig;
  exchangeCode?: typeof exchangeNearCode;
  verifyToken?: typeof verifyNearSigningToken;
}

export async function createNearUsdcProvider(farmId: string) {
  const config = nearUsdcConfig();
  const wallet = config ? await findNearTestWallet(farmId) : undefined;
  if (!config || !wallet) return;
  const provider = new JsonRpcProvider({ url: NEAR_TESTNET_RPC });
  return new NearUsdcPaymentProvider({
    farmId, wallet, provider, auth: config.auth,
    sponsor: new Account(NEAR_SPONSOR_ID, provider, config.sponsorKey as KeyPairString),
    npc: new Account(NEAR_NPC_ID, provider, config.npcKey as KeyPairString),
  });
}

export function paymentStateHash(state: string) { return createHash('sha256').update(state).digest('hex'); }

function fingerprint(intent: PaymentIntent) {
  return paymentStateHash(JSON.stringify({ orderId: intent.orderId, idempotencyKey: intent.idempotencyKey,
    sender: [intent.sender.providerId, intent.sender.network, intent.sender.accountId],
    receiver: [intent.receiver.providerId, intent.receiver.network, intent.receiver.accountId],
    sponsor: [intent.sponsor.providerId, intent.sponsor.network, intent.sponsor.accountId],
    amount: [intent.amount.asset.id, intent.amount.asset.symbol, intent.amount.asset.decimals, intent.amount.amountAtomic] }));
}

function successValue(outcome: NearOutcome) {
  if (typeof outcome.status === 'object' && 'SuccessValue' in outcome.status) return outcome.status.SuccessValue;
  throw new NearPaymentError('MPC_SIGNING_FAILED');
}

function approvedSignature(delegate: DelegateAction, outcome: NearOutcome) {
  const { signature } = JSON.parse(Buffer.from(successValue(outcome), 'base64').toString()) as { signature?: unknown };
  if (!Array.isArray(signature) || signature.length !== 64 || !signature.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new NearPaymentError('MPC_SIGNATURE_INVALID');
  }
  const bytes = Uint8Array.from(signature);
  const hash = createHash('sha256').update(encodeDelegateAction(delegate)).digest();
  if (!delegate.publicKey.verify(hash, bytes)) throw new NearPaymentError('MPC_SIGNATURE_INVALID');
  return new Signature({ keyType: 0, data: bytes });
}

interface Authorization { code?: string; cancelled?: boolean; verifier: string; nonce: string; state: string }
function authorization(value: unknown): Authorization {
  if (!value || typeof value !== 'object') throw new NearPaymentError('PAYMENT_APPROVAL_REQUIRED');
  const input = value as Record<string, unknown>;
  if (typeof input.state !== 'string' || !/^pay-[A-Za-z0-9_-]{43}$/.test(input.state) ||
      typeof input.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.verifier) ||
      typeof input.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.nonce) ||
      (input.code !== undefined && (typeof input.code !== 'string' || !input.code.length || input.code.length > 1024)) ||
      (input.cancelled !== undefined && typeof input.cancelled !== 'boolean')) throw new NearPaymentError('INVALID_AUTHORIZATION');
  return input as unknown as Authorization;
}

/** Server-only adapter. Its caller supplies a verified farm wallet and a server-priced order. */
export class NearUsdcPaymentProvider implements PaymentProvider {
  readonly id = 'near';
  constructor(private readonly options: NearUsdcOptions) {}

  private validate(intent: PaymentIntent) {
    const { wallet, sponsor, npc } = this.options;
    if (!uuid.test(intent.orderId) || !/^[A-Za-z0-9:_-]{1,128}$/.test(intent.idempotencyKey) ||
        intent.amount.asset.id !== NEAR_USDC_ASSET.id || intent.amount.asset.symbol !== 'USDC' || intent.amount.asset.decimals !== 6 ||
        !/^[1-9][0-9]{0,38}$/.test(intent.amount.amountAtomic) || BigInt(intent.amount.amountAtomic) >= 2n ** 128n ||
        [intent.sender, intent.receiver, intent.sponsor].some(value => value.providerId !== 'near' || value.network !== 'testnet') ||
        intent.sponsor.accountId !== sponsor.accountId || sponsor.accountId === npc.accountId ||
        !((intent.sender.accountId === npc.accountId && intent.receiver.accountId === wallet.wallet_account_id) ||
          (intent.sender.accountId === wallet.wallet_account_id && intent.receiver.accountId === npc.accountId))) {
      throw new NearPaymentError('INVALID_PAYMENT_INTENT');
    }
  }

  private key(intent: PaymentIntent) { return `near-usdc:${this.options.farmId}:${intent.idempotencyKey}`; }
  private lock<T>(sender: string, work: () => Promise<T>) { return withBlockchainLock(`near-usdc-wallet:${sender}`, work); }

  private result(record: NearUsdcRecord): PaymentResult {
    const status = record.status === 'awaiting_signature' ? 'awaiting_approval'
      : record.status === 'confirmed' ? 'confirmed'
      : record.status === 'failed' || record.status === 'cancelled' || record.status === 'expired' ? record.status : 'pending';
    const url = new URL(`/api/account/payments/near/${record.id}/authorize`, this.options.auth.callback.origin);
    return { reference: { providerId: this.id, network: 'testnet', paymentId: record.id }, status,
      transactionId: record.id, transactionHash: record.transaction_hash,
      explorerUrl: record.transaction_hash ? `https://testnet.nearblocks.io/txns/${record.transaction_hash}` : null,
      requiredAction: status === 'awaiting_approval' ? { type: 'redirect', url: url.href } : null,
      errorCode: record.error_code };
  }

  private async read(id: string) {
    if (!uuid.test(id)) throw new NearPaymentError('PAYMENT_NOT_FOUND');
    const record = await readNearUsdcPayment(id, this.options.farmId);
    if (!record) throw new NearPaymentError('PAYMENT_NOT_FOUND');
    return record;
  }

  private transferActions(record: Pick<NearUsdcRecord, 'receiver_account_id' | 'amount_atomic' | 'order_id'>) {
    return [actions.functionCall('ft_transfer', {
      receiver_id: record.receiver_account_id, amount: record.amount_atomic, memo: `farmverse:${record.order_id}`,
    }, 30_000_000_000_000n, 1n)];
  }

  private delegate(record: NearUsdcRecord) {
    if (!record.public_key || !record.delegate_nonce || !record.max_block_height) throw new NearPaymentError('DELEGATE_NOT_PREPARED');
    return buildDelegateAction({ senderId: record.sender_account_id, receiverId: NEAR_USDC_CONTRACT,
      actions: this.transferActions(record), nonce: BigInt(record.delegate_nonce), maxBlockHeight: BigInt(record.max_block_height),
      publicKey: PublicKey.fromString(record.public_key) });
  }

  private async preflight(intent: PaymentIntent) {
    const { provider } = this.options;
    const [metadata, senderStorage, receiverStorage, balance] = await Promise.all([
      provider.callFunction<{ symbol: string; decimals: number }>({ contractId: NEAR_USDC_CONTRACT, method: 'ft_metadata', args: {}, blockQuery: { finality: 'final' } }),
      provider.callFunction({ contractId: NEAR_USDC_CONTRACT, method: 'storage_balance_of', args: { account_id: intent.sender.accountId }, blockQuery: { finality: 'final' } }),
      provider.callFunction({ contractId: NEAR_USDC_CONTRACT, method: 'storage_balance_of', args: { account_id: intent.receiver.accountId }, blockQuery: { finality: 'final' } }),
      provider.callFunction<string>({ contractId: NEAR_USDC_CONTRACT, method: 'ft_balance_of', args: { account_id: intent.sender.accountId }, blockQuery: { finality: 'final' } }),
    ]);
    if (metadata?.symbol !== 'USDC' || metadata.decimals !== 6) throw new NearPaymentError('USDC_METADATA_MISMATCH');
    if (!senderStorage || !receiverStorage) throw new NearPaymentError('USDC_STORAGE_REQUIRED');
    if (typeof balance !== 'string' || !/^[0-9]+$/.test(balance) || BigInt(balance) < BigInt(intent.amount.amountAtomic)) {
      throw new NearPaymentError(intent.sender.accountId === this.options.npc.accountId ? 'NPC_INSUFFICIENT_USDC' : 'INSUFFICIENT_USDC');
    }
  }

  private async ensureUserDelegate(record: NearUsdcRecord) {
    if (record.status !== 'awaiting_signature' || record.delegate_nonce) return record;
    const publicKey = PublicKey.fromString(`ed25519:${bs58.encode(Buffer.from(record.sender_account_id, 'hex'))}`);
    const [access, block] = await Promise.all([
      this.options.provider.viewAccessKey({ accountId: record.sender_account_id, publicKey, finalityQuery: { finality: 'final' } }),
      this.options.provider.viewBlock({ finality: 'final' }),
    ]);
    await saveNearUsdcDelegate(record.id, publicKey.toString(), BigInt(access.nonce) + 1n, BigInt(block.header.height) + BigInt(delegateBlockTtl));
    return this.read(record.id);
  }

  async prepare(intent: PaymentIntent): Promise<PaymentResult> {
    this.validate(intent);
    return this.lock(intent.sender.accountId, async () => {
      const existing = await findNearUsdcPayment(this.options.farmId, this.key(intent), intent.orderId);
      if (existing) {
        if (existing.intent_hash !== fingerprint(intent)) throw new NearPaymentError('PAYMENT_REQUEST_CONFLICT');
        return this.result(await this.ensureUserDelegate(await this.reconcile(existing)));
      }
      if (await nearUsdcWalletBusy(intent.sender.accountId)) throw new NearPaymentError('WALLET_PAYMENT_PENDING');
      await this.preflight(intent);
      const userPays = intent.sender.accountId === this.options.wallet.wallet_account_id;
      const transaction = await createTransactionRecord({
        farm_id: this.options.farmId, request_key: this.key(intent), provider: 'near', network: 'testnet', operation: 'transfer',
        status: userPays ? 'awaiting_signature' : 'prepared', sender_account_id: intent.sender.accountId,
        receiver_account_id: intent.receiver.accountId, sponsor_account_id: intent.sponsor.accountId,
        asset: 'USDC', asset_decimals: 6, token_contract_id: NEAR_USDC_CONTRACT, amount_atomic: intent.amount.amountAtomic,
      });
      await insertNearUsdcPayment(transaction.id, intent.orderId, fingerprint(intent));
      return this.result(await this.ensureUserDelegate(await this.read(transaction.id)));
    });
  }

  async authorize(paymentId: string, state: string) {
    if (!/^pay-[A-Za-z0-9_-]{43}$/.test(state)) throw new NearPaymentError('INVALID_AUTHORIZATION');
    const first = await this.read(paymentId);
    return this.lock(first.sender_account_id, async () => {
      const record = await this.ensureUserDelegate(await this.reconcile(await this.read(paymentId)));
      if (record.status !== 'awaiting_signature') throw new NearPaymentError('PAYMENT_NOT_AWAITING_APPROVAL');
      await saveNearUsdcAuthorization(record.id, paymentStateHash(state));
      return encodeDelegateAction(this.delegate(record));
    });
  }

  intentFor(record: NearUsdcRecord): PaymentIntent {
    const wallet = (accountId: string) => ({ providerId: 'near', network: 'testnet', accountId });
    return { orderId: record.order_id, idempotencyKey: record.request_key.slice(`near-usdc:${this.options.farmId}:`.length),
      sender: wallet(record.sender_account_id), receiver: wallet(record.receiver_account_id), sponsor: wallet(record.sponsor_account_id),
      amount: { asset: NEAR_USDC_ASSET, amountAtomic: record.amount_atomic } };
  }

  private async relay(record: NearUsdcRecord, delegate: DelegateAction, signature: Signature) {
    const block = await this.options.provider.viewBlock({ finality: 'final' });
    if (BigInt(block.header.height) > delegate.maxBlockHeight) {
      await expireNearUsdcPayment(record.id);
      return;
    }
    await sendLoggedNearTransaction({
      sponsor: this.options.sponsor, farmId: this.options.farmId, requestKey: record.request_key, operation: 'transfer',
      receiverId: record.sender_account_id, senderId: record.sender_account_id, recipientId: record.receiver_account_id,
      amountAtomic: record.amount_atomic, asset: { symbol: 'USDC', decimals: 6, contractId: NEAR_USDC_CONTRACT },
      actions: [actions.signedDelegate({ delegateAction: delegate, signature })],
    });
  }

  private async reconcile(record: NearUsdcRecord): Promise<NearUsdcRecord> {
    if (terminal.has(record.status)) return record;
    if (record.transaction_hash) {
      try {
        const outcome = await this.options.provider.viewTransactionStatus({ txHash: record.transaction_hash,
          accountId: record.sponsor_account_id, waitUntil: 'NONE' });
        await saveNearOutcome(record, outcome);
      } catch { /* Unknown outcome retains the same payment and reservation. */ }
    } else if (record.status === 'signing') {
      const signing = await readTransactionRecord(`${record.request_key}:signature`);
      if (signing?.transaction_hash) {
        try {
          const outcome = await this.options.provider.viewTransactionStatus({ txHash: signing.transaction_hash,
            accountId: signing.sponsor_account_id, waitUntil: 'NONE' });
          await saveNearOutcome(signing, outcome);
          if (outcome.final_execution_status === 'FINAL') {
            if (typeof outcome.status === 'object' && 'Failure' in outcome.status) await setNearUsdcError(record.id, 'MPC_SIGNING_FAILED', true);
            else await this.relay(record, this.delegate(record), approvedSignature(this.delegate(record), outcome));
          }
        } catch (error) {
          if (error instanceof NearPaymentError && ['MPC_SIGNATURE_INVALID', 'MPC_SIGNING_FAILED'].includes(error.code)) {
            await setNearUsdcError(record.id, error.code, true);
          }
          // Otherwise the MPC receipt or transfer may become available on the next poll.
        }
      } else if (record.expires_at.getTime() <= Date.now()) await expireNearUsdcPayment(record.id);
    } else if (record.expires_at.getTime() <= Date.now()) await expireNearUsdcPayment(record.id);
    return this.read(record.id);
  }

  async submit(intent: PaymentIntent, approval: unknown): Promise<PaymentResult> {
    this.validate(intent);
    return this.lock(intent.sender.accountId, async () => {
      let record = await findNearUsdcPayment(this.options.farmId, this.key(intent), intent.orderId);
      if (!record) throw new NearPaymentError('PAYMENT_NOT_FOUND');
      if (record.intent_hash !== fingerprint(intent)) throw new NearPaymentError('PAYMENT_REQUEST_CONFLICT');
      record = await this.reconcile(record);
      if (terminal.has(record.status) || record.transaction_hash || record.status === 'signing') return this.result(record);
      const auth = intent.sender.accountId === this.options.npc.accountId ? undefined : authorization(approval);
      if (auth && paymentStateHash(auth.state) !== record.authorization_state_hash) throw new NearPaymentError('INVALID_AUTHORIZATION');
      try {
        if (intent.sender.accountId === this.options.npc.accountId) {
          await this.preflight(intent);
          const { signedDelegate } = await this.options.npc.createSignedMetaTransaction({ receiverId: NEAR_USDC_CONTRACT,
            actions: this.transferActions(record), blockHeightTtl: delegateBlockTtl });
          if (!record.delegate_nonce) await saveNearUsdcDelegate(record.id, signedDelegate.delegateAction.publicKey.toString(),
            signedDelegate.delegateAction.nonce, signedDelegate.delegateAction.maxBlockHeight);
          await this.relay(record, signedDelegate.delegateAction, signedDelegate.signature);
        } else {
          const status = auth!.cancelled ? 'cancelled' : auth!.code ? 'signing' : 'failed';
          if (!await claimTransactionRecord(record.request_key, this.options.farmId, status)) return this.result(await this.read(record.id));
          if (status !== 'signing') return this.result(await this.read(record.id));
          const { subject, accessToken } = await (this.options.exchangeCode ?? exchangeNearCode)(this.options.auth, auth!.code!, auth!.verifier, auth!.nonce);
          if (subject !== this.options.wallet.subject || typeof accessToken !== 'string') throw new NearPaymentError('SIGNING_IDENTITY_MISMATCH');
          const claims = await (this.options.verifyToken ?? verifyNearSigningToken)(accessToken);
          const delegate = this.delegate(record);
          const payload = Array.from(encodeDelegateAction(delegate));
          if (claims.sub !== subject || !Array.isArray(claims.fatxn) || claims.fatxn.length !== payload.length ||
              !payload.every((byte, i) => byte === (claims.fatxn as unknown[])[i])) throw new NearPaymentError('SIGNING_PAYLOAD_MISMATCH');
          const outcome = await sendLoggedNearTransaction({
            sponsor: this.options.sponsor, farmId: this.options.farmId, requestKey: `${record.request_key}:signature`,
            operation: 'signature', amountAtomic: '1', receiverId: 'fast-auth.testnet',
            actions: [actions.functionCall('sign', { guard_id: `jwt#${nearAuthIssuer}`, verify_payload: accessToken,
              sign_payload: payload, algorithm: 'eddsa' }, 300_000_000_000_000n, 1n)],
          });
          await this.relay(record, delegate, approvedSignature(delegate, outcome));
        }
      } catch (error) {
        const signing = await readTransactionRecord(`${record.request_key}:signature`);
        const latest = await this.read(record.id);
        await setNearUsdcError(record.id, error instanceof NearPaymentError ? error.code : 'PAYMENT_UNCONFIRMED',
          !latest.transaction_hash && !signing?.transaction_hash);
      }
      return this.result(await this.read(record.id));
    });
  }

  async getStatus(reference: PaymentReference): Promise<PaymentResult> {
    if (reference.providerId !== this.id || reference.network !== 'testnet') throw new NearPaymentError('PAYMENT_NOT_FOUND');
    const record = await this.read(reference.paymentId);
    return this.lock(record.sender_account_id, async () => this.result(await this.reconcile(await this.read(record.id))));
  }
}
