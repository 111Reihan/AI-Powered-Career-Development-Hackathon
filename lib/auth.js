// Accounts: OAuth 2.0 authorization-code sign-in (Google, Microsoft, Facebook, Apple) + email/password.
// Provider keys live in environment variables only. A provider with no keys is reported as "not configured".
import crypto from 'node:crypto';
import * as store from './store.js';

const env = process.env;
const PORT = Number(env.PORT) || 3000;
export const BASE = (env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECURE = BASE.startsWith('https://');
const MOCK = env.NODE_ENV !== 'production' && env.ORBIT_OAUTH_MOCK ? env.ORBIT_OAUTH_MOCK.replace(/\/$/, '') : '';
const tenant = env.MICROSOFT_TENANT || 'common';
const AUTH_MAX = Number(env.ORBIT_AUTH_LIMIT) || 30; // sign-in attempts per IP per minute

const PROVIDERS = {
  google: { name: 'Google', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', info: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile', id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET },
  microsoft: { name: 'Microsoft', auth: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, info: 'https://graph.microsoft.com/oidc/userinfo', scope: 'openid email profile', id: env.MICROSOFT_CLIENT_ID, secret: env.MICROSOFT_CLIENT_SECRET },
  facebook: { name: 'Facebook', auth: 'https://www.facebook.com/v19.0/dialog/oauth', token: 'https://graph.facebook.com/v19.0/oauth/access_token', info: 'https://graph.facebook.com/me?fields=id,name,email', scope: 'email public_profile', id: env.FACEBOOK_APP_ID, secret: env.FACEBOOK_APP_SECRET },
  apple: { name: 'Apple', auth: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token', scope: 'name email', formPost: true, id: env.APPLE_CLIENT_ID, secret: 'jwt' },
};
if (MOCK) for (const [k, p] of Object.entries(PROVIDERS)) Object.assign(p, { auth: `${MOCK}/${k}/authorize`, token: `${MOCK}/${k}/token`, info: `${MOCK}/${k}/userinfo`, id: 'test-id', secret: k === 'apple' ? 'test-secret' : 'test-secret' });

const appleReady = () => Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
export function configured() {
  return Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, MOCK ? true : k === 'apple' ? appleReady() : Boolean(p.id && p.secret)]));
}

const b64u = (b) => Buffer.from(b).toString('base64url');
function appleSecret() {
  if (MOCK) return 'test-secret';
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID }));
  const body = b64u(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 600, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

// ----- signed state (stateless, bound to a cookie) -----
const hmac = (s) => crypto.createHmac('sha256', store.secret()).update(s).digest('base64url');
function makeState(k, nonce, nx) { const p = b64u(JSON.stringify({ k, n: nonce, nx, e: Date.now() + 10 * 60_000 })); return p + '.' + hmac(p); }
function readState(st) {
  const [p, sig] = String(st || '').split('.');
  if (!p || !sig) return null;
  const want = Buffer.from(hmac(p)), got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch { return null; }
}

// ----- cookies -----
function parseCookies(req) {
  const o = {};
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return o;
}
const cookie = (name, val, { maxAge, sameSite = 'Lax' } = {}) =>
  `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=${sameSite}${SECURE ? '; Secure' : ''}; Max-Age=${maxAge ?? 0}`;
export const currentUser = (req) => store.sessionUser(parseCookies(req).orbit_sid);

// ----- passwords -----
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
async function hashPw(pw) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + (await scrypt(pw, salt)).toString('hex'); }
const DUMMY = crypto.randomBytes(16);
async function checkPw(pw, stored) {
  const [s, h] = String(stored || '').split(':');
  const key = await scrypt(pw, s ? Buffer.from(s, 'hex') : DUMMY);
  if (!s || !h) return false;
  const want = Buffer.from(h, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, provider: u.provider });
const decodeJwt = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString()); } catch { return {}; } };

