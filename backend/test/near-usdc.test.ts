import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Hono } from 'hono';
import { buildDelegateAction, createTransaction, KeyPair, KeyPairSigner } from 'near-api-js';
import type { Account, DelegateAction, JsonRpcProvider, SignedTransaction } from 'near-api-js';
import bs58 from 'bs58';
import type { PaymentIntent } from '../../shared/payments.mts';
import { signInSocial } from '../src/auth/social-store.ts';
import { queryFarmDatabase } from '../src/farm-store.ts';
import { nearPaymentRoutes, completeNearPayment } from '../src/blockchain/near-payment-routes.ts';
import { NEAR_USDC_ASSET, NEAR_USDC_CONTRACT, verifyNearUsdcOutcome } from '../src/blockchain/near-usdc-receipt.ts';
import type { NearOutcome } from '../src/blockchain/near-usdc-receipt.ts';
import { NearUsdcPaymentProvider } from '../src/blockchain/near-usdc.ts';
import { readNearUsdcPayment } from '../src/blockchain/near-usdc-store.ts';
import { readNearTransactionHistory } from '../src/blockchain/near-transaction-log.ts';
import { fundNearUsdcBuyer } from '../src/blockchain/near-usdc-setup.ts';
import type { TransactionRecord } from '../src/blockchain/transaction-store.ts';

const identity = (accountId: string) => ({ providerId: 'near', network: 'testnet', accountId });

function transferOutcome(hash: string, sponsor: string, sender: string, receiver: string, amount: string): NearOutcome {
  const leaf = (executor_id: string, receipt_ids: string[], logs: string[] = []) => ({
    executor_id, receipt_ids, logs, status: { SuccessValue: '' }, gas_burnt: 10, tokens_burnt: '20',
  });
  return {
    final_execution_status: 'FINAL', status: { SuccessValue: '' },
    transaction: { hash, signer_id: sponsor, receiver_id: sender, actions: [{ Delegate: { delegate_action: {
      sender_id: sender, receiver_id: NEAR_USDC_CONTRACT,
      actions: [{ FunctionCall: { method_name: 'ft_transfer', deposit: '1',
        args: Buffer.from(JSON.stringify({ receiver_id: receiver, amount })).toString('base64') } }],
    } } }] },
    transaction_outcome: { id: hash, outcome: leaf(sponsor, ['delegate']) },
    receipts_outcome: [
      { id: 'delegate', outcome: leaf(sender, ['token']) },
      { id: 'token', outcome: leaf(NEAR_USDC_CONTRACT, ['refund'], [`EVENT_JSON:${JSON.stringify({
        standard: 'nep141', version: '1.0.0', event: 'ft_transfer',
        data: [{ old_owner_id: sender, new_owner_id: receiver, amount }],
      })}`]) },
      { id: 'refund', outcome: leaf(sponsor, []) },
    ],
  } as unknown as NearOutcome;
}

test('USDC verification requires the exact delegate and a successful reachable token event', () => {
  const record = { network: 'testnet', asset: 'USDC', asset_decimals: 6, token_contract_id: NEAR_USDC_CONTRACT,
    transaction_hash: 'hash', sponsor_account_id: 'sponsor.testnet', sender_account_id: 'sender.testnet',
    receiver_account_id: 'receiver.testnet', amount_atomic: '1500000' } as TransactionRecord;
  const receipt = transferOutcome('hash', 'sponsor.testnet', 'sender.testnet', 'receiver.testnet', '1500000');
  assert.equal(verifyNearUsdcOutcome(record, receipt), 'confirmed');
  for (const override of [{ receiver_account_id: 'attacker.testnet' }, { amount_atomic: '1' },
    { sender_account_id: 'attacker.testnet' }, { token_contract_id: 'fake-usdc.testnet' }, { sponsor_account_id: 'other.testnet' }]) {
    assert.throws(() => verifyNearUsdcOutcome({ ...record, ...override }, receipt));
  }
  const pending = structuredClone(receipt);
  pending.final_execution_status = 'EXECUTED_OPTIMISTIC';
  assert.equal(verifyNearUsdcOutcome(record, pending), 'pending');
  const failed = structuredClone(receipt);
  failed.receipts_outcome[1].outcome.status = { Failure: { ActionError: {} } } as never;
  assert.equal(verifyNearUsdcOutcome(record, failed), 'failed');
  const missing = structuredClone(receipt);
  missing.receipts_outcome[1].outcome.logs = [];
  assert.equal(verifyNearUsdcOutcome(record, missing), 'pending');
  const detached = structuredClone(receipt);
  detached.receipts_outcome[0].outcome.receipt_ids = ['refund'];
  assert.equal(verifyNearUsdcOutcome(record, detached), 'pending');
  const spoofed = structuredClone(receipt);
  spoofed.receipts_outcome[1].outcome.executor_id = 'fake-token.testnet';
  assert.equal(verifyNearUsdcOutcome(record, spoofed), 'pending');
  const duplicate = structuredClone(receipt);
  duplicate.receipts_outcome[1].outcome.logs.push(duplicate.receipts_outcome[1].outcome.logs[0]);
  assert.equal(verifyNearUsdcOutcome(record, duplicate), 'pending');
});

