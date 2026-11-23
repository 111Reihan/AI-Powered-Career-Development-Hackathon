import assert from 'node:assert/strict';
import '../public/js/data.js';
import '../public/js/engine.js';
const D = globalThis.OrbitData, E = globalThis.OrbitEngine;
const base = () => ({ profile: { name: 'T', interests: ['data', 'ai'], style: { analytical: 5, creative: 2, social: 2, technical: 4 }, hours: 5, weeks: 20 }, skills: {}, done: {}, assessed: false, career: null, startedAt: Date.now() });

// every career requirement references a real skill, and every skill has resources
for (const c of D.CAREERS) for (const id of Object.keys(c.reqs)) assert.ok(D.SKILLS[id], `${c.id} -> ${id}`);
for (const [id, s] of Object.entries(D.SKILLS)) assert.ok(s.res.length && s.hpl > 0, id);

// ranking is sorted, bounded, explained
let r = E.rankCareers(base());
assert.equal(r.length, D.CAREERS.length);
assert.ok(r.every((x, i) => x.score >= 1 && x.score <= 99 && x.reasons.length && (i === 0 || r[i - 1].score >= x.score)));
assert.ok(['data-scientist', 'ml-engineer', 'data-analyst'].includes(r[0].id), 'data/AI interests -> data career first, got ' + r[0].id);

// different interests change the answer (real personalisation)
const d = base(); d.profile.interests = ['design', 'people']; d.profile.style = { analytical: 2, creative: 5, social: 4, technical: 2 };
assert.equal(E.rankCareers(d)[0].id, 'product-designer');

// skills raise fit; assessment weighting
const s = base(); s.assessed = true; s.skills = { python: 4, stats: 3, sql: 3, ml: 3, math: 3, viz: 2, comm: 2, git: 2 };
const ds = D.CAREERS[0];
assert.ok(E.scoreCareer(ds, s).score > E.scoreCareer(ds, base()).score);

// gaps
const g = E.skillGaps(ds, { python: 3, stats: 1 });
assert.equal(g.find((x) => x.id === 'python').gap, 0);
assert.equal(g.find((x) => x.id === 'stats').gap, 2);
assert.ok(g[0].gap >= g[g.length - 1].gap);

// roadmap: milestones only for gaps + capstone; stable ids; hours/weeks consistent
const st = base(); st.career = 'data-scientist'; st.assessed = true; st.skills = { python: 3 };
let road = E.buildRoadmap(st);
assert.ok(!road.milestones.some((m) => m.skill === 'python'));
assert.equal(road.milestones.at(-1).id, 'data-scientist:capstone');
assert.equal(road.totalHours, road.milestones.reduce((a, m) => a + m.hours, 0));
assert.ok(road.milestones.every((m, i) => m.startWeek === (i ? road.milestones[i - 1].endWeek + 1 : 1)));
const ids = road.milestones.flatMap((m) => m.tasks.map((t) => t.id)); assert.equal(new Set(ids).size, ids.length);

// progress survives goal changes
st.done[ids[0]] = 'x'; st.done[ids[1]] = 'x';
st.profile.hours = 10; const road2 = E.buildRoadmap(st);
assert.ok(road2.totalWeeks < road.totalWeeks);
assert.equal(E.progress(st, road2).tasksDone, 2);
assert.equal(E.progress(st, road2).percent, Math.round(2 / ids.length * 100));

// raising a rating after finishing a milestone keeps the milestone and its progress
const keep = base(); keep.career = 'data-scientist'; keep.assessed = true; keep.skills = {}; keep.baseSkills = {};
const k1 = E.buildRoadmap(keep); const m0 = k1.milestones[0];
m0.tasks.forEach((t) => { keep.done[t.id] = 'x'; }); keep.skills[m0.skill] = m0.to;
const k2 = E.buildRoadmap(keep);
assert.equal(k2.milestones.length, k1.milestones.length);
assert.equal(E.progress(keep, k2).doneMilestones.length, 1);
// switching career is safe, no tasks from the old career count
st.career = 'data-analyst'; assert.equal(E.progress(st, E.buildRoadmap(st)).tasksDone, 0);

// pace + demo advice never throw and are plain text
st.career = 'data-scientist';
assert.match(E.pace(st, E.buildRoadmap(st)).text, /\w/);
for (const t of ['career_advice', 'roadmap_review']) { const a = E.demoAdvice(st, t); assert.ok(a.headline && Array.isArray(a.next_steps)); }
assert.deepEqual(Object.keys(E.makeCoachPayload(st, 'career_advice')).sort(), ['gaps', 'matches', 'profile', 'progress', 'question', 'selectedCareer', 'skills', 'task']);
assert.equal(E.makeCoachPayload(st, 'career_advice').profile.name, '', 'name is not sent to the AI');
console.log('engine tests passed');
