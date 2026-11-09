/** Hono routes. The browser prefixes these paths with /api. */
export const FARM_API = {
  read: { method: 'GET', path: '/farm' },
  plant: { method: 'POST', path: '/farm/plant' },
  harvest: { method: 'POST', path: '/farm/harvest' },
  quickSell: { method: 'POST', path: '/farm/quick-sell' },
  unlock: { method: 'POST', path: '/farm/unlock' },
} as const;

export const CROP_VARIANTS = ['NORMAL', 'GOLDEN'] as const;
export type CropVariant = (typeof CROP_VARIANTS)[number];

export type FarmPlot =
  | { id: number; state: 'LOCKED'; unlockCostGold: number }
  | { id: number; state: 'EMPTY' | 'READY' }
  | { id: number; state: 'GROWING'; readyAtMs: number };

export interface FarmSnapshot {
  /** Changes on committed mutations. Clock-driven growth is derived at read time. */
  revision: number;
  /** Unix time in milliseconds. Compare with readyAtMs for the display countdown. */
  serverTimeMs: number;
  gold: number;
  silo: { capacity: number; counts: Record<CropVariant, number> };
  quickSellPriceGold: Record<CropVariant, number>;
  plots: FarmPlot[];
}

/** All successes return 200. Read resumes or creates a guest via a persistent HttpOnly cookie. */
export interface FarmResponse {
  farm: FarmSnapshot;
}

/** Check and increment revision in the same transaction as the mutation. */
interface FarmMutationRequest {
  expectedRevision: number;
}

/** JSON body for plant, harvest, and unlock. */
export interface PlotActionRequest extends FarmMutationRequest {
  plotId: number;
}

export interface QuickSellRequest extends FarmMutationRequest {
  crop: CropVariant;
}

export interface HarvestResponse extends FarmResponse {
  /** The single crop added to the silo. */
  harvested: CropVariant;
}

export const FARM_ERROR_STATUS = {
  INVALID_REQUEST: 400,
  SESSION_REQUIRED: 401,
  PLOT_NOT_FOUND: 404,
  STALE_FARM: 409,
  PLOT_NOT_EMPTY: 409,
  PLOT_NOT_READY: 409,
  PLOT_NOT_LOCKED: 409,
  SILO_FULL: 409,
  CROP_UNAVAILABLE: 409,
  INSUFFICIENT_GOLD: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type FarmErrorCode = keyof typeof FARM_ERROR_STATUS;

/** For 401 or 409, read the farm again before the player retries. */
export interface FarmErrorResponse {
  error: { code: FarmErrorCode; message: string };
}

function isMutationBody(value: unknown): value is FarmMutationRequest & Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const revision = (value as Record<string, unknown>).expectedRevision;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0;
}

export function isPlotActionRequest(value: unknown): value is PlotActionRequest {
  return isMutationBody(value) && typeof value.plotId === 'number'
    && Number.isSafeInteger(value.plotId) && value.plotId > 0;
}

export function isQuickSellRequest(value: unknown): value is QuickSellRequest {
  return isMutationBody(value) && CROP_VARIANTS.some((crop) => crop === value.crop);
}
