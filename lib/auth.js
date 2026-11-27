// Accounts: OAuth 2.0 authorization-code sign-in (Google, Microsoft, Facebook, Apple) + email/password with verification and reset.
// Provider keys live in environment variables only. A provider with no keys is reported as "not configured".
import crypto from 'node:crypto';
import * as db from './db.js';
import { sign, sha } from './crypto.js';
import { BASE, SECURE, AUTH_MAX, FB_VERSION, MAIL_DAILY, MAIL_IP_HOURLY, mockUrl } from './config.js';
import { clientIp, limited, csrfOk } from './guard.js';
import { normalizeState, MAX_BYTES } from './validate.js';
import { mailMode, sendMail } from './mail.js';

const env = process.env;
const MOCK = mockUrl();
const tenant = env.MICROSOFT_TENANT || 'common';
const SID = SECURE ? '__Host-orbit_sid' : 'orbit_sid';
const OAUTH = SECURE ? '__Host-orbit_oauth' : 'orbit_oauth';

const PROVIDERS = {
  google: { name: 'Google', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', info: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile', id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET },
  microsoft: { name: 'Microsoft', auth: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`, token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, info: 'https://graph.microsoft.com/oidc/userinfo', scope: 'openid email profile', id: env.MICROSOFT_CLIENT_ID, secret: env.MICROSOFT_CLIENT_SECRET },
  facebook: { name: 'Facebook', auth: `https://www.facebook.com/${FB_VERSION}/dialog/oauth`, token: `https://graph.facebook.com/${FB_VERSION}/oauth/access_token`, tokenGet: true, info: `https://graph.facebook.com/${FB_VERSION}/me?fields=id,name,email`, scope: 'email public_profile', id: env.FACEBOOK_APP_ID, secret: env.FACEBOOK_APP_SECRET },
  apple: { name: 'Apple', auth: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token', scope: 'name email', formPost: true, id: env.APPLE_CLIENT_ID, secret: 'jwt' },
};
if (MOCK) for (const [k, p] of Object.entries(PROVIDERS)) Object.assign(p, { auth: `${MOCK}/${k}/authorize`, token: `${MOCK}/${k}/token`, info: `${MOCK}/${k}/userinfo`, id: 'test-id', secret: 'test-secret' });

const appleReady = () => Boolean(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
export function configured() {
  return Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, MOCK ? true : k === 'apple' ? appleReady() : Boolean(p.id && p.secret)]));
}
export const emailEnabled = () => mailMode() !== 'off';

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
function makeState(o) { const p = b64u(JSON.stringify({ ...o, e: Date.now() + 10 * 60_000 })); return p + '.' + sign(p); }
function readState(st) {
  const [p, s] = String(st || '').split('.');
  if (!p || !s) return null;
  const want = Buffer.from(sign(p)), got = Buffer.from(s);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() ? o : null; } catch { return null; }
}

// ----- cookies -----
function parseCookies(req) {
  const o = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i <= 0) continue;
    try { o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip malformed */ }
  }
  return o;
}
const attrs = (sameSite) => `Path=/; HttpOnly; SameSite=${sameSite}${SECURE ? '; Secure' : ''}`;
const setCookie = (name, val, { maxAge, sameSite = 'Lax' } = {}) => `${name}=${encodeURIComponent(val)}; ${attrs(sameSite)}${maxAge ? `; Max-Age=${maxAge}` : ''}`; // no maxAge = session cookie
const clearCookie = (name, sameSite = 'Lax') => `${name}=; ${attrs(sameSite)}; Max-Age=0`;
const sessionToken = (req) => parseCookies(req)[SID] || '';
export const currentUser = (req) => db.sessionUser(sessionToken(req));
const startSession = (req, uid, remember) => setCookie(SID, db.newSession(uid, { ua: req.headers['user-agent'], remember }), remember ? { maxAge: db.SESSION_MS / 1000 } : {});

