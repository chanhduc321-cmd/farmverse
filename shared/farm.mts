export interface Crop {
  id: number;
  name: string;
  stages: number;
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
  coins: number;
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

export type FarmAction =
  | { type: 'buy'; cropId: number; quantity: number }
  | { type: 'sell'; cropId: number; quantity: number }
  | { type: 'plant'; plot: number; cropId: number }
  | { type: 'harvest'; plot: number }
  | { type: 'clear'; plot: number }
  | { type: 'theme' };

export function stageAt(crop: Crop, plot: Plot, now: number): number {
  const units = Math.max(0, now - plot.plantedAt) / (crop.unitSeconds * 1_000);
  return Math.min(crop.stages, Math.floor((Math.sqrt(8 * units + 1) - 1) / 2));
}

export function ripeAt(crop: Crop, plot: Plot): number {
  return plot.plantedAt + crop.unitSeconds * crop.stages * (crop.stages + 1) * 500;
}
