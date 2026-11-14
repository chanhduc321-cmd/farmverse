import pg from 'pg';

export async function withDatabaseLock<T>(key: string, operation: () => Promise<T>, namespace?: number) {
  // Keep the lock in its own transaction so it also works with transaction pooling.
  // Domain writes use the application pool and commit before external calls.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    if (namespace === undefined) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
    else await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [namespace, key]);
    return await operation();
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
}
