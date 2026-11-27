(function () {
  const { esc, $ } = Orbit, D = OrbitData, E = OrbitEngine;
  document.addEventListener('DOMContentLoaded', () => {
    const s = Orbit.state, form = $('#assessForm');
    // Put skills relevant to the student's top careers (or chosen career) first.
    const focus = s.career ? [D.CAREERS.find((c) => c.id === s.career)] : E.rankCareers(s).slice(0, 3).map((r) => D.CAREERS.find((c) => c.id === r.id));
    const relevant = new Set(focus.filter(Boolean).flatMap((c) => Object.keys(c.reqs)));
    const ids = Object.keys(D.SKILLS).sort((a, b) => (relevant.has(b) - relevant.has(a)) || D.SKILLS[a].name.localeCompare(D.SKILLS[b].name));
    const I = OrbitIcons;
    const pick3 = (id) => { const b = (OrbitBank[id] || []).slice().sort((x, y) => x.d - y.d); return b.length < 3 ? [] : [b[0], b[Math.floor(b.length / 2)], b[b.length - 1]]; };
    const QZ = {}; ids.forEach((id) => { QZ[id] = pick3(id); });
    const quiz = (id) => !QZ[id].length ? '' : `<details class="quiz"><summary>Not sure? Take a 3-question quick check</summary>${QZ[id].map((q, n) => `<fieldset class="q"><legend>${n + 1}. ${esc(q.q)}</legend>${q.o.map((o, k) => `<label><input type="radio" name="q-${id}-${n}" value="${k}"><span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}<button type="button" class="btn sm ghost" data-quiz="${id}">Suggest my level</button> <a class="small" href="exam.html?skill=${id}&n=10&start=1">or take a longer exam on this skill</a><p class="notice" data-result="${id}" role="status" hidden></p></details>`;
    const row = (id) => `<fieldset class="skill"><legend class="head u-w100"><span class="row">${I.icon(D.LOGO.skill[id], 26, D.SKILLS[id].name)} ${esc(D.SKILLS[id].name)}</span></legend><div class="levels">${D.LEVELS.map((l, i) => `<label><input type="radio" name="${id}" value="${i}"${(s.skills[id] || 0) === i ? ' checked' : ''}><span>${i} · ${l}</span></label>`).join('')}</div>${quiz(id)}</fieldset>`;
    const rel = ids.filter((i) => relevant.has(i)), oth = ids.filter((i) => !relevant.has(i));
    form.innerHTML = `<section class="card"><h2>Relevant to your ${s.career ? 'chosen career' : 'top matches'}</h2>${rel.map(row).join('')}</section>
      <details class="card u-mt20"><summary><b>Other skills (${oth.length})</b></summary>${oth.map(row).join('')}</details>
      <div class="row u-mt20"><button class="btn" type="submit">Save my skills</button><span class="muted small">You can update these any time.</span></div>`;
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quiz]'); if (!b) return;
      const id = b.dataset.quiz, qs = QZ[id], out = form.querySelector(`[data-result="${id}"]`);
      const picked = qs.map((q, n) => form.querySelector(`input[name="q-${id}-${n}"]:checked`));
      if (picked.some((p) => !p)) { out.textContent = 'Answer all 3 questions first.'; out.hidden = false; return; }
      const right = picked.filter((p, n) => Number(p.value) === qs[n].a).length;
      form.querySelector(`input[name="${id}"][value="${right}"]`).checked = true;
      const wrong = qs.map((q, n) => (Number(picked[n].value) === q.a ? '' : `Q${n + 1}: ${q.o[q.a]}`)).filter(Boolean);
      out.textContent = `You got ${right}/3, so we set "${D.LEVELS[right]}". ${wrong.length ? 'Correct answers you missed: ' + wrong.join('; ') + '. ' : ''}You can change the level above. Three questions cannot show "Strong", so set that yourself if it applies.`;
      out.hidden = false;
    });
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
