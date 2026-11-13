import type { PoolClient } from 'pg';
import type { ActivityEvent, ActivityPage, ActivityType } from '../../shared/activity.mts';
import { crops } from './catalog.ts';
import { queryFarmDatabase, transactFarm } from './farm-store.ts';

const DEFAULT_PAGE_SIZE = 20;

export interface RecordActivityParams {
  hostId: string;
  visitorId: string;
  type: ActivityType;
  plotIndex?: number;
  cropId?: number;
  plantedAt?: number;
  amount?: number;
}

export async function recordActivity(
  transaction: PoolClient | undefined,
  params: RecordActivityParams,
): Promise<void> {
  const { hostId, visitorId, type, plotIndex, cropId, plantedAt, amount = 1 } = params;
  if (hostId === visitorId) return;

  async function write(client: PoolClient): Promise<void> {
    // Serialize events for one host so a visit retry and its original cannot both insert.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 42))', [hostId]);
    if (type === 'visit') {
      const sql = `
        INSERT INTO farm_activities (host_id, visitor_id, type)
        SELECT $1, $2, 'visit'
        WHERE NOT EXISTS (
          SELECT 1 FROM farm_activities
          WHERE host_id = $1 AND visitor_id = $2 AND type = 'visit'
            AND created_at > clock_timestamp() - interval '10 minutes'
        )
      `;
      await client.query(sql, [hostId, visitorId]);
    } else {
      const sql = `
        INSERT INTO farm_activities (host_id, visitor_id, type, plot_index, crop_id, planted_at, amount)
        VALUES ($1, $2, $7, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `;
      const values = [hostId, visitorId, plotIndex ?? null, cropId ?? null, plantedAt ?? null, amount, type];
      await client.query(sql, values);
    }
  }
  if (transaction) await write(transaction);
  else await transactFarm(write);
}

export async function getActivityPage(
  hostId: string,
  offset: number = 0,
  limit: number = DEFAULT_PAGE_SIZE,
  through?: string,
): Promise<ActivityPage> {
  const { rows: [summaryRow] } = await queryFarmDatabase<{
    unread_count: string;
    recent_stolen_fruit: string;
    recent_blocked_steals: string;
    recent_visitors: string[];
  }>(`
    WITH host_info AS (
      SELECT COALESCE(last_activity_read_at, '1970-01-01 00:00:00+00'::timestamptz) AS last_read_at
      FROM farm_accounts WHERE farm_id = $1
    ), unread_activities AS (
      SELECT a.type, a.amount, v.username AS visitor_name
      FROM farm_activities a
      JOIN farm_accounts v ON v.farm_id = a.visitor_id
      CROSS JOIN host_info h
      WHERE a.host_id = $1 AND a.created_at > h.last_read_at
    )
    SELECT
      COUNT(*)::text AS unread_count,
      COALESCE(SUM(CASE WHEN type = 'steal' THEN amount ELSE 0 END), 0)::text AS recent_stolen_fruit,
      COUNT(*) FILTER (WHERE type = 'pet_block')::text AS recent_blocked_steals,
      ARRAY(SELECT DISTINCT visitor_name FROM unread_activities WHERE type = 'visit' ORDER BY visitor_name LIMIT 5) AS recent_visitors
    FROM unread_activities
  `, [hostId]);

  const unreadCount = Number(summaryRow?.unread_count ?? 0);
  const recentStolenFruit = Number(summaryRow?.recent_stolen_fruit ?? 0);
  const recentVisitors = summaryRow?.recent_visitors ?? [];

  const { rows: activityRows } = await queryFarmDatabase<{
    id: string;
    type: ActivityType;
    plot_index: number | null;
    crop_id: number | null;
    amount: number | null;
    created_at_ms: string;
    visitor_name: string;
    is_unread: boolean;
  }>(`
    SELECT
      a.id::text,
      a.type,
      a.plot_index,
      a.crop_id,
      a.amount,
      (EXTRACT(EPOCH FROM a.created_at) * 1000)::text AS created_at_ms,
      v.username AS visitor_name,
      a.created_at > h.last_activity_read_at AS is_unread
    FROM farm_activities a
    JOIN farm_accounts v ON v.farm_id = a.visitor_id
    JOIN farm_accounts h ON h.farm_id = a.host_id
    WHERE a.host_id = $1 AND ($4::bigint IS NULL OR (a.created_at, a.id) <= (
      SELECT anchor.created_at, anchor.id FROM farm_activities AS anchor
      WHERE anchor.id = $4 AND anchor.host_id = $1
    ))
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $2 OFFSET $3
  `, [hostId, limit + 1, offset, through ?? null]);

  const events: ActivityEvent[] = activityRows.slice(0, limit).map((row) => {
    const createdAt = Number(row.created_at_ms);
    const cropId = row.crop_id ?? undefined;
    const cropName = cropId && crops[cropId - 1] ? crops[cropId - 1].name : undefined;
    return {
      id: row.id,
      type: row.type,
      visitorName: row.visitor_name,
      plot: row.plot_index != null ? row.plot_index + 1 : undefined,
      cropId,
      cropName,
      amount: row.amount ?? undefined,
      createdAt,
      isUnread: row.is_unread,
    };
  });

  const nextOffset = activityRows.length > limit ? offset + limit : null;

  return {
    unreadCount,
    summary: {
      unreadCount,
      recentStolenFruit,
      recentBlockedSteals: Number(summaryRow?.recent_blocked_steals ?? 0),
      recentVisitors,
    },
    events,
    nextOffset,
  };
}

export async function getActivityVersion(hostId: string): Promise<{ last_read_at: string; newest_id: string | null } | undefined> {
  const { rows: [version] } = await queryFarmDatabase<{ last_read_at: string; newest_id: string | null }>(`
    SELECT last_activity_read_at::text AS last_read_at, (
      SELECT id::text FROM farm_activities
      WHERE host_id = host.farm_id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) AS newest_id
    FROM farm_accounts AS host
    WHERE farm_id = $1
  `, [hostId]);
  return version;
}

export async function markActivitiesRead(hostId: string, through: string): Promise<void> {
  await queryFarmDatabase(`
    UPDATE farm_accounts AS host
    SET last_activity_read_at = GREATEST(host.last_activity_read_at, event.created_at)
    FROM farm_activities AS event
    WHERE host.farm_id = $1 AND event.host_id = host.farm_id AND event.id = $2
  `, [hostId, through]);
}

export async function countUnreadActivities(hostId: string): Promise<number> {
  const { rows: [result] } = await queryFarmDatabase<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM farm_accounts AS host
    JOIN farm_activities AS event ON event.host_id = host.farm_id
      AND event.created_at > host.last_activity_read_at
    WHERE host.farm_id = $1
  `, [hostId]);
  return Number(result.count);
}
