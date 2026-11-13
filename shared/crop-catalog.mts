import type { Crop } from './farm.mts';

export const CROP_COUNT = 16;

export function parseCrop(id: number, source: string): Crop {
  const fields = Object.fromEntries(source.trim().split(/\r?\n/).map((line) => line.split('=')));
  const crop = {
    id,
    name: fields.name,
    stages: Number(fields.stageCount),
    readyFrame: Number(fields.readyFrame ?? fields.stageCount),
    unitSeconds: Number(fields.unitTime),
    buyPrice: Number(fields.seedMoney),
    sellPrice: Number(fields.sellMoney),
    level: Number(fields.buyLevel),
  };
  if (Number(fields.cropId) !== id || !crop.name || [crop.stages, crop.readyFrame, crop.unitSeconds, crop.buyPrice, crop.sellPrice, crop.level]
    .some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error(`Cấu hình cây ${id} không hợp lệ.`);
  }
  return crop;
}
