// Sign-in page: email + password (with email confirmation and reset), or continue as a guest.
(function () {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const I = OrbitIcons;
  const params = new URLSearchParams(location.search);
  const next = /^\/[a-z0-9-]+\.html$/.test(params.get('next') || '') ? params.get('next') : '/index.html';
  // Email links look like login.html#verify=TOKEN or #reset=TOKEN. The fragment never reaches server logs; we remove it from the address bar at once.
  const readLink = () => { const hm = /^#(verify|reset)=([A-Za-z0-9_-]{20,100})$/.exec(location.hash); if (hm) history.replaceState(null, '', location.pathname + location.search); return hm ? { kind: hm[1], token: hm[2] } : null; };
  let link = readLink(), mode = link ? link.kind : 'in', flash = null, pending = '';
  window.addEventListener('hashchange', () => { const l = readLink(); if (l) { link = l; mode = l.kind; flash = null; pending = ''; render(); } }); // link opened in a tab that already shows this page

  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Orbit': '1' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Please try again.'), { code: j.code });
    return j;
  }
  const note = (t, kind) => `<div class="notice ${kind === 'ok' ? 'ok' : 'bad'}" role="${kind === 'ok' ? 'status' : 'alert'}">${esc(t)}</div>`;
  const field = (id, label, inner) => `<div class="field"><label for="${id}">${label}</label><div class="glass">${inner}</div></div>`;
  const pwField = (id, label, auto) => `<div class="field"><label for="${id}">${label}</label><div class="glass pw"><input id="${id}" type="password" autocomplete="${auto}" maxlength="128" placeholder="Enter your password" required><button type="button" class="eye" data-eye="${id}" aria-label="Show password" aria-pressed="false">${I.glyph('eye', 20)}</button></div></div>`;

  function formHTML(st) {
    if (mode === 'verify') return `<form id="emailForm" novalidate><p class="muted">Enter the password you chose when you signed up to confirm your email.</p>${pwField('pw', 'Password', 'current-password')}<div id="ferr" class="notice bad" role="alert" hidden></div><button class="btn lg" id="sub" type="submit">Confirm email</button></form>`;
    if (mode === 'forgot') return `<form id="emailForm" novalidate>${field('em', 'Email address', '<input id="em" type="text" inputmode="email" autocomplete="email" maxlength="254" placeholder="Enter your email address" required>')}<div id="ferr" class="notice bad" role="alert" hidden></div><button class="btn lg" id="sub" type="submit">Email me a reset link</button><p class="center muted"><a href="#" data-mode="in">Back to sign in</a></p></form>`;
    if (mode === 'reset') return `<form id="emailForm" novalidate>${pwField('pw', 'New password (8+ characters)', 'new-password')}<div id="ferr" class="notice bad" role="alert" hidden></div><button class="btn lg" id="sub" type="submit">Set new password</button></form>`;
    return `<form id="emailForm" novalidate>
      ${mode === 'up' ? field('nm', 'Name', '<input id="nm" type="text" maxlength="40" autocomplete="name" placeholder="Your name">') : ''}
      ${field('em', 'Email address', '<input id="em" type="text" inputmode="email" autocomplete="email" maxlength="254" placeholder="Enter your email address" required>')}
      ${pwField('pw', 'Password' + (mode === 'up' ? ' (8+ characters)' : ''), mode === 'up' ? 'new-password' : 'current-password')}
      ${mode === 'in' ? '<div class="row between"><label class="check"><input type="checkbox" id="rem" checked> Keep me signed in</label><a href="#" data-mode="forgot">Forgot password?</a></div>' : ''}
      <div id="ferr" class="notice bad" role="alert" hidden></div><div id="resend" hidden><a href="#" id="resendLink">Send the confirmation email again</a></div>
      <button class="btn lg" id="sub" type="submit">${mode === 'in' ? 'Sign in' : 'Create account'}</button></form>`;
  }

  const boot = Promise.all([
    fetch('/api/status', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ email: true })),
    fetch('/api/me', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ user: null })),
  ]);
  async function render() {
    const v = $('#view');
    const [st, me] = await boot;
    if (me.user) {
      v.innerHTML = `<section class="card login"><a class="brand" href="index.html"><span class="brand-icon" aria-hidden="true">${I.glyph('rocket', 18)}</span>orbit</a><h1>You are signed in</h1><p>Signed in as <b>${esc(me.user.name)}</b>. Your progress saves automatically.</p><a class="btn" href="${esc(next)}">Continue</a></section>`;
      return;
    }
    const emailOn = st.email !== false;
    const title = { in: '<span class="light">Welcome</span> back', up: 'Create your <span class="light">account</span>', forgot: 'Reset your <span class="light">password</span>', reset: 'Choose a new <span class="light">password</span>', verify: 'Confirming your <span class="light">email</span>' }[mode];
    const body = pending ? `${note(pending, 'ok')}<p class="center muted"><a href="#" data-mode="in">Back to sign in</a></p>` : emailOn ? formHTML(st) : note('Email sign-in is not available on this server. You can still continue as a guest.', 'bad');
    v.innerHTML = `<div class="split">
      <section class="split-form"><div class="split-in">
        <a class="brand" href="index.html"><span class="brand-icon" aria-hidden="true">${I.glyph('rocket', 18)}</span>orbit</a>
        <h1 class="rise d1">${title}</h1>
        <p class="muted rise d2">Your skills, exam results and roadmap can be saved to your account and follow you across devices. No account is needed to look around.</p>
        ${flash ? note(flash.text, flash.kind) : ''}
        <div class="rise d3">${body}</div>
        ${st.mail === 'console' && emailOn ? '<p class="muted small">Developer mode: no mail server is set, so confirmation and reset emails are printed in the server console.</p>' : ''}
        <a class="btn ghost block rise d6" href="index.html">${I.glyph('user', 16)} Continue as guest</a>
        <p class="muted small rise d6">Guests keep progress in this browser only. Clearing browser data erases it. <a href="privacy.html">Privacy: what we store</a></p>
        ${mode === 'in' || mode === 'up' ? `<p class="center muted rise d7">${mode === 'in' ? 'New to Orbit?' : 'Already have an account?'} <a href="#" data-mode="${mode === 'in' ? 'up' : 'in'}">${mode === 'in' ? 'Create account' : 'Sign in'}</a></p>` : ''}
      </div></section>
      <aside class="split-art" aria-hidden="true">
        <svg class="art" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="g1" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#8f84f5"/><stop offset="1" stop-color="#2d2680"/></radialGradient></defs><rect width="600" height="600" fill="url(#g1)"/>
          <g fill="none" stroke="#fff" stroke-opacity=".22"><circle cx="300" cy="260" r="70"/><circle cx="300" cy="260" r="130"/><circle cx="300" cy="260" r="190"/><circle cx="300" cy="260" r="250"/></g>
          <circle cx="300" cy="260" r="26" fill="#fff"/><circle cx="430" cy="260" r="11" fill="#52d0a6"/><circle cx="196" cy="168" r="9" fill="#f2b45a"/><circle cx="378" cy="438" r="8" fill="#fff" fill-opacity=".85"/><circle cx="130" cy="330" r="7" fill="#c8c0ff"/></svg>
        <div class="art-cards">
          ${[['target', 'Find careers that fit', '15 career paths matched to your interests and style.'], ['list-checks', 'Exams made for you', 'Questions picked from your career gaps and level.'], ['chart-no-axes-column', 'Progress you can see', 'Heatmap, streaks and score trends, saved to your account.']].map((c, i) => `<div class="art-card ac${i}"><span class="ac-ic">${I.glyph(c[0], 20)}</span><div><b>${c[1]}</b><p>${c[2]}</p></div></div>`).join('')}
        </div>
      </aside></div>`;
    wire(st);
  }

  function go(m) { mode = m; flash = null; pending = ''; render(); }
  function wire() {
    document.querySelectorAll('[data-mode]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.mode); }));
    document.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
      const i = $('#' + b.dataset.eye), on = i.type === 'password'; i.type = on ? 'text' : 'password';
      b.innerHTML = I.glyph(on ? 'eye-off' : 'eye', 20); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
    }));
    const form = $('#emailForm'); if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ferr = $('#ferr'), btn = $('#sub'); ferr.hidden = true; btn.disabled = true;
      try {
        if (mode === 'in') { await api('/api/auth/login', { email: $('#em').value, password: $('#pw').value, remember: $('#rem').checked }); location.href = next; return; }
        if (mode === 'up') { const j = await api('/api/auth/register', { email: $('#em').value, password: $('#pw').value, name: $('#nm').value }); pending = j.message; render(); return; }
        if (mode === 'forgot') { const j = await api('/api/auth/forgot', { email: $('#em').value }); pending = j.message; render(); return; }
        if (mode === 'verify') { await api('/api/auth/verify', { token: link.token, password: $('#pw').value }); flash = { kind: 'ok', text: 'Email confirmed. You can sign in now.' }; mode = 'in'; render(); return; }
        if (mode === 'reset') { await api('/api/auth/reset', { token: link.token, password: $('#pw').value }); flash = { kind: 'ok', text: 'Password changed. Sign in with the new password.' }; mode = 'in'; render(); return; }
      } catch (x) {
        ferr.textContent = x.message; ferr.hidden = false; btn.disabled = false;
        if (x.code === 'unverified') { const r = $('#resend'); r.hidden = false; $('#resendLink').onclick = async (ev) => { ev.preventDefault(); try { const j = await api('/api/auth/resend', { email: $('#em').value }); ferr.textContent = j.message; } catch (y) { ferr.textContent = y.message; } }; }
      }
    });
  }
  document.addEventListener('DOMContentLoaded', render);
})();
