import type { PaymentAsset, PaymentIntent, PaymentProvider, PaymentWallet } from '../../../shared/payments.mts';
import type { TradeDemoBlockReason, TradeDemoSnapshot } from '../../../shared/trade-demo.mts';

export type TradeWalletState = TradeDemoSnapshot['wallet'];

/** A refusal before any payment was created or submitted. */
export class PaymentPreparationRefused extends Error {
  constructor(readonly reason: TradeDemoBlockReason) {
    super(reason);
    this.name = 'PaymentPreparationRefused';
  }
}

export interface TradePayments {
  asset: PaymentAsset;
  gasAsset: PaymentAsset;
  npc: PaymentWallet;
  sponsor: PaymentWallet;
  findWallet(farmId: string): Promise<PaymentWallet | undefined>;
  readWallet(wallet: PaymentWallet): Promise<TradeWalletState>;
  providerFor(farmId: string): Promise<PaymentProvider | undefined>;
  details(farmId: string, intent: PaymentIntent): Promise<{ feeAtomic: string; expiresAt: Date | null }>;
}
