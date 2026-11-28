// Settings: account card (password, devices, sign out, delete).
(function () {
  const { esc, $ } = Orbit;
  const H = { 'Content-Type': 'application/json', 'X-Orbit': '1' };
  const call = async (path, method, body) => {
    const r = await fetch(path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    return j;
  };
  const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  document.addEventListener('DOMContentLoaded', async () => {
    const box = $('#account'); if (!box) return;
    await Orbit.ready;
    const u = Orbit.user || (await Orbit.ready).user;
    if (!u) {
      box.innerHTML = '<h2>Account</h2><p class="muted">You are using Orbit as a guest. Your progress is saved only in this browser.</p><a class="btn" href="login.html?next=/settings.html">Sign in to save across devices</a>';
      return;
    }
    const msg = (t, bad) => { const e = $('#accMsg'); e.className = 'notice ' + (bad ? 'bad' : 'ok'); e.textContent = t; e.hidden = false; };
    const pw = () => { const e = $('#cpw'); return e ? e.value : ''; };
    const render = async () => {
      let sessions = []; try { sessions = (await call('/api/auth/sessions', 'GET')).sessions; } catch (e) { /* ignore */ }
      box.innerHTML = `<h2>Account</h2><p>Signed in as <b>${esc(u.name)}</b>${u.email ? ' (' + esc(u.email) + ')' : ''}.</p>
      <p class="muted small">Your profile, ratings, exam results and roadmap progress are saved to this account and sync between devices.</p>
      <div id="accMsg" class="notice" role="status" hidden></div>
      ${u.hasPassword ? '<div class="field"><label for="cpw">Current password (needed to delete your account)</label><input id="cpw" type="password" autocomplete="current-password" maxlength="128"></div>' : ''}
      ${u.hasPassword ? `<div class="acc-sec"><h3>Change password</h3><form id="pwForm" class="row" novalidate>
        <div class="field"><label for="cur">Current password</label><input id="cur" type="password" autocomplete="current-password" maxlength="128" required></div>
        <div class="field"><label for="nw">New password (8+ characters)</label><input id="nw" type="password" autocomplete="new-password" maxlength="128" required></div>
        <button class="btn" type="submit">Change</button></form><p class="muted small">Changing it signs out every other device.</p></div>` : ''}
      <div class="acc-sec"><h3>Devices signed in</h3><ul class="sess">${sessions.map((s) => `<li><span class="ua">${esc(s.ua || 'Unknown browser')}<br><span class="muted small">Last active ${esc(when(s.lastUsed))}${s.current ? ' · this device' : ''}</span></span>${s.current ? '' : `<button class="btn ghost" type="button" data-revoke="${esc(s.id)}">Sign out</button>`}</li>`).join('')}</ul>
        <button id="allBtn" class="btn ghost" type="button">Sign out everywhere</button></div>
      <div class="acc-sec row"><button id="outBtn" class="btn ghost" type="button">Sign out</button><button id="delBtn" class="btn danger" type="button">Delete my account</button></div>`;
      $('#outBtn').addEventListener('click', () => Orbit.logout());
      $('#allBtn').addEventListener('click', async () => { try { await call('/api/auth/logout-all', 'POST', {}); Orbit.reset(); location.href = 'index.html'; } catch (e) { msg(e.message, true); } });
      box.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => { try { await call('/api/auth/sessions/revoke', 'POST', { id: b.dataset.revoke }); render(); } catch (e) { msg(e.message, true); } }));
      const pf = $('#pwForm');
      if (pf) pf.addEventListener('submit', async (e) => { e.preventDefault(); try { await call('/api/auth/password', 'POST', { current: $('#cur').value, next: $('#nw').value }); $('#cur').value = ''; $('#nw').value = ''; msg('Password changed. Other devices were signed out.'); render(); } catch (x) { msg(x.message, true); } });
      $('#delBtn').addEventListener('click', async () => {
        if (!confirm('Delete your account and the data saved on the server? This cannot be undone.')) return;
        try { await call('/api/me', 'DELETE', { password: pw() }); Orbit.reset(); location.href = 'index.html'; } catch (x) { msg(x.message || 'Could not delete the account. Try again.', true); }
      });
    };
    render();
  });
})();