async function harness() {
  const subject = randomUUID();
  const userKey = KeyPair.fromRandom('ed25519');
  const npcKey = KeyPair.fromRandom('ed25519');
  const sponsorKey = KeyPair.fromRandom('ed25519');
  const accountId = Buffer.from(userKey.getPublicKey().data).toString('hex');
  await signInSocial({ issuer: 'https://usdc-test.invalid/', subject, walletId: accountId, network: 'testnet' });
  const { rows: [row] } = await queryFarmDatabase<{ farm_id: string }>(
    'SELECT farm_id FROM farm_social_identities WHERE issuer=$1 AND subject=$2', ['https://usdc-test.invalid/', subject],
  );
  const farmId = row.farm_id;
  const receipts = new Map<string, NearOutcome>();
  const auth = { callback: new URL('http://localhost:3000/'), clientId: 'fixture-client' };
  const state = `pay-${'s'.repeat(43)}`;
  const approval = { state, verifier: 'v'.repeat(43), nonce: 'n'.repeat(43), code: 'fixture-code' };
  const token = 'fixture-sensitive-google-access-token';
  let approvedPayload: unknown = [];
  let claimsSubject: string = subject;
  let balance = '5000000';
  const balances = new Map<string, string>();
  let throwsAfterBroadcast = false;
  let viewUnavailable = false;
  let sent = 0;
  let signatures = 0;
  let exchanges = 0;
  let outerNonce = 1n;
  const provider = {
    async callFunction({ method, args }: { method: string; args: { account_id?: string } }) {
      if (method === 'ft_metadata') return { symbol: 'USDC', decimals: 6 };
      if (method === 'ft_balance_of') return balances.get(args.account_id!) ?? balance;
      if (method === 'storage_balance_of') return { total: '1250000000000000000000', available: '0' };
      throw new Error('Unexpected view');
    },
    async viewAccessKey() { return { nonce: 10n }; },
    async viewBlock() { return { header: { height: 100 } }; },
    async viewTransactionStatus({ txHash }: { txHash: string }) {
      if (viewUnavailable || !receipts.has(txHash)) throw new Error('Temporarily unavailable');
      return receipts.get(txHash)!;
    },
    async sendTransactionUntil(signed: SignedTransaction) {
      const transaction = signed.transaction;
      const hash = bs58.encode(createHash('sha256').update(transaction.encode()).digest());
      const { rows: [logged] } = await queryFarmDatabase<TransactionRecord>('SELECT * FROM farm_blockchain_transactions WHERE transaction_hash=$1', [hash]);
      assert.equal(logged.status, 'submitted');
      const delegate = transaction.actions[0].signedDelegate?.delegateAction;
      let receipt: NearOutcome;
      if (delegate) {
        sent++;
        const call = delegate.actions[0].functionCall;
        assert.ok(call);
        assert.equal(call.methodName, 'ft_transfer');
        assert.equal(String(call.deposit), '1');
        const args = JSON.parse(Buffer.from(call.args).toString());
        assert.equal(logged.asset, 'USDC');
        assert.equal(logged.asset_decimals, 6);
        assert.equal(logged.token_contract_id, NEAR_USDC_CONTRACT);
        receipt = transferOutcome(hash, 'sponsor.testnet', delegate.senderId, args.receiver_id, args.amount);
      } else {
        signatures++;
        const args = JSON.parse(Buffer.from(transaction.actions[0].functionCall!.args).toString());
        assert.equal(args.verify_payload, token);
        const signature = userKey.sign(createHash('sha256').update(Uint8Array.from(args.sign_payload)).digest()).signature;
        receipt = transferOutcome(hash, 'sponsor.testnet', 'sponsor.testnet', 'fast-auth.testnet', '1');
        receipt.status = { SuccessValue: Buffer.from(JSON.stringify({ signature: Array.from(signature) })).toString('base64') };
      }
      receipts.set(hash, receipt);
      if (throwsAfterBroadcast) throw new Error('Network dropped after broadcast');
      return receipt;
    },
  } as unknown as JsonRpcProvider;
  const sponsor = { accountId: 'sponsor.testnet', provider,
    async createSignedTransaction({ receiverId, actions: txActions }: { receiverId: string; actions: Parameters<typeof createTransaction>[4] }) {
      return (await new KeyPairSigner(sponsorKey).signTransaction(createTransaction('sponsor.testnet', sponsorKey.getPublicKey(), receiverId,
        outerNonce++, txActions, new Uint8Array(32)))).signedTransaction;
    },
  } as unknown as Account;
  const npc = { accountId: 'npc.testnet', provider,
    async createSignedMetaTransaction({ receiverId, actions: txActions }: { receiverId: string; actions: DelegateAction['actions'] }) {
      return new KeyPairSigner(npcKey).signDelegateAction(buildDelegateAction({ senderId: 'npc.testnet', receiverId,
        actions: txActions, nonce: 11n, maxBlockHeight: 400n, publicKey: npcKey.getPublicKey() }));
    },
  } as unknown as Account;
  const options = { farmId, wallet: { wallet_account_id: accountId, subject }, provider, sponsor, npc, auth,
    async exchangeCode() { exchanges++; return { subject, accessToken: token }; },
    async verifyToken() { return { sub: claimsSubject, fatxn: approvedPayload }; },
  };
  const adapter = new NearUsdcPaymentProvider(options);
  const intent = (buyer = false): PaymentIntent => ({ orderId: randomUUID(), idempotencyKey: randomUUID(),
    sender: identity(buyer ? accountId : npc.accountId), receiver: identity(buyer ? npc.accountId : accountId),
    sponsor: identity(sponsor.accountId), amount: { asset: NEAR_USDC_ASSET, amountAtomic: buyer ? '1500000' : '1000000' } });
  const approve = async (paymentId: string) => {
    approval.state = `pay-${randomBytes(32).toString('base64url')}`;
    approvedPayload = Array.from(await adapter.authorize(paymentId, approval.state));
  };
  const cleanup = async () => {
    await queryFarmDatabase('DELETE FROM farm_near_usdc_payments WHERE transaction_id IN (SELECT id FROM farm_blockchain_transactions WHERE farm_id=$1)', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_blockchain_transactions WHERE farm_id=$1', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_social_identities WHERE farm_id=$1', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_accounts WHERE farm_id=$1', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_guest_progress WHERE session_id=$1', [farmId]);
  };
  return { adapter, options, intent, approval, approve, farmId, accountId, cleanup,
    counters: () => ({ sent, signatures, exchanges }),
    setBalance: (value: string) => { balance = value; },
    setWalletBalance: (accountId: string, value: string) => { balances.set(accountId, value); },
    dropBroadcast: (value: boolean) => { throwsAfterBroadcast = value; },
    hideReceipts: (value: boolean) => { viewUnavailable = value; },
    wrongClaims: () => { claimsSubject = 'someone-else'; },
    wrongPayload: () => { approvedPayload = [1, 2, 3]; },
  };
}

