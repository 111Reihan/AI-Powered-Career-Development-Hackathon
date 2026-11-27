(function () {
  const { esc, $, $$, bar } = Orbit, D = OrbitData, E = OrbitEngine, I = OrbitIcons;
  const f = { q: '', interests: [], sort: 'fit' };
  function list() {
    const s = Orbit.state;
    let rows = E.rankCareers(s).map((r) => Object.assign(r, { c: D.CAREERS.find((x) => x.id === r.id) }));
    const q = f.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => (r.c.title + ' ' + r.c.tagline + ' ' + r.c.about + ' ' + Object.keys(r.c.reqs).map((k) => D.SKILLS[k].name).join(' ')).toLowerCase().includes(q));
    if (f.interests.length) rows = rows.filter((r) => f.interests.some((k) => r.c.interests[k]));
    if (f.sort === 'az') rows.sort((a, b) => a.title.localeCompare(b.title));
    if (f.sort === 'gap') { const total = (r) => E.skillGaps(r.c, s.skills).reduce((a, g) => a + g.gap * D.SKILLS[g.id].hpl, 0); rows.sort((a, b) => total(a) - total(b)); }
    $('#count').textContent = rows.length + ' of ' + D.CAREERS.length + ' careers shown';
    $('#list').innerHTML = rows.length ? rows.map((r, i) => {
      const c = r.c, top = Object.keys(c.reqs).slice(0, 5);
      return `<article class="card career"><div class="top">${I.icon(D.LOGO.career[c.id], 46)}<div><h2 class="u-m0"><a href="career.html?id=${esc(c.id)}">${esc(c.title)}</a></h2><span class="small muted">${esc(c.tagline)}</span></div><div class="score">${r.score}<small>/100 fit</small></div></div>
        ${bar(r.score, i === 0 && f.sort === 'fit' ? 'green' : '')}
        <div class="logos" aria-label="Key skills">${top.map((k) => I.icon(D.LOGO.skill[k], 28, D.SKILLS[k].name)).join('')}<span class="small muted">${top.map((k) => esc(D.SKILLS[k].name)).slice(0, 3).join(', ')}…</span></div>
        <p class="small u-m0"><b>Why:</b></p><ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="row"><a class="btn sm" href="career.html?id=${esc(c.id)}">View details</a>${s.career === c.id ? '<span class="badge ai">Your chosen path</span>' : ''}</div></article>`;
    }).join('') : '<div class="card empty"><h2>No careers match</h2><p>Try removing a filter.</p></div>';
  }
  document.addEventListener('DOMContentLoaded', () => {
    const s = Orbit.state;
    $('#filters').innerHTML = `<div class="field grow"><label for="q">Search careers or skills</label><input id="q" type="search" placeholder="e.g. Python, design, security" maxlength="40"></div>
      <div class="field"><label for="sort">Sort by</label><select id="sort"><option value="fit">Best fit for me</option><option value="gap">Least learning needed</option><option value="az">A to Z</option></select></div>
      <fieldset class="field full"><legend>Show careers involving</legend><div class="chips">${Object.entries(D.INTERESTS).map(([k, l]) => `<label class="chip logo-chip"><input type="checkbox" value="${k}"><span>${I.icon(D.LOGO.interest[k], 20, l)} ${esc(l)}</span></label>`).join('')}</div></fieldset>`;
    $('#filters').addEventListener('input', () => { f.q = $('#q').value; f.sort = $('#sort').value; f.interests = $$('#filters input[type=checkbox]:checked').map((i) => i.value); list(); });
    list();
    if (!s.assessed) $('#filters').insertAdjacentHTML('beforebegin', '<div class="notice u-mb16">Skills are not rated yet, so scores assume a neutral skill level. <a href="assessment.html">Rate your skills</a> to include them.</div>');
    Orbit.wireCoach('#coachBtn', '#coachOut', 'career_advice');
  });
})();
