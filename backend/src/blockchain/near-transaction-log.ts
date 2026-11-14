import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import type { Account, Action, JsonRpcProvider } from 'near-api-js';
import type { BlockchainHistoryResponse } from '../../../shared/blockchain.mts';
import {
  createTransactionRecord, listTransactionRecords, markTransactionSubmitted, prepareTransactionBroadcast,
  readTransactionRecord, recordTransactionOutcome, setTransactionError, withBlockchainLock,
} from './transaction-store.ts';
import type { TransactionRecord } from './transaction-store.ts';
import { verifyNearUsdcOutcome } from './near-usdc-receipt.ts';

type NearOutcome = Awaited<ReturnType<JsonRpcProvider['viewTransactionStatus']>>;

export async function saveNearOutcome(record: TransactionRecord, outcome: NearOutcome) {
  if (outcome.transaction.hash !== record.transaction_hash || outcome.transaction.signer_id !== record.sponsor_account_id) {
    throw new Error('NEAR receipt does not match recorded transaction');
  }
  if (outcome.final_execution_status !== 'FINAL') return;
  const outcomes = [outcome.transaction_outcome, ...outcome.receipts_outcome];
  const unique = [...new Map(outcomes.map(item => [item.id, item.outcome])).values()];
  const gas = unique.reduce((total, item) => total + BigInt(item.gas_burnt), 0n);
  const fee = unique.reduce((total, item) => total + BigInt(item.tokens_burnt), 0n);
  const usdc = record.asset === 'USDC' ? verifyNearUsdcOutcome(record, outcome) : undefined;
  const succeeded = usdc ? usdc === 'confirmed' : typeof outcome.status === 'object' && 'SuccessValue' in outcome.status;
  const failed = usdc ? usdc === 'failed' : typeof outcome.status === 'object' && 'Failure' in outcome.status;
  if (succeeded || failed) await recordTransactionOutcome(record.id, outcome.transaction.hash, succeeded, String(gas), String(fee));
}

export async function sendLoggedNearTransaction(options: {
  sponsor: Account;
  farmId: string | null;
  requestKey: string;
  operation: string;
  receiverId: string;
  recipientId?: string;
  senderId?: string;
  amountAtomic: string;
  actions: Action[];
  asset?: { symbol: string; decimals: number; contractId: string };
}) {
  const { sponsor, farmId, requestKey, operation, receiverId, recipientId = receiverId, senderId = sponsor.accountId, amountAtomic, actions } = options;
  const initial = await createTransactionRecord({
    farm_id: farmId, request_key: requestKey, provider: 'near', network: 'testnet', operation, status: 'prepared',
    sender_account_id: senderId, receiver_account_id: recipientId, sponsor_account_id: sponsor.accountId,
    asset: options.asset?.symbol ?? 'NEAR', amount_atomic: amountAtomic,
    asset_decimals: options.asset?.decimals ?? 24, token_contract_id: options.asset?.contractId ?? null,
  });

  return withBlockchainLock(`near-sponsor:${sponsor.accountId}`, async () => {
    // Serialize the funded signer across processes. Log writes commit before broadcasting.
    const record = await readTransactionRecord(requestKey);
    if (!record || record.farm_id !== farmId) throw new Error('Transaction owner mismatch');
    if (record.sender_account_id !== senderId || record.receiver_account_id !== recipientId ||
        record.sponsor_account_id !== sponsor.accountId || record.amount_atomic !== amountAtomic ||
        record.asset !== (options.asset?.symbol ?? 'NEAR') || record.token_contract_id !== (options.asset?.contractId ?? null)) {
      throw new Error('Transaction intent mismatch');
    }
    if (record.transaction_hash) {
      const outcome = await sponsor.provider.viewTransactionStatus({
        txHash: record.transaction_hash, accountId: sponsor.accountId, waitUntil: 'FINAL',
      });
      await saveNearOutcome(record, outcome);
      return outcome;
    }

    if (!['prepared', 'signing'].includes(record.status)) throw new Error('Transaction is not available for submission');

    try {
      const signed = await sponsor.createSignedTransaction({ receiverId, actions });
      const hash = bs58.encode(createHash('sha256').update(signed.transaction.encode()).digest());
      await prepareTransactionBroadcast(record.id, hash);
      await markTransactionSubmitted(record.id);
      const outcome = await sponsor.provider.sendTransactionUntil(signed, 'FINAL');
      await saveNearOutcome({ ...record, transaction_hash: hash }, outcome);
      return outcome;
    } catch (error) {
      await setTransactionError(initial.id, 'SUBMISSION_UNCONFIRMED');
      throw error;
    }
  });
}

export async function readNearTransactionHistory(provider: JsonRpcProvider, farmId: string, limit: number): Promise<BlockchainHistoryResponse> {
  let records = await listTransactionRecords(farmId, limit);
  const pending = records.filter(record => record.provider === 'near' && record.network === 'testnet' &&
    record.transaction_hash && ['prepared', 'submitted'].includes(record.status)).slice(0, 5);
  await Promise.allSettled(pending.map(async record => {
    const outcome = await provider.viewTransactionStatus({
      txHash: record.transaction_hash!, accountId: record.sponsor_account_id, waitUntil: 'NONE',
    });
    await saveNearOutcome(record, outcome);
  }));
  if (pending.length) records = await listTransactionRecords(farmId, limit);
  return { transactions: records.map(record => ({
    id: record.id, provider: record.provider, network: record.network, operation: record.operation, status: record.status,
    senderAccountId: record.sender_account_id, receiverAccountId: record.receiver_account_id,
    sponsorAccountId: record.sponsor_account_id, asset: record.asset, amountAtomic: record.amount_atomic,
    assetDecimals: record.asset_decimals, tokenContractId: record.token_contract_id,
    transactionHash: record.transaction_hash, gasBurnt: record.gas_burnt, feeAtomic: record.fee_atomic,
    feeAsset: 'NEAR', feeDecimals: 24,
    errorCode: record.error_code, createdAt: record.created_at.toISOString(), updatedAt: record.updated_at.toISOString(),
    confirmedAt: record.confirmed_at?.toISOString() ?? null,
    explorerUrl: record.provider === 'near' && record.network === 'testnet' && record.transaction_hash
      ? `https://testnet.nearblocks.io/txns/${record.transaction_hash}` : null,
  })) };
}
