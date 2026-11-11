import { readFileSync } from 'node:fs';
import { CROP_COUNT, parseCrop } from '../../shared/crop-catalog.mts';

export const crops = Array.from({ length: CROP_COUNT }, (_, index) => {
  const id = index + 1;
  const file = new URL(`../../image/crops/crop${id}/crop.txt`, import.meta.url);
  return parseCrop(id, readFileSync(file, 'utf8'));
});