// ----- passwords -----
// scrypt at the OWASP-recommended cost (N=2^16, r=8, p=2, 64 MiB). The hash string stores its own parameters, so the cost can be raised
// later; older hashes (the first 16 MiB format) still verify and are upgraded at the next successful login.
const P = { N: 65536, r: 8, p: 2 }, LEGACY = { N: 16384, r: 8, p: 1 };
const OK_N = new Set([16384, 32768, 65536, 131072]);
let busy = 0; const waiting = []; // at most 2 hashes at once (memory) and 40 waiting (a flood gets 503, not an out-of-memory crash)
const slot = () => new Promise((res, rej) => { if (busy < 2) { busy++; res(); } else if (waiting.length >= 40) rej(Object.assign(new Error('Server busy'), { status: 503 })); else waiting.push(res); });
const release = () => { const nx = waiting.shift(); if (nx) nx(); else busy--; };
async function scrypt(pw, salt, { N, r, p }) {
  await slot();
  try { return await new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N, r, p, maxmem: 160 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k)))); } finally { release(); }
}
async function hashPw(pw) { const salt = crypto.randomBytes(16); return `scrypt$${P.N}$${P.r}$${P.p}$${salt.toString('hex')}$${(await scrypt(pw, salt, P)).toString('hex')}`; }
const DUMMY = crypto.randomBytes(16);
// -> { ok, old }. Does the same work whether or not the account exists.
async function checkPw(pw, stored) {
  const str = String(stored || ''), t = str.split('$');
  let params = P, salt = null, want = null, old = false;
  if (t[0] === 'scrypt' && t.length === 6) { params = { N: +t[1], r: +t[2], p: +t[3] }; salt = Buffer.from(t[4], 'hex'); want = Buffer.from(t[5], 'hex'); old = params.N !== P.N || params.r !== P.r || params.p !== P.p; }
  else if (/^[0-9a-f]+:[0-9a-f]+$/.test(str)) { const [a, b] = str.split(':'); params = LEGACY; salt = Buffer.from(a, 'hex'); want = Buffer.from(b, 'hex'); old = true; }
  const valid = OK_N.has(params.N) && params.r === 8 && params.p >= 1 && params.p <= 4;
  const key = await scrypt(pw, salt && valid ? salt : DUMMY, valid ? params : P);
  if (!salt || !want || !valid) return { ok: false, old: false };
  return { ok: want.length === key.length && crypto.timingSafeEqual(want, key), old };
}
const COMMON = new Set(['password', 'password1', 'password12', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwertyuiop', 'qwerty123', 'iloveyou', 'iloveyou1', '11111111', '00000000', 'abcd1234', 'abc12345', 'letmein123', 'welcome123', 'admin1234', 'passw0rd', 'p@ssw0rd', 'changeme']);
const pwProblem = (pw, email = '') => (pw.length < 8 || pw.length > 128 ? 'Password must be 8 to 128 characters.'
  : COMMON.has(pw.toLowerCase()) || (email && pw.toLowerCase() === email) || /^(.)\1+$/.test(pw) ? 'That password is too easy to guess. Choose another one.' : '');

// Failed-login lockout: 8 failures per (account, client) and 40 per account in 15 minutes. A stranger can lock only their own address,
// not the owner's, and a spread-out guessing attack is still capped.
const lockKeys = (email, ip) => ['acct:' + sha(email) + ':' + ip, 'acct:' + sha(email)];
const isLocked = (email, ip) => lockKeys(email, ip).some((k) => db.lockState(k).locked);
const noteFail = (email, ip) => { const [a, b] = lockKeys(email, ip); db.noteFail(a); db.noteFail(b, { max: 40 }); };
const clearFails = (email) => db.clearFails('acct:' + sha(email)); // also clears the per-client keys (prefix match)

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
const EMAIL = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/; // no commas, quotes or spaces: nothing that could address a second recipient
function publicUser(u) {
  const ids = db.listIdentities(u.id);
  return { id: u.id, name: u.name, email: u.email, verified: u.verified, hasPassword: u.hasPassword, identities: ids, provider: u.hasPassword ? 'password' : ids[0] || 'password' };
}
const decodeJwt = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString()); } catch { return {}; } };

