import { readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Đặt DATABASE_URL trước khi chạy migration.');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 2_000 });
  try {
    for (const name of ['003_crop_farm_guest.sql', '004_farm_accounts.sql', '005_farm_merchant.sql']) {
      const migration = new URL(`../migrations/${name}`, import.meta.url);
      await pool.query(await readFile(migration, 'utf8'));
    }
    console.log('Đã cập nhật lưu tiến độ, tài khoản và giao dịch Farm.');
  } catch (error) {
    console.error('Không chạy được migration Farm.', (error as { code?: string }).code ?? '');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
