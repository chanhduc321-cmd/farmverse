import { randomBytes, randomUUID } from 'node:crypto';
import { accountLifetimeSeconds, hashToken } from '../account-store.ts';
import { createFarm } from '../farm.ts';
import { transactFarm } from '../farm-store.ts';
import { createMerchant } from '../merchant.ts';

interface SocialIdentity {
  issuer: string;
  subject: string;
  network: string;
  walletId: string;
}

export async function signInSocial(identity: SocialIdentity, guest?: string) {
  const token = randomBytes(32).toString('hex');
  return transactFarm(async (client) => {
    // Serialize callbacks for this identity before looking up or creating its farm.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [identity.issuer, identity.subject]);
    const { rows: [existing] } = await client.query<{ farm_id: string; wallet_account_id: string }>(`
      SELECT farm_id, wallet_account_id FROM farm_social_identities WHERE issuer = $1 AND subject = $2
    `, [identity.issuer, identity.subject]);
    if (existing && existing.wallet_account_id !== identity.walletId) return;

    let farmId = existing?.farm_id;
    if (!farmId) {
      const username = `near_${randomBytes(9).toString('hex')}`;
      if (guest) {
        const { rows: [claimed] } = await client.query<{ farm_id: string }>(`
          INSERT INTO farm_accounts (farm_id, username, password_hash)
          SELECT session_id, $2, NULL FROM farm_guest_progress WHERE session_id = $1 AND NOT claimed
          ON CONFLICT (farm_id) DO NOTHING RETURNING farm_id
        `, [guest, username]);
        if (!claimed) return;
        farmId = claimed.farm_id;
        await client.query('UPDATE farm_guest_progress SET claimed = true WHERE session_id = $1', [farmId]);
      } else {
        farmId = randomUUID();
        await client.query(`
          INSERT INTO farm_guest_progress (session_id, state, merchant_state, claimed) VALUES ($1, $2, $3, true)
        `, [farmId, createFarm(), createMerchant(Date.now())]);
        await client.query('INSERT INTO farm_accounts (farm_id, username) VALUES ($1, $2)', [farmId, username]);
      }
      await client.query(`
        INSERT INTO farm_social_identities (issuer, subject, farm_id, wallet_network, wallet_account_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [identity.issuer, identity.subject, farmId, identity.network, identity.walletId]);
    }

    await client.query(`
      INSERT INTO farm_account_sessions (token_hash, farm_id, expires_at)
      VALUES ($1, $2, now() + $3 * interval '1 second')
    `, [hashToken(token), farmId, accountLifetimeSeconds]);
    return { token, claimedGuest: !existing && guest !== undefined };
  });
}
