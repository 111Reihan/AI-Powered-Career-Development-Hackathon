(function () {
  const { esc, $, $$, bar } = Orbit, D = OrbitData, E = OrbitEngine;
  const PHASES = { 1: 'Foundations', 2: 'Core skills', 3: 'Advanced & applied', 4: 'Capstone' };
  function render() {
    const s = Orbit.state, v = $('#view');
    const head = '<div class="page-head"><div class="eyebrow">Step 4 of 4</div><h1>Your learning roadmap</h1><p>Milestones are ordered from foundations to a capstone project. Tick tasks as you finish them. Completed work is kept if you change your goals.</p></div>';
    const road = E.buildRoadmap(s);
    if (!road) { v.innerHTML = head + '<div class="card empty"><h2>No career chosen yet</h2><p>Choose a career and we will build your plan.</p><a class="btn" href="careers.html">Choose a career</a></div>'; return; }
    const pr = E.progress(s, road), pc = E.pace(s, road);
    let html = head + `<section class="card"><div class="row between"><h2 class="row" style="gap:10px">${OrbitIcons.icon(D.LOGO.career[road.career.id], 34)} ${esc(road.career.title)}</h2><b>${pr.percent}% complete</b></div>${bar(pr.percent, 'green')}
      <p class="small muted" style="margin:10px 0 0">${pr.tasksDone}/${pr.tasksTotal} tasks · about ${road.totalHours} hours at ${road.hoursPerWeek} h/week = ${road.totalWeeks} weeks. ${esc(pc.text)}</p>
      ${s.assessed ? '' : '<p class="notice" style="margin-top:12px">Rate your skills for a more accurate plan. <a href="assessment.html">Take the assessment</a></p>'}</section>`;
    let phase = 0;
    for (const m of road.milestones) {
      if (m.phase !== phase) { phase = m.phase; html += `<h2 class="phase">${PHASES[phase]}</h2>`; }
      const done = m.tasks.every((t) => s.done[t.id]);
      const raise = done && m.skill && (s.skills[m.skill] || 0) < m.to;
      html += `<article class="ms${done ? ' done' : ''}" style="margin-bottom:14px"><h3 class="row" style="gap:10px">${m.skill ? OrbitIcons.icon(D.LOGO.skill[m.skill], 30, D.SKILLS[m.skill].name) : OrbitIcons.icon('glyph:trophy', 30)}<span>${done ? '✓ ' : ''}${esc(m.title)}</span> <span class="tag">Weeks ${m.startWeek}–${m.endWeek}</span><span class="tag">~${m.hours} h</span></h3>
        <p class="small muted" style="margin:6px 0 0">${esc(m.why)}</p>
        <ul class="tasks">${m.tasks.map((t) => `<li><label><input type="checkbox" data-task="${esc(t.id)}"${s.done[t.id] ? ' checked' : ''}><span class="${s.done[t.id] ? 'done-t' : ''}">${esc(t.text)} <span class="muted small">(~${t.hours} h)</span></span></label></li>`).join('')}</ul>
        ${m.resources.length ? `<ul class="res">${m.resources.map((r) => `<li class="row" style="gap:8px">${OrbitIcons.icon(OrbitIcons.forUrl(r.url), 22)}<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a> <span class="muted small">${esc(r.kind)}</span></li>`).join('')}</ul>` : ''}
        ${m.skill && E.hasBank(m.skill) ? `<p class="small" style="margin:10px 0 0"><a class="btn sm ghost" href="exam.html?skill=${esc(m.skill)}&n=5&start=1">${OrbitIcons.glyph('square-pen', 14)} 5-question check for this milestone</a></p>` : ''}
        ${raise ? `<div class="notice ok" style="margin-top:12px">Milestone complete! <button class="btn sm" data-raise="${esc(m.skill)}" data-to="${m.to}" type="button">Update my ${esc(D.SKILLS[m.skill].name)} rating to ${esc(D.LEVELS[m.to])}</button></div>` : ''}</article>`;
    }
    v.innerHTML = html + '<p class="muted small">Links are curated starting points and may change over time. They are not endorsements.</p>';
    $$('input[data-task]', v).forEach((cb) => cb.addEventListener('change', () => {
      Orbit.save((st) => { if (cb.checked) st.done[cb.dataset.task] = new Date().toISOString(); else delete st.done[cb.dataset.task]; });
      if (cb.checked) { Orbit.markActive(); Orbit.save((st) => { st.notes.unshift({ t: Date.now(), text: 'Completed: ' + cb.closest('label').querySelector('span').firstChild.textContent.trim() }); st.notes = st.notes.slice(0, 100); }); }
      const y = window.scrollY; render(); window.scrollTo(0, y);
      const el = $(`input[data-task="${CSS.escape(cb.dataset.task)}"]`); if (el) el.focus();
    }));
    $$('button[data-raise]', v).forEach((b) => b.addEventListener('click', () => {
      Orbit.save((st) => { st.skills[b.dataset.raise] = Number(b.dataset.to); });
      Orbit.toast('Skill rating updated.'); render();
    }));
  }
  document.addEventListener('DOMContentLoaded', render);
})();
