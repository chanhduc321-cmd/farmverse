export const BLOCKCHAIN_API = { history: { path: '/account/transactions' } } as const;

export type BlockchainTransactionStatus =
  | 'awaiting_signature' | 'signing' | 'prepared' | 'submitted'
  | 'confirmed' | 'failed' | 'cancelled' | 'expired';

export interface BlockchainTransaction {
  id: string;
  provider: string;
  network: string;
  operation: string;
  status: BlockchainTransactionStatus;
  senderAccountId: string;
  receiverAccountId: string;
  sponsorAccountId: string;
  asset: string;
  /** Older history responses describe native NEAR and omit this metadata. */
  assetDecimals?: number;
  tokenContractId?: string | null;
  amountAtomic: string;
  transactionHash: string | null;
  gasBurnt: string | null;
  feeAtomic: string | null;
  feeAsset?: string;
  feeDecimals?: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  explorerUrl: string | null;
}

export interface BlockchainHistoryResponse {
  transactions: BlockchainTransaction[];
}
