// Starts a throw-away server (temp database, dev mail printed to a log) and runs the browser test against it.
// Needs: pip install playwright && playwright install chromium. Optional: npm i --no-save axe-core (adds accessibility scans).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-e2e-'));
const log = path.join(tmp, 'server.log'), port = 3400 + Math.floor(Math.random() * 400);
const out = fs.openSync(log, 'a');
const srv = spawn('node', ['--no-warnings', 'server.js'], { cwd: root, stdio: ['ignore', out, out], env: { ...process.env, NODE_ENV: 'test', PORT: String(port), ORBIT_DB_FILE: path.join(tmp, 'e2e.db'), ORBIT_DATA_KEY: 'b'.repeat(64), ORBIT_AUTH_LIMIT: '10000', ANTHROPIC_API_KEY: '' } });
for (let i = 0; i < 50 && !fs.readFileSync(log, 'utf8').includes('running'); i++) await new Promise((r) => setTimeout(r, 100));
const axe = path.join(root, 'node_modules', 'axe-core', 'axe.min.js');
const r = spawnSync('python3', [path.join(root, 'tools', 'e2e.py'), `http://localhost:${port}`], { stdio: 'inherit', env: { ...process.env, ORBIT_LOG: log, ...(fs.existsSync(axe) ? { AXE_PATH: axe } : {}) } });
srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
process.exit(r.status ?? 1);
