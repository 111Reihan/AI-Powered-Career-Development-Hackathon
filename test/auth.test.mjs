// Account tests: OAuth (mock provider), email + password with confirmation/reset, lockout, sessions, CSRF, sync, encryption at rest, migration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startMockIdp } from './mock-idp.mjs';
import { start, stop, jar, client, consoleMails, tokenFrom, countMails, fakeSmtp, rawDb, wait, tmpdir, legacyHash, KEY } from './helpers.mjs';
import crypto from 'node:crypto';

const tmp = tmpdir();
const { srv: idp, seen, profiles, tweaks } = startMockIdp(4030);
const smtp = fakeSmtp(4031);
const dbA = path.join(tmp, 'a.db');
const envA = { ORBIT_OAUTH_MOCK: 'http://localhost:4030', ORBIT_DB_FILE: dbA, BASE_URL: 'http://localhost:3210', ORBIT_AUTH_LIMIT: '10000' };
let A = await start(envA, 3210);
const B = await start({ ORBIT_DB_FILE: path.join(tmp, 'b.db') }, 3211);
const PROD = await start({ NODE_ENV: 'production', BASE_URL: 'https://orbit.test', SMTP_URL: 'smtp://127.0.0.1:4031/?ignoreTLS=true', MAIL_FROM: 'Orbit <hello@orbit.test>', ORBIT_DB_FILE: path.join(tmp, 'p.db'), ORBIT_AUTH_LIMIT: '10000' }, 3212);
const base = 'http://localhost:3210';
const { req, api } = client(base);
const servers = [B, PROD];
const waitMail = async (n, s = A) => { for (let i = 0; i < 80; i++) { if (countMails(s) >= n) return; await wait(50); } throw new Error('mail not sent'); };
const idpFlow = async (j, k, qs = '') => { // browser: start -> provider -> callback
  let r = await req(j, `/auth/${k}/start${qs}`); assert.equal(r.status, 302, `${k} start`);
  const loc = new URL(r.headers.get('location'));
  if (!loc.origin.includes('4030')) return r;
  if (k === 'apple') { // form_post: provider POSTs back
    const state = loc.searchParams.get('state'); await fetch(loc, { redirect: 'manual' });
    return req(j, '/auth/apple/callback', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: 'code-apple', state, user: JSON.stringify({ name: { firstName: 'Ann', lastName: 'Apple' } }) }) });
  }
  r = await fetch(loc, { redirect: 'manual' }); const cb = new URL(r.headers.get('location'));
  return req(j, cb.pathname + cb.search);
};
const me = async (j) => (await (await req(j, '/api/me')).json()).user;
const register = (email, password = 'longenough1', name = 'Stu') => api(jar(), 'POST', '/api/auth/register', { email, password, name });
const verified = async (email, password = 'longenough1') => { // register + confirm through the mailed link
  const before = countMails(A); await register(email, password); await waitMail(before + 1);
  const tok = tokenFrom(consoleMails(A), 'verify'); assert.ok(tok, 'verify link mailed');
  assert.equal((await api(jar(), 'POST', '/api/auth/verify', { token: tok })).status, 200);
};
const login = async (email, password = 'longenough1', extra = {}) => { const j = jar(); const r = await api(j, 'POST', '/api/auth/login', { email, password, ...extra }); return { j, r }; };

