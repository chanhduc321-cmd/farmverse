import { farmLinkPath } from '../../shared/community.mts';
import type { ActivityType } from '../../shared/activity.mts';

/** Where a share was started. Sent to analytics as the `surface` of `share_click`. */
export type ShareSurface = 'farm' | 'steal' | 'pet_block' | 'journal' | 'leaderboard';
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface SharePayload {
  title: string;
  text: string;
  url: string;
}

export type ShareContext =
  | { surface: 'farm' }
  | { surface: 'leaderboard'; rank?: number }
  | { surface: 'steal'; host: string; cropName: string }
  | { surface: 'pet_block'; host: string }
  | { surface: 'journal'; event: ActivityType; visitor: string; cropName?: string; amount?: number };

/** The parts of `navigator` that sharing needs; injectable so the fallbacks can be tested. */
export interface ShareEnvironment {
  share?: (data: SharePayload) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

export const SHARE_TITLE = 'Nông Trại Mộng Mơ';

/** Link to the sharer's own farm, tagged so analytics can attribute the visit to a player share. */
export function farmShareUrl(origin: string, username: string, surface: ShareSurface): string {
  const url = new URL(farmLinkPath(username), origin);
  url.searchParams.set('utm_source', 'share');
  url.searchParams.set('utm_medium', 'player');
  url.searchParams.set('utm_campaign', surface);
  return url.href;
}

export function shareMessage(context: ShareContext): string {
  switch (context.surface) {
    case 'farm':
      return 'Vườn mình ở Nông Trại Mộng Mơ đang chín rau, có thú giữ đàng hoàng. Vào trộm thử xem!';
    case 'leaderboard':
      return context.rank
        ? `Mình đang đứng hạng ${context.rank} bảng trộm rau tuần này ở Nông Trại Mộng Mơ. Vào vườn mình thử sức xem!`
        : 'Bảng xếp hạng trộm rau tuần này ở Nông Trại Mộng Mơ đang nóng. Vào vườn mình thử sức xem!';
    case 'steal':
      return `Mình vừa trộm được 1 quả ${context.cropName.toLowerCase()} ở vườn của ${context.host}. Vườn mình đây, ai dám vào trộm lại không?`;
    case 'pet_block':
      return `Mình vừa bị thú cưng nhà ${context.host} đuổi khi vào vườn trộm rau. Vào vườn mình xem có thoát được không!`;
    case 'journal':
      if (context.event === 'steal') {
        const fruit = `${context.amount ?? 1} quả ${(context.cropName ?? 'nông sản').toLowerCase()}`;
        return `${context.visitor} vừa trộm ${fruit} ở vườn mình. Ai vào trả thù giúp mình với!`;
      }
      if (context.event === 'pet_block') {
        return `Thú cưng nhà mình vừa chặn ${context.visitor} vào vườn trộm rau. Ai muốn thử vận may không?`;
      }
      if (context.event === 'invite') {
        return `${context.visitor} vừa vào Nông Trại Mộng Mơ nhờ link vườn mình. Ai chơi cùng nữa không?`;
      }
      return `${context.visitor} vừa ghé vườn mình ở Nông Trại Mộng Mơ. Vào chơi cùng nhé!`;
  }
}

/**
 * Opens the device share sheet, or copies the text and link when there is none.
 * A share sheet the player dismisses is `cancelled`; it does not fall back to copying.
 */
export async function sendShare(payload: SharePayload, environment: ShareEnvironment = browserShareEnvironment()): Promise<ShareOutcome> {
  if (environment.share) {
    try {
      await environment.share(payload);
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  if (!environment.clipboard) return 'failed';
  try {
    await environment.clipboard.writeText(`${payload.text} ${payload.url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function browserShareEnvironment(): ShareEnvironment {
  return {
    share: typeof navigator.share === 'function' ? data => navigator.share(data) : undefined,
    clipboard: navigator.clipboard,
  };
}

/** Player-facing result of a share attempt. `undefined` means nothing needs saying. */
export function shareOutcomeMessage(outcome: ShareOutcome, url: string): { text: string; type: 'success' | 'warning' } | undefined {
  if (outcome === 'copied') return { text: 'Đã chép lời mời kèm link vườn. Dán vào Threads, Facebook hoặc tin nhắn nhé!', type: 'success' };
  if (outcome === 'failed') return { text: `Chưa chia sẻ được. Link vườn của bạn: ${url}`, type: 'warning' };
  return undefined;
}
