import { LEADERBOARD_SIZE, leaderboardWeekStart } from '../../shared/community.mts';
import type { LeaderboardGuard, LeaderboardRobbedFarm, LeaderboardThief, WeeklyLeaderboard } from '../../shared/community.mts';
import type { PetSpecies } from '../../shared/farm.mts';
import { queryFarmDatabase } from './farm-store.ts';

const WEEK_MS = 7 * 86_400_000;
const WINDOW = "created_at >= to_timestamp($1::double precision / 1000) AND created_at < to_timestamp($2::double precision / 1000)";

/**
 * Rankings for the week containing `now`. Each ranking counts distinct farms or players first,
 * so raiding one farm repeatedly cannot lift a player above someone who visited several.
 */
export async function readWeeklyLeaderboard(now: number, size = LEADERBOARD_SIZE): Promise<WeeklyLeaderboard> {
  const weekStart = leaderboardWeekStart(now);
  const weekEnd = weekStart + WEEK_MS;
  const range = [weekStart, weekEnd, size];

  const [thieves, robbed, guards] = await Promise.all([
    queryFarmDatabase<{ username: string; farms: number; fruit: number }>(`
      SELECT account.username, COUNT(DISTINCT event.host_id)::int AS farms, SUM(event.amount)::int AS fruit
      FROM farm_activities AS event
      JOIN farm_accounts AS account ON account.farm_id = event.visitor_id
      WHERE event.type = 'steal' AND ${WINDOW}
      GROUP BY account.username
      ORDER BY farms DESC, fruit DESC, account.username
      LIMIT $3
    `, range),
    queryFarmDatabase<{ username: string; thieves: number; fruit: number }>(`
      SELECT account.username, COUNT(DISTINCT event.visitor_id)::int AS thieves, SUM(event.amount)::int AS fruit
      FROM farm_activities AS event
      JOIN farm_accounts AS account ON account.farm_id = event.host_id
      WHERE event.type = 'steal' AND ${WINDOW}
      GROUP BY account.username
      ORDER BY thieves DESC, fruit DESC, account.username
      LIMIT $3
    `, range),
    queryFarmDatabase<{ username: string; pet: string | null; blocked_visitors: number; blocks: number }>(`
      SELECT account.username, MIN(farm.state->>'pet') AS pet,
        COUNT(DISTINCT event.visitor_id)::int AS blocked_visitors, COUNT(*)::int AS blocks
      FROM farm_activities AS event
      JOIN farm_accounts AS account ON account.farm_id = event.host_id
      JOIN farm_guest_progress AS farm ON farm.session_id = event.host_id
      WHERE event.type = 'pet_block' AND ${WINDOW}
      GROUP BY account.username
      ORDER BY blocked_visitors DESC, blocks DESC, account.username
      LIMIT $3
    `, range),
  ]);

  const species = (pet: string | null): PetSpecies => (pet === 'cat' || pet === 'goose' ? pet : 'dog');
  return {
    weekStart,
    weekEnd,
    generatedAt: now,
    thieves: thieves.rows satisfies LeaderboardThief[],
    robbed: robbed.rows satisfies LeaderboardRobbedFarm[],
    guards: guards.rows.map((row): LeaderboardGuard => ({
      username: row.username, pet: species(row.pet), blockedVisitors: row.blocked_visitors, blocks: row.blocks,
    })),
  };
}
