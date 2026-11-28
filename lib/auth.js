// Accounts: email and password sign-up with confirmation and reset, persistent sessions, and synced progress.
// No third-party sign-in: the server stores only what the email flows need.
import crypto from 'node:crypto';
import * as db from './db.js';
import { sha } from './crypto.js';
import { BASE, SECURE, AUTH_MAX, MAIL_DAILY, MAIL_IP_HOURLY } from './config.js';
import { clientIp, limited, csrfOk } from './guard.js';
import { normalizeState, MAX_BYTES } from './validate.js';
import { mailMode, sendMail } from './mail.js';

const SID = SECURE ? '__Host-orbit_sid' : 'orbit_sid';
export const emailEnabled = () => mailMode() !== 'off';


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

function publicUser(u) { return { id: u.id, name: u.name, email: u.email, verified: u.verified, hasPassword: u.hasPassword }; }
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
const EMAIL = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/; // no commas, quotes or spaces: nothing that could address a second recipient



const mailKey = (email) => 'mail:' + sha(email);
// 3 emails per address per hour, a per-client hourly cap, and a whole-server daily cap
const mailAllowed = (email, ip) => !limited(mailKey(email), 3, 3_600_000) && !limited(ip + ':mailip', MAIL_IP_HOURLY, 3_600_000) && db.spend('mail:all', MAIL_DAILY);
function queueMail(email, subject, text) { sendMail({ to: email, subject, text }).catch((e) => console.error('mail error', e.message)); } // not awaited: response time must not reveal whether an account exists
const GENERIC = 'If that address can be used, we have sent an email. Check your inbox (and spam).';

// Returns true when the request was handled.
export async function handle(req, res, url, h) {
  const { json, readBody } = h;
  const path = url.pathname, ip = clientIp(req);

  if (!path.startsWith('/api/auth/') && path !== '/api/me' && path !== '/api/data') return false;
  if (req.method !== 'GET' && !csrfOk(req)) return json(res, 403, { error: 'Forbidden' }), true;
  const user = currentUser(req);
  const body = async (max = 20_000) => { try { return JSON.parse((await readBody(req, max)) || '{}'); } catch (e) { throw Object.assign(new Error(e.status === 413 ? 'Request too large' : 'Invalid JSON'), { status: e.status || 400 }); } };
  const need = () => (user ? false : (json(res, 401, { error: 'Not signed in' }), true));
  // Risky actions need proof it is really the owner: the current password.
  const stepUp = async (u, b) => {
    if (isLocked(u.email, ip)) return { status: 429, out: { error: 'Too many failed attempts. Try again later.' } };
    if (!(await checkPw(String(b.password || '').slice(0, 128), u._pw)).ok) { noteFail(u.email, ip); return { status: 401, out: { error: 'Enter your current password to confirm.', code: 'password' } }; }
    clearFails(u.email); return null;
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
      if (!emailEnabled()) return json(res, 503, { error: 'Email sign-in is not available on this server. Ask the owner to configure email.' }), true;

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
