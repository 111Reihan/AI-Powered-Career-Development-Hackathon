// SQLite store (node:sqlite, Node 22.13+). Single process. Emails, names and progress are encrypted at rest.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seal, open, blind, sha, isStale } from './crypto.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.ORBIT_DB_FILE || path.join(HERE, '..', 'data', 'orbit.db');
fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(FILE);
try { fs.chmodSync(FILE, 0o600); } catch { /* best effort */ }
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, email_idx TEXT, email_enc TEXT, name_enc TEXT, pw TEXT, verified INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL, data_enc TEXT, rev INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS users_email ON users(email_idx);
CREATE UNIQUE INDEX IF NOT EXISTS users_pw_email ON users(email_idx) WHERE pw IS NOT NULL;
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, last_used INTEGER NOT NULL, exp INTEGER NOT NULL, ua TEXT);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS locks(key TEXT PRIMARY KEY, n INTEGER NOT NULL, first INTEGER NOT NULL, until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS usage(day TEXT NOT NULL, scope TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY(day, scope));
`);
const q = (sql) => db.prepare(sql);
const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* ignore */ } throw e; } };
const normEmail = (e) => String(e || '').trim().toLowerCase();

const A = (id, col) => id + ':' + col; // AAD: ties each ciphertext to its row and column
const pub = (r) => r && ({ id: r.id, email: open(r.email_enc, A(r.id, 'email')) || '', name: open(r.name_enc, A(r.id, 'name')) || '', hasPassword: Boolean(r.pw), verified: Boolean(r.verified), created: r.created, rev: r.rev, updated: r.updated, _pw: r.pw });

// ----- users -----
export function addUser({ email, name, pw = null, verified = false }) {
  const id = crypto.randomUUID(), e = normEmail(email);
  q('INSERT INTO users(id,email_idx,email_enc,name_enc,pw,verified,created) VALUES(?,?,?,?,?,?,?)')
    .run(id, e ? blind(e) : null, e ? seal(e, A(id, 'email')) : null, seal(name || '', A(id, 'name')), pw, verified ? 1 : 0, Date.now());
  return getUser(id);
}
export const getUser = (id) => pub(q('SELECT * FROM users WHERE id=?').get(id));
export const findByEmail = (email, passwordOnly = false) => {
  const e = normEmail(email); if (!e) return null;
  return pub(q(`SELECT * FROM users WHERE email_idx=? ${passwordOnly ? 'AND pw IS NOT NULL' : ''} ORDER BY verified DESC, created ASC LIMIT 1`).get(blind(e)));
};
export const findVerifiedByEmail = (email) => { const e = normEmail(email); return e ? pub(q('SELECT * FROM users WHERE email_idx=? AND verified=1 ORDER BY created ASC LIMIT 1').get(blind(e))) : null; };
export function updateUser(id, patch) {
  const sets = [], vals = [];
  if ('name' in patch) { sets.push('name_enc=?'); vals.push(seal(patch.name || '', A(id, 'name'))); }
  if ('pw' in patch) { sets.push('pw=?'); vals.push(patch.pw); }
  if ('verified' in patch) { sets.push('verified=?'); vals.push(patch.verified ? 1 : 0); }
  if ('email' in patch) { const e = normEmail(patch.email); sets.push('email_idx=?', 'email_enc=?'); vals.push(e ? blind(e) : null, e ? seal(e, A(id, 'email')) : null); }
  if (sets.length) q(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals, id);
  return getUser(id);
}
export const removeUser = (id) => { q('DELETE FROM users WHERE id=?').run(id); }; // cascades to sessions and tokens

// ----- progress data (optimistic concurrency by revision) -----
export function getData(uid) {
  const r = q('SELECT data_enc, rev, updated FROM users WHERE id=?').get(uid); if (!r) return null;
  let data = null; try { data = r.data_enc ? JSON.parse(open(r.data_enc, A(uid, 'data'))) : null; } catch { data = null; }
  return { data, rev: r.rev, updated: r.updated };
}
// Returns { ok:true, rev } when baseRev matches the stored revision, otherwise { ok:false, rev }.
export function putData(uid, data, baseRev) {
  return tx(() => {
    const r = q('SELECT rev FROM users WHERE id=?').get(uid); if (!r) return { ok: false, rev: 0 };
    if (r.rev !== baseRev) return { ok: false, rev: r.rev };
    q('UPDATE users SET data_enc=?, rev=rev+1, updated=? WHERE id=?').run(seal(JSON.stringify(data), A(uid, 'data')), Date.now(), uid);
    return { ok: true, rev: r.rev + 1 };
  });
}

// ----- sessions -----
export const SESSION_MS = 30 * 24 * 3600 * 1000, SHORT_MS = 24 * 3600 * 1000;
export function newSession(uid, { ua = '', remember = true } = {}) {
  const token = crypto.randomBytes(32).toString('base64url'), now = Date.now();
  q('INSERT INTO sessions(id,user_id,created,last_used,exp,ua) VALUES(?,?,?,?,?,?)').run(sha(token), uid, now, now, now + (remember ? SESSION_MS : SHORT_MS), String(ua).slice(0, 160));
  // keep only the 10 most recently used sessions per account, so logins cannot grow the table without limit
  q('DELETE FROM sessions WHERE user_id=? AND id NOT IN (SELECT id FROM sessions WHERE user_id=? ORDER BY last_used DESC, created DESC LIMIT 10)').run(uid, uid);
  return token;
}
export function sessionUser(token) {
  if (!token) return null;
  const id = sha(token), s = q('SELECT * FROM sessions WHERE id=?').get(id);
  if (!s || s.exp < Date.now()) return null;
  if (Date.now() - s.last_used > 5 * 60_000) q('UPDATE sessions SET last_used=? WHERE id=?').run(Date.now(), id);
  return pub(q('SELECT * FROM users WHERE id=?').get(s.user_id));
}
export const sessionCreated = (token) => { const r = token ? q('SELECT created FROM sessions WHERE id=?').get(sha(token)) : null; return r ? r.created : 0; };
export const endSession = (token) => { if (token) q('DELETE FROM sessions WHERE id=?').run(sha(token)); };
export function listSessions(uid, currentToken) {
  const cur = currentToken ? sha(currentToken) : '';
  return q('SELECT id,created,last_used,exp,ua FROM sessions WHERE user_id=? AND exp>? ORDER BY last_used DESC').all(uid, Date.now())
    .map((s) => ({ id: s.id.slice(0, 16), created: s.created, lastUsed: s.last_used, ua: s.ua, current: s.id === cur }));
}
export const revokeSession = (uid, shortId, currentToken) => {
  const cur = currentToken ? sha(currentToken) : '';
  return q('DELETE FROM sessions WHERE user_id=? AND substr(id,1,16)=? AND id<>?').run(uid, String(shortId).slice(0, 16), cur).changes;
};
export const endOtherSessions = (uid, currentToken) => q('DELETE FROM sessions WHERE user_id=? AND id<>?').run(uid, currentToken ? sha(currentToken) : '').changes;
export const endAllSessions = (uid) => q('DELETE FROM sessions WHERE user_id=?').run(uid).changes;

// ----- one-time tokens (email verify, password reset) -----
export function newToken(uid, kind, ttlMs) {
  const raw = crypto.randomBytes(32).toString('base64url');
  q('DELETE FROM tokens WHERE user_id=? AND kind=?').run(uid, kind); // only the latest link works
  q('INSERT INTO tokens(hash,user_id,kind,exp) VALUES(?,?,?,?)').run(sha(raw), uid, kind, Date.now() + ttlMs);
  return raw;
}
export function peekToken(raw, kind) { // look without using it up
  const t = q('SELECT user_id, exp FROM tokens WHERE hash=? AND kind=?').get(sha(String(raw || '')), kind);
  return t && t.exp >= Date.now() ? t.user_id : null;
}
export function consumeToken(raw, kind) {
  return tx(() => {
    const h = sha(String(raw || '')), t = q('SELECT * FROM tokens WHERE hash=? AND kind=?').get(h, kind);
    if (!t) return null;
    q('DELETE FROM tokens WHERE hash=?').run(h);
    return t.exp < Date.now() ? null : t.user_id;
  });
}

// ----- failed-login lockout (persisted, so a restart does not reset it) -----
export function lockState(key) {
  const r = q('SELECT until FROM locks WHERE key=?').get(key);
  return r && r.until > Date.now() ? { locked: true, retryAfter: Math.ceil((r.until - Date.now()) / 1000) } : { locked: false };
}
export function noteFail(key, { max = 8, windowMs = 15 * 60_000, lockMs = 15 * 60_000 } = {}) {
  tx(() => {
    const now = Date.now(), r = q('SELECT * FROM locks WHERE key=?').get(key);
    if (!r || now - r.first > windowMs) { q('INSERT OR REPLACE INTO locks(key,n,first,until) VALUES(?,?,?,0)').run(key, 1, now); return; }
    const n = r.n + 1;
    q('UPDATE locks SET n=?, until=? WHERE key=?').run(n, n >= max ? now + lockMs : 0, key);
  });
}
export const clearFails = (key) => { q('DELETE FROM locks WHERE key=? OR key LIKE ?').run(key, key + ':%'); }; // the key and its per-client variants

// ----- AI usage budget (per UTC day) -----
const day = () => new Date().toISOString().slice(0, 10);
export function spend(scope, limit) { // true when allowed (and counted)
  if (!(limit > 0)) return false;
  return q('INSERT INTO usage(day,scope,n) VALUES(?,?,1) ON CONFLICT(day,scope) DO UPDATE SET n=n+1 WHERE n<?').run(day(), scope, limit).changes > 0;
}
export const refund = (scope) => { q('UPDATE usage SET n=n-1 WHERE day=? AND scope=? AND n>0').run(day(), scope); };

// ----- re-seal at start-up: old format (v1) or old key -> current key with row-bound AAD; also rebuilds the email lookup index -----
export function reseal() {
  let n = 0;
  tx(() => {
    for (const r of q('SELECT id,email_idx,email_enc,name_enc,data_enc FROM users').all()) {
      const stale = isStale(r.email_enc, A(r.id, 'email')) || isStale(r.name_enc, A(r.id, 'name')) || isStale(r.data_enc, A(r.id, 'data'));
      const email = r.email_enc ? open(r.email_enc, A(r.id, 'email')) : null;
      if (!stale && (!email || r.email_idx === blind(email))) continue;
      const data = r.data_enc ? open(r.data_enc, A(r.id, 'data')) : null, name = r.name_enc ? open(r.name_enc, A(r.id, 'name')) : '';
      q('UPDATE users SET email_idx=?, email_enc=?, name_enc=?, data_enc=? WHERE id=?')
        .run(email ? blind(email) : null, email ? seal(email, A(r.id, 'email')) : null, seal(name || '', A(r.id, 'name')), data == null ? null : seal(data, A(r.id, 'data')), r.id);
      n++;
    }
  });
  return n;
}
reseal();

// ----- housekeeping -----
export function sweep() {
  const now = Date.now();
  q('DELETE FROM sessions WHERE exp<?').run(now);
  q('DELETE FROM tokens WHERE exp<?').run(now);
  q('DELETE FROM locks WHERE until<? AND first<?').run(now, now - 15 * 60_000);
  q('DELETE FROM usage WHERE day<?').run(new Date(now - 7 * 864e5).toISOString().slice(0, 10));
  // accounts that never verified their email within 7 days
  q('DELETE FROM users WHERE verified=0 AND pw IS NOT NULL AND created<?').run(now - 7 * 864e5);
}
sweep();
setInterval(sweep, 10 * 60_000).unref();

// ----- one-time import from the old JSON store -----
export function importLegacy(file) {
  if (!file || !fs.existsSync(file) || q('SELECT 1 FROM users LIMIT 1').get()) return 0;
  let old; try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 0; }
  let n = 0;
  tx(() => {
    for (const u of Object.values(old.users || {})) {
      const isPw = u.provider === 'password';
      const row = addUser({ email: u.email, name: u.name, pw: isPw ? u.pw : null, verified: true });
      if (u.data) { q('UPDATE users SET data_enc=?, rev=1, updated=? WHERE id=?').run(seal(JSON.stringify(u.data), A(row.id, 'data')), Date.now(), row.id); }
      n++;
    }
  });
  fs.rmSync(file, { force: true }); // the plaintext copy must not stay on disk once it is inside the encrypted database
  return n;
}
export const close = () => db.close();
