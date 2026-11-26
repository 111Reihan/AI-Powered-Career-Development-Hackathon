// Shared test helpers: spawn the server, cookie jar, API calls, fake SMTP server, mail parsing.
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const KEY = crypto.randomBytes(32).toString('hex');
export const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-'));

export function start(env, port) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', ['--no-warnings', 'server.js'], { cwd: root, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), ORBIT_DATA_KEY: KEY, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('running')) resolve({ p, out: () => out, err: () => err, port, base: `http://localhost:${port}` }); });
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (c) => { if (!out.includes('running')) reject(new Error('server exited ' + c + ': ' + err)); });
  });
}
export const stop = (s) => new Promise((r) => { if (s.p.exitCode !== null) return r(); s.p.once('exit', r); s.p.kill(); });

export function jar() {
  const c = {};
  return {
    set(res) { for (const s of res.headers.getSetCookie()) { const [kv] = s.split(';'); const i = kv.indexOf('='); const v = decodeURIComponent(kv.slice(i + 1)); if (v) c[kv.slice(0, i)] = v; else delete c[kv.slice(0, i)]; } },
    header() { return Object.entries(c).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '); },
    has: (k) => k in c, get: (k) => c[k], names: () => Object.keys(c),
  };
}
export function client(base) {
  const req = (j, url, o = {}) => fetch(base + url, { redirect: 'manual', ...o, headers: { cookie: j.header(), ...(o.headers || {}) } }).then((r) => { j.set(r); return r; });
  const api = (j, method, url, body, extra = {}) => req(j, url, { method, headers: { 'content-type': 'application/json', 'x-orbit': '1', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { req, api };
}

// ----- mail capture -----
export function consoleMails(s) { // dev-mode mails are printed to the server console
  return s.out().split('\n').filter((l) => l.startsWith('[mail:dev] ')).map((l) => l.slice(11)).join('\n');
}
export const tokenFrom = (text, kind, nth = -1) => { const all = [...text.matchAll(new RegExp(`#${kind}=([A-Za-z0-9_-]+)`, 'g'))]; return all.length ? all.at(nth)[1] : null; };
export const countMails = (s) => (s.out().match(/\[mail:dev\] Subject:/g) || []).length;
export function fakeSmtp(port) {
  const mails = [];
  const srv = net.createServer((sock) => {
    let buf = '', data = null, cur = { to: [] };
    const w = (t) => sock.write(t + '\r\n');
    w('220 fake ESMTP');
    sock.on('data', (d) => {
      buf += d.toString('binary');
      for (;;) {
        if (data !== null) { const i = buf.indexOf('\r\n.\r\n'); if (i < 0) return; cur.data = buf.slice(0, i); buf = buf.slice(i + 5); mails.push(cur); cur = { to: [] }; data = null; w('250 queued'); continue; }
        const i = buf.indexOf('\r\n'); if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') { sock.write('250-fake\r\n250 8BITMIME\r\n'); } else if (cmd === 'MAIL') w('250 ok'); else if (cmd === 'RCPT') { cur.to.push(line); w('250 ok'); } else if (cmd === 'DATA') { data = ''; w('354 go'); } else if (cmd === 'QUIT') { w('221 bye'); sock.end(); } else w('250 ok');
      }
    });
    sock.on('error', () => {});
  }).listen(port);
  const text = (m) => m.data.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return { srv, mails, text, last: () => (mails.length ? text(mails.at(-1)) : '') };
}

export const rawDb = (file) => new DatabaseSync(file, { readOnly: true });
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function legacyHash(pw) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex'); }
