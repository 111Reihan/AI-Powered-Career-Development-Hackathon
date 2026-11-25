// Sign-in page: Google, Microsoft, Facebook, Apple (OAuth), email + password, or guest.
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const I = OrbitIcons;
  const ERRS = { denied: 'Sign-in was cancelled or denied.', state: 'That sign-in link expired or was not started here. Please try again.', failed: 'The provider could not confirm your sign-in. Please try again.', unconfigured: 'That sign-in method is not set up on this server yet.' };
  const PROVS = [['google', 'Google', 'brand:google'], ['microsoft', 'Microsoft', 'brand:microsoft'], ['facebook', 'Facebook', 'brand:facebook'], ['apple', 'Apple', 'brand:apple']];
  const params = new URLSearchParams(location.search);
  const next = /^\/[a-z0-9-]+\.html$/.test(params.get('next') || '') ? params.get('next') : '/index.html';
  let mode = 'in';

  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Orbit': '1' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    return j;
  }

  async function render() {
    const v = $('#view');
    const [st, me] = await Promise.all([
      fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ providers: {} })),
      fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ user: null })),
    ]);
    const prov = st.providers || {};
    if (me.user) {
      v.innerHTML = `<section class="card login"><a class="brand" href="index.html"><span class="brand-icon" aria-hidden="true">${I.glyph('rocket', 18)}</span>orbit</a><h1>You are signed in</h1><p>Signed in as <b>${esc(me.user.name)}</b>. Your progress saves automatically.</p><a class="btn" href="${esc(next)}">Continue</a></section>`;
      return;
    }
    const anyOauth = PROVS.some(([k]) => prov[k]);
    const err = ERRS[params.get('err')] || '';
    const eye = I.glyph('eye', 20), eyeOff = I.glyph('eye-off', 20);
    v.innerHTML = `<div class="split">
      <section class="split-form"><div class="split-in">
        <a class="brand" href="index.html"><span class="brand-icon" aria-hidden="true">${I.glyph('rocket', 18)}</span>orbit</a>
        <h1 class="rise d1">${mode === 'in' ? '<span class="light">Welcome</span> back' : 'Create your <span class="light">account</span>'}</h1>
        <p class="muted rise d2">Your skills, exam results and roadmap are saved to your account and follow you across devices. No account is needed to look around.</p>
        ${err ? `<div class="notice bad" role="alert">${esc(err)}</div>` : ''}
        <form id="emailForm" class="rise d3" novalidate>
          ${mode === 'up' ? '<div class="field"><label for="nm">Name</label><div class="glass"><input id="nm" type="text" maxlength="40" autocomplete="name" placeholder="Your name"></div></div>' : ''}
          <div class="field"><label for="em">Email address</label><div class="glass"><input id="em" type="text" inputmode="email" autocomplete="email" maxlength="254" placeholder="Enter your email address" required></div></div>
          <div class="field"><label for="pw">Password ${mode === 'up' ? '(8+ characters)' : ''}</label><div class="glass pw"><input id="pw" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" maxlength="128" placeholder="Enter your password" required><button type="button" id="eye" class="eye" aria-label="Show password" aria-pressed="false">${eye}</button></div></div>
          <div id="ferr" class="notice bad" role="alert" hidden></div>
          <button class="btn lg" id="sub" type="submit">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
        <div class="or rise d4"><span>Or continue with</span></div>
        <div class="oauth rise d5" role="group" aria-label="Sign in with">
          ${PROVS.map(([k, n, ic]) => prov[k]
            ? `<a class="btn oa" href="/auth/${k}/start?next=${encodeURIComponent(next)}">${I.icon(ic, 22, n)}<span>Continue with ${n}</span></a>`
            : `<button class="btn oa off" type="button" disabled aria-describedby="oa-note">${I.icon(ic, 22, n)}<span>Continue with ${n}</span></button>`).join('')}
        </div>
        ${anyOauth ? '' : '<p id="oa-note" class="muted small">Social sign-in buttons turn on when the server owner adds the provider keys (see the README). Email sign-in works without them.</p>'}
        ${anyOauth && !PROVS.every(([k]) => prov[k]) ? '<p id="oa-note" class="muted small">Greyed-out providers are not set up on this server.</p>' : ''}
        <a class="btn ghost block rise d6" href="index.html">${I.glyph('user', 16)} Continue as guest</a>
        <p class="muted small rise d6">Guests keep progress in this browser only. Clearing browser data erases it.</p>
        <p class="center muted rise d7">${mode === 'in' ? 'New to Orbit?' : 'Already have an account?'} <a href="#" id="swap">${mode === 'in' ? 'Create account' : 'Sign in'}</a></p>
      </div></section>
      <aside class="split-art" aria-hidden="true">
        <svg class="art" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="g1" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#8f84f5"/><stop offset="1" stop-color="#2d2680"/></radialGradient></defs><rect width="600" height="600" fill="url(#g1)"/>
          <g fill="none" stroke="#fff" stroke-opacity=".22"><circle cx="300" cy="260" r="70"/><circle cx="300" cy="260" r="130"/><circle cx="300" cy="260" r="190"/><circle cx="300" cy="260" r="250"/></g>
          <circle cx="300" cy="260" r="26" fill="#fff"/><circle cx="430" cy="260" r="11" fill="#52d0a6"/><circle cx="196" cy="168" r="9" fill="#f2b45a"/><circle cx="378" cy="438" r="8" fill="#fff" fill-opacity=".85"/><circle cx="130" cy="330" r="7" fill="#c8c0ff"/></svg>
        <div class="art-cards">
          ${[['target', 'Find careers that fit', '15 career paths matched to your interests and style.'], ['list-checks', 'Exams made for you', 'Questions picked from your career gaps and level.'], ['chart-no-axes-column', 'Progress you can see', 'Heatmap, streaks and score trends, saved to your account.']].map((c, i) => `<div class="art-card ac${i}"><span class="ac-ic">${I.glyph(c[0], 20)}</span><div><b>${c[1]}</b><p>${c[2]}</p></div></div>`).join('')}
        </div>
      </aside></div>`;
    $('#eye').addEventListener('click', () => { const i = $('#pw'), on = i.type === 'password'; i.type = on ? 'text' : 'password'; $('#eye').innerHTML = on ? eyeOff : eye; $('#eye').setAttribute('aria-pressed', on); $('#eye').setAttribute('aria-label', on ? 'Hide password' : 'Show password'); });
    $('#swap').addEventListener('click', (e) => { e.preventDefault(); mode = mode === 'in' ? 'up' : 'in'; render(); });
    $('#emailForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ferr = $('#ferr'), btn = $('#sub'); ferr.hidden = true; btn.disabled = true;
      try {
        await api(mode === 'in' ? '/api/auth/login' : '/api/auth/register', { email: $('#em').value, password: $('#pw').value, name: $('#nm') ? $('#nm').value : '' });
        location.href = next;
      } catch (x) { ferr.textContent = x.message; ferr.hidden = false; btn.disabled = false; }
    });
  }
  document.addEventListener('DOMContentLoaded', render);
})();
