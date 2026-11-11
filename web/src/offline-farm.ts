/// <reference types="vite/client" />
import { CROP_COUNT, parseCrop } from '../../shared/crop-catalog.mts';
import type { Farm, FarmMutation, FarmResponse } from '../../shared/farm.mts';
import { applyFarmAction, createFarm } from '../../shared/farm-rules.mts';
import { createOfflineCommunity } from './offline-community.ts';

const files = import.meta.glob<string>('../../image/crops/crop*/crop.txt', {
  query: '?raw', import: 'default', eager: true,
});

export function openOfflineFarm() {
  const catalog = Array.from({ length: CROP_COUNT }, (_, index) => {
    const id = index + 1;
    return parseCrop(id, files[`../../image/crops/crop${id}/crop.txt`]);
  });
  let farm = createFarm();

  function read(): FarmResponse {
    return { farm, serverTime: Date.now() };
  }

  function write(update: (next: Farm, serverTime: number) => string): FarmResponse {
    const next = structuredClone(farm);
    const serverTime = Date.now();
    const message = update(next, serverTime);
    farm = next;
    return { farm, serverTime, message };
  }

  const community = createOfflineCommunity(catalog, (crop) => write(next => {
    next.produce[crop.id] = (next.produce[crop.id] ?? 0) + 1;
    next.revision++;
    return `Đã lấy 1 quả ${crop.name}.`;
  }));

  return {
    catalog,
    initial: read(),
    read,
    community,
    apply(action: FarmMutation): FarmResponse {
      return write((next, serverTime) => applyFarmAction(next, action, serverTime, catalog));
    },
  };
}
