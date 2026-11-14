import type { Account, Provider } from 'near-api-js';
import { actions } from 'near-api-js';
import { readTransactionRecord, withBlockchainLock } from './transaction-store.ts';
import { saveNearOutcome, sendLoggedNearTransaction } from './near-transaction-log.ts';
import { NEAR_USDC_CONTRACT } from './near-usdc-receipt.ts';

export async function nearUsdcBalance(provider: Provider, accountId: string) {
  const balance = await provider.callFunction<string>({ contractId: NEAR_USDC_CONTRACT,
    method: 'ft_balance_of', args: { account_id: accountId }, blockQuery: { finality: 'final' } });
  if (typeof balance !== 'string' || !/^[0-9]+$/.test(balance)) throw new Error('Invalid USDC balance');
  return balance;
}

export async function registerNearUsdcAccount(sponsor: Account, accountId: string, farmId: string | null) {
  const registered = await sponsor.provider.callFunction({ contractId: NEAR_USDC_CONTRACT,
    method: 'storage_balance_of', args: { account_id: accountId }, blockQuery: { finality: 'final' } });
  if (registered) return;
  const bounds = await sponsor.provider.callFunction<{ min: string }>({ contractId: NEAR_USDC_CONTRACT,
    method: 'storage_balance_bounds', args: {}, blockQuery: { finality: 'final' } });
  // Fail closed if the configured token ever changes its storage economics.
  if (!bounds || bounds.min !== '1250000000000000000000') throw new Error('Unexpected USDC storage deposit');
  const outcome = await sendLoggedNearTransaction({ sponsor, farmId,
    requestKey: `usdc-storage:${accountId}:v1`, operation: 'token_registration',
    receiverId: NEAR_USDC_CONTRACT, recipientId: accountId, amountAtomic: bounds.min,
    actions: [actions.functionCall('storage_deposit', { account_id: accountId, registration_only: true },
      30_000_000_000_000n, BigInt(bounds.min))],
  });
  if (outcome.final_execution_status !== 'FINAL' || typeof outcome.status !== 'object' || !('SuccessValue' in outcome.status)) {
    throw new Error('USDC storage registration is not confirmed');
  }
}

/** One-time demo seeding. The request key prevents a repeat after the player spends those tokens. */
export async function fundNearUsdcBuyer(sponsor: Account, npc: Account, accountId: string, farmId: string, seedId = 'v1') {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(seedId)) throw new Error('Invalid demo seed identifier');
  return withBlockchainLock(`near-usdc-wallet:${npc.accountId}`, async () => {
    const requestKey = `usdc-seed:${accountId}:1500000:${seedId}`;
    const old = await readTransactionRecord(requestKey);
    if (old) {
      if (old.transaction_hash && ['prepared', 'submitted'].includes(old.status)) {
        const outcome = await sponsor.provider.viewTransactionStatus({ txHash: old.transaction_hash, accountId: sponsor.accountId, waitUntil: 'FINAL' });
        await saveNearOutcome(old, outcome);
      }
      return readTransactionRecord(requestKey);
    }
    const balance = BigInt(await nearUsdcBalance(sponsor.provider, accountId));
    if (balance >= 1_500_000n) return;
    const amount = 1_500_000n - balance;
    if (BigInt(await nearUsdcBalance(sponsor.provider, npc.accountId)) < amount + 1_000_000n) throw new Error('NPC needs seed funds plus 1 USDC for the seller');
    const { signedDelegate } = await npc.createSignedMetaTransaction({ receiverId: NEAR_USDC_CONTRACT, blockHeightTtl: 300,
      actions: [actions.functionCall('ft_transfer', { receiver_id: accountId, amount: String(amount), memo: 'farmverse:demo-seed' },
        30_000_000_000_000n, 1n)],
    });
    await sendLoggedNearTransaction({ sponsor, farmId, requestKey, operation: 'demo_funding',
      receiverId: npc.accountId, recipientId: accountId, senderId: npc.accountId, amountAtomic: String(amount),
      asset: { symbol: 'USDC', decimals: 6, contractId: NEAR_USDC_CONTRACT }, actions: [actions.signedDelegate(signedDelegate)],
    });
    return readTransactionRecord(requestKey);
  });
}
