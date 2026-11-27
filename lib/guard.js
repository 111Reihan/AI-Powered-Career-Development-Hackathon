// Request guards: client IP, rate limiting, CSRF check.
import net from 'node:net';
import { TRUST_PROXY, BASE, SECURE } from './config.js';

function expandV6(ip) {
  const [h, t = ''] = ip.split('::'), a = h ? h.split(':') : [], b = t ? t.split(':') : [];
  const fill = ip.includes('::') ? Array(Math.max(0, 8 - a.length - b.length)).fill('0') : [];
  return [...a, ...fill, ...b];
}
// Clients are keyed by IPv4 address or IPv6 /64, so rotating the low bits of an IPv6 address does not dodge limits.
export function clientIp(req) {
  let ip = req.socket.remoteAddress || 'x';
  if (TRUST_PROXY) { // only behind exactly one trusted reverse proxy that appends to X-Forwarded-For
    const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xf.length) ip = xf[xf.length - 1];
  }
  ip = ip.replace(/^::ffff:/i, '');
  if (net.isIPv6(ip)) return expandV6(ip.toLowerCase()).slice(0, 4).join(':');
  return ip;
}

// Sliding-window limiter with bounded memory. When full it drops expired entries first, then entries that are not
// currently blocked (least recently used first). A key that is blocked stays blocked unless the table is badly overfull.
const hits = new Map(), MAXKEYS = 20000; // key -> { arr: timestamps, win, blocked }
export function limited(key, max = 12, windowMs = 60_000) {
  const now = Date.now(), e = hits.get(key); hits.delete(key); // re-inserting below moves the key to the "recent" end
  const arr = e ? e.arr.filter((t) => now - t < windowMs) : [];
  const blocked = arr.length >= max;
  if (!blocked) arr.push(now);
  hits.set(key, { arr, win: windowMs, blocked });
  if (hits.size > MAXKEYS) {
    const goal = MAXKEYS * 0.9;
    for (const [k, v] of hits) { if (hits.size <= goal) break; if (!v.arr.length || now - v.arr[v.arr.length - 1] >= v.win) hits.delete(k); }
    for (const [k, v] of hits) { if (hits.size <= goal) break; if (!v.blocked) hits.delete(k); }
    for (const k of hits.keys()) { if (hits.size <= MAXKEYS * 1.5) break; hits.delete(k); } // last resort: only if almost everything is blocked
  }
  return blocked;
}
export const limiterSize = () => hits.size;

// State-changing requests must come from our own pages: custom header + matching Origin / Fetch-Metadata.
export function csrfOk(req) {
  if (req.headers['x-orbit'] !== '1') return false;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  // Behind https we compare with the configured public host (a proxy may rewrite Host); in dev with the Host header.
  const want = SECURE ? new URL(BASE).host : req.headers.host;
  if (origin) { try { if (new URL(origin).host !== want) return false; } catch { return false; } }
  return true;
}
