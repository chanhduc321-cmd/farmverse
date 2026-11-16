import type { FarmResponse, PetSpecies, Plot } from './farm.mts';

export const COMMUNITY_API = {
  players: '/community/players',
  invite: '/community/friends/:username/invite',
  confirm: '/community/friends/:username/confirm',
  visit: '/community/farms/:username',
  /** Read-only view for a shared farm link. Needs no account and records no visit. */
  publicVisit: '/community/public/farms/:username',
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
