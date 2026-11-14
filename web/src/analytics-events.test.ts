import { describe, expect, test } from 'vitest';
import type { FarmAction } from '../../shared/farm.mts';
import { farmActionEvent } from './analytics-events.ts';

const GA4_EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;

const actions: FarmAction[] = [
  { type: 'buy', cropId: 1, quantity: 3 },
  { type: 'sell', cropId: 2, quantity: 4 },
  { type: 'buyFertilizer', quantity: 2 },
  { type: 'plant', plot: 0, cropId: 1 },
  { type: 'harvest', plot: 1 },
  { type: 'clear', plot: 1 },
  { type: 'water', plot: 2 },
  { type: 'fertilize', plot: 2 },
  { type: 'theme' },
  { type: 'checkIn' },
  { type: 'selectPet', pet: 'goose' },
  { type: 'claimMission', mission: 'first' },
  { type: 'claimMission', mission: 'daily', day: 3 },
];

describe('farmActionEvent', () => {
  test.each(actions)('maps $type to a valid GA4 event name', action => {
    const event = farmActionEvent(action);

    expect(event.name).toMatch(GA4_EVENT_NAME);
    expect(event.name.startsWith('farm_')).toBe(true);
  });

  test('gives every action type a distinct event name', () => {
    const names = new Set(actions.map(action => farmActionEvent(action).name));

    expect(names.size).toBe(new Set(actions.map(action => action.type)).size);
  });

  test('converts camelCase action types to snake_case', () => {
    expect(farmActionEvent({ type: 'buyFertilizer', quantity: 1 }).name).toBe('farm_buy_fertilizer');
    expect(farmActionEvent({ type: 'checkIn' }).name).toBe('farm_check_in');
  });

  test('carries crop and quantity for trades', () => {
    expect(farmActionEvent({ type: 'buy', cropId: 5, quantity: 7 }).params).toEqual({ crop_id: 5, quantity: 7 });
  });

  test('carries the crop for planting but not the plot index', () => {
    expect(farmActionEvent({ type: 'plant', plot: 9, cropId: 4 }).params).toEqual({ crop_id: 4 });
  });

  test('carries pet and mission details', () => {
    expect(farmActionEvent({ type: 'selectPet', pet: 'cat' }).params).toEqual({ pet: 'cat' });
    expect(farmActionEvent({ type: 'claimMission', mission: 'daily', day: 2 }).params).toEqual({ mission: 'daily' });
  });

  test('sends no params for plot-only actions', () => {
    expect(farmActionEvent({ type: 'harvest', plot: 3 }).params).toEqual({});
  });
});
