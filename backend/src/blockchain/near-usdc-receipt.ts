import type { JsonRpcProvider } from 'near-api-js';
import type { TransactionRecord } from './transaction-store.ts';

export type NearOutcome = Awaited<ReturnType<JsonRpcProvider['viewTransactionStatus']>>;

export const NEAR_USDC_CONTRACT = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
export const NEAR_USDC_ASSET = { id: 'usdc-testnet', symbol: 'USDC', decimals: 6 } as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function success(status: unknown) {
  const value = object(status);
  return Boolean(value && ('SuccessValue' in value || 'SuccessReceiptId' in value));
}

/** A successful relayer transaction alone is not proof that the delegated FT call succeeded. */
export function verifyNearUsdcOutcome(record: TransactionRecord, outcome: NearOutcome): 'confirmed' | 'failed' | 'pending' {
  if (record.network !== 'testnet' || record.asset !== 'USDC' || record.asset_decimals !== 6 ||
      record.token_contract_id !== NEAR_USDC_CONTRACT) throw new Error('Unexpected USDC asset');
  if (outcome.transaction.hash !== record.transaction_hash || outcome.transaction.signer_id !== record.sponsor_account_id ||
      outcome.transaction.receiver_id !== record.sender_account_id) throw new Error('USDC relayer transaction mismatch');

  const outerActions: unknown[] = outcome.transaction.actions;
  const signed = object(object(outerActions[0])?.Delegate);
  const delegate = object(signed?.delegate_action);
  const calls = delegate?.actions;
  const call = Array.isArray(calls) ? object(object(calls[0])?.FunctionCall) : undefined;
  if (outerActions.length !== 1 || !delegate || delegate.sender_id !== record.sender_account_id ||
      delegate.receiver_id !== record.token_contract_id || !Array.isArray(calls) || calls.length !== 1 ||
      call?.method_name !== 'ft_transfer' || call.deposit !== '1' || typeof call.args !== 'string') {
    throw new Error('USDC delegate mismatch');
  }
  const args = object(JSON.parse(Buffer.from(call.args, 'base64').toString('utf8')));
  if (args?.receiver_id !== record.receiver_account_id || args.amount !== record.amount_atomic) {
    throw new Error('USDC transfer arguments mismatch');
  }
  if (outcome.final_execution_status !== 'FINAL') return 'pending';

  // Only consider receipts reachable from this transaction. Ignore logs of failed receipts.
  const receipts = new Map(outcome.receipts_outcome.map(receipt => [receipt.id, receipt]));
  const pending = [...outcome.transaction_outcome.outcome.receipt_ids];
  const visited = new Set<string>();
  let matches = 0;
  let transferFailed = false;
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const receipt = receipts.get(id);
    if (!receipt) return 'pending';
    pending.push(...receipt.outcome.receipt_ids);
    if ((receipt.outcome.executor_id === record.token_contract_id || receipt.outcome.executor_id === record.sender_account_id)
        && object(receipt.outcome.status)?.Failure) transferFailed = true;
    if (receipt.outcome.executor_id !== record.token_contract_id || !success(receipt.outcome.status)) continue;
    for (const log of receipt.outcome.logs) {
      if (!log.startsWith('EVENT_JSON:')) continue;
      let event: Record<string, unknown> | undefined;
      try { event = object(JSON.parse(log.slice('EVENT_JSON:'.length))); } catch { continue; }
      if (event?.standard !== 'nep141' || event.version !== '1.0.0' || event.event !== 'ft_transfer' || !Array.isArray(event.data)) continue;
      for (const value of event.data) {
        const transfer = object(value);
        if (transfer?.old_owner_id === record.sender_account_id && transfer.new_owner_id === record.receiver_account_id &&
            transfer.amount === record.amount_atomic) matches++;
      }
    }
  }
  if (matches === 1 && success(outcome.status)) return 'confirmed';
  if (matches === 0 && (object(outcome.status)?.Failure || transferFailed)) return 'failed';
  return 'pending';
}
