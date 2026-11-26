(function () {
  const { esc, $, bar } = Orbit, D = OrbitData, E = OrbitEngine;

  const I = OrbitIcons;
  const dstr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // Deterministic made-up data for the "sample" preview (clearly labelled, never saved).
  function sampleState() {
    const s = JSON.parse(JSON.stringify(Orbit.state));
    s.career = 'data-scientist'; s.assessed = true; s.profile.hours = 6; s.profile.weeks = 24;
    s.skills = { python: 2, sql: 1, stats: 1, viz: 1, math: 1, git: 1, ml: 0, comm: 1 }; s.baseSkills = Object.assign({}, s.skills);
    const road = E.buildRoadmap(s); const tasks = road.milestones.flatMap((m) => m.tasks);
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    s.done = {}; s.activity = {}; s.exams = [];
    const now = new Date();
    for (let i = 119; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const p = i > 60 ? 0.25 : i > 20 ? 0.55 : 0.8;
      if (rnd() < p) s.activity[dstr(d)] = 1 + Math.floor(rnd() * 5);
    }
    const days = Object.keys(s.activity).sort();
    tasks.slice(0, Math.min(tasks.length - 1, 11)).forEach((t, i) => { const dk = days[Math.floor((i / 11) * days.length)]; s.done[t.id] = new Date(dk + 'T12:00:00').toISOString(); });
    [38, 52, 61, 70, 78, 84].forEach((pc, i) => { const d = new Date(now); d.setDate(d.getDate() - (45 - i * 8)); s.exams.push({ t: d.getTime(), total: 10, correct: Math.round(pc / 10), percent: pc, scope: 'gaps', src: 'bank', bySkill: {} }); });
    return s;
  }

  function heatmap(act) {
    const weeks = 26, cell = 12, gap = 3, left = 28, top = 18;
    const end = new Date(); end.setHours(12, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - (weeks * 7 - 1) - end.getDay());
    let cells = '', months = '', lastM = -1, total = 0;
    for (let w = 0; w <= weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
        if (dt > end) continue;
        const k = dstr(dt), n = Number(act[k]) || 0; total += n ? 1 : 0;
        const lv = n === 0 ? 0 : n === 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 3 : 4;
        cells += `<rect class="hm l${lv}" x="${left + w * (cell + gap)}" y="${top + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3"><title>${n ? n + ' action' + (n > 1 ? 's' : '') : 'No activity'} on ${dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</title></rect>`;
        if (d === 0 && dt.getMonth() !== lastM && dt.getDate() <= 14) { lastM = dt.getMonth(); months += `<text x="${left + w * (cell + gap)}" y="11" class="hm-t">${dt.toLocaleDateString(undefined, { month: 'short' })}</text>`; }
      }
    }
    const W = left + (weeks + 1) * (cell + gap), H = top + 7 * (cell + gap);
    const lab = ['Mon', 'Wed', 'Fri'].map((t, i) => `<text x="0" y="${top + (i * 2 + 1) * (cell + gap) + 10}" class="hm-t">${t}</text>`).join('');
    return `<div class="hm-wrap" tabindex="0" role="group" aria-label="Activity heatmap, scrolls sideways"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Activity heatmap for the last 6 months: ${total} active days" class="hm-svg">${months}${lab}${cells}</svg></div>
      <div class="hm-legend" aria-hidden="true">Less <svg width="76" height="12">${[0, 1, 2, 3, 4].map((l) => `<rect class="hm l${l}" x="${l * 15}" y="0" width="12" height="12" rx="3"/>`).join('')}</svg> More</div>`;
  }

  function donut(done, total) {
    const r = 52, c = 2 * Math.PI * r, p = total ? done / total : 0;
    return `<svg viewBox="0 0 130 130" class="donut" role="img" aria-label="${done} of ${total} tasks done"><circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--track)" stroke-width="12"/><circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--green)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 65 65)"/><text x="65" y="64" text-anchor="middle" font-size="26" font-weight="700" fill="currentColor">${done}<tspan font-size="14" fill="var(--muted)">/${total}</tspan></text><text x="65" y="84" text-anchor="middle" font-size="11" fill="var(--muted)">tasks done</text></svg>`;
  }

  // points: [{x:number, y:number, label}] ; yMax fixed
  function line(points, yMax, label, color, fmt) {
    if (!points.length) return '<p class="muted">Nothing to plot yet.</p>';
    const W = 560, H = 190, L = 34, R = 12, T = 12, B = 26;
    const xs = points.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1);
    const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), Y = (y) => T + (1 - y / yMax) * (H - T - B);
    const path = points.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    const area = path + ` L${X(points[points.length - 1].x).toFixed(1)} ${Y(0)} L${X(points[0].x).toFixed(1)} ${Y(0)} Z`;
    const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${Y(yMax * f)}" y2="${Y(yMax * f)}" class="gl-line"/><text x="${L - 6}" y="${Y(yMax * f) + 4}" text-anchor="end" class="hm-t">${fmt ? fmt(yMax * f) : Math.round(yMax * f)}</text>`).join('');
    const fmtD = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(label)}">${grid}<path d="${area}" fill="${color}" opacity=".12"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${points.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="${color}"><title>${esc(p.label)}</title></circle>`).join('')}<text x="${L}" y="${H - 6}" class="hm-t">${fmtD(x0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="hm-t">${fmtD(x1)}</text></svg>`;
  }

  function dash(s, road, pr) {
    const st = E.activityStats(s), exams = s.exams || [];
    const tl = E.taskTimeline(s);
    const tot = pr ? pr.tasksTotal : 0;
    const avg = exams.length ? Math.round(exams.reduce((a, e) => a + e.percent, 0) / exams.length) : null;
    const stat = (gl, n, l) => `<div class="card stat mini"><span class="stat-ic">${I.glyph(gl, 18)}</span><strong>${n}</strong><span>${l}</span></div>`;
    const phases = road ? E.phaseBreakdown(s, road) : [];
    const colors = { 1: 'var(--purple)', 2: 'var(--green)', 3: 'var(--amber)', 4: '#d6409f' };
    const badges = E.badges(s, road);
    const tlPts = tl.map((p) => ({ x: new Date(p.day + 'T12:00:00').getTime(), y: p.n, label: p.n + ' tasks done by ' + p.day }));
    const exPts = exams.map((e) => ({ x: e.t, y: e.percent, label: e.percent + '% on ' + new Date(e.t).toLocaleDateString() }));
    return `<div class="grid g4">${stat('flame', st.current, 'day streak')}${stat('trophy', st.longest, 'longest streak')}${stat('calendar-days', st.activeDays, 'active days')}${stat('target', avg === null ? '–' : avg + '%', 'average exam score')}</div>
      <div class="grid g-main" style="margin-top:20px">
        <section class="card"><h2>Activity</h2><p class="muted small">Every task, exam, note and goal update counts. Last 6 months.</p>${heatmap(s.activity || {})}
          <p class="small muted" style="margin:8px 0 0">${st.total} action${st.total === 1 ? '' : 's'} on ${st.activeDays} day${st.activeDays === 1 ? '' : 's'}.${st.activeDays === 0 ? ' <a href="progress.html?sample=1">Preview with sample data</a>' : ''}</p></section>
        <section class="card"><h2>Roadmap</h2>${road ? `<div class="row" style="gap:18px;align-items:center"><div class="donut-wrap">${donut(pr.tasksDone, tot)}</div><div class="phase-list">${phases.map((p) => `<div><div class="head small"><span><i class="dot" style="background:${colors[p.phase]}"></i>${esc(p.name)}</span><b>${p.done}/${p.total}</b></div><div class="bar" role="img" aria-label="${esc(p.name)} ${p.done} of ${p.total}"><div class="fill" style="width:${p.total ? Math.round(p.done / p.total * 100) : 0}%;background:${colors[p.phase]}"></div></div></div>`).join('')}</div></div><p class="small muted" style="margin:10px 0 0">${pr.hoursDone} h done of about ${road.totalHours} h planned.</p>` : '<p class="muted">Choose a career to see your roadmap breakdown.</p>'}</section>
      </div>
      <div class="grid g2" style="margin-top:20px">
        <section class="card"><h2>Tasks completed over time</h2>${road ? line(tlPts, Math.max(tot, 1), 'Cumulative tasks completed over time', 'var(--green)') : '<p class="muted">Choose a career first.</p>'}${road && !tl.length ? '<p class="muted small">Tick tasks on your roadmap and the line will grow.</p>' : ''}</section>
        <section class="card"><h2>Exam scores</h2>${line(exPts, 100, 'Exam score percentage over time', 'var(--purple)', (n) => n + '%')}${exams.length ? '' : '<p class="muted small">Take an exam and your scores will be charted. <a href="exam.html">Start one</a></p>'}</section>
      </div>
      <section class="card" style="margin-top:20px"><h2>Achievements</h2><p class="muted small">${badges.filter((b) => b.got).length} of ${badges.length} earned.</p><div class="badges">${badges.map((b) => `<div class="achv${b.got ? ' got' : ''}"><span class="achv-ic">${I.glyph(b.got ? 'award' : 'lock', 20)}</span><b>${esc(b.title)}</b><small>${esc(b.desc)}</small><span class="sr">${b.got ? 'Earned' : 'Locked'}</span></div>`).join('')}</div></section>`;
  }
  function render() {
    const sample = new URLSearchParams(location.search).get('sample') === '1';
    const s = sample ? sampleState() : Orbit.state, v = $('#view');
    const head = '<div class="page-head"><div class="eyebrow">Track</div><h1>Progress & goals</h1><p>See how far you have come and adjust your goals when life changes. Changing goals never deletes finished tasks.</p></div>';
    const road = E.buildRoadmap(s);
    if (sample) { v.innerHTML = head + '<div class="notice" role="status"><b>Sample data.</b> This is made-up activity to show what the dashboard looks like. It is not yours and is not saved. <a href="progress.html">Back to my progress</a></div><div style="margin-top:16px">' + dash(s, road, E.progress(s, road)) + '</div>'; return; }
    const options = D.CAREERS.map((c) => `<option value="${esc(c.id)}"${s.career === c.id ? ' selected' : ''}>${esc(c.title)}</option>`).join('');
    const goals = `<section class="card"><h2>Adjust my goals</h2><form id="goalForm" class="grid g3" novalidate>
      <div class="field"><label for="g-career">Career</label><select id="g-career">${s.career ? '' : '<option value="">Choose…</option>'}${options}</select></div>
      <div class="field"><label for="g-hours">Hours per week</label><input id="g-hours" type="number" min="1" max="40" value="${esc(s.profile.hours)}"></div>
      <div class="field"><label for="g-weeks">Goal: weeks until job-ready</label><input id="g-weeks" type="number" min="4" max="104" value="${esc(s.profile.weeks)}"></div>
      <div style="grid-column:1/-1"><div id="gerr" class="notice bad" role="alert" hidden></div><button class="btn" type="submit">Update plan</button></div></form></section>`;
    if (!road) { v.innerHTML = head + dash(s, null, null) + '<div class="card empty" style="margin-top:20px"><h2>No roadmap to track yet</h2><p>Choose a career to start a roadmap. Your exam results and activity already show above.</p><a class="btn" href="careers.html">Choose a career</a></div><div style="margin-top:20px">' + goals + '</div>'; bind(); return; }
    const pr = E.progress(s, road), pc = E.pace(s, road);
    v.innerHTML = head + dash(s, road, pr) + `<section class="card" style="margin-top:20px"><h2>Pace</h2><div class="notice ${pc.status === 'behind' ? '' : 'ok'}">${esc(pc.text)}</div>
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
