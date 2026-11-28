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
// Dev mode (plain-http localhost) listens on 127.0.0.1 only. Production listens on all interfaces unless HOST says otherwise.
export const HOST = env.HOST || (IS_PROD ? '0.0.0.0' : '127.0.0.1');
export const isLoopback = (h) => /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/.test(h);
export const MAIL_DAILY = Number(env.ORBIT_MAIL_DAILY ?? 500);         // emails per UTC day, whole server
export const MAIL_IP_HOURLY = Number(env.ORBIT_MAIL_IP_HOURLY ?? 10);   // emails triggered per client per hour
export const AUTH_MAX = Number(env.ORBIT_AUTH_LIMIT) || 30;           // sign-in related calls per client per minute
export const AI_DAILY_TOTAL = Number(env.ORBIT_AI_DAILY_LIMIT ?? 300); // AI calls per UTC day, whole server
export const AI_DAILY_USER = Number(env.ORBIT_AI_USER_DAILY ?? 30);    // AI calls per UTC day, per signed-in user
export const AI_PER_MIN_USER = Number(env.ORBIT_AI_USER_PER_MIN ?? 6);
