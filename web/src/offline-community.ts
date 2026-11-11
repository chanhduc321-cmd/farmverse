import type { FarmVisit, PlayerPage, StealRequest, StealResponse } from '../../shared/community.mts';
import type { Crop, FarmResponse } from '../../shared/farm.mts';

const demoFriends = ['an', 'bao', 'lan', 'linh', 'mai'];
const demoPlantedAt = 1;

export function createOfflineCommunity(catalog: readonly Crop[], takeFruit: (crop: Crop) => FarmResponse) {
  const taken = new Set<string>();

  function visit(username: string): FarmVisit {
    const friend = demoFriends.indexOf(username);
    if (friend < 0) throw new Error('Không tìm thấy ruộng.', { cause: 404 });
    return {
      username,
      theme: friend % 4 + 1,
      serverTime: Date.now(),
      plots: Array.from({ length: 6 }, (_, index) => {
        const alreadyTaken = taken.has(`${username}:${index}`);
        return {
          cropId: catalog[(friend * 6 + index) % catalog.length].id,
          plantedAt: demoPlantedAt,
          harvested: false,
          remainingFruit: alreadyTaken ? 9 : 10,
          canSteal: !alreadyTaken,
        };
      }),
    };
  }

  return {
    listFriends(query: string): PlayerPage {
      return { players: demoFriends.filter(username => username.includes(query)).map(username => ({ username })), nextOffset: null };
    },
    visit,
    steal(username: string, action: StealRequest): StealResponse {
      const plot = visit(username).plots[action.plot];
      if (!plot || plot.plantedAt !== action.plantedAt || !plot.canSteal) {
        throw new Error('Bạn không thể lấy thêm quả ở ô này.', { cause: 409 });
      }
      const result = takeFruit(catalog[plot.cropId - 1]);
      taken.add(`${username}:${action.plot}`);
      return { ...result, visit: visit(username) };
    },
  };
}
