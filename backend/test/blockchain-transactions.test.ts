import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { actions, createTransaction, KeyPair, KeyPairSigner } from 'near-api-js';
import type { Account, JsonRpcProvider } from 'near-api-js';
import bs58 from 'bs58';
import app from '../src/app.ts';
import { signInSocial } from '../src/auth/social-store.ts';
import { readNearTransactionHistory, saveNearOutcome, sendLoggedNearTransaction } from '../src/blockchain/near-transaction-log.ts';
import { claimTransactionRecord, createTransactionRecord, readTransactionRecord } from '../src/blockchain/transaction-store.ts';
import { queryFarmDatabase } from '../src/farm-store.ts';

test('blockchain log persists before broadcast and reconciles uncertain submissions once', async () => {
  const subject = randomUUID();
  const session = await signInSocial({ issuer: 'https://logging.test.invalid/', subject, network: 'testnet', walletId: subject });
  assert.ok(session);
  const { rows: [account] } = await queryFarmDatabase<{ farm_id: string }>(
    'SELECT farm_id FROM farm_social_identities WHERE issuer = $1 AND subject = $2', ['https://logging.test.invalid/', subject],
  );
  const farmId = account.farm_id;
  const requestKey = `log-test:${subject}`;
  const sponsorId = 'log-test.testnet';
  const secretMarker = 'jwt-must-never-be-in-the-log';
  const key = KeyPair.fromRandom('ed25519');
  const transaction = createTransaction(sponsorId, key.getPublicKey(), 'fast-auth.testnet', 1n,
    [actions.functionCall('sign', { verify_payload: secretMarker }, 10_000_000_000_000n, 1n)], new Uint8Array(32));
  const { signedTransaction } = await new KeyPairSigner(key).signTransaction(transaction);
  const hash = bs58.encode(createHash('sha256').update(transaction.encode()).digest());
  let broadcasts = 0;
  let constructions = 0;
  const receipt = {
    final_execution_status: 'FINAL', transaction: { hash, signer_id: sponsorId }, status: { SuccessValue: '' },
    transaction_outcome: { id: 'outer', outcome: { gas_burnt: 5, tokens_burnt: '7' } },
    receipts_outcome: [{ id: 'inner', outcome: { gas_burnt: 11, tokens_burnt: '13' } }],
  } as Awaited<ReturnType<JsonRpcProvider['viewTransactionStatus']>>;
  const provider = {
    async sendTransactionUntil() {
      broadcasts++;
      const record = await readTransactionRecord(requestKey);
      assert.equal(record?.transaction_hash, hash);
      assert.equal(record?.status, 'submitted');
      throw new Error('Simulated network interruption after submission');
    },
    async viewTransactionStatus() { return receipt; },
  } as unknown as JsonRpcProvider;
  const sponsor = {
    accountId: sponsorId, provider,
    async createSignedTransaction() { constructions++; return signedTransaction; },
  } as unknown as Account;

  try {
    await assert.rejects(sendLoggedNearTransaction({
      sponsor, farmId, requestKey, operation: 'signature', receiverId: 'fast-auth.testnet', amountAtomic: '1', actions: transaction.actions,
    }));
    const submitted = await readTransactionRecord(requestKey);
    assert.equal(submitted?.status, 'submitted');
    assert.equal(submitted?.transaction_hash, hash);
    assert.equal(JSON.stringify(submitted).includes(secretMarker), false);
    const history = await readNearTransactionHistory(provider, farmId, 25);
    assert.equal(history.transactions[0].status, 'confirmed');
    assert.equal(history.transactions[0].gasBurnt, '16');
    assert.equal(history.transactions[0].feeAtomic, '20');
    assert.equal(history.transactions[0].assetDecimals, 24);
    assert.equal(history.transactions[0].tokenContractId, null);
    assert.equal(history.transactions[0].feeAsset, 'NEAR');
    assert.equal(history.transactions[0].feeDecimals, 24);
    await sendLoggedNearTransaction({
      sponsor, farmId, requestKey, operation: 'signature', receiverId: 'fast-auth.testnet', amountAtomic: '1', actions: transaction.actions,
    });
    assert.equal(broadcasts, 1);
    assert.equal(constructions, 1);

    const base = { farm_id: farmId, provider: 'near', network: 'testnet', operation: 'transfer',
      sender_account_id: sponsorId, receiver_account_id: 'npc.testnet', sponsor_account_id: sponsorId, asset: 'NEAR', amount_atomic: '0' };
    await createTransactionRecord({ ...base, request_key: `${requestKey}:approval`, status: 'awaiting_signature' });
    const claims = await Promise.all([
      claimTransactionRecord(`${requestKey}:approval`, farmId, 'signing'),
      claimTransactionRecord(`${requestKey}:approval`, farmId, 'signing'),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);

    const failed = await createTransactionRecord({ ...base, request_key: `${requestKey}:failed`, status: 'prepared' });
    const failureHash = bs58.encode(new Uint8Array(32).fill(9));
    await queryFarmDatabase('UPDATE farm_blockchain_transactions SET transaction_hash=$2, status=$3 WHERE id=$1', [failed.id, failureHash, 'submitted']);
    await saveNearOutcome({ ...failed, transaction_hash: failureHash }, {
      ...receipt, transaction: { ...receipt.transaction, hash: failureHash },
      status: { Failure: { ActionError: { index: 0, kind: { AccountDoesNotExist: { account_id: 'npc.testnet' } } } } },
    } as typeof receipt);
    assert.equal((await readTransactionRecord(`${requestKey}:failed`))?.status, 'failed');

    const unauthenticated = await app.request('/account/transactions');
    assert.equal(unauthenticated.status, 401);
    const headers = { cookie: `farmverse_account=${session.token}` };
    assert.equal((await app.request('/account/transactions?limit=51', { headers })).status, 400);
    const response = await app.request('/account/transactions?limit=25', { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.transactions.length, 3);
    assert.equal(body.transactions.every((item: { id: string }) => [submitted!.id, failed.id, ...claims.filter(Boolean).map(item => item!.id)].includes(item.id)), true);
    assert.equal('request_key' in body.transactions[0], false);
    const { rows: [security] } = await queryFarmDatabase<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE oid = 'farm_blockchain_transactions'::regclass",
    );
    assert.equal(security.relrowsecurity, true);
  } finally {
    await queryFarmDatabase('DELETE FROM farm_blockchain_transactions WHERE farm_id=$1', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_social_identities WHERE farm_id=$1', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_accounts WHERE farm_id=$1', [farmId]);
    await queryFarmDatabase('DELETE FROM farm_guest_progress WHERE session_id=$1', [farmId]);
  }
});
