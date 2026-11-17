import type { Farm } from './farm.mts';

/** FV-INVITE-01: what each side receives once an invited player has an account and a first harvest. */
export const INVITE_REWARD = {
  inviteeSeeds: { cropId: 1, amount: 2 },
  inviterGold: 10,
  /** Invited players an inviter is paid for per day, Vietnam time. */
  inviterDailyCap: 5,
} as const;

/** True once the farm shows any sign of a completed harvest. */
export function hasHarvested(farm: Farm): boolean {
  return (farm.progression?.firstStep ?? 0) >= 3
    || Boolean(farm.progression?.daily.harvested)
    || Object.values(farm.produce).some(count => count > 0)
    || farm.plots.some(plot => plot?.harvested);
}
