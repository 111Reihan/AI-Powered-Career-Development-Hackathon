// Central configuration, read once from the environment.
const env = process.env;
export const PORT = Number(env.PORT) || 3000;
export const BASE = (env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
export const SECURE = BASE.startsWith('https://');
export const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE);
export const IS_TEST = env.NODE_ENV === 'test';
// "Production" = anything that is not plain-http localhost.
export const IS_PROD = env.NODE_ENV === 'production' || (!LOCAL && !IS_TEST);
export const TRUST_PROXY = env.TRUST_PROXY === '1';
export const AUTH_MAX = Number(env.ORBIT_AUTH_LIMIT) || 30;           // sign-in related calls per client per minute
export const AI_DAILY_TOTAL = Number(env.ORBIT_AI_DAILY_LIMIT ?? 300); // AI calls per UTC day, whole server
export const AI_DAILY_USER = Number(env.ORBIT_AI_USER_DAILY ?? 30);    // AI calls per UTC day, per signed-in user
export const AI_PER_MIN_USER = Number(env.ORBIT_AI_USER_PER_MIN ?? 6);
export const FB_VERSION = /^v\d+\.\d$/.test(env.FACEBOOK_API_VERSION || '') ? env.FACEBOOK_API_VERSION : 'v26.0';

// The OAuth mock is a test tool only. It needs NODE_ENV=test, an http localhost BASE, and a localhost mock URL.
export function mockUrl() {
  const m = env.ORBIT_OAUTH_MOCK;
  if (!m) return '';
  if (!IS_TEST || !LOCAL || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(m.replace(/\/$/, ''))) {
    console.error('ORBIT_OAUTH_MOCK ignored: it only works with NODE_ENV=test, an http://localhost BASE_URL and a localhost mock URL.');
    return '';
  }
  return m.replace(/\/$/, '');
}
