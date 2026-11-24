// Rule-based logic: career fit, skill gaps, roadmap generation, progress and demo-mode coaching.
// Nothing here calls an AI model. All functions are pure so they can be tested in Node.
(function (g) {
  const D = g.OrbitData;
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  // Fit score 0-100. Weights: interests 45%, work style 25%, current skills 30%.
  // Before the skill assessment, skills count as a neutral 40% so scores are not inflated.
  function scoreCareer(career, state) {
    const p = state.profile;
    const reasons = [];
    // interests
    const wants = p.interests || [];
    const totalW = Object.values(career.interests).reduce((a, b) => a + b, 0);
    let got = 0; const hit = [];
    for (const k of wants) if (career.interests[k]) { got += career.interests[k]; hit.push(D.INTERESTS[k]); }
    const interestFit = wants.length ? clamp(got / Math.min(totalW, 4), 0, 1) : 0.4;
    if (hit.length) reasons.push('Matches your interest in ' + hit.slice(0, 3).join(', '));
    // style
    const keys = Object.keys(D.STYLES);
    const diff = keys.reduce((s, k) => s + Math.abs((p.style?.[k] ?? 3) - career.style[k]), 0) / (keys.length * 4);
    const styleFit = 1 - diff;
    const close = keys.filter((k) => Math.abs((p.style?.[k] ?? 3) - career.style[k]) <= 1 && career.style[k] >= 4)
      .map((k) => D.STYLES[k].toLowerCase());
    if (close.length) reasons.push('Rewards ' + close.slice(0, 2).join(' and ') + ', which you rated highly');
    // skills
    let skillFit = 0.4; let have = [];
    const reqs = Object.entries(career.reqs);
    if (state.assessed) {
      const need = reqs.reduce((s, [, n]) => s + n, 0);
      const owned = reqs.reduce((s, [id, n]) => s + Math.min(state.skills[id] || 0, n), 0);
      skillFit = owned / need;
      have = reqs.filter(([id, n]) => (state.skills[id] || 0) >= Math.min(n, 2) && (state.skills[id] || 0) > 0)
        .sort((a, b) => (state.skills[b[0]] || 0) - (state.skills[a[0]] || 0)).slice(0, 2).map(([id]) => D.SKILLS[id].name);
      if (have.length) reasons.push('You already have a head start in ' + have.join(' and '));
    }
    const score = Math.round(100 * (interestFit * 0.45 + styleFit * 0.25 + skillFit * 0.3));
    if (!reasons.length) reasons.push('A broad option worth exploring while you decide');
    return { id: career.id, title: career.title, score: clamp(score, 1, 99), reasons, parts: { interest: Math.round(interestFit * 100), style: Math.round(styleFit * 100), skills: state.assessed ? Math.round(skillFit * 100) : null } };
  }

  function rankCareers(state) {
    return D.CAREERS.map((c) => scoreCareer(c, state)).sort((a, b) => b.score - a.score);
  }

  // Skills the student needs to develop for a career, largest gap first.
  function skillGaps(career, skills) {
    return Object.entries(career.reqs).map(([id, need]) => {
      const have = skills[id] || 0;
      return { id, name: D.SKILLS[id].name, have, need, gap: Math.max(0, need - have) };
    }).sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name));
  }

  // Roadmap: one milestone per skill gap, ordered foundations -> core -> advanced, then a capstone.
  // Task ids are stable ("career:skill:n"), so changing goals keeps completed work.
  function buildRoadmap(state) {
    const career = D.CAREERS.find((c) => c.id === state.career);
    if (!career) return null;
    const hours = clamp(Number(state.profile.hours) || 5, 1, 40);
    // Plan from the ratings at assessment time, so raising a rating after finishing a milestone
    // does not make that milestone (and its progress) disappear.
    const base = state.baseSkills || state.skills;
    const hasDone = (id) => Object.keys(state.done || {}).some((k) => k.startsWith(career.id + ':' + id + ':'));
    const gaps = skillGaps(career, base).map((g) => (g.gap === 0 && hasDone(g.id) ? Object.assign(g, { gap: 1, have: g.need - 1 }) : g)).filter((g) => g.gap > 0)
      .sort((a, b) => D.SKILLS[a.id].order - D.SKILLS[b.id].order || b.gap - a.gap);
    const phases = [{ n: 1, name: 'Foundations' }, { n: 2, name: 'Core skills' }, { n: 3, name: 'Advanced & applied' }];
    const milestones = gaps.map((g) => {
      const s = D.SKILLS[g.id];
      const est = g.gap * s.hpl;
      const key = career.id + ':' + g.id;
      return {
        id: key, skill: g.id, title: 'Reach "' + D.LEVELS[g.need] + '" in ' + s.name, phase: s.order,
        from: g.have, to: g.need, hours: est, weeks: Math.max(1, Math.ceil(est / hours)),
        why: g.have === 0 ? career.title + ' requires ' + s.name + ' and you have not started it yet.'
          : 'You rated yourself "' + D.LEVELS[g.have] + '"; this role needs "' + D.LEVELS[g.need] + '".',
        resources: s.res,
        tasks: [
          { id: key + ':1', text: 'Learn: work through ' + s.res[0].title, hours: Math.round(est * 0.5) },
          { id: key + ':2', text: 'Practice: do small exercises on ' + s.name + ' until you can do them without notes', hours: Math.round(est * 0.25) },
          { id: key + ':3', text: 'Project: ' + s.project, hours: Math.round(est * 0.25) },
        ],
      };
    });
    const capHours = 25;
    milestones.push({
      id: career.id + ':capstone', skill: null, title: 'Capstone project', phase: 4, from: 0, to: 0, hours: capHours,
      weeks: Math.max(1, Math.ceil(capHours / hours)), why: 'A finished project is the clearest proof of your skills.', resources: [],
      tasks: [
        { id: career.id + ':capstone:1', text: 'Plan: ' + career.capstone, hours: 5 },
        { id: career.id + ':capstone:2', text: 'Build the first working version', hours: 15 },
        { id: career.id + ':capstone:3', text: 'Publish it (GitHub or a portfolio page) and ask two people for feedback', hours: 5 },
      ],
    });
    let week = 0;
    for (const m of milestones) { m.startWeek = week + 1; week += m.weeks; m.endWeek = week; }
    const totalHours = milestones.reduce((a, m) => a + m.hours, 0);
    return { career, phases, milestones, totalHours, totalWeeks: week, hoursPerWeek: hours };
  }

  function progress(state, road) {
    const done = state.done || {};
    const tasks = road.milestones.flatMap((m) => m.tasks);
    const doneTasks = tasks.filter((t) => done[t.id]);
    const hoursDone = doneTasks.reduce((a, t) => a + t.hours, 0);
    const doneMs = road.milestones.filter((m) => m.tasks.every((t) => done[t.id]));
    return { percent: tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0, tasksDone: doneTasks.length, tasksTotal: tasks.length, hoursDone, doneMilestones: doneMs, next: road.milestones.find((m) => !doneMs.includes(m)) };
  }

  // Compare plan length to the student's goal (weeks) and say what would be needed.
  function pace(state, road) {
    const goal = Number(state.profile.weeks) || 0;
    const prog = progress(state, road);
    const remainingHours = Math.max(0, road.totalHours - prog.hoursDone);
    const hrs = road.hoursPerWeek;
    const weeksNeeded = Math.ceil(remainingHours / hrs);
    if (!goal) return { status: 'none', weeksNeeded, text: 'About ' + weeksNeeded + ' weeks remain at ' + hrs + ' h/week.' };
    const elapsed = state.startedAt ? Math.floor((Date.now() - state.startedAt) / 6048e5) : 0;
    const left = Math.max(1, goal - elapsed);
    if (weeksNeeded <= left) return { status: 'ok', weeksNeeded, text: 'On track: about ' + weeksNeeded + ' weeks of work remain and you have ' + left + ' weeks to your goal.' };
    const need = Math.ceil(remainingHours / left);
    return { status: 'behind', weeksNeeded, needHours: need, text: 'To finish in ' + left + ' weeks you would need about ' + need + ' h/week (you planned ' + hrs + '). Consider more time, a later goal date, or fewer skills.' };
  }

  // Demo-mode coaching: templates filled from the student's real data. NOT AI-generated.
  function demoAdvice(state, task) {
    const ranked = rankCareers(state);
    const top = ranked.slice(0, 3);
    const p = state.profile;
    if (task === 'roadmap_review') {
      const road = buildRoadmap(state);
      if (!road) return { headline: 'Pick a career first.', explanations: [], next_steps: ['Choose a career on the Careers page.'], watch_outs: [] };
      const pr = progress(state, road); const pc = pace(state, road);
      return {
        headline: pr.percent === 0 ? 'Start with one small task this week.' : pr.percent + '% done. Keep the rhythm going.',
        explanations: [{ title: 'Pace check', detail: pc.text }, { title: 'Next milestone', detail: pr.next ? pr.next.title + ' (about ' + pr.next.hours + ' hours).' : 'All milestones complete.' }],
        next_steps: pr.next ? pr.next.tasks.filter((t) => !state.done[t.id]).slice(0, 3).map((t) => t.text) : ['Update your skill ratings and pick a stretch goal.'],
        watch_outs: pc.status === 'behind' ? ['You may be over-scheduled. Adjust your goal on this page rather than skipping tasks.'] : [],
      };
    }
    return {
      headline: top[0].title + ' looks like your strongest fit right now.',
      explanations: top.map((t) => ({ title: t.title + ' (' + t.score + '/100)', detail: t.reasons.join('. ') + '.' })),
      next_steps: ['Open the ' + top[0].title + ' page and review the skills to develop.', 'Pick one career to build a roadmap for. You can change it later.', 'Plan around ' + (p.hours || 5) + ' hours a week; start with the first Foundations task.'],
      watch_outs: state.assessed ? [] : ['You have not rated your skills yet, so these scores assume a neutral skill level.'],
    };
  }

  function makeCoachPayload(state, task, question) {
    const ranked = rankCareers(state);
    const career = D.CAREERS.find((c) => c.id === state.career);
    const road = career ? buildRoadmap(state) : null;
    const pr = road ? progress(state, road) : null;
    return {
      task, question: question || '',
      profile: { name: '', study: state.profile.study, year: state.profile.year, interests: (state.profile.interests || []).map((k) => D.INTERESTS[k]), hours: state.profile.hours, weeks: state.profile.weeks, style: state.profile.style },
      skills: state.assessed ? Object.entries(state.skills).filter(([, v]) => v > 0).map(([id, v]) => ({ skill: D.SKILLS[id].name, level: v })) : [],
      matches: ranked.slice(0, 5).map((r) => ({ career: r.title, score: r.score, reasons: r.reasons })),
      selectedCareer: career ? career.title : '',
      gaps: career ? skillGaps(career, state.skills).filter((x) => x.gap > 0).map((x) => ({ skill: x.name, have: x.have, need: x.need })) : [],
      progress: pr ? { percentDone: pr.percent, completedMilestones: pr.doneMilestones.map((m) => m.title), onTrack: pace(state, road).text } : {},
    };
  }

  g.OrbitEngine = { scoreCareer, rankCareers, skillGaps, buildRoadmap, progress, pace, demoAdvice, makeCoachPayload };
})(typeof window !== 'undefined' ? window : globalThis);
