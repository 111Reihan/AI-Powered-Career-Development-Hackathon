// Minimal fake OAuth provider for tests. Not for production use.
import http from 'node:http';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function startMockIdp(port) {
  const seen = { tokenCalls: [] };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const [, k, what] = u.pathname.split('/');
    if (what === 'authorize') {
      const back = new URL(u.searchParams.get('redirect_uri'));
      back.searchParams.set('code', 'code-' + k); back.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, { Location: back.toString() }); return res.end();
    }
    if (what === 'token' && req.method === 'POST') {
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
        seen.tokenCalls.push({ k, form: Object.fromEntries(new URLSearchParams(b)) });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'at-' + k, id_token: `h.${b64u({ sub: 'apple-sub-1', email: 'ap@example.com' })}.s` }));
      }); return;
    }
    if (what === 'userinfo') {
      if (req.headers.authorization !== 'Bearer at-' + k) { res.writeHead(401); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(k === 'facebook' ? { id: 'fb-1', name: 'Fay Book', email: 'fay@example.com' } : { sub: k + '-sub-1', name: 'Mock ' + k, email: k + '@example.com' }));
    }
    res.writeHead(404); res.end();
  }).listen(port);
  return { srv, seen };
}
