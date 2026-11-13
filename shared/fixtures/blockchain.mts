import type { BlockchainHistoryResponse } from '../blockchain.mts';

/** Synthetic USDC history for formatting checks. */
export const USDC_HISTORY_FIXTURE = {
  transactions: [{
    id: '20000000-0000-4000-8000-000000000008', provider: 'near', network: 'testnet',
    operation: 'transfer', status: 'confirmed',
    senderAccountId: '22'.repeat(32), receiverAccountId: 'fixture-npc.testnet', sponsorAccountId: 'fixture-sponsor.testnet',
    asset: 'USDC', assetDecimals: 6,
    tokenContractId: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
    amountAtomic: '1500000', transactionHash: 'fixture-buyer-transfer',
    gasBurnt: '1000000000000', feeAtomic: '100000000000000000000', feeAsset: 'NEAR', feeDecimals: 24,
    errorCode: null, createdAt: '2026-11-14T00:00:00+07:00', updatedAt: '2026-11-14T00:00:05+07:00',
    confirmedAt: '2026-11-14T00:00:05+07:00', explorerUrl: null,
  }],
} satisfies BlockchainHistoryResponse;
