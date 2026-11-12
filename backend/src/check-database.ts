import pg from 'pg';
import { TLSSocket } from 'node:tls';

if (!process.env.DATABASE_URL) {
  console.error('Chưa có DATABASE_URL trong env đã chọn.');
  process.exitCode = 1;
} else {
  let client: pg.Client | undefined;
  try {
    const url = new URL(process.env.DATABASE_URL);
    client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 15_000 });
    await client.connect();
    const ssl = client.connection.stream instanceof TLSSocket && client.connection.stream.encrypted;
    const { rows: [database] } = await client.query<{ database: string }>('SELECT current_database() AS database');
    const { rows: tables } = await client.query<{ table_name: string; rls: boolean }>(`
      SELECT relname AS table_name, relrowsecurity AS rls
      FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace
      WHERE nspname = 'public' AND relkind = 'r' AND relname IN (
        'farm_guest_progress', 'farm_accounts', 'farm_account_sessions',
        'farm_friendships', 'farm_crop_steals', 'farm_activities'
      ) ORDER BY relname
    `);
    console.log(`Kết nối được ${url.hostname}:${url.port || '5432'}/${database.database}. TLS ${ssl ? 'bật' : 'tắt'}.`);
    console.log(`Có ${tables.length}/6 bảng Farm.`);
    for (const table of tables) console.log(`${table.table_name}: RLS ${table.rls ? 'bật' : 'tắt'}`);
  } catch (error) {
    console.error('Chưa kết nối được DB.', (error as { code?: string }).code ?? 'Kiểm tra URI, mật khẩu và mạng.');
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
