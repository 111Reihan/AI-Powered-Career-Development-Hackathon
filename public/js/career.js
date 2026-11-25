(function () {
  const { esc, $, bar } = Orbit, D = OrbitData, E = OrbitEngine;
  document.addEventListener('DOMContentLoaded', () => {
    const s = Orbit.state, v = $('#view');
    const id = new URLSearchParams(location.search).get('id');
    const c = D.CAREERS.find((x) => x.id === id);
    if (!c) { v.innerHTML = '<div class="card empty"><h1>Career not found</h1><p>That career does not exist.</p><a class="btn" href="careers.html">Back to careers</a></div>'; return; }
    document.title = c.title + ' · Orbit';
    const fit = E.scoreCareer(c, s), gaps = E.skillGaps(c, s.skills);
    const chosen = s.career === c.id;
    v.innerHTML = `<p><a href="careers.html">← All careers</a></p>
      <div class="page-head"><div class="eyebrow">Career path</div><h1 class="row" style="gap:12px">${OrbitIcons.icon(D.LOGO.career[c.id], 44)} ${esc(c.title)}</h1><p>${esc(c.about)}</p></div>
      <div class="grid g-main">
        <section class="card"><h2>Skills this role needs</h2><p class="muted small">Target levels are illustrative entry-level goals${s.assessed ? '. Green means you meet the target.' : '. Rate your skills to see your gaps.'}</p>
          ${gaps.map((g) => `<div class="skill"><div class="head"><span class="row">${OrbitIcons.icon(D.LOGO.skill[g.id], 24, g.name)} ${esc(g.name)}</span><span>${s.assessed ? `${esc(OrbitData.LEVELS[g.have])} → ${esc(OrbitData.LEVELS[g.need])}` : 'Target: ' + esc(OrbitData.LEVELS[g.need])}</span></div>${bar(Math.round(Math.min(g.have, g.need) / g.need * 100), g.gap === 0 ? 'green' : '')}</div>`).join('')}
          <p><a href="assessment.html">${s.assessed ? 'Update my skill ratings' : 'Rate my skills'}</a></p></section>
        <section class="card"><h2>Why this fits you</h2><div class="stat"><strong>${fit.score}/100</strong><span>rule-based fit score</span></div>
          <ul class="reasons" style="margin:12px 0">${fit.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <p class="small muted">Interests ${fit.parts.interest}% · Work style ${fit.parts.style}%${fit.parts.skills === null ? '' : ' · Skills ' + fit.parts.skills + '%'}</p>
          <button id="choose" class="btn" ${chosen ? 'disabled' : ''}>${chosen ? 'This is your chosen path' : 'Choose this career'}</button>
          ${chosen ? '<p><a href="roadmap.html">Open my roadmap →</a> · <a href="exam.html?scope=career">Take an exam on this career</a></p>' : ''}</section>
      </div>`;
    const btn = $('#choose');
    if (btn && !chosen) btn.addEventListener('click', () => {
      Orbit.save((st) => { st.career = c.id; if (!st.startedAt) st.startedAt = Date.now(); });
      Orbit.markActive();
      location.href = s.assessed ? 'gaps.html' : 'assessment.html';
    });
  });
})();
