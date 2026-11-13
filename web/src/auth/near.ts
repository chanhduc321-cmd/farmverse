import { SOCIAL_AUTH_API } from '../../../shared/social-auth.mts';
import type { SocialAuthResult } from '../../../shared/social-auth.mts';

export function beginNearAuth(): void {
  window.location.assign(`/api${SOCIAL_AUTH_API.near.path}`);
}

export function consumeNearAuthResult(): SocialAuthResult | undefined {
  const url = new URL(window.location.href);
  const result = url.searchParams.get(SOCIAL_AUTH_API.resultParam);
  if (result === null) return;
  url.searchParams.delete(SOCIAL_AUTH_API.resultParam);
  const search = url.searchParams.toString();
  const nextUrl = url.pathname + (search ? `?${search}` : '') + url.hash;
  history.replaceState(history.state, '', nextUrl);
  if (result === 'success' || result === 'unavailable' || result === 'failed') return result;
}
