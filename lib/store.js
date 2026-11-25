// Tiny JSON-file store for accounts, sessions and synced progress.
// Fine for a demo or a single small server. For real production use a database.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const FILE = process.env.ORBIT_DATA_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'orbit.json');
let db = { secret: '', users: {}, sessions: {} };

try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch { /* first run */ }
if (!db.secret) { db.secret = crypto.randomBytes(32).toString('hex'); persist(); }
for (const [k, s] of Object.entries(db.sessions)) if (s.exp < Date.now()) delete db.sessions[k];

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error('store write failed:', e.message); }
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const secret = () => db.secret;
export const findUser = (fn) => Object.values(db.users).find(fn) || null;
export const getUser = (id) => db.users[id] || null;
export function addUser(u) {
  const id = crypto.randomUUID();
  db.users[id] = { id, createdAt: Date.now(), data: null, updatedAt: 0, ...u };
  persist(); return db.users[id];
}
export function updateUser(id, patch) { if (db.users[id]) { Object.assign(db.users[id], patch); persist(); } return db.users[id] || null; }
export function removeUser(id) {
  delete db.users[id];
  for (const [k, s] of Object.entries(db.sessions)) if (s.uid === id) delete db.sessions[k];
  persist();
}
export const SESSION_MS = 30 * 24 * 3600 * 1000;
export function newSession(uid) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha(token)] = { uid, exp: Date.now() + SESSION_MS };
  persist(); return token;
}
export function sessionUser(token) {
  if (!token) return null;
  const s = db.sessions[sha(token)];
  if (!s || s.exp < Date.now()) return null;
  return db.users[s.uid] || null;
}
export function endSession(token) { if (token && db.sessions[sha(token)]) { delete db.sessions[sha(token)]; persist(); } }
