// Keys and field encryption. One master key (ORBIT_DATA_KEY) -> separate subkeys for encryption, lookup index and signing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_PROD } from './config.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

const parseKey = (raw) => {
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('ORBIT_DATA_KEY must be 32 bytes: 64 hex characters or base64. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  return k;
};
function masterKey() {
  const raw = process.env.ORBIT_DATA_KEY;
  if (raw) return parseKey(raw);
  if (IS_PROD) throw new Error('ORBIT_DATA_KEY is required in production (it encrypts emails, names and progress at rest).');
  // Development only: a key file next to the database. It protects nothing if the whole folder leaks.
  const f = path.join(DATA_DIR, '.key');
  try { return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex'); } catch { /* create below */ }
  const k = crypto.randomBytes(32);
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(f, k.toString('hex'), { mode: 0o600 });
  return k;
}
const MK = masterKey();
const derive = (key, label) => Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(0), 'orbit/' + label, 32));
// Key ring for rotation: ORBIT_DATA_KEY encrypts; ORBIT_DATA_KEY_OLD (comma separated) can still decrypt until rows are re-sealed at start-up.
const RING = [MK, ...String(process.env.ORBIT_DATA_KEY_OLD || '').split(',').map((x) => x.trim()).filter(Boolean).map(parseKey)].map((k) => ({ ENC: derive(k, 'enc'), IDX: derive(k, 'idx') }));
const SIG = derive(MK, 'sig');

// v2 binds every ciphertext to its row and column (AAD), so a database writer cannot swap one user's encrypted field into another's.
export function seal(plain, aad = '') {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', RING[0].ENC, iv);
  c.setAAD(Buffer.from(String(aad)));
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v2.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
function tryOpen(sealed, aad, ring) {
  const v2 = String(sealed).startsWith('v2.');
  const b = Buffer.from(String(sealed).slice(3), 'base64url');
  for (let i = 0; i < ring.length; i++) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', ring[i].ENC, b.subarray(0, 12));
      if (v2) d.setAAD(Buffer.from(String(aad)));
      d.setAuthTag(b.subarray(12, 28));
      return { plain: Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'), stale: !v2 || i > 0 };
    } catch { /* try the next key */ }
  }
  return null;
}
export function open(sealed, aad = '') {
  if (!sealed) return null;
  const r = tryOpen(sealed, aad, RING); return r ? r.plain : null;
}
// true when a value is in the old format or was sealed with an old key, i.e. it should be re-sealed
export const isStale = (sealed, aad = '') => { if (!sealed) return false; const r = tryOpen(sealed, aad, RING); return Boolean(r && r.stale); };
export const blind = (s) => crypto.createHmac('sha256', RING[0].IDX).update(String(s).toLowerCase()).digest('hex'); // deterministic lookup key, not reversible
export const sign = (s) => crypto.createHmac('sha256', SIG).update(s).digest('base64url');
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
