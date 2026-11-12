import { readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Đặt DATABASE_URL trước khi chạy migration.');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 15_000 });
  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(9810626)');
    for (const name of ['003_crop_farm_guest.sql', '004_farm_accounts.sql', '005_farm_merchant.sql', '006_farm_community.sql', '007_farm_activity.sql', '008_farm_server_access.sql']) {
      const migration = new URL(`../migrations/${name}`, import.meta.url);
      await client.query(await readFile(migration, 'utf8'));
    }
    await client.query('COMMIT');
    console.log('Đã cập nhật lưu tiến độ, tài khoản và giao dịch Farm.');
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => undefined);
    console.error('Không chạy được migration Farm.', (error as { code?: string }).code ?? '');
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