test('NPC USDC payment persists evidence before broadcast and reconciles one payment after interruption', async () => {
  const h = await harness();
  try {
    const intent = h.intent();
    const prepared = await h.adapter.prepare(intent);
    h.dropBroadcast(true);
    const submitted = await h.adapter.submit(intent, null);
    assert.equal(submitted.status, 'pending');
    assert.ok(submitted.transactionHash);
    assert.equal(submitted.reference.paymentId, prepared.reference.paymentId);
    h.dropBroadcast(false);
    const [one, two] = await Promise.all([h.adapter.submit(intent, null), h.adapter.getStatus(submitted.reference)]);
    assert.equal(one.status, 'confirmed');
    assert.equal(two.status, 'confirmed');
    assert.equal(h.counters().sent, 1);
    const record = await readNearUsdcPayment(one.reference.paymentId, h.farmId);
    assert.equal(record?.fee_atomic, '80');
    assert.equal(record?.asset_decimals, 6);
    const history = await readNearTransactionHistory(h.options.provider, h.farmId, 25);
    assert.equal(history.transactions[0].asset, 'USDC');
    assert.equal(history.transactions[0].assetDecimals, 6);
    assert.equal(history.transactions[0].feeAsset, 'NEAR');
    assert.equal(history.transactions[0].feeDecimals, 24);
    assert.equal('intent_hash' in history.transactions[0], false);
    const { rows: [security] } = await queryFarmDatabase<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE oid='farm_near_usdc_payments'::regclass",
    );
    assert.equal(security.relrowsecurity, true);
    await assert.rejects(h.adapter.prepare({ ...intent, amount: { ...intent.amount, amountAtomic: '999999' } }), /PAYMENT_REQUEST_CONFLICT/);
    await assert.rejects(new NearUsdcPaymentProvider({ ...h.options, farmId: randomUUID() }).getStatus(one.reference), /PAYMENT_NOT_FOUND/);
    h.setBalance('0');
    await assert.rejects(h.adapter.prepare(h.intent()), /NPC_INSUFFICIENT_USDC/);
  } finally { await h.cleanup(); }
});

