import type { PaymentProvider } from '../../../shared/payments.mts';
import { JsonRpcProvider } from 'near-api-js';
import { findNearTestWallet } from '../auth/near-test-signing.ts';
import { createNearUsdcProvider, nearUsdcConfig, NEAR_NPC_ID, NEAR_SPONSOR_ID, NEAR_TESTNET_RPC } from '../blockchain/near-usdc.ts';
import { NEAR_USDC_ASSET, NEAR_USDC_CONTRACT } from '../blockchain/near-usdc-receipt.ts';
import { nearUsdcBalance } from '../blockchain/near-usdc-setup.ts';
import { findNearUsdcPayment } from '../blockchain/near-usdc-store.ts';
import { readTransactionRecord } from '../blockchain/transaction-store.ts';
import type { TradePayments } from './trade-payments.ts';

/** Domain services select a partner here; SDKs and signing stay inside adapters. */
export async function paymentProviderFor(farmId: string, providerId: string): Promise<PaymentProvider | undefined> {
  if (providerId === 'near') return createNearUsdcProvider(farmId);
  return undefined;
}

const nearIdentity = (accountId: string) => ({ providerId: 'near', network: 'testnet', accountId });
const nearRpc = new JsonRpcProvider({ url: NEAR_TESTNET_RPC });

export function tradePayments(): TradePayments | undefined {
  if (!nearUsdcConfig()) return;
  return {
    asset: NEAR_USDC_ASSET,
    gasAsset: { id: 'near-testnet-native', symbol: 'NEAR', decimals: 24 },
    npc: nearIdentity(NEAR_NPC_ID),
    sponsor: nearIdentity(NEAR_SPONSOR_ID),
    async findWallet(farmId) {
      const wallet = await findNearTestWallet(farmId);
      return wallet && nearIdentity(wallet.wallet_account_id);
    },
    async readWallet(identity) {
      try {
        const storage = await nearRpc.callFunction({ contractId: NEAR_USDC_CONTRACT, method: 'storage_balance_of',
          args: { account_id: identity.accountId }, blockQuery: { finality: 'final' } });
        if (!storage) return { identity, status: 'initializing', balance: null };
        return { identity, status: 'ready',
          balance: { asset: NEAR_USDC_ASSET, amountAtomic: await nearUsdcBalance(nearRpc, identity.accountId) } };
      } catch {
        return { identity, status: 'unavailable', balance: null };
      }
    },
    providerFor: farmId => paymentProviderFor(farmId, 'near'),
    async details(farmId, intent) {
      const key = `near-usdc:${farmId}:${intent.idempotencyKey}`;
      const [transfer, signing] = await Promise.all([
        findNearUsdcPayment(farmId, key, intent.orderId),
        readTransactionRecord(`${key}:signature`),
      ]);
      return {
        feeAtomic: String(BigInt(transfer?.fee_atomic ?? '0') + BigInt(signing?.fee_atomic ?? '0')),
        expiresAt: transfer?.expires_at ?? null,
      };
    },
  };
}
