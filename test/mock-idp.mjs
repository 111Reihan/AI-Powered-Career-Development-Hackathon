// Minimal fake OAuth provider for tests. Not for production use.
import http from 'node:http';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function startMockIdp(port) {
  const seen = { tokenCalls: [], nonce: {} };
  // Tests edit these to change what the "provider" says about the user.
  const profiles = {
    google: { sub: 'google-sub-1', name: 'Mock google', email: 'google@example.com', email_verified: true },
    microsoft: { sub: 'microsoft-sub-1', name: 'Mock microsoft', email: 'microsoft@example.com' },
    facebook: { id: 'fb-1', name: 'Fay Book', email: 'fay@example.com' },
    apple: { sub: 'apple-sub-1', email: 'ap@example.com', email_verified: 'true' },
  };
  const tweaks = { appleAud: null, appleNonce: null, appleIss: null };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const [, k, what] = u.pathname.split('/');
    if (what === 'authorize') {
      const back = new URL(u.searchParams.get('redirect_uri'));
      seen.nonce[k] = u.searchParams.get('nonce');
      seen.lastAuthorize = Object.fromEntries(u.searchParams);
      back.searchParams.set('code', 'code-' + k); back.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, { Location: back.toString() }); return res.end();
    }
    if (what === 'token') {
      const finish = (b) => {
        const form = Object.fromEntries(new URLSearchParams(b));
        seen.tokenCalls.push({ k, method: req.method, form });
        res.writeHead(200, { 'content-type': 'application/json' });
        const a = profiles.apple;
        res.end(JSON.stringify({ access_token: 'at-' + k, id_token: `h.${b64u({ sub: a.sub, email: a.email, email_verified: a.email_verified, iss: tweaks.appleIss || 'https://appleid.apple.com', aud: tweaks.appleAud || form.client_id, exp: Math.floor(Date.now() / 1000) + 600, nonce: tweaks.appleNonce || seen.nonce.apple })}.s` }));
      };
      if (req.method === 'GET') return finish(u.searchParams.toString());
      let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => finish(b)); return;
    }
    if (what === 'userinfo') {
      if (req.headers.authorization !== 'Bearer at-' + k) { res.writeHead(401); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(profiles[k]));
    }
    res.writeHead(404); res.end();
  }).listen(port);
  return { srv, seen, profiles, tweaks };
}
