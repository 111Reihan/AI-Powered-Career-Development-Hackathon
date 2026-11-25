(function () {
  const { esc, $, bar } = Orbit, D = OrbitData, E = OrbitEngine;
  function render() {
    const s = Orbit.state, v = $('#view');
    const head = `<div class="page-head"><div class="eyebrow">Step 3 of 4</div><h1>Skills to develop</h1><p>The gap between where you are and where a role typically starts, biggest gaps first.</p></div>`;
    const ranked = E.rankCareers(s);
    const options = ranked.map((r) => `<option value="${esc(r.id)}"${s.career === r.id ? ' selected' : ''}>${esc(r.title)} (${r.score}/100)</option>`).join('');
    const picker = `<div class="field" style="max-width:420px"><label for="pick">Career to plan for</label><select id="pick"><option value="">Choose…</option>${options}</select></div>`;
    const career = D.CAREERS.find((c) => c.id === s.career);
    if (!career) { v.innerHTML = head + `<div class="card">${picker}<p class="muted">Pick a career to see which skills to build.</p></div>`; bind(); return; }
    const gaps = E.skillGaps(career, s.skills);
    const open = gaps.filter((g) => g.gap > 0), met = gaps.filter((g) => g.gap === 0);
    const hrs = open.reduce((a, g) => a + g.gap * D.SKILLS[g.id].hpl, 0);
    v.innerHTML = head + `<section class="card">${picker}
      ${s.assessed ? '' : '<div class="notice" style="margin-bottom:14px">You have not rated your skills, so every skill shows as a full gap. <a href="assessment.html">Rate my skills</a></div>'}
      <div class="row between"><h2 class="row" style="gap:10px">${OrbitIcons.icon(D.LOGO.career[career.id], 34)} ${esc(career.title)}</h2><span class="muted small">${open.length} to develop · about ${hrs} hours in total</span></div>
      <table><thead><tr><th>Skill</th><th>You</th><th>Target</th><th>Gap</th><th>Est. hours</th></tr></thead><tbody>
      ${gaps.map((g) => `<tr><td><span class="row">${OrbitIcons.icon(D.LOGO.skill[g.id], 24, g.name)} ${esc(g.name)}</span></td><td>${esc(D.LEVELS[g.have])}</td><td>${esc(D.LEVELS[g.need])}</td><td>${g.gap === 0 ? '<span class="badge ai">Met</span>' : g.gap + ' level' + (g.gap > 1 ? 's' : '')}</td><td>${g.gap * D.SKILLS[g.id].hpl || '–'}</td></tr>`).join('')}</tbody></table>
      <p class="muted small">Hour estimates are rough averages for self-paced learning, not guarantees. ${met.length ? 'You already meet the target for ' + met.length + ' skill' + (met.length > 1 ? 's' : '') + '.' : ''}</p>
      <div class="row"><a class="btn" href="roadmap.html">Build my roadmap →</a><a class="btn ghost" href="exam.html?scope=gaps">Test myself on these gaps</a></div></section>`;
    bind();
  }
  function bind() {
    const pick = $('#pick');
    pick.addEventListener('change', () => {
      if (!pick.value) return;
      Orbit.save((st) => { st.career = pick.value; if (!st.startedAt) st.startedAt = Date.now(); });
      Orbit.markActive(); render(); $('#pick').focus();
    });
  }
  document.addEventListener('DOMContentLoaded', render);
})();
