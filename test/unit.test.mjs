// Unit tests for the limiter, client-IP keying and the progress-data validator.
import assert from 'node:assert/strict';
const { limited, clientIp, limiterSize, csrfOk } = await import('../lib/guard.js');
const { normalizeState } = await import('../lib/validate.js');

// limiter: blocks at max, recovers, never grows without bound, flooding other keys cannot reset a blocked key
assert.equal(limited('k1', 3, 60_000), false); assert.equal(limited('k1', 3), false); assert.equal(limited('k1', 3), false);
for (let i = 0; i < 5; i++) assert.equal(limited('k1', 3), true);
for (let i = 0; i < 30_000; i++) limited('flood' + i, 1);
assert.ok(limiterSize() <= 20_000 + 1, 'bounded memory: ' + limiterSize());
assert.equal(limited('k1', 3), true, 'a key that was blocked is still blocked after 30k other keys (no global clear)');
assert.equal(limited('short', 1, 20), false); assert.equal(limited('short', 1, 20), true); await new Promise((r) => setTimeout(r, 40)); assert.equal(limited('short', 1, 20), false, 'window slides');

// client IP: one key per IPv6 /64, IPv4-mapped addresses collapse to IPv4
const ip = (a, h = {}) => clientIp({ socket: { remoteAddress: a }, headers: h });
assert.equal(ip('203.0.113.9'), '203.0.113.9'); assert.equal(ip('::ffff:203.0.113.9'), '203.0.113.9');
assert.equal(ip('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), ip('2001:db8:1:2::1')); assert.notEqual(ip('2001:db8:1:2::1'), ip('2001:db8:1:3::1'));
assert.equal(ip('10.0.0.1', { 'x-forwarded-for': '6.6.6.6' }), '10.0.0.1', 'X-Forwarded-For ignored unless TRUST_PROXY=1');

// CSRF predicate
const c = (h) => csrfOk({ headers: h });
assert.equal(c({}), false); assert.equal(c({ 'x-orbit': '1', host: 'a.com' }), true); assert.equal(c({ 'x-orbit': '1', host: 'a.com', origin: 'https://a.com' }), true);
assert.equal(c({ 'x-orbit': '1', host: 'a.com', origin: 'https://b.com' }), false); assert.equal(c({ 'x-orbit': '1', host: 'a.com', origin: 'null' }), false);
assert.equal(c({ 'x-orbit': '1', host: 'a.com', 'sec-fetch-site': 'same-site' }), false); assert.equal(c({ 'x-orbit': '1', host: 'a.com', 'sec-fetch-site': 'same-origin' }), true);

// validator
assert.equal(normalizeState(null), null); assert.equal(normalizeState({ v: 1 }), null); assert.equal(normalizeState([]), null);
const n = normalizeState({ v: 2, __proto__: { x: 1 }, skills: { python: '3', constructor: 4, toString: 4 }, done: { 'a:1': 'nonsense' }, activity: { '2026-01-02': 5, 'x': 1 }, exams: Array.from({ length: 200 }, (_, i) => ({ t: i, total: 5, correct: 9999, percent: 150 })), profile: { interests: 'data' } });
assert.deepEqual(n.skills, { python: 3 }); assert.deepEqual(n.done, {}); assert.deepEqual(n.activity, { '2026-01-02': 5 });
assert.equal(n.exams.length, 60); assert.equal(n.exams[0].correct, 100); assert.equal(n.exams[0].percent, 100); assert.deepEqual(n.profile.interests, []);
assert.ok(!Object.hasOwn(n, 'x'));
const again = normalizeState(JSON.parse(JSON.stringify(n))); assert.deepEqual(again, n, 'normalising is idempotent');
console.log('unit tests passed');
