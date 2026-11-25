(function () {
  const { esc, $, bar } = Orbit, D = OrbitData, E = OrbitEngine, I = OrbitIcons;
  const TECH = ['brand:python', 'brand:javascript', 'brand:html5', 'brand:react', 'brand:git', 'brand:docker', 'brand:nodedotjs', 'brand:figma', 'brand:postgresql', 'brand:tensorflow', 'brand:kaggle', 'brand:googleanalytics'];
  const strip = () => `<section class="card" aria-label="Skills you can learn with Orbit"><h2>What you can learn here</h2><p class="muted small">Tools and topics covered by the roadmaps and exams.</p><div class="logos wide">${TECH.map((t) => I.icon(t, 44)).join('')}</div></section>`;
  document.addEventListener('DOMContentLoaded', () => {
    const v = $('#view');
    if (!Orbit.state.onboarded) {
      v.innerHTML = `<section class="card hero"><div class="eyebrow">Welcome to Orbit</div><h2>Find a career that fits, then get a plan to reach it.</h2>
        <p>Explore careers, rate your skills, take exams matched to your goal, and follow a step-by-step roadmap with projects and milestones.</p>
        <div class="row"><a class="btn light" href="onboarding.html">Get started →</a><a class="btn light outline" href="careers.html">Just look around</a><a class="btn light outline" href="login.html">Sign in</a></div></section>
        <div class="grid g4" style="margin-top:20px">
        ${[['compass', 'Explore', 'See careers ranked by fit with your interests and style.', 'careers.html'], ['clipboard-list', 'Assess', 'Rate your skills honestly, or check them with a quick quiz.', 'assessment.html'], ['square-pen', 'Test', 'Take exams built from your goal, gaps and roadmap.', 'exam.html'], ['chart-line', 'Track', 'Streaks, an activity heatmap and charts of your progress.', 'progress.html']]
          .map(([ic, t, d, h]) => `<a class="card feat" href="${h}"><span class="feat-ic">${I.glyph(ic, 22)}</span><h3>${t}</h3><p class="muted">${d}</p></a>`).join('')}</div>
        <div style="margin-top:20px">${strip()}</div>
        <p class="muted small" style="margin-top:18px">Every page works without an account. Sign in only if you want your progress saved across devices. AI coaching is optional and clearly labelled when it is on.</p>`;
      return;
    }
    const s = Orbit.state, first = s.profile.name.split(/\s+/)[0] || 'there';
    const ranked = E.rankCareers(s).slice(0, 3);
    const career = D.CAREERS.find((c) => c.id === s.career);
    let planCard = `<p class="muted">You have not chosen a career yet. Pick one to get a roadmap.</p><a class="btn" href="careers.html">Choose a career</a>`;
    if (career) {
      const road = E.buildRoadmap(s), pr = E.progress(s, road), pc = E.pace(s, road);
      const nt = pr.next && pr.next.tasks.find((t) => !s.done[t.id]);
      planCard = `<div class="row between"><h3 class="row" style="gap:10px">${I.icon(D.LOGO.career[career.id], 34)} ${esc(career.title)}</h3><b>${pr.percent}%</b></div>${bar(pr.percent, 'green')}
        <p class="small muted">${esc(pc.text)}</p>
        ${nt ? `<p><b>Next task:</b> ${esc(nt.text)}</p>` : '<p>Every task is done. Update your skills and choose a stretch goal.</p>'}
        <div class="row"><a class="btn" href="roadmap.html">Open roadmap</a><a class="btn ghost" href="exam.html?scope=roadmap">Test what I am learning</a></div>`;
    }
    v.innerHTML = `<div class="page-head"><div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Welcome back, ${esc(first)}</h1><p>Here is where you stand.</p></div>
      <div class="grid g-main">
        <section class="card"><h2>Top career fits</h2><p class="muted small">Rule-based scores from your profile.</p>
          ${ranked.map((r) => `<div class="skill"><div class="head"><span class="row">${I.icon(D.LOGO.career[r.id], 26)} <a href="career.html?id=${esc(r.id)}">${esc(r.title)}</a></span><span>${r.score}/100</span></div>${bar(r.score)}<p class="small muted" style="margin:6px 0 0">${esc(r.reasons[0])}</p></div>`).join('')}
          <p><a href="careers.html">See all careers →</a></p></section>
        <section class="card"><h2>Your plan</h2>${planCard}</section>
      </div>
      <div style="margin-top:20px">${strip()}</div>
      ${s.assessed ? '' : '<div class="notice" style="margin-top:20px">You have not rated your skills yet. <a href="assessment.html">Take the skill assessment</a> to sharpen your matches.</div>'}`;
  });
})();
