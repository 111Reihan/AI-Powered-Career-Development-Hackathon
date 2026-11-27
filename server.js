// Orbit server: static files + a small, key-safe AI proxy.
// Zero runtime dependencies for demo mode. AI mode needs `@anthropic-ai/sdk`
// and ANTHROPIC_API_KEY (read from the environment only, never sent to the browser).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import * as auth from './lib/auth.js';
import * as db from './lib/db.js';
import { limited, csrfOk } from './lib/guard.js';
import { SECURE, IS_PROD, IS_TEST, LOCAL, HOST, isLoopback, BASE, TRUST_PROXY, AI_DAILY_TOTAL, AI_DAILY_USER, AI_PER_MIN_USER } from './lib/config.js';
import { mailMode } from './lib/mail.js';
import { MODEL, hasKey, aiReady, coach, genExam } from './lib/ai.js';
if (IS_PROD && !SECURE && !LOCAL) { console.error('Refusing to start: BASE_URL must be https:// in production, otherwise cookies cannot be marked Secure.'); process.exit(1); }
if (!IS_PROD && !IS_TEST && !isLoopback(HOST)) { console.error(`Refusing to start: BASE_URL is localhost (dev mode) but HOST=${HOST} is reachable from the network. Set BASE_URL to your public https URL, or NODE_ENV=production.`); process.exit(1); }
const legacy = db.importLegacy(process.env.ORBIT_DATA_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'orbit.json'));
if (legacy) console.log(`Imported ${legacy} account(s) from the old JSON store into SQLite.`);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 60 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  ...(SECURE ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0, over = false; const chunks = [];
    req.on('data', (c) => {
      if (over) return;
      size += c.length;
      if (size > max) { over = true; reject(Object.assign(new Error('Request too large'), { status: 413 })); } else chunks.push(c);
    });
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

const cache = new Map(); // file -> { mtime, raw, gz, type, etag }
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel.includes('\0')) return send(res, 400, 'Bad request');
  if (rel.endsWith('/')) rel += 'index.html';
  if (!path.extname(rel)) rel += '.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  let st;
  try { st = fs.statSync(file); if (!st.isFile()) throw 0; } catch {
    const nf = path.join(ROOT, '404.html');
    return send(res, 404, fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found', { 'Content-Type': MIME['.html'] });
  }
  let e = cache.get(file);
  if (!e || e.mtime !== st.mtimeMs) {
    const raw = fs.readFileSync(file);
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const compressible = /^(text|application\/json|image\/svg)/.test(type);
    e = { mtime: st.mtimeMs, raw, type, gz: compressible ? zlib.gzipSync(raw, { level: 9 }) : null, etag: `"${st.size}-${Math.floor(st.mtimeMs)}"` };
    cache.set(file, e);
  }
  // HTML always revalidates; css/js may be reused for 5 minutes (ETag revalidation after that).
  const isAsset = /\.(css|js)$/.test(file);
  const headers = { 'Content-Type': e.type, ETag: e.etag, Vary: 'Accept-Encoding', 'Cache-Control': isAsset ? 'public, max-age=300' : 'no-cache' };
  if (req.headers['if-none-match'] === e.etag) return send(res, 304, '', headers);
  if (e.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    return send(res, 200, req.method === 'HEAD' ? '' : e.gz, { ...headers, 'Content-Encoding': 'gzip' });
  }
  send(res, 200, req.method === 'HEAD' ? '' : e.raw, headers);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    // Behind a TLS-terminating proxy: send plain-http requests to https (the proxy must set X-Forwarded-Proto).
    if (SECURE && TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',').pop().trim() === 'http') {
      res.writeHead(308, { ...SECURITY, Location: BASE + req.url }); return res.end();
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/status' && req.method === 'GET') { // public and minimal: no model name, no setup hints
      return json(res, 200, { ai: await aiReady(), providers: auth.configured(), email: auth.emailEnabled(), mail: mailMode() });
    }
    if (await auth.handle(req, res, url, { json, readBody })) return;
    if (url.pathname === '/api/exam' || url.pathname === '/api/coach') {
      const isExam = url.pathname === '/api/exam';
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });
      if (!csrfOk(req)) return json(res, 403, { error: 'Forbidden' });
      if (!(await aiReady())) return json(res, 503, { error: 'AI is not configured on this server.' + (isExam ? '' : ' Using demo mode.') });
      const user = auth.currentUser(req); // AI costs money: signed-in users only, with per-user and whole-server budgets
      if (!user) return json(res, 401, { error: 'Sign in to use AI features. Demo mode stays free for everyone.', code: 'signin' });
      if (limited('ai:' + user.id, AI_PER_MIN_USER)) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });
      if (!db.spend('ai:user:' + user.id, AI_DAILY_USER)) return json(res, 429, { error: 'Daily AI limit reached for your account. Try again tomorrow.' });
      if (!db.spend('ai:all', AI_DAILY_TOTAL)) { db.refund('ai:user:' + user.id); return json(res, 429, { error: 'The server has reached its daily AI limit. Try again tomorrow.' }); }
      const giveBack = () => { db.refund('ai:user:' + user.id); db.refund('ai:all'); };
      let body;
      try { body = JSON.parse(await readBody(req) || '{}'); } catch (e) {
        giveBack();
        if (e.status === 413) { res.setHeader('Connection', 'close'); res.on('finish', () => req.destroy()); }
        return json(res, e.status || 400, { error: e.status === 413 ? 'Request too large' : 'Invalid JSON' });
      }
      try {
        return isExam ? json(res, 200, { source: 'ai', model: MODEL, questions: await genExam(body) })
          : json(res, 200, { source: 'ai', model: MODEL, result: await coach(body) });
      } catch (e) {
        giveBack(); console.error('AI error:', e.status || '', e.message);
        if (e.status === 400 && isExam) return json(res, 400, { error: 'Pick at least one valid skill.' });
        return json(res, e.status === 422 ? 422 : 502, { error: isExam ? 'The AI could not write questions right now. The built-in question bank still works.' : 'The AI service could not complete this request. Demo mode will be used instead.' });
      }
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (url.pathname.startsWith('/auth/')) return send(res, 404, 'Not found');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
});

server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && e.message));
server.listen(PORT, HOST, () => {
  console.log(`Orbit running at http://localhost:${PORT}`);
  console.log(hasKey() ? `AI mode: key found, model ${MODEL}` : 'Demo mode: set ANTHROPIC_API_KEY to enable AI coaching');
});
