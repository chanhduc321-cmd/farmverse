import type { FarmVisit, PlayerList, PlayerPage, StealRequest, StealResponse } from '../../shared/community.mts';
import type { Farm } from '../../shared/farm.mts';
import { ripeYield } from '../../shared/farm-rules.mts';
import { recordActivity } from './activity-store.ts';
import { crops } from './catalog.ts';
import { queryFarmDatabase, transactFarm } from './farm-store.ts';

const PAGE_SIZE = 25;
type CommunityError = { status: 401 | 404 | 409; error: string };

export async function listPlayers(visitorId: string, list: PlayerList, search: string, offset: number): Promise<PlayerPage> {
  const { rows } = await queryFarmDatabase<{ username: string }>(`
    SELECT username FROM farm_accounts AS player
    WHERE farm_id <> $1 AND strpos(username, $3) > 0
      AND (($2 = 'residents' AND NOT EXISTS (
        SELECT 1 FROM farm_friendships
        WHERE confirmed AND (
          (sender_id = $1 AND recipient_id = player.farm_id)
          OR (recipient_id = $1 AND sender_id = player.farm_id)
        )
      )) OR ($2 <> 'residents' AND EXISTS (
        SELECT 1 FROM farm_friendships
        WHERE (recipient_id = $1 AND sender_id = player.farm_id AND confirmed = ($2 = 'friends'))
           OR ($2 = 'friends' AND confirmed AND sender_id = $1 AND recipient_id = player.farm_id)
      )))
    ORDER BY username
    LIMIT $4 OFFSET $5
  `, [visitorId, list, search, PAGE_SIZE + 1, offset]);
  return { players: rows.slice(0, PAGE_SIZE), nextOffset: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null };
}

export async function inviteFriend(senderId: string, username: string): Promise<CommunityError | undefined> {
  const { rows: [result] } = await queryFarmDatabase<{ found: boolean; inserted: boolean }>(`
    WITH target AS (
      SELECT farm_id FROM farm_accounts WHERE username = $2
    ), invitation AS (
      INSERT INTO farm_friendships (sender_id, recipient_id)
      SELECT $1, farm_id FROM target WHERE farm_id <> $1
      ON CONFLICT DO NOTHING RETURNING sender_id
    )
    SELECT EXISTS (SELECT 1 FROM target) AS found, EXISTS (SELECT 1 FROM invitation) AS inserted
  `, [senderId, username]);
  if (!result.found) return { status: 404, error: 'Không tìm thấy cư dân.' };
  if (!result.inserted) return { status: 409, error: 'Lời mời hoặc kết bạn đã tồn tại.' };
}

export async function confirmFriend(recipientId: string, username: string): Promise<CommunityError | undefined> {
  const result = await queryFarmDatabase(`
    UPDATE farm_friendships SET confirmed = true
    FROM farm_accounts
    WHERE sender_id = farm_id AND username = $2 AND recipient_id = $1 AND NOT confirmed
  `, [recipientId, username]);
  if (!result.rowCount) return { status: 409, error: 'Không có lời mời đang chờ xác nhận.' };
}

function farmVisit(username: string, farm: Farm, taken: readonly number[], now: number): FarmVisit {
  return {
    username, theme: farm.theme, serverTime: now, pet: farm.pet,
    plots: farm.plots.map((plot, index) => {
      if (!plot) return null;
      const { cropId, plantedAt, harvested, watered, fertilized } = plot;
      const remainingFruit = ripeYield(crops[cropId - 1], plot, index, now) ?? null;
      return {
        cropId, plantedAt, harvested, watered, fertilized, remainingFruit,
        canSteal: remainingFruit !== null && remainingFruit >= 2 && !taken.includes(index),
      };
    }),
  };
}

