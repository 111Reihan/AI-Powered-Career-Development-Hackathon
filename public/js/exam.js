// Personalised exams: built from the student's career, gaps or roadmap. Selection and grading are rule-based.
(function () {
  const { esc, $, $$ } = Orbit, D = OrbitData, E = OrbitEngine, I = OrbitIcons;
  const sk = (id) => D.SKILLS[id];
  const chip = (id, size) => I.icon(D.LOGO.skill[id], size || 22, sk(id).name);
  let cfg, qs, answers, idx, timer, endAt, aiNote;

  const params = new URLSearchParams(location.search);

  function scopes(s) {
    const has = Boolean(s.career), c = D.CAREERS.find((x) => x.id === s.career);
    return [
      has && ['roadmap', 'My roadmap: skills in milestones I have not finished', 'Tests what you are about to learn.'],
      has && ['gaps', 'My skill gaps for ' + c.title, 'Tests the skills where you are below the target.'],
      has && ['career', 'Everything ' + c.title + ' needs', 'A full check across the role\'s required skills.'],
      ['pick', 'Skills I choose', 'Pick exactly what to be tested on.'],
      ['all', 'Any skill with questions', 'A broad mixed check.'],
    ].filter(Boolean);
  }

  function setup() {
    clearInterval(timer);
    const s = Orbit.state, v = $('#view');
    const sc = scopes(s);
    const pre = params.get('skill');
    const qs0 = params.get('scope'), scope = pre ? 'pick' : (cfg && cfg.scope) || (sc.some((x) => x[0] === qs0) ? qs0 : sc[0][0]);
    const picked = pre ? [pre] : (cfg && cfg.picked) || [];
    const all = Object.keys(D.SKILLS).filter(E.hasBank).sort((a, b) => sk(a).name.localeCompare(sk(b).name));
    const count = Number(params.get('n')) || (cfg && cfg.count) || 10;
    v.innerHTML = `<form id="setup" class="card" novalidate>
      ${s.career ? '' : '<div class="notice" style="margin-bottom:14px">No career chosen yet, so the exam is not tied to a goal. <a href="careers.html">Choose a career</a> to unlock roadmap and gap exams.</div>'}
      <fieldset class="field"><legend>1. What should the exam cover?</legend>
        ${sc.map(([k, l, h]) => `<label class="opt"><input type="radio" name="scope" value="${k}"${k === scope ? ' checked' : ''}><span><b>${esc(l)}</b><small class="muted"> ${esc(h)}</small></span></label>`).join('')}
        <div id="pickBox" class="chips" style="margin-top:10px"${scope === 'pick' ? '' : ' hidden'}>${all.map((id) => `<label class="chip logo-chip"><input type="checkbox" name="pick" value="${id}"${picked.includes(id) ? ' checked' : ''}><span>${chip(id, 20)} ${esc(sk(id).name)}</span></label>`).join('')}</div></fieldset>
      <div class="grid g3">
        <div class="field"><label for="count">2. Number of questions</label><select id="count">${[5, 10, 15, 20].map((n) => `<option${n === count ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label for="diff">3. Difficulty</label><select id="diff"><option value="auto">Adapt to my skill levels</option><option value="1">Easy</option><option value="2">Medium</option><option value="3">Hard</option></select></div>
        <div class="field"><label for="timed">4. Time limit</label><select id="timed"><option value="0">No time limit</option><option value="1">1 minute per question</option><option value="2">2 minutes per question</option></select></div>
      </div>
      <fieldset class="field"><legend>5. Who writes the questions?</legend>
        <label class="opt"><input type="radio" name="src" value="bank" checked><span><b>Built-in question bank</b><small class="muted"> Hand-written, always available.</small></span></label>
        <label class="opt" id="aiOpt"><input type="radio" name="src" value="ai" disabled><span><b>AI-written questions</b><small class="muted" id="aiHint"> Checking AI status…</small></span></label></fieldset>
      <div id="preview" class="notice" aria-live="polite"></div>
      <div id="err" class="notice bad" role="alert" hidden></div>
      <button class="btn" type="submit">Start exam</button></form>
      <section class="card" style="margin-top:20px"><h2>Past exams</h2>${history()}</section>`;
    const form = $('#setup');
    Promise.all([Orbit.status(), Orbit.ready]).then(([st, me]) => { const r = $('input[name=src][value=ai]'); if (!r) return; const ok = st.ai && me.user; r.disabled = !ok; $('#aiHint').textContent = ok ? ' Written by Claude for your levels, then graded by Orbit. May contain mistakes.' : st.ai ? ' Sign in to use AI-written questions (they cost money to generate). The built-in bank is free.' : ' Turn on AI mode by adding an API key on the server. Not available right now.'; });
    const current = () => ({ scope: $('input[name=scope]:checked', form).value, picked: $$('input[name=pick]:checked', form).map((i) => i.value), count: Number($('#count').value), difficulty: $('#diff').value, timed: Number($('#timed').value), src: $('input[name=src]:checked', form).value });
    const ids = (c) => E.examSkills(s, c.scope, c.picked);
    const paint = () => {
      const c = current(); $('#pickBox').hidden = c.scope !== 'pick';
      const list = ids(c);
      $('#preview').innerHTML = list.length
        ? `<b>Your exam will draw on ${list.length} skill${list.length > 1 ? 's' : ''}:</b><div class="plist">${list.map((id) => `<span class="pill">${chip(id, 18)} ${esc(sk(id).name)} <small>you: ${esc(D.LEVELS[s.skills[id] || 0])}</small></span>`).join('')}</div><small class="muted">${c.difficulty === 'auto' ? 'Difficulty adapts: lower levels get easier questions.' : ''} Skills without a question bank (for example writing or teamwork) are rated by you in the assessment instead.</small>`
        : (c.scope === 'pick' ? 'Pick at least one skill above.' : 'No testable skills in this selection (everything is met, or has no questions). Try another scope.');
    };
    form.addEventListener('change', paint); paint();
    form.addEventListener('submit', (e) => {
      e.preventDefault(); const c = current(), list = ids(c), err = $('#err');
      if (!list.length) { err.textContent = 'Choose something with testable skills first.'; err.hidden = false; return; }
      cfg = c; start(list);
    });
    if (params.get('start') && pre) { params.delete('start'); form.requestSubmit(); }
  }

  const history = () => {
    const ex = Orbit.state.exams || [];
    if (!ex.length) return '<p class="muted">Your results will appear here after your first exam.</p>';
    return `<table><thead><tr><th>Date</th><th>Score</th><th>Questions</th><th>Source</th></tr></thead><tbody>${ex.slice(-8).reverse().map((e) => `<tr><td>${esc(new Date(e.t).toLocaleDateString())}</td><td><b>${e.percent}%</b></td><td>${e.correct}/${e.total}</td><td>${e.src === 'ai' ? 'AI-written' : 'Question bank'}</td></tr>`).join('')}</tbody></table>`;
  };

  async function start(list) {
    const v = $('#view'), s = Orbit.state;
    v.innerHTML = '<div class="card"><p class="muted">Building your exam…</p></div>';
    aiNote = '';
    qs = null;
    if (cfg.src === 'ai') {
      try {
        const r = await fetch('/api/exam', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Orbit': '1' }, body: JSON.stringify({ count: cfg.count, skills: list.slice(0, 6).map((id) => ({ id, name: sk(id).name, level: s.skills[id] || 0 })) }) });
        const j = await r.json();
        if (r.ok && j.questions && j.questions.length) {
          const sh = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };
          qs = j.questions.map((q) => { const ord = sh(q.o.map((_, k) => k)); return { skill: q.skill, src: 'ai', q: q.q, o: ord.map((k) => q.o[k]), a: ord.indexOf(q.a), d: q.d, why: q.why }; });
        } else aiNote = (j && j.error) || 'AI questions were unavailable, so the built-in bank was used.';
      } catch (e) { aiNote = 'Could not reach the AI service, so the built-in bank was used.'; }
    }
    if (!qs) { cfg = Object.assign({}, cfg, { src: 'bank' }); qs = E.buildExam(s, { skills: list, count: cfg.count, difficulty: cfg.difficulty }); }
    if (!qs.length) { v.innerHTML = '<div class="card empty"><h2>No questions available</h2><button class="btn" id="back" type="button">Back</button></div>'; $('#back').addEventListener('click', setup); return; }
    answers = new Array(qs.length).fill(null); idx = 0;
    endAt = cfg.timed ? Date.now() + cfg.timed * 60000 * qs.length : 0;
    take();
    if (endAt) timer = setInterval(tick, 1000);
  }

  function tick() {
    const left = Math.max(0, Math.round((endAt - Date.now()) / 1000)), t = $('#clock');
    if (t) t.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    if (left <= 0) { clearInterval(timer); finish(true); }
  }

  function take() {
    const q = qs[idx], v = $('#view'), last = idx === qs.length - 1;
    const answered = answers.filter((a) => a !== null).length;
    v.innerHTML = `<section class="card exam"><div class="row between"><span class="pill">${chip(q.skill, 22)} ${esc(sk(q.skill).name)}</span><span class="muted small">${endAt ? 'Time left <b id="clock">–</b> · ' : ''}Question ${idx + 1} of ${qs.length}${q.src === 'ai' ? ' · AI-written' : ''}</span></div>
      ${Orbit.bar(Math.round(answered / qs.length * 100))}<p class="small muted">${answered} of ${qs.length} answered</p>
      <fieldset class="q big"><legend>${esc(q.q)}</legend>${q.o.map((o, k) => `<label><input type="radio" name="a" value="${k}"${answers[idx] === k ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</fieldset>
      <div class="row between"><button class="btn ghost" id="prev" type="button"${idx === 0 ? ' disabled' : ''}>← Previous</button>
      <span class="row">${last ? '' : '<button class="btn ghost" id="skip" type="button">Skip</button>'}<button class="btn" id="next" type="button">${last ? 'Finish exam' : 'Next →'}</button></span></div></section>`;
    $$('input[name=a]', v).forEach((r) => r.addEventListener('change', () => { answers[idx] = Number(r.value); }));
    $('#prev').addEventListener('click', () => { idx--; take(); });
    const sk2 = $('#skip'); if (sk2) sk2.addEventListener('click', () => { idx++; take(); });
    $('#next').addEventListener('click', () => { if (last) finish(false); else { idx++; take(); } });
    if (endAt) tick();
    $('input[name=a]', v).focus();
  }

  function finish(timeUp) {
    clearInterval(timer);
    const s = Orbit.state, res = E.gradeExam(s, qs, answers), v = $('#view');
    const unanswered = answers.filter((a) => a === null).length;
    Orbit.save((st) => { st.exams = (st.exams || []).concat([{ t: Date.now(), total: res.total, correct: res.correct, percent: res.percent, scope: cfg.scope, src: cfg.src, bySkill: res.bySkill }]).slice(-60); });
    Orbit.markActive();
    const msg = res.percent >= 80 ? 'Strong result.' : res.percent >= 50 ? 'A solid base, with room to grow.' : 'Good to know where to focus.';
    v.innerHTML = `${timeUp ? '<div class="notice">Time is up, so the exam was submitted.</div>' : ''}${aiNote ? `<div class="notice">${esc(aiNote)}</div>` : ''}
      <section class="card"><div class="row between"><div><div class="eyebrow">Result</div><h2>${res.correct} of ${res.total} correct (${res.percent}%)</h2><p class="muted">${msg}${unanswered ? ' ' + unanswered + ' unanswered question' + (unanswered > 1 ? 's' : '') + ' counted as wrong.' : ''}</p></div>
        <div class="ring" role="img" aria-label="${res.percent} percent">${ring(res.percent)}</div></div></section>
      <section class="card" style="margin-top:20px"><h2>By skill</h2>${Object.entries(res.bySkill).map(([id, b]) => `<div class="skill"><div class="head"><span class="row">${chip(id, 22)} ${esc(sk(id).name)}</span><span>${b.c}/${b.n}</span></div>${Orbit.bar(Math.round(b.c / b.n * 100), b.c === b.n ? 'green' : '')}</div>`).join('')}</section>
      ${res.suggestions.length ? `<section class="card" style="margin-top:20px"><h2>Should your ratings change?</h2><p class="muted small">Suggestions come from your score on 2 or more questions per skill. Exams can show up to "Solid", never "Strong". You decide.</p>
        ${res.suggestions.map((g) => `<div class="row between sug"><span>${chip(g.skill, 22)} <b>${esc(sk(g.skill).name)}</b>: ${esc(D.LEVELS[g.from])} → ${esc(D.LEVELS[g.to])} <small class="muted">(${g.c}/${g.n} correct)</small></span><button class="btn sm" type="button" data-set="${g.skill}" data-to="${g.to}">Apply</button></div>`).join('')}</section>` : ''}
      <section class="card" style="margin-top:20px"><h2>Review</h2>${qs.map((q, i) => { const ok = answers[i] === q.a; return `<div class="rev ${ok ? 'ok' : 'bad'}"><b>${ok ? '✓' : '✗'} ${i + 1}. ${esc(q.q)}</b><p class="small">Your answer: ${answers[i] === null ? '<i>skipped</i>' : esc(q.o[answers[i]])}${ok ? '' : `<br>Correct answer: <b>${esc(q.o[q.a])}</b>`}${q.why ? `<br><span class="muted">${esc(q.why)}</span>` : ''}</p></div>`; }).join('')}</section>
      <div class="row" style="margin-top:20px"><button class="btn" id="again" type="button">Retake with new questions</button><button class="btn ghost" id="new" type="button">Change settings</button><a class="btn ghost" href="progress.html">See my progress</a></div>`;
    $$('button[data-set]', v).forEach((b) => b.addEventListener('click', () => { Orbit.save((st) => { st.skills[b.dataset.set] = Number(b.dataset.to); st.assessed = true; if (!st.baseSkills) st.baseSkills = Object.assign({}, st.skills); }); b.disabled = true; b.textContent = 'Applied'; Orbit.toast('Rating updated.'); }));
    $('#again').addEventListener('click', () => start(E.examSkills(Orbit.state, cfg.scope, cfg.picked)));
    $('#new').addEventListener('click', setup);
    window.scrollTo(0, 0);
  }

  function ring(p) {
    const r = 34, c = 2 * Math.PI * r;
    return `<svg viewBox="0 0 80 80" width="96" height="96" aria-hidden="true"><circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--track)" stroke-width="8"/><circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--green)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/><text x="40" y="45" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor">${p}%</text></svg>`;
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
