import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('missing or unreachable PostgreSQL never starts RAM gameplay', () => {
  for (const connection of ['', 'postgresql://offline_test:unused@127.0.0.1:1/unavailable']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import app from './src/app.ts';
      const health = await app.request('/health');
      assert.equal(health.status, 503);
      const farm = await app.request('/farm');
      assert.equal(farm.status, 503);
      assert.equal(farm.headers.get('set-cookie'), null);
      assert.equal('farm' in await farm.json(), false);
    `], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, DATABASE_URL: connection },
      encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});
