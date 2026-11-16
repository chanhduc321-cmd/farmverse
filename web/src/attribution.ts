import { FARM_USERNAME_PATTERN, parseFarmLink } from '../../shared/community.mts';
import type { AnalyticsParams } from './analytics.ts';

const STORAGE_KEY = 'farmverse-attribution';
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,39}$/;

/** Where a player first came from. Kept on the device; only the campaign slugs go to analytics. */
export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  /** Username of the farm whose shared link brought the player in. */
  referrerFarm?: string;
}

function slug(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && SLUG_PATTERN.test(normalized) ? normalized : undefined;
}

function clean(value: Attribution): Attribution | undefined {
  const referrerFarm = typeof value.referrerFarm === 'string' && FARM_USERNAME_PATTERN.test(value.referrerFarm)
    ? value.referrerFarm : undefined;
  const entries = Object.entries({
    source: slug(value.source), medium: slug(value.medium), campaign: slug(value.campaign), referrerFarm,
  }).filter(([, entry]) => entry !== undefined);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Reads the campaign parameters and referring farm from the current address. */
export function readAttribution(pathname: string, search: string): Attribution | undefined {
  const params = new URLSearchParams(search);
  return clean({
    source: params.get('utm_source') ?? undefined,
    medium: params.get('utm_medium') ?? undefined,
    campaign: params.get('utm_campaign') ?? undefined,
    referrerFarm: parseFarmLink(pathname, search) ?? undefined,
  });
}

/**
 * First-touch attribution: the first visit that carries a campaign or a farm link wins and is
 * remembered on the device. Call before the farm link is cleared from the address bar.
 */
export function captureAttribution(
  pathname: string,
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): Attribution | undefined {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : undefined;
    const stored = typeof parsed === 'object' && parsed !== null ? clean(parsed as Attribution) : undefined;
    if (stored) return stored;
  } catch { /* Fall through to the current visit. */ }

  const current = readAttribution(pathname, search);
  if (current) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* Continue without browser storage. */ }
  }
  return current;
}

/** Event parameters for analytics. The referring username stays out; only that a player referred them. */
export function attributionParams(attribution: Attribution | undefined): AnalyticsParams {
  const params: AnalyticsParams = {
    utm_source: attribution?.source ?? '(direct)',
    referred_by_player: Boolean(attribution?.referrerFarm),
  };
  if (attribution?.medium) params.utm_medium = attribution.medium;
  if (attribution?.campaign) params.utm_campaign = attribution.campaign;
  return params;
}
