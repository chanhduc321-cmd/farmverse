import { COMMUNITY_PAGE_SIZE, COMMUNITY_RESULT_LIMIT } from '../../shared/community.mts';
import type { FarmVisit, PlayerList, PlayerPage, StealRequest, StealResponse } from '../../shared/community.mts';
import type { Farm } from '../../shared/farm.mts';
import { ripeYield } from '../../shared/farm-rules.mts';
import { recordActivity } from './activity-store.ts';
import { crops } from './catalog.ts';
import { queryFarmDatabase, transactFarm } from './farm-store.ts';

const directoryTtl = 20_000;
const directoryCapacity = 512;
const directoryPages = new Map<string, { farmId: string; expiresAt: number; page: Promise<PlayerPage> }>();
type CommunityError = { status: 401 | 404 | 409; error: string };

export function listPlayers(visitorId: string, list: PlayerList, search: string, offset: number): Promise<PlayerPage> {
  const key = `${visitorId}:${list}:${search}:${offset}`;
  const cached = directoryPages.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.page;

  directoryPages.delete(key);
  if (directoryPages.size >= directoryCapacity) directoryPages.delete(directoryPages.keys().next().value!);
  const entry = {
    farmId: visitorId, expiresAt: Infinity,
    page: readPlayerPage(visitorId, list, search, offset),
  };
  directoryPages.set(key, entry);
  void entry.page.then(
    () => { entry.expiresAt = Date.now() + directoryTtl; },
    () => { if (directoryPages.get(key) === entry) directoryPages.delete(key); },
  );
  return entry.page;
}

function invalidatePlayerPages(first: string, second: string) {
  for (const [key, entry] of directoryPages) {
    if (entry.farmId === first || entry.farmId === second) directoryPages.delete(key);
  }
}

async function readPlayerPage(visitorId: string, list: PlayerList, search: string, offset: number): Promise<PlayerPage> {
  const pageSize = Math.min(COMMUNITY_PAGE_SIZE, COMMUNITY_RESULT_LIMIT - offset);
  const hasRoom = offset + pageSize < COMMUNITY_RESULT_LIMIT;
  const isDirectory = list === 'residents';
  // Start from the indexed incoming/outgoing relationships for this account.
  const { rows } = await queryFarmDatabase<{ username: string }>(`
    WITH related AS (
      SELECT sender_id AS id FROM farm_friendships
      WHERE recipient_id = $1 AND confirmed = ($2 <> 'invitations')
      UNION ALL
      SELECT recipient_id AS id FROM farm_friendships
      WHERE sender_id = $1 AND confirmed AND $2 <> 'invitations'
    )
    SELECT username FROM farm_accounts AS player
    ${isDirectory ? '' : 'JOIN related ON related.id = player.farm_id'}
    WHERE farm_id <> $1 AND ($3 = '' OR strpos(username, $3) > 0)
    ${isDirectory ? 'AND NOT EXISTS (SELECT 1 FROM related WHERE related.id = player.farm_id)' : ''}
    ORDER BY username
    LIMIT $4 OFFSET $5
  `, [visitorId, list, search, pageSize + Number(hasRoom), offset]);
  return { players: rows.slice(0, pageSize), nextOffset: rows.length > pageSize ? offset + pageSize : null };
}

export async function inviteFriend(senderId: string, username: string): Promise<CommunityError | undefined> {
  const { rows: [result] } = await queryFarmDatabase<{ found: boolean; recipient_id: string | null }>(`
    WITH target AS (
      SELECT farm_id FROM farm_accounts WHERE username = $2
    ), invitation AS (
      INSERT INTO farm_friendships (sender_id, recipient_id)
      SELECT $1, farm_id FROM target WHERE farm_id <> $1
      ON CONFLICT DO NOTHING RETURNING recipient_id
    )
    SELECT EXISTS (SELECT 1 FROM target) AS found, (SELECT recipient_id FROM invitation) AS recipient_id
  `, [senderId, username]);
  if (!result.found) return { status: 404, error: 'Không tìm thấy cư dân.' };
  if (!result.recipient_id) return { status: 409, error: 'Lời mời hoặc kết bạn đã tồn tại.' };
  invalidatePlayerPages(senderId, result.recipient_id);
}

export async function confirmFriend(recipientId: string, username: string): Promise<CommunityError | undefined> {
  const { rows: [result] } = await queryFarmDatabase<{ sender_id: string }>(`
    UPDATE farm_friendships SET confirmed = true
    FROM farm_accounts
    WHERE sender_id = farm_id AND username = $2 AND recipient_id = $1 AND NOT confirmed
    RETURNING sender_id
  `, [recipientId, username]);
  if (!result) return { status: 409, error: 'Không có lời mời đang chờ xác nhận.' };
  invalidatePlayerPages(recipientId, result.sender_id);
}

function farmVisit(username: string, farm: Farm, taken: readonly number[], now: number): FarmVisit {
  return {
    username, theme: farm.theme, serverTime: now, pet: farm.pet ?? 'dog',
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

export async function stealFruit(visitorId: string, tokenHash: string, username: string, action: StealRequest, random = Math.random):
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
    if (!inserted.rowCount) return { status: 409, error: 'Bạn đã thử lấy quả ở vụ này.' };

    // Roll once after claiming the attempt so a retry cannot roll again.
    const blocked = random() < 0.5;
    if (!blocked) {
      plot.fruitTaken = (plot.fruitTaken ?? 0) + 1;
      visitor.produce[plot.cropId] = (visitor.produce[plot.cropId] ?? 0) + 1;
      host.revision++;
      visitor.revision++;
      await client.query(`
        UPDATE farm_guest_progress
        SET state = CASE WHEN session_id = $1 THEN $3::jsonb ELSE $4::jsonb END
        WHERE session_id IN ($1, $2)
      `, [hostId, visitorId, host, visitor]);
    }
    await recordActivity(client, {
      hostId,
      visitorId,
      type: blocked ? 'pet_block' : 'steal',
      plotIndex: action.plot,
      cropId: plot.cropId,
      plantedAt: action.plantedAt,
      amount: blocked ? 0 : 1,
    });
    const { rows: taken } = await client.query<{ plot_index: number }>(`
      SELECT plot_index FROM farm_crop_steals
      WHERE host_id = $1 AND visitor_id = $2 AND planted_at = ($3::jsonb->'plots'->plot_index::integer->>'plantedAt')::bigint
    `, [hostId, visitorId, host]);
    return { farm: visitor, visit: farmVisit(username, host, taken.map(row => row.plot_index), now), serverTime: now, blocked };
  });
}
