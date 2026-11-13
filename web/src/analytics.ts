/**
 * Google Analytics 4 (gtag.js). Inert unless VITE_GA_MEASUREMENT_ID is a valid
 * "G-…" ID at build time. Never send usernames or other personal data here.
 */

export type AnalyticsParams = Record<string, string | number | boolean>;

export interface Analytics {
  readonly enabled: boolean;
  init(): void;
  track(name: string, params?: AnalyticsParams): void;
}

declare global {
  interface Window { dataLayer?: unknown[] }
}

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;
const GTAG_URL = 'https://www.googletagmanager.com/gtag/js';
const DEBUG_QUERY_PARAM = 'ga_debug';

export function createAnalytics(measurementId: string | undefined): Analytics {
  const id = measurementId?.trim() ?? '';
  const enabled = MEASUREMENT_ID_PATTERN.test(id);
  let started = false;

  // gtag.js only understands the `arguments` object, not a plain array.
  function gtag(..._args: unknown[]): void {
    window.dataLayer?.push(arguments);
  }

  return {
    enabled,
    init(): void {
      if (!enabled || started) return;
      started = true;
      try {
        const script = document.createElement('script');
        script.async = true;
        script.src = `${GTAG_URL}?id=${id}`;
        window.dataLayer = window.dataLayer ?? [];
        const debug = new URLSearchParams(window.location.search).has(DEBUG_QUERY_PARAM);
        gtag('js', new Date());
        gtag('config', id, debug ? { debug_mode: true } : {});
        document.head.append(script);
      } catch {
        // Analytics must never stop the game from loading.
      }
    },
    track(name: string, params: AnalyticsParams = {}): void {
      if (!started) return;
      try {
        gtag('event', name, params);
      } catch {
        // Analytics must never interrupt gameplay.
      }
    },
  };
}

const analytics = createAnalytics(import.meta.env.VITE_GA_MEASUREMENT_ID);

export const initAnalytics = analytics.init;
export const trackEvent = analytics.track;
