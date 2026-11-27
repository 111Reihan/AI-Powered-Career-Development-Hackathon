// Portfolio: finished roadmap projects, each with an optional https link and a short reflection. Nothing is published anywhere;
// links and notes are saved with the rest of the progress (this browser, plus the account when signed in).
(function () {
  const { esc, $, $$ } = Orbit, D = OrbitData, E = OrbitEngine, I = OrbitIcons;
  const MAX_URL = 200, MAX_NOTE = 300;
  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  // https only, no credentials in the address, and not too long (the server applies the same rules).
  function cleanUrl(v) {
    const t = String(v || '').trim(); if (!t) return '';
    let u; try { u = new URL(t); } catch (e) { return null; }
    return u.protocol === 'https:' && !u.username && !u.password && u.href.length <= MAX_URL ? u.href : null;
  }
  function markdown(items, s) {
    const who = s.profile.name ? s.profile.name + '’s' : 'My';
    const lines = ['# ' + who + ' project portfolio', ''];
    for (const it of items) {
      const p = (s.projects || {})[it.key] || {};
      lines.push('## ' + it.title, '*' + it.career + ' path, finished ' + date(it.doneAt) + '*', '', it.summary);
      if (p.note) lines.push('', '**What I learned:** ' + p.note);
      if (p.url) lines.push('', '[View the project](' + p.url + ')');
      lines.push('');
    }
    return lines.join('\n');
  }
  function render() {
    const s = Orbit.state, v = $('#view'), items = E.portfolio(s), road = E.buildRoadmap(s), next = E.upcomingProjects(s, road);
    const head = '<div class="page-head"><div class="eyebrow">Show your work</div><h1>Project portfolio</h1><p>Every project you finish on your roadmap lands here. Add a link and a short reflection, then copy or print it for an application.</p></div>';
    const up = next.length ? `<section class="card u-mt20"><h2>Up next on your roadmap</h2><ul class="reasons">${next.map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul><a href="roadmap.html">Open roadmap</a></section>` : '';
    if (!items.length) {
      v.innerHTML = head + `<div class="card empty"><h2>No finished projects yet</h2><p>Tick a roadmap task that starts with "Project:" and it will show up here.</p><a class="btn" href="${s.career ? 'roadmap.html' : 'careers.html'}">${s.career ? 'Open my roadmap' : 'Choose a career'}</a></div>` + up;
      return;
    }
    v.innerHTML = head + `<div class="row between portfolio-bar"><p class="muted small u-m0">${items.length} finished project${items.length === 1 ? '' : 's'}. Private: nothing here is published.</p>
      <div class="row"><button id="copyMd" class="btn ghost" type="button">Copy as Markdown</button><button id="printBtn" class="btn ghost" type="button">Print or save as PDF</button></div></div>
      <div id="pmsg" class="notice ok" role="status" hidden></div>
      <div class="grid g2 u-mt16">${items.map((it, i) => {
        const p = (s.projects || {})[it.key] || {}, logo = it.skill ? I.icon(D.LOGO.skill[it.skill], 32) : I.icon(D.LOGO.career[it.careerId], 32);
        return `<section class="card proj" data-key="${esc(it.key)}"><div class="row u-gap10">${logo}<div><h2 class="u-m0">${esc(it.title)}</h2><p class="muted small u-m0">${esc(it.career)} path · finished ${esc(date(it.doneAt))}</p></div></div>
          <p>${esc(it.summary)}</p>
          ${p.url ? `<p><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer nofollow">View project</a></p>` : ''}${p.note ? `<p class="small"><b>What I learned:</b> ${esc(p.note)}</p>` : ''}
          <form class="pf" data-i="${i}" novalidate>
            <div class="field"><label for="u${i}">Project link (https://…)</label><input id="u${i}" type="url" inputmode="url" maxlength="${MAX_URL}" value="${esc(p.url || '')}" placeholder="https://github.com/you/project"></div>
            <div class="field"><label for="n${i}">What did you learn? (optional)</label><textarea id="n${i}" rows="2" maxlength="${MAX_NOTE}">${esc(p.note || '')}</textarea></div>
            <div id="e${i}" class="notice bad" role="alert" hidden></div><button class="btn sm" type="submit">Save</button></form></section>`;
      }).join('')}</div>` + up;
    $$('form.pf', v).forEach((f) => f.addEventListener('submit', (e) => {
      e.preventDefault();
      const it = items[Number(f.dataset.i)], err = $('#e' + f.dataset.i), url = cleanUrl($('#u' + f.dataset.i).value), note = $('#n' + f.dataset.i).value.trim().slice(0, MAX_NOTE);
      if (url === null) { err.textContent = 'Use a full https:// address (no password in it, under ' + MAX_URL + ' characters).'; err.hidden = false; return; }
      Orbit.save((st) => { st.projects = st.projects || {}; st.projects[it.key] = { url, note }; });
      Orbit.markActive(); Orbit.toast('Saved.'); render();
    }));
    $('#copyMd').addEventListener('click', async () => {
      const m = $('#pmsg');
      try { await navigator.clipboard.writeText(markdown(items, Orbit.state)); m.textContent = 'Copied. Paste it into a README, a document or an application.'; } catch (e) { m.textContent = 'Your browser blocked copying. Use Print or save as PDF instead.'; }
      m.hidden = false;
    });
    $('#printBtn').addEventListener('click', () => window.print());
  }
  document.addEventListener('DOMContentLoaded', render);
})();