async function http(url, { method = 'GET', form, headers = {} } = {}) {
  const r = await fetch(form && method === 'GET' ? url + (url.includes('?') ? '&' : '?') + new URLSearchParams(form) : url, {
    method, headers: { Accept: 'application/json', ...(form && method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...headers },
    body: form && method === 'POST' ? new URLSearchParams(form) : undefined, signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`);
  return r.json();
}
// Returns { sub, email, emailVerified, name }. emailVerified is true only when the provider itself asserts it.
async function profileFor(k, p, code, nonce, appleUser) {
  const form = { grant_type: 'authorization_code', code, redirect_uri: `${BASE}/auth/${k}/callback`, client_id: p.id, client_secret: k === 'apple' ? appleSecret() : p.secret };
  const tok = await http(p.token, { method: p.tokenGet ? 'GET' : 'POST', form });
  if (k === 'apple') {
    // The id_token arrives straight from Apple's token endpoint over TLS, so its signature need not be re-checked (OIDC Core 3.1.3.7); its claims are.
    const c = decodeJwt(tok.id_token);
    if (!c.sub || c.iss !== 'https://appleid.apple.com' || c.aud !== p.id || !(c.exp * 1000 > Date.now()) || c.nonce !== sha(nonce)) throw new Error('apple id_token claims rejected');
    return { sub: String(c.sub), email: clip(c.email, 254).toLowerCase(), emailVerified: c.email_verified === true || c.email_verified === 'true', name: clip(appleUser?.name ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}` : '', 40) };
  }
  if (!tok.access_token) throw new Error('no access token');
  const u = await http(p.info, { headers: { Authorization: 'Bearer ' + tok.access_token } });
  const sub = u.sub || u.id; if (!sub) throw new Error('no sub');
  // Only Google states email_verified. Microsoft and Facebook emails are not proof of ownership, so they never auto-link accounts.
  return { sub: String(sub), email: clip(u.email, 254).toLowerCase(), emailVerified: k === 'google' && u.email_verified === true, name: clip(u.name || u.given_name, 40) };
}

const redirect = (res, loc, cookies = []) => { res.writeHead(302, { Location: loc, 'Cache-Control': 'no-store', 'Set-Cookie': cookies }); res.end(); };
const safeNext = (n) => (/^\/[a-z0-9-]+\.html$/.test(String(n || '')) ? n : '/index.html');
const ERR = new Set(['denied', 'state', 'failed', 'unconfigured', 'linked', 'signin']);

const mailKey = (email) => 'mail:' + sha(email);
// 3 emails per address per hour, a per-client hourly cap, and a whole-server daily cap
const mailAllowed = (email, ip) => !limited(mailKey(email), 3, 3_600_000) && !limited(ip + ':mailip', MAIL_IP_HOURLY, 3_600_000) && db.spend('mail:all', MAIL_DAILY);
function queueMail(email, subject, text) { sendMail({ to: email, subject, text }).catch((e) => console.error('mail error', e.message)); } // not awaited: response time must not reveal whether an account exists
const GENERIC = 'If that address can be used, we have sent an email. Check your inbox (and spam).';

