(function () {
  const { esc, $, bar } = Orbit, D = OrbitData, E = OrbitEngine;
  function render() {
    const s = Orbit.state, v = $('#view');
    const head = '<div class="page-head"><div class="eyebrow">Track</div><h1>Progress & goals</h1><p>See how far you have come and adjust your goals when life changes. Changing goals never deletes finished tasks.</p></div>';
    const road = E.buildRoadmap(s);
    const options = D.CAREERS.map((c) => `<option value="${esc(c.id)}"${s.career === c.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('');
    const goals = `<section class="card"><h2>Adjust my goals</h2><form id="goalForm" class="grid g3" novalidate>
      <div class="field"><label for="g-career">Career</label><select id="g-career">${s.career ? '' : '<option value="">Choose…</option>'}${options}</select></div>
      <div class="field"><label for="g-hours">Hours per week</label><input id="g-hours" type="number" min="1" max="40" value="${esc(s.profile.hours)}"></div>
      <div class="field"><label for="g-weeks">Goal: weeks until job-ready</label><input id="g-weeks" type="number" min="4" max="104" value="${esc(s.profile.weeks)}"></div>
      <div style="grid-column:1/-1"><div id="gerr" class="notice bad" role="alert" hidden></div><button class="btn" type="submit">Update plan</button></div></form></section>`;
    if (!road) { v.innerHTML = head + '<div class="card empty"><h2>Nothing to track yet</h2><p>Choose a career to start a roadmap.</p><a class="btn" href="careers.html">Choose a career</a></div>' + goals; bind(); return; }
    const pr = E.progress(s, road), pc = E.pace(s, road);
    const act = Object.keys(s.activity).length;
    v.innerHTML = head + `<div class="grid g3">
      <div class="card stat"><strong>${pr.percent}%</strong><span>of ${pr.tasksTotal} tasks done</span>${bar(pr.percent, 'green')}</div>
      <div class="card stat"><strong>${pr.hoursDone} h</strong><span>of about ${road.totalHours} h planned</span></div>
      <div class="card stat"><strong>${Orbit.streak()} 🔥</strong><span>day streak · ${act} active day${act === 1 ? '' : 's'}</span></div></div>
      <section class="card" style="margin-top:20px"><h2>Pace</h2><div class="notice ${pc.status === 'behind' ? '' : 'ok'}">${esc(pc.text)}</div>
        <p class="small muted">Next: ${pr.next ? esc(pr.next.title) : 'all milestones done'} · <a href="roadmap.html">open roadmap</a></p>
        <button id="coachBtn" class="btn ghost">Review my progress</button><div id="coachOut" aria-live="polite"></div></section>
      <div style="margin-top:20px">${goals}</div>
      <section class="card" style="margin-top:20px"><h2>Reflection</h2><div class="field"><label for="note">What went well this week? What is blocking you?</label><textarea id="note" rows="3" maxlength="500"></textarea></div><button id="noteBtn" class="btn sm" type="button">Save note</button></section>
      <section class="card" style="margin-top:20px"><h2>Activity log</h2>${s.notes.length ? `<ul class="log">${s.notes.slice(0, 12).map((n) => `<li><time>${esc(new Date(n.t).toLocaleDateString())}</time>${esc(n.text)}</li>`).join('')}</ul>` : '<p class="muted">Finished tasks and notes appear here.</p>'}</section>`;
    Orbit.wireCoach('#coachBtn', '#coachOut', 'roadmap_review');
    $('#noteBtn').addEventListener('click', () => {
      const t = $('#note').value.trim(); if (!t) return;
      Orbit.save((st) => { st.notes.unshift({ t: Date.now(), text: 'Note: ' + t.slice(0, 500) }); st.notes = st.notes.slice(0, 100); });
      Orbit.markActive(); Orbit.toast('Note saved.'); render();
    });
    bind();
  }
  function bind() {
    $('#goalForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const career = $('#g-career').value, hours = Number($('#g-hours').value), weeks = Number($('#g-weeks').value), err = $('#gerr');
      const msg = !career ? 'Choose a career.' : !(hours >= 1 && hours <= 40) ? 'Hours must be between 1 and 40.' : !(weeks >= 4 && weeks <= 104) ? 'Weeks must be between 4 and 104.' : '';
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      const changed = career !== Orbit.state.career;
      Orbit.save((st) => { st.career = career; st.profile.hours = hours; st.profile.weeks = weeks; if (changed || !st.startedAt) st.startedAt = Date.now(); st.notes.unshift({ t: Date.now(), text: 'Goals updated: ' + D.CAREERS.find((c) => c.id === career).title + ', ' + hours + ' h/week, ' + weeks + ' weeks' }); });
      Orbit.markActive(); Orbit.toast('Plan updated.'); render();
    });
  }
  document.addEventListener('DOMContentLoaded', render);
})();
