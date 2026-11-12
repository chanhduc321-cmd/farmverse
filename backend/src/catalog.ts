import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CROP_COUNT, parseCrop } from '../../shared/crop-catalog.mts';

export const crops = Array.from({ length: CROP_COUNT }, (_, index) => {
  const id = index + 1;
  const path = `image/crops/crop${id}/crop.txt`;
  const file = process.env.VERCEL ? resolve(process.cwd(), path) : new URL(`../../${path}`, import.meta.url);
  return parseCrop(id, readFileSync(file, 'utf8'));
});