try {
  // ---------- status / configuration ----------
  let st = await (await fetch(base + '/api/status')).json();
  assert.deepEqual(st.providers, { google: true, microsoft: true, facebook: true, apple: true }); assert.equal(st.email, true); assert.equal(st.mail, 'console');
  assert.equal((await (await fetch('http://localhost:3211/api/status')).json()).providers.google, false);

  // ---------- OAuth ----------
  for (const k of ['google', 'microsoft', 'facebook']) {
    const j = jar();
    let r = await req(j, `/auth/${k}/start?next=/exam.html`);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.origin, 'http://localhost:4030'); assert.equal(loc.searchParams.get('response_type'), 'code');
    assert.equal(loc.searchParams.get('redirect_uri'), `${base}/auth/${k}/callback`); assert.ok(j.has('orbit_oauth'));
    r = await fetch(loc, { redirect: 'manual' }); const cb = new URL(r.headers.get('location'));
    r = await req(j, cb.pathname + cb.search);
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/exam.html'); assert.ok(j.has('orbit_sid'));
    const u = await me(j); assert.ok(u.identities.includes(k)); assert.ok(u.name);
    const j2 = jar(); await idpFlow(j2, k); assert.equal((await me(j2)).id, u.id, 'same provider account -> same user');
  }
  assert.ok(seen.tokenCalls.some((t) => t.k === 'facebook' && t.method === 'GET'), 'facebook token exchange uses GET as documented');
  assert.ok(seen.tokenCalls.some((t) => t.k === 'google' && t.method === 'POST'));
  { // Apple: form_post, nonce sent, id_token claims checked
    const j = jar(); const r = await idpFlow(j, 'apple');
    assert.equal(r.status, 302); assert.ok(j.has('orbit_sid')); assert.equal(seen.lastAuthorize.response_mode, 'form_post'); assert.ok(seen.lastAuthorize.nonce);
    assert.equal((await me(j)).name, 'Ann Apple');
    for (const [t, v] of [['appleAud', 'someone-else'], ['appleNonce', 'replayed'], ['appleIss', 'https://evil.example']]) {
      tweaks[t] = v; const j2 = jar(); const r2 = await idpFlow(j2, 'apple');
      assert.match(r2.headers.get('location'), /err=failed/, t + ' rejected'); assert.ok(!j2.has('orbit_sid')); tweaks[t] = null;
    }
  }
  { // callback protections
    const j = jar(); let r = await req(j, '/auth/google/callback?code=x&state=forged.sig'); assert.match(r.headers.get('location'), /err=state/); assert.ok(!j.has('orbit_sid'));
    const s = await req(jar(), '/auth/google/start'); const state = new URL(s.headers.get('location')).searchParams.get('state');
    r = await req(jar(), '/auth/google/callback?code=x&state=' + encodeURIComponent(state)); assert.match(r.headers.get('location'), /err=state/, 'login CSRF: state without matching cookie');
    assert.match((await req(jar(), '/auth/google/callback?error=access_denied')).headers.get('location'), /err=denied/);
    const st4 = new URL((await req(jar(), '/auth/google/start?next=//evil.com')).headers.get('location')).searchParams.get('state');
    assert.ok(!Buffer.from(st4.split('.')[0], 'base64url').toString().includes('evil'), 'open redirect dropped');
  }

  // ---------- account linking rules ----------
  await verified('pw1@example.com');
  { const { j } = await login('pw1@example.com'); var pw1 = await me(j); var pw1Jar = j; }
  profiles.google = { sub: 'google-sub-2', name: 'G Two', email: 'pw1@example.com', email_verified: true };
  { const j = jar(); await idpFlow(j, 'google'); const u = await me(j); assert.equal(u.id, pw1.id, 'Google with the same VERIFIED email joins the existing account'); assert.ok(u.hasPassword && u.identities.includes('google')); }
  profiles.microsoft = { sub: 'ms-sub-2', name: 'M Two', email: 'pw1@example.com' };
  { const j = jar(); await idpFlow(j, 'microsoft'); assert.notEqual((await me(j)).id, pw1.id, 'Microsoft email is not proof of ownership: no auto-link (nOAuth)'); }
  profiles.google = { sub: 'google-sub-2b', name: 'G Unverified', email: 'pw1@example.com', email_verified: false };
  { const j = jar(); await idpFlow(j, 'google'); assert.notEqual((await me(j)).id, pw1.id, 'unverified Google email never links'); }
  { // squatter: unverified signup with someone's email is removed once the real owner proves it
    await register('squat@example.com', 'squatterpass1'); // never confirmed
    assert.equal((await login('squat@example.com', 'squatterpass1')).r.status, 403, 'unconfirmed account cannot sign in');
    profiles.google = { sub: 'google-sub-3', name: 'Real Owner', email: 'squat@example.com', email_verified: true };
    const j = jar(); await idpFlow(j, 'google'); assert.ok(await me(j));
    assert.equal((await login('squat@example.com', 'squatterpass1')).r.status, 401, 'squatter password no longer works');
  }
  { // explicit linking from Settings
    profiles.facebook = { id: 'fb-link-1', name: 'Linker', email: 'x@example.com' };
    let r = await req(jar(), '/auth/facebook/start?link=1'); assert.match(r.headers.get('location'), /err=signin/, 'linking needs a session');
    r = await idpFlow(pw1Jar, 'facebook', '?link=1'); assert.equal(r.headers.get('location'), '/settings.html');
    assert.ok((await me(pw1Jar)).identities.includes('facebook'));
    const j = jar(); await idpFlow(j, 'facebook'); assert.equal((await me(j)).id, pw1.id, 'signing in with the linked provider reaches the account');
    profiles.google = { sub: 'google-sub-9', name: 'Other', email: 'other@example.com', email_verified: true };
    const o = jar(); await idpFlow(o, 'google'); const rr = await idpFlow(o, 'facebook', '?link=1'); assert.match(rr.headers.get('location'), /err=linked/, 'identity already belongs to another account');
    assert.equal((await api(o, 'POST', '/api/auth/unlink', { provider: 'google' })).status, 400, 'cannot remove the only sign-in method');
    assert.equal((await api(pw1Jar, 'POST', '/api/auth/unlink', { provider: 'facebook' })).status, 200);
    assert.ok(!(await me(pw1Jar)).identities.includes('facebook'));
  }

  // ---------- email + password ----------
  { const j = jar();
    assert.equal((await api(j, 'POST', '/api/auth/register', { email: 'a@b.co', password: 'short' })).status, 400);
    assert.equal((await api(j, 'POST', '/api/auth/register', { email: 'nope', password: 'longenough1' })).status, 400);
    const m0 = countMails(A);
    const r1 = await register('Enum@Example.com'); const b1 = await r1.text(); await waitMail(m0 + 1);
    const r2 = await register('enum@example.com'); const b2 = await r2.text(); // same (unverified) address again
    assert.equal(r1.status, 200); assert.equal(b1, b2, 'register answers identically for new and pending addresses');
    assert.equal((await login('enum@example.com')).r.status, 403); assert.equal((await login('enum@example.com', 'wrongpass1')).r.status, 401, 'wrong password stays generic');
    const tok = tokenFrom(consoleMails(A), 'verify'); assert.ok(tok);
    const old = tokenFrom(consoleMails(A), 'verify', -2); assert.equal((await api(jar(), 'POST', '/api/auth/verify', { token: old })).status, 400, 'only the newest link works');
    const vr = await api(jar(), 'POST', '/api/auth/verify', { token: tok }); assert.equal(vr.status, 200); assert.equal(vr.headers.getSetCookie().length, 0, 'verifying does not sign anyone in');
    assert.equal((await api(jar(), 'POST', '/api/auth/verify', { token: tok })).status, 400, 'link is single-use');
    const b3 = await (await register('enum@example.com')).text(); assert.equal(b3, b1, 'registering a CONFIRMED address looks the same too');
    const f1 = await (await api(jar(), 'POST', '/api/auth/forgot', { email: 'enum@example.com' })).text(), f2 = await (await api(jar(), 'POST', '/api/auth/forgot', { email: 'nobody@example.com' })).text();
    assert.equal(f1, f2, 'forgot-password does not reveal which addresses exist');
    const n = countMails(A); for (let i = 0; i < 5; i++) await register('enum@example.com'); await wait(300);
    assert.ok(countMails(A) - n <= 1, 'mail is capped at 3 per address per hour');
  }
  { // sign in / remember me / CSRF
    const on = await login('pw1@example.com'); assert.equal(on.r.status, 200);
    assert.match(on.r.headers.getSetCookie()[0], /Max-Age=\d+/); assert.match(on.r.headers.getSetCookie()[0], /HttpOnly/);
    const off = await login('pw1@example.com', 'longenough1', { remember: false }); assert.ok(!/Max-Age/i.test(off.r.headers.getSetCookie()[0]), 'unticked "keep me signed in" = session cookie');
    const j = on.j;
    assert.equal((await req(j, '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403, 'needs X-Orbit');
    assert.equal((await api(j, 'POST', '/api/auth/logout', {}, { origin: 'http://evil.example' })).status, 403, 'cross-origin blocked');
    assert.equal((await api(j, 'POST', '/api/auth/logout', {}, { 'sec-fetch-site': 'cross-site' })).status, 403, 'Fetch-Metadata cross-site blocked');
    assert.equal((await api(jar(), 'GET', '/api/data')).status, 401);
  }

  // ---------- lockout (persisted) ----------
  await verified('lock@example.com');
  for (let i = 0; i < 8; i++) assert.equal((await login('lock@example.com', 'badpassword' + i)).r.status, 401);
  assert.equal((await login('lock@example.com')).r.status, 429, 'correct password refused while locked');
  for (let i = 0; i < 9; i++) await login('ghost@example.com', 'x' + i + 'xxxxxxx'); assert.equal((await login('ghost@example.com')).r.status, 429, 'unknown addresses lock too (no oracle)');

  // ---------- password reset + change + sessions ----------
  await verified('reset@example.com');
  const dev1 = await login('reset@example.com'), dev2 = await login('reset@example.com');
  let m = countMails(A); await api(jar(), 'POST', '/api/auth/forgot', { email: 'reset@example.com' }); await waitMail(m + 1);
  const rt = tokenFrom(consoleMails(A), 'reset'); assert.ok(rt);
  assert.equal((await api(jar(), 'POST', '/api/auth/reset', { token: rt, password: 'short' })).status, 400);
  assert.equal((await api(jar(), 'POST', '/api/auth/reset', { token: 'x'.repeat(43), password: 'newpassword1' })).status, 400);
  assert.equal((await api(jar(), 'POST', '/api/auth/reset', { token: rt, password: 'newpassword1' })).status, 200);
  assert.equal((await api(jar(), 'POST', '/api/auth/reset', { token: rt, password: 'newpassword2' })).status, 400, 'reset link is single-use');
  assert.equal(await me(dev1.j), null, 'reset ends every existing session'); assert.equal((await login('reset@example.com')).r.status, 401, 'old password dead');
  const nu = await login('reset@example.com', 'newpassword1'); assert.equal(nu.r.status, 200);
  { // an unconfirmed squatter's password is wiped by a reset
    await register('pre@example.com', 'attackerpass1'); m = countMails(A); await api(jar(), 'POST', '/api/auth/forgot', { email: 'pre@example.com' }); await waitMail(m + 1);
    const t = tokenFrom(consoleMails(A), 'reset'); await api(jar(), 'POST', '/api/auth/reset', { token: t, password: 'ownerpass123' });
    assert.equal((await login('pre@example.com', 'attackerpass1')).r.status, 401); assert.equal((await login('pre@example.com', 'ownerpass123')).r.status, 200);
  }
  { const a = await login('reset@example.com', 'newpassword1'), b = await login('reset@example.com', 'newpassword1');
    let s = await (await req(a.j, '/api/auth/sessions')).json(); assert.ok(s.sessions.length >= 3); assert.equal(s.sessions.filter((x) => x.current).length, 1);
    assert.equal((await api(a.j, 'POST', '/api/auth/password', { current: 'wrong-one-1', next: 'brandnew123' })).status, 401);
    assert.equal((await api(a.j, 'POST', '/api/auth/password', { current: 'newpassword1', next: 'short' })).status, 400);
    assert.equal((await api(a.j, 'POST', '/api/auth/password', { current: 'newpassword1', next: 'brandnew123' })).status, 200);
    assert.ok(await me(a.j), 'this device stays signed in'); assert.equal(await me(b.j), null, 'other devices signed out'); assert.equal(await me(nu.j), null);
    const c = await login('reset@example.com', 'brandnew123'), d = await login('reset@example.com', 'brandnew123');
    s = await (await req(c.j, '/api/auth/sessions')).json(); const other = s.sessions.find((x) => !x.current);
    assert.equal((await (await api(c.j, 'POST', '/api/auth/sessions/revoke', { id: other.id })).json()).ok, true);
    assert.ok(await me(c.j)); assert.equal((await (await api(c.j, 'POST', '/api/auth/sessions/revoke', { id: s.sessions.find((x) => x.current).id })).json()).ok, false, 'cannot revoke the current one here');
    assert.equal((await api(c.j, 'POST', '/api/auth/logout-all', {})).status, 200); assert.equal(await me(d.j), null); assert.equal(await me(c.j), null);
  }

  // ---------- progress sync ----------
  await verified('sync@example.com'); const S = (await login('sync@example.com')).j, S2 = (await login('sync@example.com')).j;
  const good = (over = {}) => ({ v: 2, onboarded: true, career: 'data-scientist', profile: { name: 'Annabelle Marker', study: 'CS', year: 'Year 2', interests: ['data'], hours: 6, weeks: 20, style: { analytical: 4, creative: 3, social: 2, technical: 5 } }, skills: { python: 2 }, done: {}, activity: {}, notes: [], exams: [], updatedAt: Date.now(), ...over });
  let g = await (await api(S, 'GET', '/api/data')).json(); assert.equal(g.rev, 0); assert.equal(g.data, null);
  let r = await api(S, 'PUT', '/api/data', { data: good(), baseRev: 0 }); assert.equal((await r.json()).rev, 1);
  r = await api(S2, 'PUT', '/api/data', { data: good({ profile: { name: 'Stale' } }), baseRev: 0 }); assert.equal(r.status, 409, 'write based on an old revision is refused');
  const conflict = await r.json(); assert.equal(conflict.rev, 1); assert.equal(conflict.data.profile.name, 'Annabelle Marker', 'conflict reply carries the server copy for merging');
  assert.equal((await api(S2, 'PUT', '/api/data', { data: good(), baseRev: 1 })).status, 200);
  assert.equal((await api(S, 'PUT', '/api/data', { data: good(), baseRev: 1.5 })).status, 400); assert.equal((await api(S, 'PUT', '/api/data', { data: { v: 1 }, baseRev: 2 })).status, 400);
  assert.equal((await api(S, 'PUT', '/api/data', { data: { v: 2, big: 'x'.repeat(250_000) }, baseRev: 2 })).status, 413);
  r = await api(S, 'PUT', '/api/data', { data: good({ hacked: 'yes', career: 'nope', skills: { python: 99, '__proto__': 4, evil: 3 }, done: { 'ok:1': new Date().toISOString(), '<img onerror=x>': new Date().toISOString(), bad: 'not a date' }, notes: [{ t: 1, text: '<b>x</b>'.repeat(300) }], profile: { name: '<script>alert(1)</script>' + 'n'.repeat(100), interests: ['data', '<x>'], hours: 9999, weeks: 1, style: {} }, updatedAt: 4e15 }), baseRev: 2 }); assert.equal(r.status, 200);
  g = (await (await api(S, 'GET', '/api/data')).json()).data;
  assert.ok(!('hacked' in g) && g.career === null && g.skills.python === 4 && !('evil' in g.skills), 'unknown keys dropped, values clamped');
  assert.deepEqual(Object.keys(g.done), ['ok:1']); assert.ok(!g.profile.name.includes('<') && g.profile.name.length <= 40); assert.deepEqual(g.profile.interests, ['data']);
  assert.equal(g.profile.hours, 40); assert.equal(g.profile.weeks, 4); assert.ok(g.updatedAt <= Date.now() + 61_000, 'far-future timestamps are clamped'); assert.ok(g.notes[0].text.length <= 600);
  { let last = 0, rev = 3; for (let i = 0; i < 70; i++) { const x = await api(S, 'PUT', '/api/data', { data: good(), baseRev: rev }); last = x.status; if (x.status === 200) rev++; if (x.status === 429) break; } assert.equal(last, 429, 'sync writes are rate limited'); }

  // ---------- storage: encrypted at rest, cascade delete ----------
  const files = [dbA, dbA + '-wal'].filter((f) => fs.existsSync(f));
  const rawAll = Buffer.concat(files.map((f) => fs.readFileSync(f))).toString('latin1');
  for (const secret of ['pw1@example.com', 'sync@example.com', 'longenough1', 'newpassword1', 'data-scientist', 'Annabelle Marker', 'Real Owner']) assert.ok(!rawAll.includes(secret), `"${secret}" must not appear in the database file in clear text`);
  assert.match(rawAll, /[0-9a-f]{32}:[0-9a-f]{128}/, 'password hashes are salted scrypt');
  assert.ok(!/at-google|code-google/.test(rawAll), 'provider tokens are not stored');
  { const d = rawDb(dbA); const uid = (await me(S)).id; assert.equal(await (await api(S, 'DELETE', '/api/me')).status, 200);
    assert.equal(d.prepare('SELECT COUNT(*) c FROM users WHERE id=?').get(uid).c, 0); assert.equal(d.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id=?').get(uid).c, 0, 'sessions removed with the account'); d.close();
    assert.equal((await login('sync@example.com')).r.status, 401); }

  // ---------- restart: lockout persists, expired sessions are swept ----------
  { const w = new DatabaseSync(dbA); w.prepare('UPDATE sessions SET exp=1 WHERE id IN (SELECT id FROM sessions LIMIT 5)').run(); const expired = w.prepare('SELECT COUNT(*) c FROM sessions WHERE exp<?').get(Date.now()).c; assert.ok(expired >= 1); w.close();
    await stop(A); A = await start(envA, 3210);
    const d = rawDb(dbA); assert.equal(d.prepare('SELECT COUNT(*) c FROM sessions WHERE exp<?').get(Date.now()).c, 0, 'expired sessions are deleted at start-up (and every 10 minutes)'); d.close();
    assert.equal((await login('lock@example.com')).r.status, 429, 'lockout survived the restart');
    const w2 = new DatabaseSync(dbA); w2.prepare('UPDATE locks SET until=1, first=1').run(); w2.close();
    assert.equal((await login('lock@example.com')).r.status, 200, 'lock expires'); }

  // ---------- production-like server: SMTP delivery, HSTS, __Host- cookie ----------
  { const pb = 'http://localhost:3212', pc = client(pb);
    const s = await (await fetch(pb + '/api/status')).json(); assert.equal(s.email, true); assert.equal(s.mail, 'smtp'); assert.equal(s.providers.google, false, 'mock IdP is never honoured in production');
    assert.match((await fetch(pb + '/index.html')).headers.get('strict-transport-security'), /max-age=\d{7,}/);
    assert.equal((await pc.api(jar(), 'POST', '/api/auth/register', { email: 'prod@example.com', password: 'longenough1', name: 'P' })).status, 200);
    for (let i = 0; i < 60 && !smtp.mails.length; i++) await wait(50); assert.equal(smtp.mails.length, 1, 'mail was delivered through SMTP');
    const txt = smtp.last(); assert.match(txt, /From: .*hello@orbit\.test/); assert.match(txt, /https:\/\/orbit\.test\/login\.html#verify=/);
    assert.equal((await pc.api(jar(), 'POST', '/api/auth/verify', { token: tokenFrom(txt, 'verify') })).status, 200);
    const j = jar(); const lr = await pc.api(j, 'POST', '/api/auth/login', { email: 'prod@example.com', password: 'longenough1' }); assert.equal(lr.status, 200);
    const sc = lr.headers.getSetCookie()[0]; assert.match(sc, /^__Host-orbit_sid=/); assert.match(sc, /; Secure/); assert.match(sc, /; HttpOnly/); assert.match(sc, /Path=\//); assert.ok(!/Domain=/i.test(sc));
    assert.equal((await (await pc.req(j, '/api/me')).json()).user.email, 'prod@example.com');
  }
  { // production without SMTP: email sign-up is off (no unverifiable accounts)
    const N = await start({ NODE_ENV: 'production', BASE_URL: 'https://orbit.test', ORBIT_DB_FILE: path.join(tmp, 'n.db') }, 3214);
    try { assert.equal((await (await fetch(N.base + '/api/status')).json()).email, false); assert.equal((await client(N.base).api(jar(), 'POST', '/api/auth/register', { email: 'a@b.co', password: 'longenough1' })).status, 503); } finally { await stop(N); }
  }
  { // start-up refusals
    await assert.rejects(start({ NODE_ENV: 'production', BASE_URL: 'https://orbit.test', ORBIT_DATA_KEY: '', ORBIT_DB_FILE: path.join(tmp, 'x.db') }, 3215), /ORBIT_DATA_KEY/, 'production needs an encryption key');
    await assert.rejects(start({ NODE_ENV: 'production', BASE_URL: 'http://example.com', ORBIT_DB_FILE: path.join(tmp, 'y.db') }, 3216), /Refusing to start|https/, 'production needs https');
    const M = await start({ NODE_ENV: 'development', ORBIT_OAUTH_MOCK: 'http://localhost:4030', ORBIT_DB_FILE: path.join(tmp, 'm.db') }, 3217);
    try { assert.equal((await (await fetch(M.base + '/api/status')).json()).providers.google, false, 'ORBIT_OAUTH_MOCK is ignored outside NODE_ENV=test'); assert.match(M.err(), /ORBIT_OAUTH_MOCK ignored/); } finally { await stop(M); }
  }

  // ---------- default limits and provider without keys ----------
  { const r1 = await fetch('http://localhost:3211/auth/google/start', { redirect: 'manual' }); assert.match(r1.headers.get('location'), /err=unconfigured/);
    let last = 0; for (let i = 0; i < 40; i++) last = (await fetch('http://localhost:3211/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-orbit': '1' }, body: JSON.stringify({ email: 'z@z.co', password: 'abcdefgh' + i }) })).status;
    assert.equal(last, 429, 'per-client rate limit on sign-in calls'); }

  // ---------- migration from the old JSON store ----------
  { const legacy = path.join(tmp, 'orbit.json'), ldb = path.join(tmp, 'l.db');
    fs.writeFileSync(legacy, JSON.stringify({ secret: 'x', sessions: {}, users: { u1: { id: 'u1', provider: 'password', sub: 'old@example.com', email: 'old@example.com', name: 'Old', pw: legacyHash('oldpassword1'), data: good(), updatedAt: 5 }, u2: { id: 'u2', provider: 'google', sub: 'g-old', email: 'g@example.com', name: 'G Old', data: null } } }));
    const L = await start({ ORBIT_DB_FILE: ldb, ORBIT_DATA_FILE: legacy }, 3218);
    try { assert.match(L.out(), /Imported 2 account/); assert.ok(fs.existsSync(legacy + '.migrated') && !fs.existsSync(legacy));
      const lc = client(L.base), j = jar(); assert.equal((await lc.api(j, 'POST', '/api/auth/login', { email: 'old@example.com', password: 'oldpassword1' })).status, 200, 'old password still works');
      const d = (await (await lc.api(j, 'GET', '/api/data')).json()); assert.equal(d.data.profile.name, 'Annabelle Marker'); assert.equal(d.rev, 1);
    } finally { await stop(L); } }

  console.log('auth tests passed');
} finally { await Promise.all([A, ...servers].map(stop)); idp.close(); smtp.srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
