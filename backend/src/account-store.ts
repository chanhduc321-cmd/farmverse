import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { AccountCredentials, Farm } from '../../shared/farm.mts';
import { queryFarmDatabase } from './farm-store.ts';

export const accountLifetimeSeconds = 30 * 24 * 60 * 60;
const scryptOptions = { N: 32_768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const dummySalt = randomBytes(16);
const dummyKey = Buffer.alloc(32);

export function parseCredentials(value: unknown): AccountCredentials | undefined {
  if (typeof value !== 'object' || value === null) return;
  const { username, password } = value as Partial<AccountCredentials>;
  if (typeof username !== 'string' || typeof password !== 'string') return;
  const normalized = username.trim().toLowerCase();
  const passwordLength = [...password].length;
  if (!/^[a-z0-9_]{3,24}$/.test(normalized) || passwordLength < 15 || passwordLength > 128) return;
  return { username: normalized, password };
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, scryptOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function findAccountSession(tokenHash: string) {
  const result = await queryFarmDatabase<{ farm_id: string; username: string }>(`
    SELECT accounts.farm_id, accounts.username
    FROM farm_account_sessions AS sessions
    JOIN farm_accounts AS accounts USING (farm_id)
    WHERE sessions.token_hash = $1 AND sessions.expires_at > now()
  `, [tokenHash]);
  return result.rows[0];
}

export async function registerAccount(guestId: string, { username, password }: AccountCredentials) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  const passwordHash = `${salt.toString('hex')}:${key.toString('hex')}`;
  const token = randomBytes(32).toString('hex');

  // Insert the account before claiming the farm so a username conflict leaves the Guest intact.
  const result = await queryFarmDatabase<{ state: Farm }>(`
    WITH account AS (
      INSERT INTO farm_accounts (farm_id, username, password_hash)
      SELECT session_id, $2, $3 FROM farm_guest_progress WHERE session_id = $1 AND NOT claimed
      ON CONFLICT DO NOTHING
      RETURNING farm_id
    ), claimed_farm AS (
      UPDATE farm_guest_progress SET claimed = true
      FROM account WHERE session_id = account.farm_id
      RETURNING session_id, state
    ), session AS (
      INSERT INTO farm_account_sessions (token_hash, farm_id, expires_at)
      SELECT $4, session_id, now() + $5 * interval '1 second' FROM claimed_farm
      RETURNING farm_id
    )
    SELECT state FROM claimed_farm JOIN session ON farm_id = session_id
  `, [guestId, username, passwordHash, hashToken(token), accountLifetimeSeconds]);
  if (result.rows[0]) return { farm: result.rows[0].state, username, token };
}

export async function loginAccount({ username, password }: AccountCredentials) {
  const result = await queryFarmDatabase<{ farm_id: string; password_hash: string }>(`
    SELECT farm_id, password_hash FROM farm_accounts WHERE username = $1
  `, [username]);
  const account = result.rows[0];
  const [salt, storedKey] = account?.password_hash.split(':') ?? [];
  const key = await deriveKey(password, salt ? Buffer.from(salt, 'hex') : dummySalt);
  const expectedKey = storedKey ? Buffer.from(storedKey, 'hex') : dummyKey;
  if (!timingSafeEqual(key, expectedKey) || !account) return;

  const token = randomBytes(32).toString('hex');
  const session = await queryFarmDatabase<{ state: Farm }>(`
    WITH expired AS (DELETE FROM farm_account_sessions WHERE expires_at <= now()), session AS (
      INSERT INTO farm_account_sessions (token_hash, farm_id, expires_at)
      VALUES ($1, $2, now() + $3 * interval '1 second')
      RETURNING farm_id
    )
    SELECT state FROM farm_guest_progress JOIN session ON session_id = farm_id
  `, [hashToken(token), account.farm_id, accountLifetimeSeconds]);
  if (session.rows[0]) return { farm: session.rows[0].state, username, token };
}

export async function logoutAccount(tokenHash: string): Promise<void> {
  await queryFarmDatabase('DELETE FROM farm_account_sessions WHERE token_hash = $1', [tokenHash]);
}
