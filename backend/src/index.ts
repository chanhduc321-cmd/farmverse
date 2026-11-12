import { serve } from '@hono/node-server';
import app from './app.ts';
import { farmStorageMode } from './farm-store.ts';

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: Number(process.env.PORT ?? 8092) },
  ({ address, port }) => console.log(`FarmVerse API listening at http://${address}:${port} (${farmStorageMode})`));
