import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import pg from 'pg';
import type { HealthResponse } from '../../shared/health.ts';
import { createFarmRoutes } from './farm-routes.js';
import { createMerchantRoutes } from './merchant-routes.js';

if (existsSync('.env')) loadEnvFile('.env');

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? new pg.Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 2_000,
  query_timeout: 2_000,
}) : undefined;

// The pool discards failed idle clients. Handle the event so it can reconnect.
database?.on('error', () => console.warn('An idle PostgreSQL connection was lost.'));

const app = new Hono();
app.route('/', createFarmRoutes(database));
app.route('/', createMerchantRoutes(database));

app.get('/health', async (context) => {
  context.header('Cache-Control', 'no-store');
  const unavailable = { status: 'unavailable' } satisfies HealthResponse;
  if (!database) return context.json(unavailable, 503);

  try {
    await database.query('SELECT 1');
    return context.json({ status: 'ok' } satisfies HealthResponse, 200);
  } catch {
    return context.json(unavailable, 503);
  }
});

serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port: Number(process.env.PORT ?? 8080),
}, ({ address, port }) => console.log(`FarmVerse API listening on http://${address}:${port}`));
