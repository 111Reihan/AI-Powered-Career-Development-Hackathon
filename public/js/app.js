// Shared shell: state storage, navigation, toasts, AI/demo coaching helper.
(function (g) {
  const KEY = 'orbit.v2';
  const D = g.OrbitData, E = g.OrbitEngine;

  const defaults = () => ({
    v: 2, onboarded: false, assessed: false, career: null, startedAt: null,
    profile: { name: '', study: '', year: '', interests: [], style: { analytical: 3, creative: 3, social: 3, technical: 3 }, hours: 5, weeks: 24 },
    skills: {}, done: {}, activity: {}, notes: [],
  });

  let mem = null; // fallback if localStorage is blocked
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); if (s && s.v === 2) return Object.assign(defaults(), s, { profile: Object.assign(defaults().profile, s.profile) }); }
    } catch (e) { /* ignore corrupt or blocked storage */ }
    return mem || defaults();
  }
  let state = load();
  function save(patch) {
    if (typeof patch === 'function') patch(state); else if (patch) Object.assign(state, patch);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { mem = state; }
    return state;
  }
  function reset() { state = defaults(); try { localStorage.removeItem(KEY); } catch (e) { mem = null; } }
  const today = () => new Date().toISOString().slice(0, 10);
  function markActive() { save((s) => { s.activity[today()] = true; }); }
  function streak() {
    let n = 0; const d = new Date();
    if (!state.activity[d.toISOString().slice(0, 10)]) d.setDate(d.getDate() - 1);
    while (state.activity[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let toastT;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const NAV = [
    ['index.html', 'Home', '⌂'], ['careers.html', 'Career paths', '◎'], ['assessment.html', 'Skill assessment', '◇'],
    ['gaps.html', 'Skills to develop', '△'], ['roadmap.html', 'Learning roadmap', '▤'], ['progress.html', 'Progress & goals', '↗'],
  ];
  function renderShell() {
    const page = document.body.dataset.page;
    const nav = $('#nav');
    if (!nav) return;
    const link = ([href, label, ic]) => `<a href="${href}"${href.startsWith(page) ? ' aria-current="page"' : ''}><span class="ic" aria-hidden="true">${ic}</span><span class="lb">${label}</span></a>`;
    const first = state.profile.name ? state.profile.name.split(/\s+/)[0] : 'Guest';
    nav.innerHTML = `<a class="brand" href="index.html"><span class="brand-icon" aria-hidden="true">✳</span>orbit</a>
      <nav aria-label="Main">${NAV.map(link).join('')}</nav>
      <div class="side-bottom"><nav aria-label="Account">${link(['settings.html', 'Settings', '⚙'])}</nav>
      <div class="me"><span class="avatar" aria-hidden="true">${esc(first[0].toUpperCase())}</span><span><b>${esc(state.profile.name || 'Guest')}</b><small>${esc(state.profile.study || 'Not set up yet')}</small></span></div></div>`;
    const bar = $('#topbar');
    if (bar) bar.innerHTML = `<span class="crumb">Orbit / <b>${esc(document.title.split('·')[0].trim())}</b></span><span class="top-right"><span id="modeBadge" class="badge" title="Checking AI status…">Checking…</span><button id="themeBtn" class="theme-btn" type="button"></button><span class="streak" title="Days in a row with activity">✦ ${streak()} day streak</span></span>`;
    const tb = $('#themeBtn');
    if (tb) {
      const paint = () => { const d = document.documentElement.dataset.theme === 'dark'; tb.textContent = d ? '☀ Light' : '☾ Dark'; tb.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); };
      paint();
      tb.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('orbit.theme', next); } catch (e) { /* ignore */ }
        paint();
      });
    }
    // Pages that need a profile
    if (document.body.hasAttribute('data-need-profile') && !state.onboarded) { location.replace('onboarding.html'); return; }
    status().then((s) => {
      const b = $('#modeBadge'); if (!b) return;
      b.textContent = s.ai ? 'AI coach: on' : 'Demo mode';
      b.className = 'badge ' + (s.ai ? 'ai' : 'demo');
      b.title = s.ai ? 'Coaching text comes from Claude (' + s.model + '). Scores and roadmaps are rule-based.' : 'No API key: coaching text is rule-based templates, not AI. Scores and roadmaps are always rule-based.';
    });
  }

  let statusP;
  function status() {
    if (!statusP) statusP = fetch('/api/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { ai: false })).catch(() => ({ ai: false }));
    return statusP;
  }

  // Ask for coaching. Returns { source: 'ai'|'demo', result, note? }. Never throws.
  async function coach(task, question) {
    const s = await status();
    if (s.ai) {
      try {
        const r = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(E.makeCoachPayload(state, task, question)) });
        const j = await r.json();
        if (r.ok && j.result) return { source: 'ai', model: j.model, result: j.result };
        return { source: 'demo', result: E.demoAdvice(state, task), note: j.error || 'AI unavailable.' };
      } catch (e) { return { source: 'demo', result: E.demoAdvice(state, task), note: 'Could not reach the AI service.' }; }
    }
    return { source: 'demo', result: E.demoAdvice(state, task) };
  }

  function coachHTML(c) {
    const r = c.result;
    const tag = c.source === 'ai' ? `<span class="badge ai">AI-generated by Claude</span>` : `<span class="badge demo">Demo mode: rule-based text, not AI</span>`;
    const list = (a) => (a && a.length ? '<ul>' + a.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>' : '');
    return `<div class="coach">${tag}${c.note ? `<p class="muted small">${esc(c.note)}</p>` : ''}<h3>${esc(r.headline)}</h3>
      ${(r.explanations || []).map((e) => `<div class="why"><b>${esc(e.title)}</b><p>${esc(e.detail)}</p></div>`).join('')}
      ${r.next_steps?.length ? '<h4>Next steps</h4>' + list(r.next_steps) : ''}${r.watch_outs?.length ? '<h4>Keep in mind</h4>' + list(r.watch_outs) : ''}</div>`;
  }

  // Wires up a "Get coaching" button + container on a page.
  function wireCoach(btnSel, outSel, task) {
    const btn = $(btnSel), out = $(outSel);
    if (!btn || !out) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true; const old = btn.textContent; btn.textContent = 'Thinking…';
      out.setAttribute('aria-busy', 'true');
      const c = await coach(task);
      out.innerHTML = coachHTML(c); out.removeAttribute('aria-busy');
      btn.disabled = false; btn.textContent = old;
    });
  }

  const bar = (pct, cls) => `<div class="bar" role="img" aria-label="${pct}%"><div class="fill ${cls || ''}" style="width:${pct}%"></div></div>`;

  g.Orbit = { get state() { return state; }, save, reset, markActive, streak, esc, $, $$, toast, coach, coachHTML, wireCoach, bar, status };
  document.addEventListener('DOMContentLoaded', renderShell);
})(window);
