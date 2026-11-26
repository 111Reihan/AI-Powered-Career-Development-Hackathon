// One real call to the Anthropic API through the same code the server uses. Run it yourself with your key:
//   ANTHROPIC_API_KEY=sk-ant-... node tools/check-ai.mjs
// It spends a few cents. It prints what came back and exits 1 if the answers do not have the expected shape.
import { hasKey, aiReady, coach, genExam, MODEL } from '../lib/ai.js';
await import('../public/js/data.js'); await import('../public/js/bank.js'); await import('../public/js/engine.js');
if (!hasKey()) { console.error('Set ANTHROPIC_API_KEY first.'); process.exit(2); }
if (!(await aiReady())) { console.error('The SDK is not installed. Run: npm install'); process.exit(2); }
const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
const state = { v: 2, onboarded: true, assessed: true, career: 'data-scientist', startedAt: Date.now() - 14 * 864e5, profile: { name: '', study: 'Computer science', year: 'Year 2', interests: ['data', 'ai'], style: { analytical: 5, creative: 2, social: 3, technical: 4 }, hours: 6, weeks: 20 }, skills: { python: 2, sql: 1, statistics: 1 }, done: {}, activity: {}, notes: [], exams: [], updatedAt: Date.now() };
console.log('model:', MODEL);
const payload = globalThis.OrbitEngine.makeCoachPayload(state, 'career_advice', 'What should I do first?');
const c = await coach(payload).catch((e) => fail('coach threw: ' + (e.status || '') + ' ' + e.message));
if (typeof c.headline !== 'string' || !c.headline || !Array.isArray(c.explanations) || !c.explanations.length || !Array.isArray(c.next_steps)) fail('coach result has the wrong shape: ' + JSON.stringify(c).slice(0, 300));
console.log('coach OK:', c.headline, '|', c.explanations.length, 'explanations,', c.next_steps.length, 'next steps');
const q = await genExam({ count: 3, skills: [{ id: 'python', level: 2 }, { id: 'sql', level: 1 }] }).catch((e) => fail('exam threw: ' + (e.status || '') + ' ' + e.message));
if (!q.length) fail('no valid exam questions came back');
for (const x of q) if (x.o.length !== 4 || !(x.a >= 0 && x.a < 4) || !x.q) fail('bad question: ' + JSON.stringify(x));
console.log('exam OK:', q.length, 'questions, e.g.', q[0].q);
console.log('All AI checks passed.');
