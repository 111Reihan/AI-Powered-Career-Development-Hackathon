// Keys and field encryption. One master key (ORBIT_DATA_KEY) -> separate subkeys for encryption, lookup index and signing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_PROD } from './config.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

function masterKey() {
  const raw = process.env.ORBIT_DATA_KEY;
  if (raw) {
    const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (k.length !== 32) throw new Error('ORBIT_DATA_KEY must be 32 bytes: 64 hex characters or base64. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    return k;
  }
  if (IS_PROD) throw new Error('ORBIT_DATA_KEY is required in production (it encrypts emails, names and progress at rest).');
  // Development only: a key file next to the database. It protects nothing if the whole folder leaks.
  const f = path.join(DATA_DIR, '.key');
  try { return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex'); } catch { /* create below */ }
  const k = crypto.randomBytes(32);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(f, k.toString('hex'), { mode: 0o600 });
  return k;
}
const MK = masterKey();
const sub = (label) => Buffer.from(crypto.hkdfSync('sha256', MK, Buffer.alloc(0), 'orbit/' + label, 32));
const ENC = sub('enc'), IDX = sub('idx'), SIG = sub('sig');

export function seal(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
export function open(sealed) {
  if (!sealed) return null;
  try {
    const b = Buffer.from(String(sealed).slice(3), 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', ENC, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}
export const blind = (s) => crypto.createHmac('sha256', IDX).update(String(s).toLowerCase()).digest('hex'); // deterministic lookup key, not reversible
export const sign = (s) => crypto.createHmac('sha256', SIG).update(s).digest('base64url');
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
