import { randomBytes, randomInt } from 'node:crypto';
import pg from 'pg';
import type { PetSpecies } from '../../shared/farm.mts';
import { ripeAt } from '../../shared/farm.mts';
import { createFarm } from '../../shared/farm-rules.mts';
import { crops } from './catalog.ts';
import { createMerchant } from './merchant.ts';

const connectionString = process.env.DATABASE_URL;
const friendOf = process.argv[2]?.trim().toLowerCase();
if (!connectionString || (friendOf !== undefined && !/^[a-z0-9_]{3,24}$/.test(friendOf)) || process.argv.length > 3) {
  console.error('Dùng DATABASE_URL và chạy seed:friends [tên tài khoản cần kết bạn].');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 15_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(9810627)');
      const { rows: [owner] } = friendOf
        ? await client.query<{ farm_id: string }>('SELECT farm_id FROM farm_accounts WHERE username = $1', [friendOf])
        : { rows: [] };
      if (friendOf && !owner) throw new Error('Không tìm thấy tài khoản cần kết bạn.');

      const species: PetSpecies[] = ['dog', 'cat', 'goose'];
      const pets = [...species, ...species, ...species, species[randomInt(species.length)]];
      const now = Date.now();
      let created = 0;
      for (let index = 0; index < 10; index++) {
        const number = String(index + 1).padStart(2, '0');
        const id = `73a32c4c-8502-4ea9-b958-8b9b264ada${number}`;
        const username = `farm_ban_${number}`;
        if (owner?.farm_id === id) throw new Error('Chọn tài khoản người chơi để kết bạn.');
        const { rows: existing } = await client.query<{ farm_id: string; username: string }>(
          'SELECT farm_id, username FROM farm_accounts WHERE farm_id = $1 OR username = $2', [id, username],
        );
        if (existing.some(account => account.farm_id !== id || account.username !== username)) {
          throw new Error(`Tên hoặc ID seed bị trùng: ${username}.`);
        }
        const pet = pets.splice(randomInt(pets.length), 1)[0];
        if (existing.length === 0) {
          const farm = createFarm();
          farm.pet = pet;
          farm.theme = index % 4 + 1;
          farm.plots = farm.plots.map((_, plot) => {
            const crop = crops[(index * farm.plots.length + plot) % crops.length];
            const planted = { cropId: crop.id, plantedAt: 0, harvested: false, yieldRoll: randomInt(20) / 20 };
            planted.plantedAt = now - ripeAt(crop, planted) - 1_000;
            return planted;
          });
          await client.query(
            'INSERT INTO farm_guest_progress (session_id, state, merchant_state, claimed) VALUES ($1, $2, $3, true)',
            [id, farm, createMerchant(now)],
          );
          const passwordHash = `${randomBytes(16).toString('hex')}:${randomBytes(32).toString('hex')}`;
          await client.query('INSERT INTO farm_accounts (farm_id, username, password_hash) VALUES ($1, $2, $3)',
            [id, username, passwordHash]);
          created++;
        }
        if (owner) {
          await client.query(`
            INSERT INTO farm_friendships (sender_id, recipient_id, confirmed) VALUES ($1, $2, true)
            ON CONFLICT (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id))
            DO UPDATE SET confirmed = true
          `, [owner.farm_id, id]);
        }
      }
      await client.query('COMMIT');
      console.log(`Seed hoàn tất. Tạo mới ${created}/10 cư dân${friendOf ? `, đã nối danh sách Bạn bè của ${friendOf}` : ''}.`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error && !('code' in error) ? error.message : (error as { code?: string }).code;
    console.error('Seed không thành công.', message ?? '');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