test('Google USDC approval binds the exact payload and resumes an uncertain MPC signature once', async () => {
  const h = await harness();
  try {
    const intent = h.intent(true);
    const prepared = await h.adapter.prepare(intent);
    assert.equal(prepared.status, 'awaiting_approval');
    assert.ok(prepared.requiredAction?.url.includes('/authorize'));
    await h.approve(prepared.reference.paymentId);
    await assert.rejects(h.adapter.submit(intent, { ...h.approval, state: `pay-${'z'.repeat(43)}` }), /INVALID_AUTHORIZATION/);
    assert.equal((await h.adapter.getStatus(prepared.reference)).status, 'awaiting_approval');
    await assert.rejects(h.adapter.prepare(h.intent(true)), /WALLET_PAYMENT_PENDING/);
    h.dropBroadcast(true);
    const signing = await h.adapter.submit(intent, h.approval);
    assert.equal(signing.status, 'pending');
    assert.equal(signing.transactionHash, null);
    h.hideReceipts(true);
    assert.equal((await h.adapter.getStatus(prepared.reference)).status, 'pending');
    h.hideReceipts(false);
    h.dropBroadcast(false);
    const done = await h.adapter.getStatus(prepared.reference);
    assert.equal(done.status, 'confirmed');
    const replay = await h.adapter.submit(intent, h.approval);
    assert.equal(replay.transactionHash, done.transactionHash);
    assert.deepEqual(h.counters(), { exchanges: 1, signatures: 1, sent: 1 });
    const { rows } = await queryFarmDatabase('SELECT to_jsonb(t) AS record FROM farm_blockchain_transactions t WHERE farm_id=$1', [h.farmId]);
    assert.equal(JSON.stringify(rows).includes('fixture-sensitive-google-access-token'), false);
  } finally { await h.cleanup(); }
});

