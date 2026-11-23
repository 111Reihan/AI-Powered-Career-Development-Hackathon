(function () {
  const { esc, $ } = Orbit, D = OrbitData, E = OrbitEngine;
  document.addEventListener('DOMContentLoaded', () => {
    const s = Orbit.state, form = $('#assessForm');
    // Put skills relevant to the student's top careers (or chosen career) first.
    const focus = s.career ? [D.CAREERS.find((c) => c.id === s.career)] : E.rankCareers(s).slice(0, 3).map((r) => D.CAREERS.find((c) => c.id === r.id));
    const relevant = new Set(focus.filter(Boolean).flatMap((c) => Object.keys(c.reqs)));
    const ids = Object.keys(D.SKILLS).sort((a, b) => (relevant.has(b) - relevant.has(a)) || D.SKILLS[a].name.localeCompare(D.SKILLS[b].name));
    const row = (id) => `<fieldset class="skill"><legend class="head" style="width:100%">${esc(D.SKILLS[id].name)}</legend><div class="levels">${D.LEVELS.map((l, i) => `<label><input type="radio" name="${id}" value="${i}"${(s.skills[id] || 0) === i ? ' checked' : ''}><span>${i} · ${l}</span></label>`).join('')}</div></fieldset>`;
    const rel = ids.filter((i) => relevant.has(i)), oth = ids.filter((i) => !relevant.has(i));
    form.innerHTML = `<section class="card"><h2>Relevant to your ${s.career ? 'chosen career' : 'top matches'}</h2>${rel.map(row).join('')}</section>
      <details class="card" style="margin-top:20px"><summary><b>Other skills (${oth.length})</b></summary>${oth.map(row).join('')}</details>
      <div class="row" style="margin-top:20px"><button class="btn" type="submit">Save my skills</button><span class="muted small">You can update these any time.</span></div>`;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      Orbit.save((st) => {
        for (const id of ids) { const r = form.querySelector(`input[name="${id}"]:checked`); st.skills[id] = r ? Number(r.value) : 0; }
        st.assessed = true; st.baseSkills = Object.assign({}, st.skills);
      });
      Orbit.markActive(); Orbit.toast('Skills saved.');
      setTimeout(() => { location.href = Orbit.state.career ? 'gaps.html' : 'careers.html'; }, 500);
    });
  });
})();
