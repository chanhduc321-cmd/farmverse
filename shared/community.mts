import type { FarmResponse, PetSpecies, Plot } from './farm.mts';

export const COMMUNITY_API = {
  players: '/community/players',
  invite: '/community/friends/:username/invite',
  confirm: '/community/friends/:username/confirm',
  visit: '/community/farms/:username',
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
