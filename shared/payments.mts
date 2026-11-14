export interface PaymentAsset {
  id: string;
  symbol: string;
  decimals: number;
}

export interface PaymentAmount {
  asset: PaymentAsset;
  amountAtomic: string;
}

export interface PaymentWallet {
  providerId: string;
  network: string;
  accountId: string;
}

export type PaymentStatus = 'awaiting_approval' | 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'expired';

export interface PaymentReference {
  providerId: string;
  network: string;
  paymentId: string;
}

export interface PaymentResult {
  reference: PaymentReference;
  status: PaymentStatus;
  transactionId: string | null;
  transactionHash: string | null;
  explorerUrl: string | null;
  requiredAction: { type: 'redirect'; url: string } | null;
  errorCode: string | null;
}

/** Server-created instruction. Prices and wallet ownership are verified before calling an adapter. */
export interface PaymentIntent {
  orderId: string;
  idempotencyKey: string;
  sender: PaymentWallet;
  receiver: PaymentWallet;
  sponsor: PaymentWallet;
  amount: PaymentAmount;
}

/** Implemented by server-side provider modules. Authorization stays inside the backend callback. */
export interface PaymentProvider {
  readonly id: string;
  prepare(intent: PaymentIntent): Promise<PaymentResult>;
  submit(intent: PaymentIntent, authorization: unknown): Promise<PaymentResult>;
  getStatus(reference: PaymentReference): Promise<PaymentResult>;
}
