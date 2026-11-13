import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Account, JsonRpcProvider } from 'near-api-js';
import type { KeyPairString } from 'near-api-js';
import { queryFarmDatabase } from '../farm-store.ts';
import { ensureNearTestWallet, findNearTestWallet, nearSigningDemoConfig } from '../auth/near-test-signing.ts';
import { nearAuthIssuer } from '../auth/near.ts';
import { NEAR_USDC_ASSET, NEAR_USDC_CONTRACT } from './near-usdc-receipt.ts';
import { createNearUsdcProvider, NearPaymentError, NEAR_NPC_ID, NEAR_SPONSOR_ID, NEAR_TESTNET_RPC } from './near-usdc.ts';
import { findNearUsdcPayment } from './near-usdc-store.ts';
import { fundNearUsdcBuyer, nearUsdcBalance, registerNearUsdcAccount } from './near-usdc-setup.ts';

// Explicit local-only opt-in. Never copy the provisioning file into a deployed artifact.
const args = process.argv.slice(2);
const provider = new JsonRpcProvider({ url: NEAR_TESTNET_RPC });
try {
  if (args.includes('--local-keys')) {
    const keys = JSON.parse(await readFile(new URL('../../.env.near-provisioning.local', import.meta.url), 'utf8')) as Record<string, string>;
    process.env.NEAR_TEST_SIGNING_SPONSOR_KEY ??= keys[NEAR_SPONSOR_ID];
    process.env.NEAR_USDC_NPC_KEY ??= keys[NEAR_NPC_ID];
  }
  const { rows: wallets } = await queryFarmDatabase<{ farm_id: string; wallet_account_id: string }>(`
    SELECT farm_id,wallet_account_id FROM farm_social_identities
    WHERE issuer=$1 AND wallet_network='testnet' ORDER BY farm_id
  `, [nearAuthIssuer]);
  const metadata = await provider.callFunction<{ symbol: string; decimals: number }>({ contractId: NEAR_USDC_CONTRACT,
    method: 'ft_metadata', args: {}, blockQuery: { finality: 'final' } });
  if (metadata?.symbol !== 'USDC' || metadata.decimals !== 6) throw new Error('USDC metadata mismatch');
  const sponsorKey = process.env.NEAR_TEST_SIGNING_SPONSOR_KEY;
  const npcKey = process.env.NEAR_USDC_NPC_KEY;
  const sponsor = sponsorKey ? new Account(NEAR_SPONSOR_ID, provider, sponsorKey as KeyPairString) : undefined;
  const npc = npcKey ? new Account(NEAR_NPC_ID, provider, npcKey as KeyPairString) : undefined;
  if (args.includes('--register')) {
    if (!sponsor) throw new Error('Server sponsor key missing');
    await registerNearUsdcAccount(sponsor, NEAR_NPC_ID, null);
    const config = nearSigningDemoConfig();
    if (!config) throw new Error('Local wallet initialization config missing');
    for (const row of wallets) {
      const wallet = await findNearTestWallet(row.farm_id);
      if (!wallet) throw new Error('Invalid Google wallet');
      await ensureNearTestWallet(config, wallet);
      await registerNearUsdcAccount(sponsor, wallet.wallet_account_id, wallet.farm_id);
    }
  }
  const fundingTarget = args[args.indexOf('--fund-wallet') + 1];
  if (args.includes('--fund-wallet')) {
    const wallet = wallets.find(row => row.wallet_account_id === fundingTarget);
    if (!wallet || !sponsor || !npc) throw new Error('Funding requires a linked Google wallet and server keys');
    const seedId = args.includes('--seed-id') ? args[args.indexOf('--seed-id') + 1] : 'v1';
    if (!seedId) throw new Error('Missing demo seed identifier');
    const receipt = await fundNearUsdcBuyer(sponsor, npc, wallet.wallet_account_id, wallet.farm_id, seedId);
    console.log('Buyer seed:', receipt?.status ?? 'already funded', receipt?.transaction_hash ?? '');
  }
  if (args.includes('--smoke-payout') || args.includes('--smoke-purchase')) {
    const purchase = args.includes('--smoke-purchase');
    const farmId = args[args.indexOf(purchase ? '--smoke-purchase' : '--smoke-payout') + 1];
    const wallet = wallets.find(row => row.farm_id === farmId);
    if (!wallet) throw new Error('Payout requires a linked Google farm');
    process.env.NEAR_USDC_ENABLED = 'true';
    const adapter = await createNearUsdcProvider(farmId);
    if (!adapter) throw new Error('Payment adapter config missing');
    const attempt = args.includes('--attempt') ? args[args.indexOf('--attempt') + 1] : 'v1';
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(attempt ?? '')) throw new Error('Invalid test attempt');
    const idempotencyKey = `adapter-${purchase ? 'purchase' : 'smoke'}:${farmId}:${attempt}`;
    const old = await findNearUsdcPayment(farmId, `near-usdc:${farmId}:${idempotencyKey}`, '00000000-0000-4000-8000-000000000000');
    const identity = (accountId: string) => ({ providerId: 'near', network: 'testnet', accountId });
    const intent = old ? adapter.intentFor(old) : { orderId: randomUUID(), idempotencyKey,
      sender: identity(purchase ? wallet.wallet_account_id : NEAR_NPC_ID),
      receiver: identity(purchase ? NEAR_NPC_ID : wallet.wallet_account_id), sponsor: identity(NEAR_SPONSOR_ID),
      amount: { asset: NEAR_USDC_ASSET, amountAtomic: purchase ? '1500000' : '1000000' } };
    const prepared = await adapter.prepare(intent);
    console.log(purchase ? 'Open approval URL in the buyer Google session:' : 'Adapter payout:',
      purchase ? prepared : await adapter.submit(intent, null));
  }
  console.log('Linked Google wallets:', wallets.length);
  for (const row of [{ farm_id: null, wallet_account_id: NEAR_SPONSOR_ID }, { farm_id: null, wallet_account_id: NEAR_NPC_ID }, ...wallets]) {
    const accountId = row.wallet_account_id;
    const [account, balance, storage] = await Promise.all([
      provider.viewAccount({ accountId, blockQuery: { finality: 'final' } }).catch(() => undefined),
      nearUsdcBalance(provider, accountId),
      provider.callFunction({ contractId: NEAR_USDC_CONTRACT, method: 'storage_balance_of', args: { account_id: accountId }, blockQuery: { finality: 'final' } }),
    ]);
    console.log({ accountId, farmId: row.farm_id, nearAtomic: account?.amount.toString() ?? null, usdcAtomic: balance, registered: Boolean(storage) });
  }
} catch (error) {
  console.error('NEAR setup failed:', error instanceof Error ? error.name : 'UnknownError',
    error instanceof NearPaymentError ? error.code : 'Check server configuration and testnet availability.');
  process.exitCode = 1;
}
