(function () {
  const { state, esc, $, bar } = Orbit, D = OrbitData, E = OrbitEngine;
  document.addEventListener('DOMContentLoaded', () => {
    const v = $('#view');
    if (!Orbit.state.onboarded) {
      v.innerHTML = `<section class="card hero"><div class="eyebrow">Welcome to Orbit</div><h2>Find a career that fits, then get a plan to reach it.</h2>
        <p>Tell us your interests, rate your skills, and Orbit builds a step-by-step roadmap with projects and milestones. Takes about 5 minutes.</p>
        <a class="btn light" href="onboarding.html">Get started →</a></section>
        <div class="grid g3" style="margin-top:20px">
        ${[['1', 'Explore', 'See careers ranked by fit with your interests and style.'], ['2', 'Assess', 'Rate your current skills honestly.'], ['3', 'Plan', 'See your skill gaps and a personalised roadmap.'], ['4', 'Track', 'Tick off tasks and adjust goals as life changes.']]
          .map(([n, t, d]) => `<div class="card"><div class="eyebrow">Step ${n}</div><h3>${t}</h3><p class="muted">${d}</p></div>`).join('')}</div>
        <p class="muted small" style="margin-top:18px">Demo mode runs without any account or API key. AI coaching is optional and clearly labelled when it is on.</p>`;
      return;
    }
    const s = Orbit.state, first = s.profile.name.split(/\s+/)[0] || 'there';
    const ranked = E.rankCareers(s).slice(0, 3);
    const career = D.CAREERS.find((c) => c.id === s.career);
    let planCard = `<p class="muted">You have not chosen a career yet. Pick one to get a roadmap.</p><a class="btn" href="careers.html">Choose a career</a>`;
    if (career) {
      const road = E.buildRoadmap(s), pr = E.progress(s, road), pc = E.pace(s, road);
      const nt = pr.next && pr.next.tasks.find((t) => !s.done[t.id]);
      planCard = `<div class="row between"><h3>${esc(career.icon)} ${esc(career.title)}</h3><b>${pr.percent}%</b></div>${bar(pr.percent, 'green')}
        <p class="small muted">${esc(pc.text)}</p>
        ${nt ? `<p><b>Next task:</b> ${esc(nt.text)}</p>` : '<p>🎉 Every task is done. Update your skills and choose a stretch goal.</p>'}
        <a class="btn" href="roadmap.html">Open roadmap</a>`;
    }
    v.innerHTML = `<div class="page-head"><div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Welcome back, ${esc(first)}</h1><p>Here is where you stand.</p></div>
      <div class="grid g-main">
        <section class="card"><h2>Top career fits</h2><p class="muted small">Rule-based scores from your profile.</p>
          ${ranked.map((r) => `<div class="skill"><div class="head"><a href="career.html?id=${esc(r.id)}">${esc(r.title)}</a><span>${r.score}/100</span></div>${bar(r.score)}<p class="small muted" style="margin:6px 0 0">${esc(r.reasons[0])}</p></div>`).join('')}
          <p><a href="careers.html">See all careers →</a></p></section>
        <section class="card"><h2>Your plan</h2>${planCard}</section>
      </div>
      ${s.assessed ? '' : '<div class="notice" style="margin-top:20px">You have not rated your skills yet. <a href="assessment.html">Take the skill assessment</a> to sharpen your matches.</div>'}`;
  });
})();
