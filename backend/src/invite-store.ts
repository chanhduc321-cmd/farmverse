import type { Farm } from '../../shared/farm.mts';
import { hasHarvested, INVITE_REWARD } from '../../shared/invite.mts';
import { transactFarm } from './farm-store.ts';

export interface InviteSettlement {
  /** The invited player's farm after their seeds were added. */
  farm: Farm;
  /** False when the inviter had already reached the daily cap or no longer has a farm. */
  inviterPaid: boolean;
}

/**
 * FV-INVITE-01. Settles the one-time invite reward for an account once it has completed a
 * harvest. Returns `undefined` when there is nothing to settle: no referrer, already settled,
 * or no harvest yet. Safe to call after every harvest and after account creation.
 */
export function settleInviteReward(inviteeId: string, harvestedNow: boolean): Promise<InviteSettlement | undefined> {
  return transactFarm(async (client): Promise<InviteSettlement | undefined> => {
    // Claim the account row first so concurrent calls for one invited player run one at a time.
    const { rows: [account] } = await client.query<{ referred_by: string }>(`
      SELECT referred_by FROM farm_accounts
      WHERE farm_id = $1 AND referred_by IS NOT NULL AND referral_rewarded_at IS NULL
      FOR UPDATE
    `, [inviteeId]);
    if (!account) return;
    const inviterId = account.referred_by;

    // Lock both farms in id order, as steals do, so the two flows cannot deadlock.
    const { rows } = await client.query<{ session_id: string; state: Farm }>(`
      SELECT session_id, state FROM farm_guest_progress
      WHERE session_id IN ($1, $2) AND claimed
      ORDER BY session_id FOR UPDATE
    `, [inviteeId, inviterId]);
    const invitee = rows.find(row => row.session_id === inviteeId)?.state;
    const inviter = rows.find(row => row.session_id === inviterId)?.state;
    if (!invitee || (!harvestedNow && !hasHarvested(invitee))) return;

    // Holding the inviter's farm lock makes this count exact under concurrency.
    const { rows: [paid] } = await client.query<{ count: number }>(`
      SELECT COUNT(*)::int AS count FROM farm_accounts
      WHERE referred_by = $1 AND referral_inviter_paid
        AND referral_rewarded_at >= date_trunc('day', clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'
    `, [inviterId]);
    const inviterPaid = Boolean(inviter) && paid.count < INVITE_REWARD.inviterDailyCap;

    const { cropId, amount } = INVITE_REWARD.inviteeSeeds;
    invitee.seeds[cropId] = (invitee.seeds[cropId] ?? 0) + amount;
    invitee.revision++;
    if (inviter && inviterPaid) {
      inviter.gold += INVITE_REWARD.inviterGold;
      inviter.revision++;
    }

    await client.query(`
      UPDATE farm_accounts SET referral_rewarded_at = clock_timestamp(), referral_inviter_paid = $2
      WHERE farm_id = $1
    `, [inviteeId, inviterPaid]);
    await client.query(`
      UPDATE farm_guest_progress
      SET state = CASE WHEN session_id = $1 THEN $3::jsonb ELSE $4::jsonb END
      WHERE session_id = $1 OR (session_id = $2 AND $5)
    `, [inviteeId, inviterId, invitee, inviter ?? null, Boolean(inviter && inviterPaid)]);
    if (inviter) {
      await client.query(`
        INSERT INTO farm_activities (host_id, visitor_id, type, amount) VALUES ($1, $2, 'invite', $3)
      `, [inviterId, inviteeId, inviterPaid ? INVITE_REWARD.inviterGold : 0]);
    }
    return { farm: invitee, inviterPaid };
  });
}
