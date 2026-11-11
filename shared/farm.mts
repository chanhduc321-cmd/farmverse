export const FARM_API = {
  read: { path: '/farm' },
  catalog: { path: '/crops' },
  buy: { path: '/farm/buy' },
  sell: { path: '/farm/sell' },
  plant: { path: '/farm/plant' },
  harvest: { path: '/farm/harvest' },
  clear: { path: '/farm/clear' },
  theme: { path: '/farm/actions' },
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
}

export interface Farm {
  revision: number;
  gold: number;
  xp: number;
  level: number;
  theme: number;
  seeds: Record<number, number>;
  produce: Record<number, number>;
  plots: (Plot | null)[];
}

export interface FarmResponse {
  farm: Farm;
  serverTime: number;
  message?: string;
}

export interface FarmSessionResponse extends FarmResponse {
  accountsAvailable: boolean;
  account: { username: string } | null;
}

export type FarmAction =
  | { type: 'buy' | 'sell'; cropId: number; quantity: number }
  | { type: 'plant'; plot: number; cropId: number }
  | { type: 'harvest' | 'clear'; plot: number }
  | { type: 'theme' };

export type FarmMutation = FarmAction & { expectedRevision: number };

export function stageAt(crop: Crop, plot: Plot, now: number): number {
  const units = Math.max(0, now - plot.plantedAt) / (crop.unitSeconds * 1_000);
  return Math.min(crop.stages, Math.floor((Math.sqrt(8 * units + 1) - 1) / 2));
}

export function ripeAt(crop: Crop, plot: Plot): number {
  return plot.plantedAt + crop.unitSeconds * crop.stages * (crop.stages + 1) * 500;
}
