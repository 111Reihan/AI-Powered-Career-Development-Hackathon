// Sign-in tests against a mock identity provider: OAuth for 4 providers, email/password, CSRF, sync, logout, delete.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startMockIdp } from './mock-idp.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-'));
const { srv: idp, seen } = startMockIdp(4030);
const start = (env, port) => new Promise((resolve) => {
  const p = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: port, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; if (out.includes('running')) resolve(p); });
});
const P = 3210, base = `http://localhost:${P}`;
const A = await start({ ORBIT_OAUTH_MOCK: 'http://localhost:4030', ORBIT_DATA_FILE: path.join(tmp, 'a.json'), BASE_URL: base, ORBIT_AUTH_LIMIT: '1000' }, P);
const B = await start({ ORBIT_DATA_FILE: path.join(tmp, 'b.json'), GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }, 3211);

const jar = () => { const c = {}; return { set(res) { for (const s of res.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); const v = decodeURIComponent(kv.slice(i + 1)); if (v) c[kv.slice(0, i)] = v; else delete c[kv.slice(0, i)]; } }, header: () => Object.entries(c).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '), has: (k) => k in c }; };
const req = (j, url, o = {}) => fetch(base + url, { redirect: 'manual', ...o, headers: { cookie: j.header(), ...(o.headers || {}) } }).then((r) => { j.set(r); return r; });
const api = (j, method, url, body, extra = {}) => req(j, url, { method, headers: { 'content-type': 'application/json', 'x-orbit': '1', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });

try {
  const st = await (await fetch(base + '/api/status')).json();
  assert.deepEqual(st.providers, { google: true, microsoft: true, facebook: true, apple: true });

  for (const k of ['google', 'microsoft', 'facebook']) {
    const j = jar();
    let r = await req(j, `/auth/${k}/start?next=/exam.html`);
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get('location'));
    assert.equal(loc.origin, 'http://localhost:4030'); assert.equal(loc.searchParams.get('response_type'), 'code');
    assert.equal(loc.searchParams.get('redirect_uri'), `${base}/auth/${k}/callback`);
    assert.ok(j.has('orbit_oauth'), 'nonce cookie set');
    r = await fetch(loc, { redirect: 'manual' }); // identity provider sends the browser back
    const cb = new URL(r.headers.get('location'));
    r = await req(j, cb.pathname + cb.search);
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/exam.html');
    assert.ok(j.has('orbit_sid'));
    const sc = (await req(j, '/auth/' + k + '/start')).headers; void sc;
    const me = await (await req(j, '/api/me')).json();
    assert.equal(me.user.provider, k); assert.ok(me.user.name);
    // same account again -> same user id
    const j2 = jar(); let r2 = await req(j2, `/auth/${k}/start`); const l2 = new URL(r2.headers.get('location'));
    r2 = await fetch(l2, { redirect: 'manual' }); const c2 = new URL(r2.headers.get('location')); await req(j2, c2.pathname + c2.search);
    assert.equal((await (await req(j2, '/api/me')).json()).user.id, me.user.id);
  }

  { // Apple: form_post callback, POST, token carries id_token
    const j = jar(); let r = await req(j, '/auth/apple/start');
    const loc = new URL(r.headers.get('location')); assert.equal(loc.searchParams.get('response_mode'), 'form_post');
    const state = loc.searchParams.get('state');
    r = await req(j, '/auth/apple/callback', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: 'code-apple', state, user: JSON.stringify({ name: { firstName: 'Ann', lastName: 'Apple' } }) }) });
    assert.equal(r.status, 302); assert.ok(j.has('orbit_sid'));
    const me = await (await req(j, '/api/me')).json();
    assert.equal(me.user.provider, 'apple'); assert.equal(me.user.name, 'Ann Apple');
    assert.ok(seen.tokenCalls.some((t) => t.k === 'apple' && t.form.client_secret));
  }

  { // callback protections
    const j = jar(); const r = await req(j, '/auth/google/callback?code=x&state=forged.sig');
    assert.match(r.headers.get('location'), /login\.html\?err=state/); assert.ok(!j.has('orbit_sid'));
    const j3 = jar(); let s = await req(j3, '/auth/google/start'); const state = new URL(s.headers.get('location')).searchParams.get('state');
    const other = jar(); // state valid, but cookie missing (login CSRF)
    const r2 = await req(other, '/auth/google/callback?code=x&state=' + encodeURIComponent(state));
    assert.match(r2.headers.get('location'), /err=state/); assert.ok(!other.has('orbit_sid'));
    const r3 = await req(jar(), '/auth/google/callback?error=access_denied'); assert.match(r3.headers.get('location'), /err=denied/);
    const r4 = await req(jar(), '/auth/google/start?next=//evil.com'); const st4 = new URL(r4.headers.get('location')).searchParams.get('state');
    assert.ok(!Buffer.from(st4.split('.')[0], 'base64url').toString().includes('evil'), 'open redirect target is dropped');
  }

  { // email + password
    const j = jar();
    assert.equal((await api(j, 'POST', '/api/auth/register', { email: 'a@b.co', password: 'short' })).status, 400);
    assert.equal((await api(j, 'POST', '/api/auth/register', { email: 'nope', password: 'longenough1' })).status, 400);
    let r = await api(j, 'POST', '/api/auth/register', { email: 'Stu@Example.com', password: 'longenough1', name: 'Stu' }); assert.equal(r.status, 200);
    assert.equal((await (await req(j, '/api/me')).json()).user.email, 'stu@example.com');
    assert.equal((await api(jar(), 'POST', '/api/auth/register', { email: 'stu@example.com', password: 'longenough1' })).status, 409);
    const raw = fs.readFileSync(path.join(tmp, 'a.json'), 'utf8'); assert.ok(!raw.includes('longenough1'), 'password not stored in clear'); assert.match(raw, /"pw":"[0-9a-f]{32}:[0-9a-f]{128}"/);
    assert.equal((await api(jar(), 'POST', '/api/auth/login', { email: 'stu@example.com', password: 'wrongpass1' })).status, 401);
    assert.equal((await api(jar(), 'POST', '/api/auth/login', { email: 'nobody@example.com', password: 'wrongpass1' })).status, 401);
    const j2 = jar(); assert.equal((await api(j2, 'POST', '/api/auth/login', { email: 'stu@example.com', password: 'longenough1' })).status, 200);

    // CSRF
    assert.equal((await req(j2, '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403, 'needs X-Orbit');
    assert.equal((await api(j2, 'POST', '/api/auth/logout', {}, { origin: 'http://evil.example' })).status, 403, 'cross-origin blocked');
    assert.equal((await api(jar(), 'GET', '/api/data')).status, 401);

    // sync: last write wins
    const data = (n) => ({ v: 2, onboarded: true, career: 'data-scientist', profile: { name: n }, skills: {}, done: {}, activity: {}, notes: [], exams: [] });
    r = await api(j, 'PUT', '/api/data', { data: data('first'), updatedAt: 1000 }); assert.equal(r.status, 200);
    await api(j2, 'PUT', '/api/data', { data: data('older'), updatedAt: 500 });
    assert.equal((await (await api(j2, 'GET', '/api/data')).json()).data.profile.name, 'first', 'older write ignored');
    await api(j2, 'PUT', '/api/data', { data: data('newer'), updatedAt: 2000 });
    assert.equal((await (await api(j, 'GET', '/api/data')).json()).data.profile.name, 'newer', 'second device sees it');
    assert.equal((await api(j, 'PUT', '/api/data', { data: { v: 1 }, updatedAt: 3000 })).status, 400);
    assert.equal((await api(j, 'PUT', '/api/data', { data: { v: 2, big: 'x'.repeat(250_000) }, updatedAt: 3000 })).status, 413);

    // logout ends the session on the server
    const old = j2.header(); assert.equal((await api(j2, 'POST', '/api/auth/logout', {})).status, 200);
    assert.equal((await (await fetch(base + '/api/me', { headers: { cookie: old } })).json()).user, null, 'old cookie is dead');

    // delete account
    assert.equal((await api(j, 'DELETE', '/api/me')).status, 200);
    assert.equal((await api(jar(), 'POST', '/api/auth/login', { email: 'stu@example.com', password: 'longenough1' })).status, 401);
  }

  { // provider without keys
    const r = await fetch('http://localhost:3211/auth/google/start', { redirect: 'manual' });
    assert.match(r.headers.get('location'), /login\.html\?err=unconfigured/);
    const s = await (await fetch('http://localhost:3211/api/status')).json(); assert.equal(s.providers.google, false);
  }
  { // brute-force limit on the default server
    let last = 0; for (let i = 0; i < 40; i++) last = (await fetch('http://localhost:3211/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-orbit': '1' }, body: JSON.stringify({ email: 'x@y.co', password: 'wrongpass1' }) })).status;
    assert.equal(last, 429);
  }
  const raw = fs.readFileSync(path.join(tmp, 'a.json'), 'utf8'); assert.ok(!/at-google|code-google/.test(raw), 'provider tokens are not stored');
  console.log('auth tests passed');
} finally { A.kill(); B.kill(); idp.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
