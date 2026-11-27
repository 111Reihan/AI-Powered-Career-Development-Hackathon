// Second-round hardening: password-confirmed email links, step-up for risky actions, lockout fairness, mail caps,
// session cap, AAD-bound encryption, v1 -> v2 re-sealing, key rotation, https redirect, dev-mode bind, portfolio validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { start, stop, jar, client, consoleMails, tokenFrom, countMails, wait, tmpdir, KEY } from './helpers.mjs';
const rawDb = (f) => { const d = new DatabaseSync(f); d.exec('PRAGMA busy_timeout=5000'); return d; };

const tmp = tmpdir(), PW = 'longenough1';
const base = (port) => `http://localhost:${port}`;
const waitMail = async (S, n) => { for (let i = 0; i < 80; i++) { if (countMails(S) >= n) return; await wait(50); } throw new Error('mail not sent'); };
const dbH = path.join(tmp, 'h.db');
let H = await start({ ORBIT_DB_FILE: dbH, BASE_URL: base(3230), ORBIT_AUTH_LIMIT: '100000' }, 3230);
const { req, api } = client(base(3230));
const extra = [];
async function signup(S, c, email, password = PW) {
  const m = countMails(S); await c.api(jar(), 'POST', '/api/auth/register', { email, password, name: 'T' }); await waitMail(S, m + 1);
  return tokenFrom(consoleMails(S), 'verify');
}
async function verified(S, c, email, password = PW) {
  const t = await signup(S, c, email, password);
  assert.equal((await c.api(jar(), 'POST', '/api/auth/verify', { token: t, password })).status, 200); return t;
}
const state = (extraKeys = {}) => ({ v: 2, onboarded: true, assessed: false, career: 'data-scientist', profile: { name: 'Hardening Marker', study: 'CS', year: 'Year 1', interests: [], style: { analytical: 3, creative: 3, social: 3, technical: 3 }, hours: 5, weeks: 24 }, skills: {}, done: {}, activity: {}, notes: [], exams: [], updatedAt: 5, ...extraKeys });
try {
  // ---- email link needs the password chosen at sign-up (pre-hijack) ----
  { const c = { api };
    const t = await signup(H, c, 'victim@example.com');
    let r = await api(jar(), 'POST', '/api/auth/verify', { token: t }); assert.equal(r.status, 401); assert.equal((await r.json()).code, 'password');
    assert.equal((await api(jar(), 'POST', '/api/auth/verify', { token: t, password: 'attackerpw99' })).status, 401, 'wrong password cannot confirm');
    assert.equal((await api(jar(), 'POST', '/api/auth/login', { email: 'victim@example.com', password: PW })).status, 403, 'still unverified after failed confirms');
    assert.equal((await api(jar(), 'POST', '/api/auth/verify', { token: t, password: PW })).status, 200, 'the token survives wrong guesses');
    assert.equal((await api(jar(), 'POST', '/api/auth/verify', { token: t, password: PW })).status, 400, 'single use'); }

  // ---- password policy and email shape ----
  { for (const pw of ['password123', 'aaaaaaaaaa', 'short1', 'weak@example.com']) assert.equal((await api(jar(), 'POST', '/api/auth/register', { email: 'weak@example.com', password: pw })).status, 400, pw);
    for (const e of ['a,b@evil.com', 'x@y', 'a b@c.com', '"q"@c.com', 'a@b.c']) assert.equal((await api(jar(), 'POST', '/api/auth/register', { email: e, password: PW })).status, 400, e);
    assert.equal((await api(jar(), 'POST', '/api/auth/register', { email: 'new.person+tag@sub.example.co.uk', password: PW })).status, 200); }

  // ---- at most 10 sessions per account ----
  { await verified(H, { api }, 'many@example.com'); const jars = [];
    for (let i = 0; i < 12; i++) { const j = jar(); assert.equal((await api(j, 'POST', '/api/auth/login', { email: 'many@example.com', password: PW })).status, 200); jars.push(j); await wait(5); }
    const list = await (await api(jars[11], 'GET', '/api/auth/sessions')).json(); assert.equal(list.sessions.length, 10, 'older sessions are dropped');
    assert.equal((await (await req(jars[0], '/api/me')).json()).user, null, 'the oldest session no longer works'); }

  // ---- step-up: social-only accounts must have signed in recently ----
  { await verified(H, { api }, 'social@example.com'); const j = jar(); await api(j, 'POST', '/api/auth/login', { email: 'social@example.com', password: PW });
    const d = rawDb(dbH); const uid = (await (await req(j, '/api/me')).json()).user.id;
    d.prepare('UPDATE users SET pw=NULL WHERE id=?').run(uid); d.prepare("INSERT INTO identities(provider,sub,user_id) VALUES('google','g-social',?)").run(uid);
    d.prepare('UPDATE sessions SET created=created-3600000 WHERE user_id=?').run(uid);
    const r = await api(j, 'DELETE', '/api/me', {}); assert.equal(r.status, 403); assert.equal((await r.json()).code, 'reauth');
    d.prepare('UPDATE sessions SET created=? WHERE user_id=?').run(Date.now(), uid);
    assert.equal((await api(j, 'DELETE', '/api/me', {})).status, 200, 'a fresh sign-in may delete'); d.close(); }

  // ---- lockout: a stranger cannot lock the owner out, but spread-out guessing is still capped ----
  { const L = await start({ ORBIT_DB_FILE: path.join(tmp, 'l.db'), BASE_URL: base(3231), TRUST_PROXY: '1', ORBIT_AUTH_LIMIT: '100000' }, 3231); extra.push(L);
    const lc = client(base(3231)), from = (ip) => ({ 'x-forwarded-for': ip });
    await verified(L, lc, 'owner@example.com');
    const login = (ip, pw) => lc.api(jar(), 'POST', '/api/auth/login', { email: 'owner@example.com', password: pw }, from(ip));
    for (let i = 0; i < 9; i++) assert.ok([401, 429].includes((await login('9.9.9.9', 'wrongwrong1')).status));
    assert.equal((await login('9.9.9.9', PW)).status, 429, 'the guessing address is locked');
    assert.equal((await login('2.2.2.2', PW)).status, 200, 'the owner, from another address, is not');
    for (let ip = 10; ip < 16; ip++) for (let i = 0; i < 8; i++) await login('7.7.7.' + ip, 'wrongwrong1'); // 48 failures from 6 addresses
    assert.equal((await login('2.2.2.2', PW)).status, 429, 'distributed guessing hits the per-account cap'); }

  // ---- mail caps: per client and per day, with identical responses ----
  { const M = await start({ ORBIT_DB_FILE: path.join(tmp, 'm.db'), BASE_URL: base(3232), ORBIT_AUTH_LIMIT: '100000', ORBIT_MAIL_IP_HOURLY: '2', ORBIT_MAIL_DAILY: '100000' }, 3232); extra.push(M);
    const mc = client(base(3232)); const bodies = [];
    for (let i = 0; i < 4; i++) { const r = await mc.api(jar(), 'POST', '/api/auth/register', { email: `cap${i}@example.com`, password: PW }); assert.equal(r.status, 200); bodies.push(await r.text()); }
    await wait(300); assert.equal(countMails(M), 2, 'only 2 mails per client per hour'); assert.equal(new Set(bodies).size, 1, 'the caller cannot tell the difference');
    const D = await start({ ORBIT_DB_FILE: path.join(tmp, 'd.db'), BASE_URL: base(3233), ORBIT_AUTH_LIMIT: '100000', ORBIT_MAIL_DAILY: '1' }, 3233); extra.push(D);
    const dc = client(base(3233)); for (let i = 0; i < 3; i++) await dc.api(jar(), 'POST', '/api/auth/register', { email: `day${i}@example.com`, password: PW });
    await wait(300); assert.equal(countMails(D), 1, 'whole-server daily mail cap'); }

  // ---- encryption: bound to its row, old format and old keys are re-sealed ----
  { await verified(H, { api }, 'aad1@example.com'); await verified(H, { api }, 'aad2@example.com');
    const j1 = jar(), j2 = jar(); await api(j1, 'POST', '/api/auth/login', { email: 'aad1@example.com', password: PW }); await api(j2, 'POST', '/api/auth/login', { email: 'aad2@example.com', password: PW });
    const u1 = (await (await req(j1, '/api/me')).json()).user.id, u2 = (await (await req(j2, '/api/me')).json()).user.id;
    assert.equal((await api(j1, 'PUT', '/api/data', { data: state(), baseRev: 0 })).status, 200); assert.equal((await api(j2, 'PUT', '/api/data', { data: state(), baseRev: 0 })).status, 200);
    const d = rawDb(dbH), get = (id) => d.prepare('SELECT data_enc, name_enc FROM users WHERE id=?').get(id);
    assert.ok(get(u1).data_enc.startsWith('v2.'), 'new values use the v2 format');
    d.prepare('UPDATE users SET data_enc=? WHERE id=?').run(get(u2).data_enc, u1); // someone with database write access swaps two users' data
    assert.equal((await (await api(j1, 'GET', '/api/data')).json()).data, null, 'a swapped ciphertext does not decrypt for the other user');
    d.prepare('UPDATE users SET data_enc=? WHERE id=?').run(get(u2).data_enc, u2); d.close();

    // v1 (no AAD) values written by the previous release are upgraded at start-up
    const enc = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(KEY, 'hex'), Buffer.alloc(0), 'orbit/enc', 32));
    const v1 = (t) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', enc, iv), ct = Buffer.concat([c.update(t, 'utf8'), c.final()]); return 'v1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url'); };
    await stop(H); const d2 = rawDb(dbH); d2.prepare('UPDATE users SET name_enc=? WHERE id=?').run(v1('Old Format Name'), u1); d2.close();
    H = await start({ ORBIT_DB_FILE: dbH, BASE_URL: base(3230), ORBIT_AUTH_LIMIT: '100000' }, 3230);
    const jj = jar(); await client(base(3230)).api(jj, 'POST', '/api/auth/login', { email: 'aad1@example.com', password: PW });
    assert.equal((await (await client(base(3230)).req(jj, '/api/me')).json()).user.name, 'Old Format Name', 'old values are still readable');
    const d3 = rawDb(dbH); assert.ok(d3.prepare('SELECT name_enc FROM users WHERE id=?').get(u1).name_enc.startsWith('v2.'), 're-sealed to v2'); d3.close();

    // key rotation: new key + old key in ORBIT_DATA_KEY_OLD; rows move to the new key, lookups still work
    const K2 = crypto.randomBytes(32).toString('hex'); await stop(H);
    H = await start({ ORBIT_DB_FILE: dbH, BASE_URL: base(3230), ORBIT_AUTH_LIMIT: '100000', ORBIT_DATA_KEY: K2, ORBIT_DATA_KEY_OLD: KEY }, 3230);
    const jr = jar(), rc = client(base(3230)); assert.equal((await rc.api(jr, 'POST', '/api/auth/login', { email: 'aad1@example.com', password: PW })).status, 200, 'login works after rotation (email index rebuilt)');
    assert.equal((await (await rc.req(jr, '/api/me')).json()).user.email, 'aad1@example.com');
    await stop(H); H = await start({ ORBIT_DB_FILE: dbH, BASE_URL: base(3230), ORBIT_AUTH_LIMIT: '100000', ORBIT_DATA_KEY: K2 }, 3230);
    const jn = jar(); assert.equal((await client(base(3230)).api(jn, 'POST', '/api/auth/login', { email: 'aad1@example.com', password: PW })).status, 200, 'the old key is no longer needed');
    await stop(H); H = await start({ ORBIT_DB_FILE: dbH, BASE_URL: base(3230), ORBIT_AUTH_LIMIT: '100000', ORBIT_DATA_KEY: KEY }, 3230); // wrong key now
    assert.equal((await client(base(3230)).api(jar(), 'POST', '/api/auth/login', { email: 'aad1@example.com', password: PW })).status, 401, 'a wrong key cannot find or read accounts');
    await stop(H); H = await start({ ORBIT_DB_FILE: dbH, BASE_URL: base(3230), ORBIT_AUTH_LIMIT: '100000', ORBIT_DATA_KEY: K2 }, 3230); }

  // ---- https redirect behind a proxy, and dev mode never listens publicly ----
  { const P = await start({ NODE_ENV: 'production', BASE_URL: 'https://orbit.test', TRUST_PROXY: '1', ORBIT_DB_FILE: path.join(tmp, 'p.db') }, 3234); extra.push(P);
    let r = await fetch(base(3234) + '/careers.html?x=1', { redirect: 'manual', headers: { 'x-forwarded-proto': 'http' } }); assert.equal(r.status, 308); assert.equal(r.headers.get('location'), 'https://orbit.test/careers.html?x=1');
    assert.match(r.headers.get('strict-transport-security') || '', /max-age=31536000/);
    r = await fetch(base(3234) + '/careers.html', { headers: { 'x-forwarded-proto': 'https' } }); assert.equal(r.status, 200);
    await assert.rejects(start({ NODE_ENV: 'development', BASE_URL: 'http://localhost:3235', HOST: '0.0.0.0', ORBIT_DB_FILE: path.join(tmp, 'x.db') }, 3235), /Refusing to start/); }

  // ---- headers, status, portfolio validation ----
  { const r = await fetch(base(3230) + '/index.html'); const csp = r.headers.get('content-security-policy');
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp), 'CSP has no unsafe-inline'); assert.match(csp, /object-src 'none'/);
    assert.deepEqual(Object.keys(await (await fetch(base(3230) + '/api/status')).json()).sort(), ['ai', 'email', 'mail', 'providers'], 'status exposes no model name or setup hints');
    for (const f of fs.readdirSync(path.join(import.meta.dirname, '..', 'public')).filter((x) => x.endsWith('.html'))) assert.ok(!/ style="/.test(fs.readFileSync(path.join(import.meta.dirname, '..', 'public', f), 'utf8')), f + ' has no inline style');
    await verified(H, { api }, 'port@example.com'); const j = jar(); await api(j, 'POST', '/api/auth/login', { email: 'port@example.com', password: PW });
    const projects = { 'data-scientist:python:3': { url: 'javascript:alert(1)', note: '<img src=x onerror=alert(1)>'.repeat(40) }, 'data-scientist:sql:3': { url: 'http://insecure.example.com/x', note: 'ok' },
      'data-scientist:ml:3': { url: 'https://user:pw@example.com/x', note: 'creds' }, 'data-scientist:stats:3': { url: 'https://example.com/ok?x=1', note: 'fine' }, '__proto__': { url: 'https://example.com' }, 'nope:python:3': { url: 'https://example.com' }, 'data-scientist:capstone:2': { url: 'https://github.com/a/b', note: 'cap' } };
    assert.equal((await api(j, 'PUT', '/api/data', { data: state({ projects }), baseRev: 0 })).status, 200);
    const got = (await (await api(j, 'GET', '/api/data')).json()).data.projects;
    assert.equal(got['data-scientist:python:3'].url, '', 'javascript: links are dropped'); assert.ok(got['data-scientist:python:3'].note.length <= 300 && !got['data-scientist:python:3'].note.includes('<'), 'notes are clipped and stripped of < >');
    assert.equal(got['data-scientist:sql:3'].url, '', 'http links are dropped'); assert.equal(got['data-scientist:ml:3'].url, '', 'links with credentials are dropped');
    assert.equal(got['data-scientist:stats:3'].url, 'https://example.com/ok?x=1'); assert.equal(got['data-scientist:capstone:2'].url, 'https://github.com/a/b');
    assert.ok(!('nope:python:3' in got) && !Object.keys(got).includes('__proto__'), 'unknown keys are dropped'); }

  console.log('hardening tests passed');
} finally { await Promise.all([H, ...extra].map((s) => stop(s))); fs.rmSync(tmp, { recursive: true, force: true }); }