test('wrong Google identity or payload never authorizes USDC and expired requests never submit', async () => {
  const h = await harness();
  try {
    for (const mismatch of [h.wrongPayload, h.wrongClaims]) {
      const intent = h.intent(true);
      const prepared = await h.adapter.prepare(intent);
      await h.approve(prepared.reference.paymentId);
      mismatch();
      const failed = await h.adapter.submit(intent, h.approval);
      assert.equal(failed.status, 'failed');
      assert.match(failed.errorCode!, /SIGNING_(PAYLOAD|IDENTITY)_MISMATCH/);
    }
    const intent = h.intent(true);
    const prepared = await h.adapter.prepare(intent);
    await queryFarmDatabase("UPDATE farm_near_usdc_payments SET expires_at=now()-interval '1 minute' WHERE transaction_id=$1", [prepared.reference.paymentId]);
    assert.equal((await h.adapter.getStatus(prepared.reference)).status, 'expired');
    assert.equal((await h.adapter.submit(intent, h.approval)).status, 'expired');
    assert.equal(h.counters().sent, 0);
    assert.equal(h.counters().signatures, 0);
  } finally { await h.cleanup(); }
});

test('payment HTTP authorization requires the farm session and the matching callback cookie', async () => {
  const h = await harness();
  const previous = process.env.NEAR_AUTH_CALLBACK_URL;
  const previousFlag = process.env.NEAR_DEMO_ENABLED;
  process.env.NEAR_DEMO_ENABLED = 'true';
  process.env.NEAR_AUTH_CALLBACK_URL = 'http://localhost:3000/';
  try {
    const payment = await h.adapter.prepare(h.intent(true));
    const app = new Hono();
    app.route('/', nearPaymentRoutes(async c => c.req.header('x-test-farm') === h.farmId ? h.farmId : undefined, async () => h.adapter));
    app.get('/callback', c => completeNearPayment(c, h.farmId, async () => h.adapter));
    const url = `/account/payments/near/${payment.reference.paymentId}/authorize`;
    assert.equal((await app.request(url)).status, 401);
    assert.equal((await app.request(url, { headers: { 'x-test-farm': h.farmId, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    const response = await app.request(url, { headers: { 'x-test-farm': h.farmId } });
    assert.equal(response.status, 303);
    const state = new URL(response.headers.get('location')!).searchParams.get('state');
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    await app.request(`/callback?state=${state}&error=access_denied`);
    assert.equal((await h.adapter.getStatus(payment.reference)).status, 'awaiting_approval');
    const cancelled = await app.request(`/callback?state=${state}&error=access_denied`, { headers: { cookie } });
    assert.equal(cancelled.status, 303);
    assert.equal((await h.adapter.getStatus(payment.reference)).status, 'cancelled');
    await app.request(`/callback?state=${state}&code=duplicate`, { headers: { cookie } });
    assert.equal(h.counters().exchanges, 0);
    assert.equal(h.counters().sent, 0);
  } finally {
    if (previous === undefined) delete process.env.NEAR_AUTH_CALLBACK_URL; else process.env.NEAR_AUTH_CALLBACK_URL = previous;
    if (previousFlag === undefined) delete process.env.NEAR_DEMO_ENABLED; else process.env.NEAR_DEMO_ENABLED = previousFlag;
    await h.cleanup();
  }
});

test('demo funding runs once per seed identifier and preserves NPC seller funds', async () => {
  const h = await harness();
  try {
    h.setWalletBalance(h.accountId, '0');
    h.setWalletBalance(h.options.npc.accountId, '2000000');
    await assert.rejects(fundNearUsdcBuyer(h.options.sponsor, h.options.npc, h.accountId, h.farmId), /NPC needs seed funds/);
    assert.equal(h.counters().sent, 0);
    h.setWalletBalance(h.options.npc.accountId, '5000000');
    const first = await fundNearUsdcBuyer(h.options.sponsor, h.options.npc, h.accountId, h.farmId);
    assert.equal(first?.status, 'confirmed');
    const replay = await fundNearUsdcBuyer(h.options.sponsor, h.options.npc, h.accountId, h.farmId);
    assert.equal(replay?.transaction_hash, first?.transaction_hash);
    assert.equal(h.counters().sent, 1);
    const nextRun = await fundNearUsdcBuyer(h.options.sponsor, h.options.npc, h.accountId, h.farmId, randomUUID());
    assert.equal(nextRun?.status, 'confirmed');
    assert.equal(h.counters().sent, 2);
  } finally { await h.cleanup(); }
});
