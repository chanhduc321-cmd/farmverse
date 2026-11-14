import { tradePayments } from '../payments/provider.ts';
import { demoUuid, initializeDemoRun } from './store.ts';

try {
  const sellerId = process.env.TRADE_DEMO_SELLER_FARM_ID;
  const buyerId = process.env.TRADE_DEMO_BUYER_FARM_ID;
  if (!sellerId || !buyerId || !demoUuid.test(sellerId) || !demoUuid.test(buyerId) || sellerId === buyerId) {
    throw new Error('Set two distinct Google farm IDs in TRADE_DEMO_SELLER_FARM_ID and TRADE_DEMO_BUYER_FARM_ID.');
  }
  const payments = tradePayments();
  if (!payments) throw new Error('Enable the server-side USDC testnet adapter before creating a demo run.');
  const [seller, buyer] = await Promise.all([payments.findWallet(sellerId), payments.findWallet(buyerId)]);
  if (!seller || !buyer) throw new Error('Both demo farms must have verified Google testnet wallets.');
  const result = await initializeDemoRun({ farmId: sellerId, wallet: seller }, { farmId: buyerId, wallet: buyer },
    process.argv.includes('--new-run'));
  console.log(result.created ? 'Created demo run' : 'Using existing demo run', result.runId);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not initialize demo run.');
  process.exitCode = 1;
}
