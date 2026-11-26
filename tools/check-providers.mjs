// Compares the sign-in URLs this app uses with what Google, Microsoft and Apple publish today, and checks that the Facebook API version exists.
// Needs internet access. No keys are used or sent.   node tools/check-providers.mjs
import { endpoints } from '../lib/auth.js';
import { FB_VERSION } from '../lib/config.js';
const E = endpoints(); let bad = 0;
const cmp = async (name, doc, map) => {
  const d = await (await fetch(doc, { signal: AbortSignal.timeout(10_000) })).json();
  for (const [ours, theirs] of Object.entries(map)) {
    const norm = (u) => String(u || '').replace(/login\.microsoftonline\.com\/[^/]+\//, 'login.microsoftonline.com/T/');
    const want = d[theirs] || '', got = E[name][ours], ok = norm(want) === norm(got);
    console.log(ok ? 'ok  ' : 'DIFF', name, ours, ok ? '' : `\n     ours:      ${got}\n     published: ${want}`); if (!ok) bad++;
  }
};
await cmp('google', 'https://accounts.google.com/.well-known/openid-configuration', { auth: 'authorization_endpoint', token: 'token_endpoint', info: 'userinfo_endpoint' });
await cmp('microsoft', 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration', { auth: 'authorization_endpoint', token: 'token_endpoint', info: 'userinfo_endpoint' });
await cmp('apple', 'https://appleid.apple.com/.well-known/openid-configuration', { auth: 'authorization_endpoint', token: 'token_endpoint' });
const r = await fetch(`https://graph.facebook.com/${FB_VERSION}/me?access_token=invalid`, { signal: AbortSignal.timeout(10_000) }); const j = await r.json().catch(() => ({}));
const fbOk = j.error && j.error.type === 'OAuthException'; console.log(fbOk ? 'ok  ' : 'DIFF', `facebook Graph API ${FB_VERSION} answers (set FACEBOOK_API_VERSION to a current version if not)`); if (!fbOk) bad++;
process.exit(bad ? 1 : 0);
