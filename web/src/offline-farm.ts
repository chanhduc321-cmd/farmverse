/// <reference types="vite/client" />
import { CROP_COUNT, parseCrop } from '../../shared/crop-catalog.mts';
import type { Farm, FarmMutation, FarmResponse } from '../../shared/farm.mts';
import { applyFarmAction, createFarm } from '../../shared/farm-rules.mts';

const storageKey = 'farmverse_local_farm';
const files = import.meta.glob<string>('../../image/crops/crop*/crop.txt', {
  query: '?raw', import: 'default', eager: true,
});

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validStock(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(validCount);
}

function loadLocalFarm(sharedSave: boolean): Farm | undefined {
  try {
    const saved = sharedSave ? localStorage.getItem(storageKey)
      : sessionStorage.getItem(storageKey) ?? localStorage.getItem(storageKey);
    if (saved) {
      const state = JSON.parse(saved) as Farm & { coins?: number };
      const { coins, ...farm } = state;
      farm.gold ??= coins ?? 200;
      farm.revision ??= 0;
      if ([farm.gold, farm.revision, farm.xp, farm.level, farm.theme].every(validCount)
        && farm.level >= 1 && farm.theme >= 1 && farm.theme <= 4
        && validStock(farm.seeds) && validStock(farm.produce)
        && Array.isArray(farm.plots) && farm.plots.length === 6
        && farm.plots.every(plot => plot === null || (validCount(plot?.cropId) && plot.cropId >= 1
          && plot.cropId <= CROP_COUNT && validCount(plot.plantedAt) && typeof plot.harvested === 'boolean'))) {
        return farm;
      }
    }
  } catch {
    // A disabled browser store or an unreadable save starts a fresh demo.
  }
}

export function openOfflineFarm() {
  const catalog = Array.from({ length: CROP_COUNT }, (_, index) => {
    const id = index + 1;
    return parseCrop(id, files[`../../image/crops/crop${id}/crop.txt`]);
  });
  const locks = navigator.locks;
  const sharedSave = locks !== undefined;
  let farm = loadLocalFarm(sharedSave) ?? createFarm();

  function read(): FarmResponse {
    const saved = loadLocalFarm(sharedSave);
    if (saved && saved.revision >= farm.revision) farm = saved;
    return { farm, serverTime: Date.now() };
  }

  return {
    catalog,
    initial: read(),
    read,
    async apply(action: FarmMutation): Promise<FarmResponse> {
      const write = () => {
        const { farm: latest, serverTime } = read();
        if (action.expectedRevision !== latest.revision) {
          throw new Error('Ruộng đã thay đổi ở tab khác. Hãy thử lại.', { cause: 409 });
        }
        const next = structuredClone(latest);
        const message = applyFarmAction(next, action, serverTime, catalog);
        farm = next;
        try {
          const storage = sharedSave ? localStorage : sessionStorage;
          storage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // Continue in memory if browser storage is unavailable.
        }
        return { farm: next, serverTime, message };
      };
      return locks ? locks.request(storageKey, write) : write();
    },
  };
}
