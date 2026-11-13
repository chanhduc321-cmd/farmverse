import { FARM_BATCH_LIMIT } from '../../shared/farm.mts';
import type { Farm, FarmAction, FarmBatchMutation, FarmMutation } from '../../shared/farm.mts';
import { applyFarmAction, applyFarmBatch } from '../../shared/farm-rules.mts';
import { crops } from './catalog.ts';

export { createFarm, FarmError } from '../../shared/farm-rules.mts';

export function parseAction(type: unknown, value: unknown): FarmMutation | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const { expectedRevision, cropId, quantity, plot } = value as Record<string, unknown>;
  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return;
  if (type === 'theme' || type === 'checkIn') return { type, expectedRevision };
  if (type === 'selectPet') {
    const { pet } = value as Record<string, unknown>;
    if (pet === 'dog' || pet === 'cat' || pet === 'goose') return { type, pet, expectedRevision };
    return;
  }
  if (type === 'claimMission') {
    const { mission, day } = value as Record<string, unknown>;
    if (mission === 'first') return { type, mission, expectedRevision };
    if (mission === 'daily' && typeof day === 'number' && Number.isSafeInteger(day) && day >= 0) {
      return { type, mission, day, expectedRevision };
    }
    return;
  }
  if (type === 'buy' || type === 'buyFertilizer' || type === 'sell') {
    const min = type === 'sell' ? 0 : 1;
    const max = type === 'sell' ? 999 : 99;
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < min || quantity > max) return;
    if (type === 'buyFertilizer') return { type, quantity, expectedRevision };
    if (typeof cropId === 'number' && Number.isInteger(cropId) && crops[cropId - 1]) {
      return { type, cropId, quantity, expectedRevision };
    }
    return;
  }
  if (typeof plot !== 'number' || !Number.isInteger(plot) || plot < 0 || plot >= 6) return;
  if (type === 'harvest' || type === 'clear' || type === 'water' || type === 'fertilize') {
    return { type, plot, expectedRevision };
  }
  if (type === 'plant' && typeof cropId === 'number' && Number.isInteger(cropId) && crops[cropId - 1]) {
    return { type, plot, cropId, expectedRevision };
  }
}

export function applyAction(farm: Farm, action: FarmMutation, now: number, random = Math.random): string {
  return applyFarmAction(farm, action, now, crops, random);
}

export function parseBatch(value: unknown): FarmBatchMutation | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const { expectedRevision, actions } = value as Record<string, unknown>;
  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return;
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > FARM_BATCH_LIMIT) return;
  const parsedActions: FarmAction[] = [];
  for (const item of actions) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return;
    const type = (item as { type?: unknown }).type;
    const parsed = parseAction(type, { ...item, expectedRevision });
    if (!parsed) return;
    const { expectedRevision: _, ...action } = parsed;
    parsedActions.push(action);
  }
  return { expectedRevision, actions: parsedActions };
}

export function applyBatch(farm: Farm, batch: FarmBatchMutation, now: number, random = Math.random): string[] {
  return applyFarmBatch(farm, batch, now, crops, random);
}