async function post(url, form) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error('token endpoint ' + r.status);
  return r.json();
}
async function profileFor(k, p, code, appleUser) {
  const tok = await post(p.token, { grant_type: 'authorization_code', code, redirect_uri: `${BASE}/auth/${k}/callback`, client_id: p.id, client_secret: k === 'apple' ? appleSecret() : p.secret });
  if (k === 'apple') {
    const c = decodeJwt(tok.id_token); // received directly from Apple's token endpoint over TLS
    if (!c.sub) throw new Error('no sub');
    return { sub: String(c.sub), email: clip(c.email, 254), name: clip(appleUser?.name ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}` : '', 40) };
  }
  if (!tok.access_token) throw new Error('no access token');
  const r = await fetch(p.info, { headers: { Authorization: 'Bearer ' + tok.access_token, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error('userinfo ' + r.status);
  const u = await r.json(); const sub = u.sub || u.id;
  if (!sub) throw new Error('no sub');
  return { sub: String(sub), email: clip(u.email, 254), name: clip(u.name || u.given_name, 40) };
}

const redirect = (res, loc, extra = []) => { res.writeHead(302, { Location: loc, 'Cache-Control': 'no-store', 'Set-Cookie': extra }); res.end(); };
const safeNext = (n) => (/^\/[a-z0-9-]+\.html$/.test(String(n || '')) ? n : '/index.html');
const ERR = new Set(['denied', 'state', 'failed', 'unconfigured']);

// Returns true when the request was handled.
export async function handle(req, res, url, h) {
  const { json, readBody, limited } = h;
  const path = url.pathname;

  // ----- OAuth redirect flow -----
  let m = path.match(/^\/auth\/(google|microsoft|facebook|apple)\/(start|callback)$/);
  if (m) {
    const [, k, step] = m, p = PROVIDERS[k];
    const bad = (code) => redirect(res, `/login.html?err=${ERR.has(code) ? code : 'failed'}`, [cookie('orbit_oauth', '', { sameSite: p.formPost && SECURE ? 'None' : 'Lax' })]);
    if (!configured()[k]) return bad('unconfigured'), true;
    if (limited(req.socket.remoteAddress + ':auth', AUTH_MAX)) return json(res, 429, { error: 'Too many attempts. Try again in a minute.' }), true;
    if (step === 'start') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Use GET' }), true;
      const nonce = crypto.randomBytes(16).toString('base64url');
      const q = new URLSearchParams({ client_id: p.id, redirect_uri: `${BASE}/auth/${k}/callback`, response_type: 'code', scope: p.scope, state: makeState(k, nonce, safeNext(url.searchParams.get('next'))) });
      if (p.formPost) q.set('response_mode', 'form_post');
      redirect(res, p.auth + '?' + q, [cookie('orbit_oauth', nonce, { maxAge: 600, sameSite: p.formPost && SECURE ? 'None' : 'Lax' })]);
      return true;
    }
    // callback (Apple uses POST form_post, others GET)
    let params;
    if (req.method === 'POST' && p.formPost) { try { params = new URLSearchParams(await readBody(req, 20_000)); } catch { return bad('failed'), true; } }
    else if (req.method === 'GET') params = url.searchParams;
    else return json(res, 405, { error: 'Method not allowed' }), true;
    if (params.get('error')) return bad('denied'), true;
    const st = readState(params.get('state'));
    if (!st || st.k !== k || st.n !== parseCookies(req).orbit_oauth || !params.get('code')) return bad('state'), true;
    try {
      let appleUser; try { appleUser = params.get('user') ? JSON.parse(params.get('user')) : null; } catch { /* ignore */ }
      const prof = await profileFor(k, p, params.get('code'), appleUser);
      let user = store.findUser((u) => u.provider === k && u.sub === prof.sub);
      if (!user) user = store.addUser({ provider: k, sub: prof.sub, email: prof.email, name: prof.name || prof.email.split('@')[0] || p.name + ' user' });
      const token = store.newSession(user.id);
      redirect(res, safeNext(st.nx), [cookie('orbit_sid', token, { maxAge: store.SESSION_MS / 1000 }), cookie('orbit_oauth', '', {})]);
    } catch (e) { console.error('oauth error', k, e.message); bad('failed'); }
    return true;
  }

  if (!path.startsWith('/api/auth/') && path !== '/api/me' && path !== '/api/data') return false;

  // ----- JSON API (CSRF: custom header + same-origin) -----
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    let okOrigin = true; if (origin) { try { okOrigin = new URL(origin).host === req.headers.host; } catch { okOrigin = false; } }
    if (req.headers['x-orbit'] !== '1' || !okOrigin) return json(res, 403, { error: 'Forbidden' }), true;
  }
  const user = currentUser(req);
  const body = async (max = 20_000) => { try { return JSON.parse((await readBody(req, max)) || '{}'); } catch (e) { throw Object.assign(new Error(e.status === 413 ? 'Request too large' : 'Invalid JSON'), { status: e.status || 400 }); } };
  try {
    if (path === '/api/me') {
      if (req.method === 'GET') return json(res, 200, { user: user ? publicUser(user) : null }), true;
      if (req.method === 'DELETE') {
        if (!user) return json(res, 401, { error: 'Not signed in' }), true;
        store.removeUser(user.id);
        res.setHeader('Set-Cookie', cookie('orbit_sid', '')); return json(res, 200, { ok: true }), true;
      }
      return json(res, 405, { error: 'Method not allowed' }), true;
    }
    if (path === '/api/data') {
      if (!user) return json(res, 401, { error: 'Not signed in' }), true;
      if (req.method === 'GET') return json(res, 200, { data: user.data, updatedAt: user.updatedAt }), true;
      if (req.method === 'PUT') {
        const b = await body(200_000);
        if (!b.data || typeof b.data !== 'object' || b.data.v !== 2 || !Number.isFinite(b.updatedAt)) return json(res, 400, { error: 'Invalid data' }), true;
        if (b.updatedAt >= user.updatedAt) store.updateUser(user.id, { data: b.data, updatedAt: Math.min(b.updatedAt, Date.now() + 60_000) });
        const u = store.getUser(user.id);
        return json(res, 200, { updatedAt: u.updatedAt }), true;
      }
      return json(res, 405, { error: 'Method not allowed' }), true;
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' }), true;
    if (limited(req.socket.remoteAddress + ':auth', AUTH_MAX)) return json(res, 429, { error: 'Too many attempts. Try again in a minute.' }), true;
    if (path === '/api/auth/logout') {
      store.endSession(parseCookies(req).orbit_sid);
      res.setHeader('Set-Cookie', cookie('orbit_sid', '')); return json(res, 200, { ok: true }), true;
    }
    if (path === '/api/auth/register' || path === '/api/auth/login') {
      const b = await body();
      const email = clip(b.email, 254).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' }), true;
      let u;
      if (path.endsWith('register')) {
        if (pw.length < 8 || pw.length > 128) return json(res, 400, { error: 'Password must be 8 to 128 characters.' }), true;
        if (store.findUser((x) => x.provider === 'password' && x.email === email)) return json(res, 409, { error: 'An account with this email already exists. Sign in instead.' }), true;
        u = store.addUser({ provider: 'password', sub: email, email, name: clip(b.name, 40) || email.split('@')[0], pw: await hashPw(pw) });
      } else {
        const found = store.findUser((x) => x.provider === 'password' && x.email === email);
        const ok = await checkPw(pw.slice(0, 128), found && found.pw);
        if (!found || !ok) return json(res, 401, { error: 'Incorrect email or password.' }), true;
        u = found;
      }
      res.setHeader('Set-Cookie', cookie('orbit_sid', store.newSession(u.id), { maxAge: store.SESSION_MS / 1000 }));
      return json(res, 200, { user: publicUser(u) }), true;
    }
    return json(res, 404, { error: 'Not found' }), true;
  } catch (e) {
    if (e.status === 413 || e.status === 400) return json(res, e.status, { error: e.message }), true;
    console.error('auth error', e.message); return json(res, 500, { error: 'Server error' }), true;
  }
}
