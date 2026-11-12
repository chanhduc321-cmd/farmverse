import { FERTILIZER_COST, ripeAt } from './farm.mts';
import type { Crop, Farm, FarmMutation, Plot } from './farm.mts';
import { claimMissionReward, recordCheckIn, recordMissionAction } from './progression.mts';

export function createFarm(): Farm {
  return {
    revision: 0, gold: 200, xp: 0, level: 1, theme: 1, seeds: {}, fertilizer: 0, produce: {},
    plots: Array.from({ length: 6 }, () => null), pet: 'dog',
  };
}

export class FarmError extends Error {}

export function ripeYield(crop: Crop, plot: Plot, plotIndex: number, now: number): number | undefined {
  if (plot.harvested || now < ripeAt(crop, plot)) return;

  // Saves from before yield rolls use a stable value derived from the planted crop.
  const legacySeed = plot.plantedAt + crop.id * 31 + plotIndex;
  const legacyRoll = (Math.imul(legacySeed, 0x9e3779b1) >>> 0) / 2 ** 32;
  const roll = plot.yieldRoll !== undefined && plot.yieldRoll >= 0 && plot.yieldRoll < 1
    ? plot.yieldRoll : legacyRoll;
  return 10 + Math.floor(roll * 20) - (plot.fruitTaken ?? 0);
}

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
  recordMissionAction(farm, action, now);
  farm.revision++;
  return message;
}

function applyMutation(farm: Farm, action: FarmMutation, now: number, crops: readonly Crop[], random: () => number): string {
  switch (action.type) {
    case 'selectPet':
      farm.pet = action.pet;
      return 'Đã đổi Pet giữ nhà.';
    case 'checkIn':
      if (!recordCheckIn(farm, now)) throw new FarmError('Hôm nay đã điểm danh.');
      return 'Đã điểm danh hôm nay.';
    case 'claimMission': {
      const gold = claimMissionReward(farm, action);
      if (gold === undefined) throw new FarmError('Phần thưởng chưa sẵn sàng hoặc đã nhận.');
      farm.gold += gold;
      return `Đã nhận ${gold} Gold từ nhiệm vụ.`;
    }
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
    case 'buyFertilizer': {
      const cost = FERTILIZER_COST * action.quantity;
      if (farm.gold < cost) throw new FarmError('Không đủ Gold để mua phân bón.');
      farm.gold -= cost;
      farm.fertilizer = (farm.fertilizer ?? 0) + action.quantity;
      return `Đã mua ${action.quantity} bịch phân bón.`;
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
      farm.plots[action.plot] = { cropId: action.cropId, plantedAt: now, harvested: false, yieldRoll: random() };
      addXp(farm, 5);
      return `Đã gieo ô ${action.plot + 1}.`;
    }
    case 'harvest': {
      const plot = farm.plots[action.plot];
      if (!plot) throw new FarmError('Ô đất trống. Chọn hạt trong Túi để gieo.');
      if (plot.harvested) throw new FarmError('Ô đã thu hoạch. Bấm gốc để dọn.');
      const crop = crops[plot.cropId - 1];
      const quantity = ripeYield(crop, plot, action.plot, now);
      if (quantity === undefined) throw new FarmError('Cây chưa chín.');
      farm.produce[crop.id] = (farm.produce[crop.id] ?? 0) + quantity;
      plot.harvested = true;
      addXp(farm, 1);
      return `Đã thu hoạch ${quantity} ${crop.name.toLowerCase()}. Bấm gốc để dọn.`;
    }
    case 'water':
    case 'fertilize': {
      const plot = farm.plots[action.plot];
      if (!plot || plot.harvested) throw new FarmError('Chỉ chăm được cây đang lớn.');
      const crop = crops[plot.cropId - 1];
      const readyAt = ripeAt(crop, plot);
      if (now >= readyAt) throw new FarmError('Cây đã chín. Hãy thu hoạch.');
      const isWater = action.type === 'water';
      if (isWater) {
        if (plot.watered) throw new FarmError('Vụ này đã tưới nước rồi.');
        plot.watered = true;
      } else {
        if (plot.fertilized) throw new FarmError('Vụ này đã bón phân rồi.');
        const available = farm.fertilizer ?? 0;
        if (available < 1) throw new FarmError('Đã hết phân bón. Mua thêm ở Tiệm hạt.');
        plot.fertilized = true;
        farm.fertilizer = available - 1;
      }
      const remaining = Math.ceil((ripeAt(crop, plot) - now) / 1_000);
      const care = isWater ? 'Đã tưới nước' : 'Đã bón phân';
      return remaining > 0 ? `${care}. Còn ${remaining}s nữa chín.` : `${care}. Cây đã chín!`;
    }
    case 'clear':
      if (!farm.plots[action.plot]?.harvested) throw new FarmError('Chỉ dọn được ô đã thu hoạch.');
      farm.plots[action.plot] = null;
      addXp(farm, 3);
      return `Đã dọn ô ${action.plot + 1}.`;
  }
}
