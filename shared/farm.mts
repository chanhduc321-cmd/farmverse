import type { FarmProgression, MissionClaim } from './progression.mts';

export const FARM_API = {
  read: { path: '/farm' },
  catalog: { path: '/crops' },
  batch: { path: '/farm/batch' },
  buy: { path: '/farm/buy' },
  buyFertilizer: { path: '/farm/buy-fertilizer' },
  sell: { path: '/farm/sell' },
  plant: { path: '/farm/plant' },
  harvest: { path: '/farm/harvest' },
  clear: { path: '/farm/clear' },
  water: { path: '/farm/water' },
  fertilize: { path: '/farm/fertilize' },
  theme: { path: '/farm/actions' },
  claimMission: { path: '/farm/missions/claim' },
  checkIn: { path: '/farm/check-in' },
  selectPet: { path: '/farm/pet' },
} as const;

export const ACCOUNT_API = {
  register: { path: '/account/register' },
  login: { path: '/account/login' },
  logout: { path: '/account/logout' },
} as const;

export interface AccountCredentials {
  username: string;
  password: string;
}

export interface Crop {
  id: number;
  name: string;
  stages: number;
  readyFrame: number;
  unitSeconds: number;
  buyPrice: number;
  sellPrice: number;
  level: number;
}

export interface Plot {
  cropId: number;
  plantedAt: number;
  harvested: boolean;
  /** Roll fixed at sowing. Older saves omit it. */
  yieldRoll?: number;
  fruitTaken?: number;
  watered?: boolean;
  fertilized?: boolean;
}

export type PetSpecies = 'dog' | 'cat' | 'goose';

export interface Farm {
  revision: number;
  gold: number;
  xp: number;
  level: number;
  theme: number;
  seeds: Record<number, number>;
  /** Saves created before fertilizer was sold omit this field. */
  fertilizer?: number;
  produce: Record<number, number>;
  plots: (Plot | null)[];
  progression?: FarmProgression;
  pet?: PetSpecies;
}

export interface FarmResponse {
  farm: Farm;
  serverTime: number;
  message?: string;
}

export interface FarmSessionResponse extends FarmResponse {
  accountsAvailable: boolean;
  nearDemoAvailable: boolean;
  account: { username: string } | null;
  sessionKey: string;
}

export type FarmAction =
  | { type: 'buy' | 'sell'; cropId: number; quantity: number }
  | { type: 'buyFertilizer'; quantity: number }
  | { type: 'plant'; plot: number; cropId: number }
  | { type: 'harvest' | 'clear' | 'water' | 'fertilize'; plot: number }
  | { type: 'theme' }
  | { type: 'checkIn' }
  | { type: 'selectPet'; pet: PetSpecies }
  | ({ type: 'claimMission' } & MissionClaim);

export type FarmMutation = FarmAction & { expectedRevision: number };

export interface FarmBatchMutation {
  expectedRevision: number;
  actions: FarmAction[];
}

export interface FarmBatchRequest extends FarmBatchMutation {
  sessionKey: string;
}

export const FARM_BATCH_LIMIT = 20;

export const FERTILIZER_COST = 5;

function growthDuration(crop: Crop): number {
  return crop.unitSeconds * crop.stages * (crop.stages + 1) * 500;
}

function growthBoost(crop: Crop, plot: Plot): number {
  const percent = (plot.watered ? 10 : 0) + (plot.fertilized ? 20 : 0);
  return growthDuration(crop) * percent / 100;
}

export function stageAt(crop: Crop, plot: Plot, now: number): number {
  const units = Math.max(0, now - plot.plantedAt + growthBoost(crop, plot)) / (crop.unitSeconds * 1_000);
  return Math.min(crop.stages, Math.floor((Math.sqrt(8 * units + 1) - 1) / 2));
}

export function ripeAt(crop: Crop, plot: Plot): number {
  return plot.plantedAt + growthDuration(crop) - growthBoost(crop, plot);
}
