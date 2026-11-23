(function () {
  const { esc, $, bar } = Orbit, D = OrbitData, E = OrbitEngine;
  document.addEventListener('DOMContentLoaded', () => {
    const s = Orbit.state;
    $('#list').innerHTML = E.rankCareers(s).map((r, i) => {
      const c = D.CAREERS.find((x) => x.id === r.id);
      return `<article class="card career"><div class="top"><span class="role-icon" aria-hidden="true">${c.icon}</span><div><h2 style="margin:0"><a href="career.html?id=${esc(c.id)}">${esc(c.title)}</a></h2><span class="small muted">${esc(c.tagline)}</span></div><div class="score">${r.score}<small>/100 fit</small></div></div>
        ${bar(r.score, i === 0 ? 'green' : '')}
        <p class="small" style="margin:0"><b>Why:</b></p><ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="row"><a class="btn sm" href="career.html?id=${esc(c.id)}">View details</a>${s.career === c.id ? '<span class="badge ai">Your chosen path</span>' : ''}</div></article>`;
    }).join('');
    if (!s.assessed) $('#list').insertAdjacentHTML('beforebegin', '<div class="notice" style="margin-bottom:16px">Skills are not rated yet, so scores assume a neutral skill level. <a href="assessment.html">Rate your skills</a> to include them.</div>');
    Orbit.wireCoach('#coachBtn', '#coachOut', 'career_advice');
  });
})();
