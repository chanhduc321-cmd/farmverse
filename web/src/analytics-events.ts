import type { FarmAction } from '../../shared/farm.mts';
import type { AnalyticsParams } from './analytics.ts';

export interface AnalyticsEvent {
  name: string;
  params: AnalyticsParams;
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function farmActionParams(action: FarmAction): AnalyticsParams {
  switch (action.type) {
    case 'buy':
    case 'sell':
      return { crop_id: action.cropId, quantity: action.quantity };
    case 'buyFertilizer':
      return { quantity: action.quantity };
    case 'plant':
      return { crop_id: action.cropId };
    case 'selectPet':
      return { pet: action.pet };
    case 'claimMission':
      return { mission: action.mission };
    default:
      return {};
  }
}

/** Maps a successful farm action to its GA4 event, e.g. `buyFertilizer` → `farm_buy_fertilizer`. */
export function farmActionEvent(action: FarmAction): AnalyticsEvent {
  return { name: `farm_${snakeCase(action.type)}`, params: farmActionParams(action) };
}
