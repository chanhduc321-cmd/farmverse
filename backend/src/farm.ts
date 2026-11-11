import type { Farm, FarmMutation } from '../../shared/farm.mts';
import { applyFarmAction } from '../../shared/farm-rules.mts';
import { crops } from './catalog.ts';

export { createFarm, FarmError } from '../../shared/farm-rules.mts';

export function parseAction(type: FarmMutation['type'], value: unknown): FarmMutation | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const { expectedRevision, cropId, quantity, plot } = value as Record<string, unknown>;
  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return;
  if (type === 'theme') return { type, expectedRevision };
  if (type === 'buy' || type === 'sell') {
    if (typeof cropId !== 'number' || !Number.isInteger(cropId) || !crops[cropId - 1]) return;
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity)) return;
    const min = type === 'buy' ? 1 : 0;
    const max = type === 'buy' ? 99 : 999;
    if (quantity >= min && quantity <= max) return { type, cropId, quantity, expectedRevision };
    return;
  }
  if (typeof plot !== 'number' || !Number.isInteger(plot) || plot < 0 || plot >= 6) return;
  if (type !== 'plant') return { type, plot, expectedRevision };
  if (typeof cropId === 'number' && Number.isInteger(cropId) && crops[cropId - 1]) {
    return { type, plot, cropId, expectedRevision };
  }
}

export function applyAction(farm: Farm, action: FarmMutation, now: number, random = Math.random): string {
  return applyFarmAction(farm, action, now, crops, random);
}