// Returns true when the request was handled.
export async function handle(req, res, url, h) {
  const { json, readBody } = h;
  const path = url.pathname, ip = clientIp(req);

  // ----- OAuth redirect flow -----
  const m = path.match(/^\/auth\/(google|microsoft|facebook|apple)\/(start|callback)$/);
  if (m) {
    const [, k, step] = m, p = PROVIDERS[k], oSame = p.formPost && SECURE ? 'None' : 'Lax';
    const bad = (code) => redirect(res, `/login.html?err=${ERR.has(code) ? code : 'failed'}`, [clearCookie(OAUTH, oSame)]);
    if (!configured()[k]) return bad('unconfigured'), true;
    if (limited(ip + ':auth', AUTH_MAX)) return json(res, 429, { error: 'Too many attempts. Try again in a minute.' }), true;
    if (step === 'start') {
      if (req.method !== 'GET') return json(res, 405, { error: 'Use GET' }), true;
      const link = url.searchParams.get('link') === '1', me = link ? currentUser(req) : null;
      if (link && !me) return bad('signin'), true;
      const nonce = crypto.randomBytes(16).toString('base64url');
      const q = new URLSearchParams({ client_id: p.id, redirect_uri: `${BASE}/auth/${k}/callback`, response_type: 'code', scope: p.scope, state: makeState({ k, n: nonce, nx: safeNext(url.searchParams.get('next')), ...(me ? { u: me.id } : {}) }) });
      if (p.formPost) { q.set('response_mode', 'form_post'); q.set('nonce', sha(nonce)); }
      redirect(res, p.auth + '?' + q, [setCookie(OAUTH, nonce, { maxAge: 600, sameSite: oSame })]);
      return true;
    }
    let params; // Apple uses POST form_post, the others GET
    if (req.method === 'POST' && p.formPost) { try { params = new URLSearchParams(await readBody(req, 20_000)); } catch { return bad('failed'), true; } }
    else if (req.method === 'GET') params = url.searchParams;
    else return json(res, 405, { error: 'Method not allowed' }), true;
    if (params.get('error')) return bad('denied'), true;
    const st = readState(params.get('state')), nonce = parseCookies(req)[OAUTH];
    if (!st || st.k !== k || !nonce || st.n !== nonce || !params.get('code')) return bad('state'), true;
    try {
      let appleUser; try { appleUser = params.get('user') ? JSON.parse(params.get('user')) : null; } catch { /* ignore */ }
      const prof = await profileFor(k, p, params.get('code'), nonce, appleUser);
      const owner = db.findByIdentity(k, prof.sub);
      if (st.u) { // linking another sign-in method to the signed-in account
        const me = currentUser(req);
        if (!me || me.id !== st.u) return bad('signin'), true;
        if (owner && owner.id !== me.id) return bad('linked'), true;
        db.addIdentity(me.id, k, prof.sub);
        return redirect(res, '/settings.html', [clearCookie(OAUTH, oSame)]), true;
      }
      let user = owner;
      if (!user) {
        const mine = prof.emailVerified && prof.email ? db.findVerifiedByEmail(prof.email) : null;
        if (mine) user = mine; // same verified email -> same person
        else {
          // An unverified email+password signup for this address could be someone squatting on it. The provider just proved ownership, so drop it.
          if (prof.emailVerified && prof.email) { const sq = db.findByEmail(prof.email, true); if (sq && !sq.verified) db.removeUser(sq.id); }
          user = db.addUser({ email: prof.email, name: prof.name || prof.email.split('@')[0] || p.name + ' user', verified: prof.emailVerified });
        }
        db.addIdentity(user.id, k, prof.sub);
      }
      redirect(res, safeNext(st.nx), [startSession(req, user.id, true), clearCookie(OAUTH, oSame)]);
    } catch (e) { console.error('oauth error', k, e.message); bad('failed'); }
    return true;
  }

  if (!path.startsWith('/api/auth/') && path !== '/api/me' && path !== '/api/data') return false;
  if (req.method !== 'GET' && !csrfOk(req)) return json(res, 403, { error: 'Forbidden' }), true;
  const user = currentUser(req);
  const body = async (max = 20_000) => { try { return JSON.parse((await readBody(req, max)) || '{}'); } catch (e) { throw Object.assign(new Error(e.status === 413 ? 'Request too large' : 'Invalid JSON'), { status: e.status || 400 }); } };
  const need = () => (user ? false : (json(res, 401, { error: 'Not signed in' }), true));
  // Risky actions need proof it is really the owner: the password, or (for social-only accounts) a sign-in within the last 15 minutes.
  const stepUp = async (u, b) => {
    if (u.hasPassword) {
      if (isLocked(u.email, ip)) return { status: 429, out: { error: 'Too many failed attempts. Try again later.' } };
      if (!(await checkPw(String(b.password || '').slice(0, 128), u._pw)).ok) { noteFail(u.email, ip); return { status: 401, out: { error: 'Enter your current password to confirm.', code: 'password' } }; }
      clearFails(u.email); return null;
    }
    return Date.now() - db.sessionCreated(sessionToken(req)) < 15 * 60_000 ? null : { status: 403, out: { error: 'For your safety, sign in again and retry within 15 minutes.', code: 'reauth' } };
  };
  try {
    if (path === '/api/me') {
      if (req.method === 'GET') return json(res, 200, { user: user ? publicUser(user) : null }), true;
      if (req.method === 'DELETE') {
        if (need()) return true;
        const sb = await body(), bad = await stepUp(user, sb); if (bad) return json(res, bad.status, bad.out), true;
        db.removeUser(user.id);
        res.setHeader('Set-Cookie', clearCookie(SID)); return json(res, 200, { ok: true }), true;
      }
      return json(res, 405, { error: 'Method not allowed' }), true;
    }
    if (path === '/api/data') {
      if (need()) return true;
      if (limited('data:' + user.id, req.method === 'PUT' ? 60 : 120)) return json(res, 429, { error: 'Slow down.' }), true;
      if (req.method === 'GET') { const g = db.getData(user.id); return json(res, 200, { data: g.data ? normalizeState(g.data) : null, rev: g.rev }), true; }
      if (req.method === 'PUT') {
        const b = await body(MAX_BYTES);
        const data = normalizeState(b.data);
        if (!data || !Number.isInteger(b.baseRev) || b.baseRev < 0) return json(res, 400, { error: 'Invalid data' }), true;
        const r = db.putData(user.id, data, b.baseRev);
        if (r.ok) return json(res, 200, { rev: r.rev }), true;
        const cur = db.getData(user.id);
        return json(res, 409, { error: 'Changed on another device', data: cur.data ? normalizeState(cur.data) : null, rev: cur.rev }), true;
      }
      return json(res, 405, { error: 'Method not allowed' }), true;
    }
    if (path === '/api/auth/sessions' && req.method === 'GET') {
      if (need()) return true;
      return json(res, 200, { sessions: db.listSessions(user.id, sessionToken(req)) }), true;
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' }), true;
    if (limited(ip + ':auth', AUTH_MAX)) return json(res, 429, { error: 'Too many attempts. Try again in a minute.' }), true;
    if (path === '/api/auth/logout') {
      db.endSession(sessionToken(req));
      res.setHeader('Set-Cookie', clearCookie(SID)); return json(res, 200, { ok: true }), true;
    }
    if (path === '/api/auth/logout-all') {
      if (need()) return true;
      db.endAllSessions(user.id); res.setHeader('Set-Cookie', clearCookie(SID)); return json(res, 200, { ok: true }), true;
    }
    if (path === '/api/auth/sessions/revoke') {
      if (need()) return true;
      const b = await body();
      return json(res, 200, { ok: db.revokeSession(user.id, clip(b.id, 40), sessionToken(req)) > 0 }), true;
    }
    if (path === '/api/auth/unlink') {
      if (need()) return true;
      const b = await body(), ids = db.listIdentities(user.id), prov = clip(b.provider, 20);
      if (!ids.includes(prov)) return json(res, 404, { error: 'Not linked' }), true;
      { const bad = await stepUp(user, b); if (bad) return json(res, bad.status, bad.out), true; }
      if (!user.hasPassword && ids.length < 2) return json(res, 400, { error: 'That is your only way to sign in.' }), true;
      db.removeIdentity(user.id, prov); return json(res, 200, { ok: true }), true;
    }
    if (path === '/api/auth/password') { // change password while signed in
      if (need()) return true;
      const b = await body();
      if (!user.hasPassword) return json(res, 400, { error: 'This account has no password.' }), true;
      if (isLocked(user.email, ip)) return json(res, 429, { error: 'Too many failed attempts. Try again later.' }), true;
      const next = typeof b.next === 'string' ? b.next : '';
      { const pb = pwProblem(next, user.email); if (pb) return json(res, 400, { error: pb }), true; }
      if (!(await checkPw(String(b.current || '').slice(0, 128), user._pw)).ok) { noteFail(user.email, ip); return json(res, 401, { error: 'Current password is incorrect.' }), true; }
      clearFails(user.email); db.updateUser(user.id, { pw: await hashPw(next) }); db.endOtherSessions(user.id, sessionToken(req));
      return json(res, 200, { ok: true }), true;
    }
    if (['/api/auth/register', '/api/auth/login', '/api/auth/resend', '/api/auth/forgot', '/api/auth/verify', '/api/auth/reset'].includes(path)) {
      const b = await body();
      const email = clip(b.email, 254).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';

      if (path === '/api/auth/verify') {
        // The person must also give the password chosen at sign-up, so someone who merely receives a sign-up mail they did not ask for cannot confirm it.
        const tok = clip(b.token, 100), uid = db.peekToken(tok, 'verify');
        if (!uid) return json(res, 400, { error: 'This link is invalid or has expired. Request a new one.' }), true;
        const vu = db.getUser(uid);
        if (vu && vu.hasPassword) {
          if (isLocked(vu.email, ip)) return json(res, 429, { error: 'Too many failed attempts. Try again later.' }), true;
          if (!(await checkPw(pw.slice(0, 128), vu._pw)).ok) { noteFail(vu.email, ip); return json(res, 401, { error: 'Enter the password you chose when you signed up to confirm your email.', code: 'password' }), true; }
        }
        if (!db.consumeToken(tok, 'verify')) return json(res, 400, { error: 'This link is invalid or has expired. Request a new one.' }), true;
        db.updateUser(uid, { verified: true }); return json(res, 200, { ok: true }), true; // no session is created: verifying must not log anyone in
      }
      if (path === '/api/auth/reset') {
        { const pb = pwProblem(pw); if (pb) return json(res, 400, { error: pb }), true; }
        const uid = db.consumeToken(clip(b.token, 100), 'reset');
        if (!uid) return json(res, 400, { error: 'This link is invalid or has expired. Request a new one.' }), true;
        const u = db.getUser(uid);
        db.updateUser(uid, { pw: await hashPw(pw), verified: true }); db.endAllSessions(uid); if (u && u.email) clearFails(u.email);
        return json(res, 200, { ok: true }), true;
      }
      if (!EMAIL.test(email)) return json(res, 400, { error: 'Enter a valid email address.' }), true;
      if (!emailEnabled()) return json(res, 503, { error: 'Email sign-in is not available on this server. Use a social sign-in or ask the owner to configure email.' }), true;

      if (path === '/api/auth/register') {
        { const pb = pwProblem(pw, email); if (pb) return json(res, 400, { error: pb }), true; }
        const hash = await hashPw(pw); // always done, so timing does not depend on whether the address is registered
        let ex = db.findByEmail(email, true), tok = null;
        try {
          if (!ex) { ex = db.addUser({ email, name: clip(b.name, 40) || email.split('@')[0], pw: hash, verified: false }); tok = db.newToken(ex.id, 'verify', 24 * 3600_000); }
          else if (!ex.verified) { db.updateUser(ex.id, { pw: hash, name: clip(b.name, 40) || ex.name }); tok = db.newToken(ex.id, 'verify', 24 * 3600_000); } // latest signup wins until verified
        } catch (e) { if (!/constraint/i.test(e.message)) throw e; }
        if (mailAllowed(email, ip)) {
          if (tok) queueMail(email, 'Confirm your Orbit account', `Hi,\n\nConfirm your email to finish creating your Orbit account:\n${BASE}/login.html#verify=${tok}\n\nThe link works once and expires in 24 hours. If you did not sign up, ignore this email.`);
          else queueMail(email, 'Orbit sign-up attempt', `Someone tried to create an Orbit account with this address, which already has one.\n\nSign in: ${BASE}/login.html\nForgot your password? Use "Forgot password" on that page.\n\nIf this was not you, you can ignore this email.`);
        }
        return json(res, 200, { ok: true, message: GENERIC }), true;
      }
      if (path === '/api/auth/resend' || path === '/api/auth/forgot') {
        const ex = db.findByEmail(email, true);
        if (ex && mailAllowed(email, ip)) {
          if (path === '/api/auth/resend' && !ex.verified) queueMail(email, 'Confirm your Orbit account', `Confirm your email:\n${BASE}/login.html#verify=${db.newToken(ex.id, 'verify', 24 * 3600_000)}\n\nThe link works once and expires in 24 hours.`);
          if (path === '/api/auth/forgot') queueMail(email, 'Reset your Orbit password', `Choose a new password:\n${BASE}/login.html#reset=${db.newToken(ex.id, 'reset', 3600_000)}\n\nThe link works once and expires in 1 hour. If you did not ask for this, ignore this email; your password has not changed.`);
        }
        return json(res, 200, { ok: true, message: GENERIC }), true;
      }
      // login
      if (isLocked(email, ip)) return json(res, 429, { error: 'Too many failed attempts for this account. Try again in a few minutes, or reset your password.' }), true;
      const found = db.findByEmail(email, true);
      const chk = await checkPw(pw.slice(0, 128), found && found._pw);
      if (!found || !chk.ok) { noteFail(email, ip); return json(res, 401, { error: 'Incorrect email or password.' }), true; }
      if (!found.verified) return json(res, 403, { error: 'Please confirm your email first. We can send the link again.', code: 'unverified' }), true;
      clearFails(email);
      if (chk.old) db.updateUser(found.id, { pw: await hashPw(pw.slice(0, 128)) }); // upgrade an older, cheaper hash
      res.setHeader('Set-Cookie', startSession(req, found.id, b.remember !== false));
      return json(res, 200, { user: publicUser(found) }), true;
    }
    return json(res, 404, { error: 'Not found' }), true;
  } catch (e) {
    if (e.status === 413 || e.status === 400 || e.status === 503) return json(res, e.status, { error: e.message }), true;
    console.error('auth error', e.message); return json(res, 500, { error: 'Server error' }), true;
  }
}
export { db };
export const endpoints = () => Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, { auth: p.auth, token: p.token, info: p.info || null }]));
