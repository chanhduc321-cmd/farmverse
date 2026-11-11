import { ripeAt } from './farm.mts';
import type { Crop, Farm, FarmMutation } from './farm.mts';

export function createFarm(): Farm {
  return {
    revision: 0, gold: 200, xp: 0, level: 1, theme: 1, seeds: {}, produce: {},
    plots: Array.from({ length: 6 }, () => null),
  };
}

export class FarmError extends Error {}

function addXp(farm: Farm, amount: number): void {
  farm.xp += amount;
  if (farm.xp >= farm.level * 200) {
    farm.xp -= farm.level * 200;
    farm.level++;
  }
}

export function applyFarmAction(farm: Farm, action: FarmMutation, now: number, crops: readonly Crop[], random = Math.random): string {
  if (action.expectedRevision !== farm.revision) throw new FarmError('Nông trại vừa thay đổi. Hãy thử lại.');
  if (action.type === 'sell' && action.quantity === 0) return 'Chưa bán nông sản.';
  const message = applyMutation(farm, action, now, crops, random);
  farm.revision++;
  return message;
}

function applyMutation(farm: Farm, action: FarmMutation, now: number, crops: readonly Crop[], random: () => number): string {
  switch (action.type) {
    case 'theme':
      farm.theme = farm.theme % 4 + 1;
      return 'Đã đổi nền.';
    case 'buy': {
      const crop = crops[action.cropId - 1];
      const cost = crop.buyPrice * action.quantity;
      if (farm.gold < cost) throw new FarmError('Không đủ Gold để mua hạt.');
      farm.gold -= cost;
      farm.seeds[crop.id] = (farm.seeds[crop.id] ?? 0) + action.quantity;
      return `Đã mua ${action.quantity} hạt ${crop.name.toLowerCase()}.`;
    }
    case 'sell': {
      const crop = crops[action.cropId - 1];
      const available = farm.produce[crop.id] ?? 0;
      if (available < action.quantity) throw new FarmError('Kho không đủ nông sản để bán.');
      const income = crop.sellPrice * action.quantity;
      farm.produce[crop.id] = available - action.quantity;
      farm.gold += income;
      return `Đã bán ${action.quantity} ${crop.name.toLowerCase()} · +${income} Gold.`;
    }
    case 'plant': {
      if (farm.plots[action.plot]) throw new FarmError('Chọn ô đất trống để gieo.');
      const seeds = farm.seeds[action.cropId] ?? 0;
      if (seeds === 0) throw new FarmError('Túi đã hết hạt giống này.');
      farm.seeds[action.cropId] = seeds - 1;
      farm.plots[action.plot] = { cropId: action.cropId, plantedAt: now, harvested: false };
      addXp(farm, 5);
      return `Đã gieo ô ${action.plot + 1}.`;
    }
    case 'harvest': {
      const plot = farm.plots[action.plot];
      if (!plot) throw new FarmError('Ô đất trống. Chọn hạt trong Túi để gieo.');
      if (plot.harvested) throw new FarmError('Ô đã thu hoạch. Dùng Xẻng để dọn.');
      const crop = crops[plot.cropId - 1];
      if (now < ripeAt(crop, plot)) throw new FarmError('Cây chưa chín.');
      const quantity = 10 + Math.floor(random() * 20);
      farm.produce[crop.id] = (farm.produce[crop.id] ?? 0) + quantity;
      plot.harvested = true;
      addXp(farm, 1);
      return `Đã thu hoạch ${quantity} ${crop.name.toLowerCase()}. Dùng Xẻng để dọn ô.`;
    }
    case 'clear':
      if (!farm.plots[action.plot]?.harvested) throw new FarmError('Chỉ dọn được ô đã thu hoạch.');
      farm.plots[action.plot] = null;
      addXp(farm, 3);
      return `Đã dọn ô ${action.plot + 1}.`;
  }
}
