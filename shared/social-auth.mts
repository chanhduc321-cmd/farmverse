export const SOCIAL_AUTH_API = {
  near: { path: '/account/social/near', callback: '/account/social/near/callback' },
  nearTest: { path: '/account/social/near/test-signature' },
  resultParam: 'nearAuth',
} as const;

export type SocialAuthResult = 'success' | 'unavailable' | 'failed';
