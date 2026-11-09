import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { ripeAt } from '../../shared/farm.mts';
import type { Crop, Farm, FarmAction } from '../../shared/farm.mts';

const names = [
  'Dâu tây', 'Ngô', 'Củ cải trắng', 'Cà rốt', 'Khoai tây',
  'Cà tím', 'Cà chua', 'Đậu xanh', 'Ớt', 'Bí đỏ',
  'Táo', 'Dưa hấu', 'Chuối', 'Đào', 'Dứa',
];

export const crops: Crop[] = names.map((name, index) => {
  const id = index + 1;
  const source = new URL(`../../image/crops/crop${id}/crop.txt`, import.meta.url);
  const entries = new TextDecoder('gbk').decode(readFileSync(source)).trim().split(/\r?\n/);
  const values = new Map(entries.map((line) => {
    const [key, value] = line.split('=');
    return [key, Number(value)] as const;
  }));
  const stages = values.get('stageCount');
  const unitSeconds = values.get('unitTime');
  const buyPrice = values.get('seedMoney');
  const sellPrice = values.get('sellMoney');
  const level = values.get('buyLevel');
  if (!stages || !unitSeconds || !buyPrice || !sellPrice || !level) {
    throw new Error(`Invalid HappyFarm crop data for crop ${id}`);
  }
  return { id, name, stages, unitSeconds, buyPrice, sellPrice, level };
});

export function createFarm(): Farm {
  return { coins: 200, xp: 0, level: 1, theme: 1, seeds: {}, produce: {}, plots: Array(6).fill(null) };
}

export function parseAction(value: unknown): FarmAction | null {
  if (!value || typeof value !== 'object') return null;
  const { type, cropId, quantity, plot } = value as Record<string, unknown>;
  const validCrop = typeof cropId === 'number' && crops.some((crop) => crop.id === cropId);
  const validPlot = typeof plot === 'number' && Number.isInteger(plot) && plot >= 0 && plot < 6;
  switch (type) {
    case 'buy':
    case 'sell':
      if (validCrop && typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 999) {
        return { type, cropId, quantity };
      }
      break;
    case 'plant':
      if (validPlot && validCrop) return { type, plot, cropId };
      break;
    case 'harvest':
    case 'clear':
      if (validPlot) return { type, plot };
      break;
    case 'theme':
      return { type };
  }
  return null;
}

export class FarmError extends Error {}

function addXp(farm: Farm, xp: number): void {
  farm.xp += xp;
  if (farm.xp >= farm.level * 200) {
    farm.xp -= farm.level * 200;
    farm.level++;
  }
}

export function applyAction(farm: Farm, action: FarmAction, now: number): string {
  if (action.type === 'theme') {
    farm.theme = farm.theme % 4 + 1;
    return `Đã đổi cảnh nền ${farm.theme}.`;
  }

  if (action.type === 'buy' || action.type === 'sell') {
    const crop = crops[action.cropId - 1];
    if (action.type === 'buy') {
      const cost = crop.buyPrice * action.quantity;
      if (farm.level < crop.level) throw new FarmError(`Cần đạt cấp ${crop.level}.`);
      if (farm.coins < cost) throw new FarmError('Anh chưa đủ xu để mua số hạt này.');
      farm.coins -= cost;
      farm.seeds[crop.id] = (farm.seeds[crop.id] ?? 0) + action.quantity;
      return `Đã mua ${action.quantity} hạt ${crop.name.toLowerCase()}.`;
    }
    const count = farm.produce[crop.id] ?? 0;
    if (count < action.quantity) throw new FarmError('Kho không đủ nông sản để bán.');
    const amount = crop.sellPrice * action.quantity;
    farm.produce[crop.id] = count - action.quantity;
    farm.coins += amount;
    return `Đã bán ${action.quantity} ${crop.name.toLowerCase()} và nhận ${amount} xu.`;
  }

  if (action.type === 'plant') {
    if (farm.plots[action.plot]) throw new FarmError('Ô này đang có cây.');
    const count = farm.seeds[action.cropId] ?? 0;
    if (count < 1) throw new FarmError('Túi đã hết hạt giống này.');
    farm.seeds[action.cropId] = count - 1;
    farm.plots[action.plot] = { cropId: action.cropId, plantedAt: now, harvested: false };
    addXp(farm, 5);
    return `Đã gieo ô ${action.plot + 1}.`;
  }

  const plot = farm.plots[action.plot];
  if (!plot) throw new FarmError('Ô này đang trống.');
  if (action.type === 'clear') {
    if (!plot.harvested) throw new FarmError('Hãy thu hoạch trước khi dọn đất.');
    farm.plots[action.plot] = null;
    addXp(farm, 3);
    return `Đã dọn ô ${action.plot + 1}.`;
  }

  const crop = crops[plot.cropId - 1];
  if (plot.harvested) throw new FarmError('Ô này đã thu hoạch. Chọn xẻng để dọn đất.');
  if (now < ripeAt(crop, plot)) throw new FarmError('Cây chưa chín.');
  const amount = randomInt(10, 30);
  farm.produce[crop.id] = (farm.produce[crop.id] ?? 0) + amount;
  plot.harvested = true;
  addXp(farm, 1);
  return `Thu hoạch ${amount} ${crop.name.toLowerCase()} vào kho.`;
}
