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
        <div class="grid g4 u-mt20">
        ${[['compass', 'Explore', 'See careers ranked by fit with your interests and style.', 'careers.html'], ['clipboard-list', 'Assess', 'Rate your skills honestly, or check them with a quick quiz.', 'assessment.html'], ['square-pen', 'Test', 'Take exams built from your goal, gaps and roadmap.', 'exam.html'], ['chart-line', 'Track', 'Streaks, an activity heatmap and charts of your progress.', 'progress.html']]
          .map(([ic, t, d, h]) => `<a class="card feat" href="${h}"><span class="feat-ic">${I.glyph(ic, 22)}</span><h3>${t}</h3><p class="muted">${d}</p></a>`).join('')}</div>
        <div class="u-mt20">${strip()}</div>
        <p class="muted small u-mt18">Every page works without an account. Sign in only if you want your progress saved across devices. AI coaching is optional and clearly labelled when it is on.</p>`;
      return;
    }
    const s = Orbit.state, first = s.profile.name.split(/\s+/)[0] || 'there';
    const ranked = E.rankCareers(s).slice(0, 3);
    const career = D.CAREERS.find((c) => c.id === s.career);
    let planCard = `<p class="muted">You have not chosen a career yet. Pick one to get a roadmap.</p><a class="btn" href="careers.html">Choose a career</a>`;
    if (career) {
      const road = E.buildRoadmap(s), pr = E.progress(s, road), pc = E.pace(s, road);
      const nt = pr.next && pr.next.tasks.find((t) => !s.done[t.id]);
      planCard = `<div class="row between"><h3 class="row u-gap10">${I.icon(D.LOGO.career[career.id], 34)} ${esc(career.title)}</h3><b>${pr.percent}%</b></div>${bar(pr.percent, 'green')}
        <p class="small muted">${esc(pc.text)}</p>
        ${nt ? `<p><b>Next task:</b> ${esc(nt.text)}</p>` : '<p>Every task is done. Update your skills and choose a stretch goal.</p>'}
        <div class="row"><a class="btn" href="roadmap.html">Open roadmap</a><a class="btn ghost" href="exam.html?scope=roadmap">Test what I am learning</a></div>`;
    }
    // The three questions a student comes with, answered from their own data (rule-based, not AI).
    const road0 = career ? E.buildRoadmap(s) : null, pr0 = road0 ? E.progress(s, road0) : null;
    const rated = Object.entries(s.skills || {}).filter(([k, n]) => n > 0 && D.SKILLS[k]).sort((x, y) => y[1] - x[1]);
    const gaps0 = career && s.assessed ? E.skillGaps(career, s.skills).filter((x) => x.gap > 0).slice(0, 3) : [];
    const nextT = pr0 && pr0.next && pr0.next.tasks.find((t) => !s.done[t.id]);
    const snap = `<section class="card" aria-label="Your career snapshot"><div class="row between"><h2>Your career snapshot</h2><span class="badge demo">Rule-based, not AI</span></div><div class="grid g3 u-mt12">
      <div><h3>1. Where you stand</h3>${s.assessed ? `<p>You rated ${rated.length} skill${rated.length === 1 ? '' : 's'} above "None".${rated.length ? ' Strongest: ' + esc(rated.slice(0, 3).map(([k]) => D.SKILLS[k].name).join(', ')) + '.' : ''}</p><a href="assessment.html">Update my ratings</a>` : '<p class="muted">You have not rated your skills yet.</p><a class="btn sm" href="assessment.html">Rate my skills</a>'}</div>
      <div><h3>2. What to develop</h3>${!career ? '<p class="muted">Choose a career to see the skills it needs.</p><a class="btn sm" href="careers.html">Choose a career</a>' : !s.assessed ? '<p class="muted">Rate your skills to see your gaps for ' + esc(career.title) + '.</p>' : gaps0.length ? '<ul class="reasons">' + gaps0.map((x) => `<li>${esc(x.name)}: ${esc(D.LEVELS[x.have])} → ${esc(D.LEVELS[x.need])}</li>`).join('') + '</ul><a href="gaps.html">See all skill gaps</a>' : '<p>Your ratings meet every target for ' + esc(career.title) + '.</p>'}</div>
      <div><h3>3. What to do next</h3>${nextT ? `<p>${esc(nextT.text)}</p><a href="roadmap.html">Open my roadmap</a>` : career ? '<p>Every roadmap task is done. Raise your ratings or pick a stretch career.</p>' : '<p class="muted">Pick a career and Orbit builds your step-by-step plan.</p>'}</div>
    </div></section>`;
    v.innerHTML = `<div class="page-head"><div class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>Welcome back, ${esc(first)}</h1><p>Here is where you stand.</p></div>
      ${snap}
      <div class="grid g-main">
        <section class="card"><h2>Top career fits</h2><p class="muted small">Rule-based scores from your profile.</p>
          ${ranked.map((r) => `<div class="skill"><div class="head"><span class="row">${I.icon(D.LOGO.career[r.id], 26)} <a href="career.html?id=${esc(r.id)}">${esc(r.title)}</a></span><span>${r.score}/100</span></div>${bar(r.score)}<p class="small muted u-m6">${esc(r.reasons[0])}</p></div>`).join('')}
          <p><a href="careers.html">See all careers →</a></p></section>
        <section class="card"><h2>Your plan</h2>${planCard}</section>
      </div>
      <div class="u-mt20">${Orbit.readyCard(s)}</div>
      <div class="u-mt20">${strip()}</div>
      ${s.assessed ? '' : '<div class="notice u-mt20">You have not rated your skills yet. <a href="assessment.html">Take the skill assessment</a> to sharpen your matches.</div>'}`;
  });
})();
