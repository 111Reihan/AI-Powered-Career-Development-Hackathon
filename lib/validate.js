// Server-side shape check for the progress blob. Unknown keys are dropped, values are clamped, ids must be known.
await import('../public/js/data.js'); // defines globalThis.OrbitData (same data the pages use)
const D = globalThis.OrbitData;
const int = (v, min, max, def) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').slice(0, n);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const skillMap = (m) => { const out = {}; for (const [k, v] of Object.entries(obj(m)).slice(0, 200)) if (has(D.SKILLS, k)) out[k] = int(v, 0, 4, 0); return out; };

export const MAX_BYTES = 200_000;
export function normalizeState(d) {
  if (!d || typeof d !== 'object' || d.v !== 2) return null;
  const p = obj(d.profile), st = obj(p.style), now = Date.now();
  const done = {};
  for (const [k, v] of Object.entries(obj(d.done)).slice(0, 3000)) if (/^[a-z0-9:_.-]{1,100}$/i.test(k) && Number.isFinite(Date.parse(v))) done[k] = new Date(Date.parse(v)).toISOString();
  const activity = {};
  for (const k of Object.keys(obj(d.activity)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().slice(-800)) activity[k] = int(d.activity[k], 0, 1000, 0);
  const bySkill = (m) => { const o = {}; for (const [k, v] of Object.entries(obj(m)).slice(0, 60)) if (has(D.SKILLS, k)) o[k] = { n: int(obj(v).n, 0, 100, 0), c: int(obj(v).c, 0, 100, 0) }; return o; };
  return {
    v: 2,
    onboarded: d.onboarded === true, assessed: d.assessed === true,
    career: typeof d.career === 'string' && D.CAREERS.some((c) => c.id === d.career) ? d.career : null,
    startedAt: Number.isFinite(Number(d.startedAt)) && d.startedAt ? int(d.startedAt, 0, now + 60_000, null) : null,
    profile: {
      name: str(p.name, 40), study: str(p.study, 60), year: str(p.year, 20),
      interests: (Array.isArray(p.interests) ? p.interests : []).filter((k) => typeof k === 'string' && has(D.INTERESTS, k)).slice(0, 12),
      style: Object.fromEntries(Object.keys(D.STYLES).map((k) => [k, int(st[k], 1, 5, 3)])),
      hours: int(p.hours, 1, 40, 5), weeks: int(p.weeks, 4, 104, 24),
    },
    skills: skillMap(d.skills),
    ...(d.baseSkills ? { baseSkills: skillMap(d.baseSkills) } : {}),
    done, activity,
    notes: (Array.isArray(d.notes) ? d.notes : []).slice(0, 100).map((n) => ({ t: int(obj(n).t, 0, now + 60_000, 0), text: str(obj(n).text, 600) })),
    exams: (Array.isArray(d.exams) ? d.exams : []).slice(-60).map((e) => { e = obj(e); return { t: int(e.t, 0, now + 60_000, 0), total: int(e.total, 0, 100, 0), correct: int(e.correct, 0, 100, 0), percent: int(e.percent, 0, 100, 0), scope: str(e.scope, 20), src: e.src === 'ai' ? 'ai' : 'bank', bySkill: bySkill(e.bySkill) }; }),
    updatedAt: int(d.updatedAt, 0, now + 60_000, 0),
  };
}
