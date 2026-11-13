import { copyFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { CROP_COUNT } from '../shared/crop-catalog.mts';

const output = '.vercel/output';
const functionDir = join(output, 'functions/api/farmverse.func');
// Preserve the crop catalog's path relative to backend/src in the function.
const handler = 'backend/src/vercel.mjs';

await build({
  entryPoints: ['backend/src/vercel.ts'],
  outfile: join(functionDir, handler),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

for (let id = 1; id <= CROP_COUNT; id++) {
  const source = `image/crops/crop${id}/crop.txt`;
  const destination = join(functionDir, source);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

await cp('web/dist', join(output, 'static'), { recursive: true });
await writeFile(join(functionDir, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler,
  launcherType: 'Nodejs',
  useWebApi: true,
}));
await writeFile(join(output, 'config.json'), JSON.stringify({
  version: 3,
  routes: [{ src: '^/api(?:/(.*))?$', dest: '/api/farmverse?__farm_route=$1' }],
}));
