import type { PaymentProvider } from '../../../shared/payments.mts';
import { createNearUsdcProvider } from '../blockchain/near-usdc.ts';

/** Domain services select a partner here; SDKs and signing stay inside adapters. */
export async function paymentProviderFor(farmId: string, providerId: string): Promise<PaymentProvider | undefined> {
  if (providerId === 'near') return createNearUsdcProvider(farmId);
  return undefined;
}
