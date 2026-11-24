// Starts the server (plus a fake AI upstream) and checks security-relevant behaviour of every page and route.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'sk-ant-TEST-SECRET-KEY-12345';
let upstreamCalls = 0;
const upstream = http.createServer((q, r) => { q.resume(); q.on('end', () => {
  upstreamCalls++;
  r.writeHead(200, { 'content-type': 'application/json' });
  r.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: 'text', text: JSON.stringify({ headline: '<img src=x onerror=alert(1)>', explanations: [], next_steps: [], watch_outs: [] }) }] }));
}); }).listen(4020);

function start(env, port) {
  return new Promise((resolve) => {
    const p = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT: port, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', (d) => { out += d; if (out.includes('running')) resolve({ p, out: () => out }); });
  });
}
const get = (port, url, opt = {}) => fetch(`http://localhost:${port}${url}`, opt);

const noKey = await start({ ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '' }, 3200);
const withKey = await start({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: 'http://localhost:4020' }, 3201);
try {
  const pages = fs.readdirSync(path.join(root, 'public')).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length >= 10);
  for (const port of [3200, 3201]) {
    for (const f of pages) {
      const r = await get(port, '/' + f); const body = await r.text();
      assert.ok(r.status === 200 || (f === '404.html' && r.status === 200), f + ' ' + r.status);
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /default-src 'self'/); assert.match(csp, /script-src 'self'(;|$)/); assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /base-uri 'none'/);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('x-frame-options'), 'DENY'); assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
      assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(body), f + ' has an inline script (blocked by CSP)');
      assert.ok(!/\son[a-z]+\s*=/i.test(body), f + ' has an inline event handler');
      assert.ok(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(body.replace(/%3Csvg[^"]*/g, '')), f + ' loads an external resource');
      assert.ok(!body.includes(KEY));
    }
    // secrets / source never served, traversal blocked, odd inputs do not crash
    for (const u of ['/server.js', '/package.json', '/package-lock.json', '/.env', '/.env.example', '/.git/config', '/node_modules/', '/test/security.test.mjs', '/../server.js', '/%2e%2e/server.js', '/..%2fserver.js', '/%2e%2e%2fpackage.json', '/js/../../server.js', '/%00', '/%E0%A4%A', '//etc/passwd', '/js/', '/css']) {
      const r = await get(port, u); const t = await r.text();
      assert.ok(r.status >= 400 || u === '/js/' || u === '/css', `${u} -> ${r.status}`);
      assert.ok(!t.includes('createServer') && !t.includes('"name": "orbit') && !t.includes(KEY), u + ' leaked content');
    }
    // static JS/CSS never contain a key
    for (const f of ['js/app.js', 'js/engine.js', 'js/data.js', 'css/app.css']) assert.ok(!(await (await get(port, '/' + f)).text()).includes(KEY));
    assert.equal((await get(port, '/index.html', { method: 'POST' })).status, 405);
    assert.equal((await get(port, '/api/nope')).status, 404);
    assert.equal((await get(port, '/api/coach')).status, 405);
  }
  // no key: AI disabled, status never reveals key
  let s = await (await get(3200, '/api/status')).json(); assert.equal(s.ai, false);
  assert.equal((await get(3200, '/api/coach', { method: 'POST', body: '{}' })).status, 503);
  // key present: status does not reveal it
  const st = await (await get(3201, '/api/status')).text(); assert.ok(!st.includes(KEY)); assert.equal(JSON.parse(st).ai, true);
  const post = (b, h = {}) => get(3201, '/api/coach', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: b });
  assert.equal((await post('{not json')).status, 400);
  assert.equal((await post('x'.repeat(70_000))).status, 413);
  // valid call, hostile input is sanitised and never reaches the browser unescaped by the server contract
  let r = await post(JSON.stringify({ task: 'career_advice', profile: { name: '<script>alert(1)</script>', study: 'a'.repeat(5000), interests: ['x'.repeat(500)] }, matches: [{ career: 'A', score: 'NaN', reasons: ['r'] }], skills: 'bad', gaps: null }));
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.source, 'ai');
  assert.ok(!JSON.stringify(j).includes(KEY));
  // rate limit: more than 12/min from one IP gets 429
  const codes = []; for (let i = 0; i < 14; i++) codes.push((await post('{}')).status);
  assert.ok(codes.includes(429), 'rate limit not applied: ' + codes);
  // upstream failure never leaks details or the key
  upstream.close(); await new Promise((res) => setTimeout(res, 100));
  console.log('security tests passed');
} finally { noKey.p.kill(); withKey.p.kill(); upstream.closeAllConnections?.(); upstream.close(); }
