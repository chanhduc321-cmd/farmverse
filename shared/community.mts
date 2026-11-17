import type { FarmResponse, PetSpecies, Plot } from './farm.mts';

export const COMMUNITY_API = {
  players: '/community/players',
  invite: '/community/friends/:username/invite',
  confirm: '/community/friends/:username/confirm',
  visit: '/community/farms/:username',
  /** Read-only view for a shared farm link. Needs no account and records no visit. */
  publicVisit: '/community/public/farms/:username',
  /** This week's rankings. Public, so it can be screenshotted and shared by anyone. */
  leaderboard: '/community/leaderboard',
  steal: '/community/farms/:username/steal',
} as const;

export type PlayerList = 'residents' | 'friends' | 'invitations';
export const COMMUNITY_SEARCH_MIN = 3;
export const COMMUNITY_PAGE_SIZE = 12;
export const COMMUNITY_RESULT_LIMIT = 120;
export interface PlayerPage {
  players: { username: string }[];
  nextOffset: number | null;
}

export interface FarmVisit {
  username: string;
  theme: number;
  serverTime: number;
  pet?: PetSpecies;
  plots: (Pick<Plot, 'cropId' | 'plantedAt' | 'harvested' | 'watered' | 'fertilized'> & { remainingFruit: number | null; canSteal: boolean } | null)[];
}

export interface StealRequest {
  plot: number;
  plantedAt: number;
}

export interface StealResponse extends FarmResponse {
  visit: FarmVisit;
  blocked: boolean;
}

export const FARM_USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const FARM_LINK_PREFIX = '/farm/';
export const FARM_LINK_PARAM = 'farm';

/** Path of the shareable page for a player's farm, e.g. `/farm/an_nguyen`. */
export function farmLinkPath(username: string): string {
  return `${FARM_LINK_PREFIX}${encodeURIComponent(username)}`;
}

/**
 * Reads the farm owner from a shared link. Accepts `/farm/<username>` and the
 * `?farm=<username>` fallback, and returns `null` when a link names an invalid player.
 */
export function parseFarmLink(pathname: string, search: string): string | null | undefined {
  let candidate: string | null | undefined;
  if (pathname.startsWith(FARM_LINK_PREFIX)) {
    candidate = pathname.slice(FARM_LINK_PREFIX.length).replace(/\/$/, '');
  } else {
    candidate = new URLSearchParams(search).get(FARM_LINK_PARAM) ?? undefined;
  }
  if (candidate === undefined) return undefined;
  let username: string;
  try {
    username = decodeURIComponent(candidate ?? '').trim().toLowerCase();
  } catch {
    return null;
  }
  return FARM_USERNAME_PATTERN.test(username) ? username : null;
}

export const LEADERBOARD_SIZE = 5;
const VIETNAM_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** Start of the leaderboard week containing `now`: Monday 00:00 in Vietnam, as a UTC timestamp. */
export function leaderboardWeekStart(now: number): number {
  const day = Math.floor((now + VIETNAM_OFFSET_MS) / DAY_MS);
  // 1 January 1970 was a Thursday, so day 4 was the first Monday.
  const monday = day - ((day + 3) % 7);
  return monday * DAY_MS - VIETNAM_OFFSET_MS;
}

export interface LeaderboardThief {
  username: string;
  /** Different farms this player took fruit from; repeat raids on one farm count once. */
  farms: number;
  fruit: number;
}

export interface LeaderboardRobbedFarm {
  username: string;
  /** Different players who took fruit from this farm. */
  thieves: number;
  fruit: number;
}

export interface LeaderboardGuard {
  username: string;
  pet: PetSpecies;
  /** Different players this farm's pet turned away. */
  blockedVisitors: number;
  blocks: number;
}

export interface WeeklyLeaderboard {
  weekStart: number;
  weekEnd: number;
  generatedAt: number;
  thieves: LeaderboardThief[];
  robbed: LeaderboardRobbedFarm[];
  guards: LeaderboardGuard[];
}