export async function visitFarm(visitorId: string, username: string): Promise<FarmVisit | undefined> {
  const { rows: [host] } = await queryFarmDatabase<{ farm_id: string; state: Farm; taken: number[] }>(`
    SELECT account.farm_id, state, ARRAY(
      SELECT plot_index FROM farm_crop_steals
      WHERE host_id = account.farm_id AND visitor_id = $1
        AND planted_at = (farm.state->'plots'->plot_index::integer->>'plantedAt')::bigint
    ) AS taken
    FROM farm_accounts AS account
    JOIN farm_guest_progress AS farm ON farm.session_id = account.farm_id
    WHERE account.username = $2 AND account.farm_id <> $1
  `, [visitorId, username]);
  if (host) {
    await recordActivity(undefined, {
      hostId: host.farm_id,
      visitorId,
      type: 'visit',
    });
    return farmVisit(username, host.state, host.taken, Date.now());
  }
}

export async function stealFruit(visitorId: string, tokenHash: string, username: string, action: StealRequest):
Promise<StealResponse | CommunityError> {
  return transactFarm(async (client): Promise<StealResponse | CommunityError> => {
    const { rows: [account] } = await client.query<{ farm_id: string }>(
      'SELECT farm_id FROM farm_accounts WHERE username = $1 AND farm_id <> $2', [username, visitorId],
    );
    if (!account) return { status: 404, error: 'Không tìm thấy ruộng.' };
    const hostId = account.farm_id;
    // Acquire both farm locks in the same order even when two players visit each other.
    const { rows } = await client.query<{ session_id: string; state: Farm }>(`
      SELECT session_id, state FROM farm_guest_progress
      WHERE session_id IN ($1, $2) AND claimed
      ORDER BY session_id FOR UPDATE
    `, [visitorId, hostId]);
    const visitor = rows.find(row => row.session_id === visitorId)?.state;
    const host = rows.find(row => row.session_id === hostId)?.state;
    const auth = await client.query(`
      SELECT 1 FROM farm_account_sessions WHERE token_hash = $1 AND farm_id = $2 AND expires_at > clock_timestamp()
    `, [tokenHash, visitorId]);
    if (!visitor || !auth.rowCount) return { status: 401, error: 'Hãy đăng nhập lại để thăm ruộng.' };
    if (!host) return { status: 404, error: 'Không tìm thấy ruộng.' };
    const now = Date.now();
    const plot = host.plots[action.plot];
    if (!plot || plot.plantedAt !== action.plantedAt) return { status: 409, error: 'Vụ này đã thay đổi.' };
    const remaining = ripeYield(crops[plot.cropId - 1], plot, action.plot, now);
    if (remaining === undefined || remaining < 2) {
      return { status: 409, error: 'Chỉ lấy được khi cây chín và còn ít nhất 2 quả.' };
    }
    const inserted = await client.query(`
      INSERT INTO farm_crop_steals (host_id, plot_index, planted_at, visitor_id)
      VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
    `, [hostId, action.plot, action.plantedAt, visitorId]);
    if (!inserted.rowCount) return { status: 409, error: 'Bạn đã lấy quả ở vụ này.' };

    await recordActivity(client, {
      hostId,
      visitorId,
      type: 'steal',
      plotIndex: action.plot,
      cropId: plot.cropId,
      plantedAt: action.plantedAt,
      amount: 1,
    });

    plot.fruitTaken = (plot.fruitTaken ?? 0) + 1;
    visitor.produce[plot.cropId] = (visitor.produce[plot.cropId] ?? 0) + 1;
    host.revision++;
    visitor.revision++;
    await client.query(`
      UPDATE farm_guest_progress SET state = CASE WHEN session_id = $1 THEN $3::jsonb ELSE $4::jsonb END
      WHERE session_id IN ($1, $2)
    `, [visitorId, hostId, visitor, host]);
    const { rows: taken } = await client.query<{ plot_index: number }>(`
      SELECT plot_index FROM farm_crop_steals
      WHERE host_id = $1 AND visitor_id = $2 AND planted_at = ($3::jsonb->'plots'->plot_index::integer->>'plantedAt')::bigint
    `, [hostId, visitorId, host]);
    return { farm: visitor, visit: farmVisit(username, host, taken.map(row => row.plot_index), now), serverTime: now };
  });
}
