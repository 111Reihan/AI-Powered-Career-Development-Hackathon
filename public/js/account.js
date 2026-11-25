// Settings: account card (sign out / delete account / sign-in prompt).
(function () {
  const { esc, $ } = Orbit;
  document.addEventListener('DOMContentLoaded', async () => {
    const box = $('#account'); if (!box) return;
    await Orbit.ready;
    const u = Orbit.user || (await Orbit.ready).user;
    if (!u) {
      box.innerHTML = '<h2>Account</h2><p class="muted">You are using Orbit as a guest. Your progress is saved only in this browser.</p><a class="btn" href="login.html?next=/settings.html">Sign in to save across devices</a>';
      return;
    }
    const via = { password: 'email and password', google: 'Google', microsoft: 'Microsoft', facebook: 'Facebook', apple: 'Apple' }[u.provider] || u.provider;
    box.innerHTML = `<h2>Account</h2><p>Signed in as <b>${esc(u.name)}</b>${u.email ? ' (' + esc(u.email) + ')' : ''} via ${esc(via)}.</p>
      <p class="muted small">Your profile, ratings, exam results and roadmap progress sync to this server while you are signed in.</p>
      <div class="row"><button id="outBtn" class="btn ghost" type="button">Sign out</button><button id="delBtn" class="btn danger" type="button">Delete my account</button></div><div id="accErr" class="notice bad" role="alert" hidden></div>`;
    $('#outBtn').addEventListener('click', () => Orbit.logout());
    $('#delBtn').addEventListener('click', async () => {
      if (!confirm('Delete your account and the data saved on the server? This cannot be undone.')) return;
      const r = await fetch('/api/me', { method: 'DELETE', headers: { 'X-Orbit': '1' } }).catch(() => null);
      if (r && r.ok) { Orbit.reset(); location.href = 'index.html'; } else { const e = $('#accErr'); e.textContent = 'Could not delete the account. Try again.'; e.hidden = false; }
    });
  });
})();
