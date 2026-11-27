# Orbit: AI-assisted career development for students

Orbit helps a student explore careers, rate their skills, see what to learn for a chosen role, follow a step-by-step roadmap with projects and milestones, and track progress while adjusting goals.

It works fully **without an API key** (demo mode). If you add a key, an optional AI coach explains your matches and reviews your progress.

## Quick start

Requires Node.js 22.13 or newer (the account database uses the built-in `node:sqlite`, which Node still labels experimental).

```bash
npm install          # optional: AI mode (Anthropic SDK) and real email delivery (nodemailer). Demo mode needs nothing
npm start            # http://localhost:3000
```

Optional AI mode (key stays on the server, never in browser code):

```bash
export ANTHROPIC_API_KEY=your-key
export ANTHROPIC_MODEL=claude-opus-5-5   # optional, this is the default
npm start
```

Other settings: `PORT` (default 3000), plus the account and production settings below. Copy `.env.example` for reference; the server reads real environment variables, not a `.env` file.

## Tests

```bash
npm test                       # logic, unit, security, account/OAuth/SMTP, AI-proxy and hardening tests (about 2 minutes)
pip install playwright && playwright install chromium && npm i --no-save axe-core
npm run test:e2e               # real browser: every page, sign-up/confirm/reset flow, sync, WCAG A/AA scan (BROWSER=firefox|webkit to switch)
ANTHROPIC_API_KEY=... node tools/check-ai.mjs     # one real AI call through the server's own code (spends a few cents)
node tools/check-providers.mjs                    # compares our sign-in URLs with what Google, Microsoft, Apple and Facebook publish
```

`.github/workflows/test.yml` runs all of this on every push, with the browser test in Chromium, Firefox and WebKit.

## Screenshots and demo

| | |
|---|---|
| ![Welcome](docs/01-welcome.png) | ![Careers](docs/03-careers.png) |
| ![Assessment with quick check](docs/05-assessment.png) | ![Roadmap](docs/07-roadmap.png) |
| ![Sign in](docs/10-login.png) | ![Exam setup](docs/11-exam-setup.png) |
| ![Exam question](docs/12-exam-question.png) | ![Progress dashboard (sample data)](docs/08-progress.png) |
| ![Dark mode (optional)](docs/09-dark-mode.png) | |

- Video walkthrough: [docs/orbit-demo.webm](docs/orbit-demo.webm)
- Pitch deck: [docs/Orbit-pitch-deck.pptx](docs/Orbit-pitch-deck.pptx)

The interface is light by default. A toggle in the top bar switches to dark mode and remembers the choice on that device.

## Pages (every action has its own URL)

| Page | What it does |
|---|---|
| `index.html` | Welcome for new users. Afterwards a dashboard that opens with a three-part career snapshot (where you stand, what to develop, what to do next; all rule-based, labelled as such), top fits, plan and readiness |
| `onboarding.html` | Name, studies, interests, work-style sliders, weekly hours, goal weeks |
| `careers.html` | 15 careers ranked by fit, each with reasons |
| `career.html?id=…` | Role detail, required skills, choose this career |
| `login.html` | Sign in with Google, Microsoft, Facebook, Apple or email, or continue as a guest |
| `exam.html` | Personalised exam: pick scope (roadmap, gaps, whole career, chosen skills), size, difficulty, timer, bank or AI questions |
| `assessment.html` | Self-rate 31 skills, with optional 3-question quick checks for 10 of them (0 to 4) |
| `gaps.html` | Skills to develop for the chosen career, biggest gaps first |
| `roadmap.html` | Milestones in phases, tasks, projects, resource links, capstone |
| `progress.html` | Career-readiness score (rule-based: skills 50%, roadmap 30%, exams 20%, parts not yet measured are left out), then a LeetCode-style dashboard: activity heatmap, streaks, roadmap ring, tasks over time, exam scores, achievements; adjust career/hours/goal, notes. Add `?sample=1` to preview with made-up data |
| `portfolio.html` | Finished roadmap projects with an optional https link and reflection; copy as Markdown or print to PDF |
| `privacy.html` | Plain-language list of what is stored, where, and how to delete it |
| `settings.html` | Edit profile, download data, erase data, manage sign-in methods and devices |

Every page opens for guests with its own content. Only the Home page shows the welcome; other pages show empty states or neutral defaults until you set a profile.

## Sign-in and saved data

Guests keep progress in this browser only. Signed-in users get progress saved on the server and merged across devices (see "Sync" below).

| Method | Status |
|---|---|
| Email + password | Needs email delivery: on `localhost` the confirmation and reset links are printed in the server console; in production set `SMTP_URL` (below). Passwords are hashed with scrypt. |
| Google, Microsoft, Facebook, Apple | Standard OAuth 2.0 authorization-code flow. **Each button turns on only when you add that provider's keys.** Greyed-out buttons are providers not set up on this server. |

**Email accounts:** sign-up sends a one-time link (24 h) and the account cannot sign in until it is opened. "Forgot password" sends a one-hour link that signs out every device. Sign-up, resend and forgot-password answer identically whether or not the address exists, and at most 3 emails per address per hour are sent. Eight wrong passwords lock an address for 15 minutes; the lock is stored in the database, so a restart does not clear it. Links carry their token after `#`, so it never reaches server logs and is removed from the address bar.

**Linking:** Google and Apple sign-ins join an existing account only when the provider says the email is verified. Microsoft and Facebook emails are never trusted for that, so those sign-ins make their own account, and you link them yourself from Settings while signed in. An unconfirmed email sign-up for an address is deleted when the real owner proves it through Google or Apple.

**Settings** shows linked sign-in methods, a password change (signs out other devices), every signed-in device with a "sign out" button, "sign out everywhere", and account deletion.

**Sync:** each account has a revision number. A save is accepted only if it was made from the latest revision; otherwise the server returns its copy and the browser merges (newest profile and ratings win, ticked tasks, activity days, exams and notes are combined) and retries. Nothing is silently overwritten and a wrong device clock cannot win. The server validates every save: unknown keys are dropped, numbers clamped, ids checked against the catalogue, 200 KB cap, 60 saves per minute.

**Storage:** SQLite file (`data/orbit.db`, git-ignored, one server process). Emails, names and progress are encrypted with AES-256-GCM using `ORBIT_DATA_KEY`; emails are looked up through a keyed hash. Passwords are salted scrypt hashes. Provider tokens are never stored. An old `data/orbit.json` from an earlier version is imported once and renamed `.migrated`.

The OAuth code is tested against a local mock identity provider (`test/auth.test.mjs`): state and cookie binding, code exchange, Apple `id_token` issuer/audience/nonce/expiry checks, linking rules, squatter removal. **It has not been run against the real Google, Microsoft, Facebook or Apple servers**, because that needs your own registered apps and a public HTTPS URL. `tools/check-providers.mjs` confirms our URLs match what the providers publish today (Facebook uses Graph API v26.0; override with `FACEBOOK_API_VERSION`). Test each provider yourself after setting it up.

### Settings (environment variables)

```
BASE_URL=https://your-domain            # defaults to http://localhost:PORT; register BASE_URL/auth/<provider>/callback with each provider
ORBIT_DATA_KEY=                         # REQUIRED in production: 64 hex chars. node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SMTP_URL=smtps://user:pass@smtp.example.com:465   MAIL_FROM="Orbit <no-reply@your-domain>"   # needs `npm install` (nodemailer)
GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID= MICROSOFT_CLIENT_SECRET=   # MICROSOFT_TENANT optional, default "common"
FACEBOOK_APP_ID= FACEBOOK_APP_SECRET=           # FACEBOOK_API_VERSION optional, default v26.0
APPLE_CLIENT_ID= APPLE_TEAM_ID= APPLE_KEY_ID= APPLE_PRIVATE_KEY=   # Apple needs a paid developer account
TRUST_PROXY=1                           # only when exactly one reverse proxy sits in front: use its X-Forwarded-For for rate limits
ORBIT_AI_DAILY_LIMIT=300  ORBIT_AI_USER_DAILY=30  ORBIT_AI_USER_PER_MIN=6   # AI call budgets (see below)
```

Production rules the server enforces: `BASE_URL` must be https (or the server refuses to start), `ORBIT_DATA_KEY` must be set, cookies get the `Secure` flag and the `__Host-` prefix, `Strict-Transport-Security` is sent, and with no `SMTP_URL` email sign-up is switched off (social sign-in still works) instead of creating accounts nobody can verify. Terminate TLS at your host or proxy. (Because of these rules, opening the app from a phone over plain `http://192.168...` is not supported; use `localhost` or an https tunnel.)

## Personalised exams

`exam.html` builds a test from your own state: skills in unfinished roadmap milestones, your gaps, everything your career needs, or skills you pick. Questions come from a hand-written bank (`public/js/bank.js`), weighted toward your level; difficulty can adapt. With an API key you can choose **AI-written questions**, which are labelled as such and may contain mistakes. Grading is always done by Orbit. After an exam it can suggest changing a skill rating; you decide.

## Reference: React sign-in component

`reference/react-sign-in/` holds the shadcn/Tailwind/TypeScript `SignInPage` component you supplied, plus setup notes. **This app is plain HTML/JS, so that component is not used at runtime.** `login.html` re-creates its look (split layout, glass inputs, password toggle) in plain CSS. The testimonial cards were replaced by feature cards, because the demo testimonials were invented people.

## What is AI and what is not

| Feature | Source |
|---|---|
| Career fit scores and the "why" bullets | **Rule-based** (`public/js/engine.js`): 45% interests, 25% work style, 30% skills |
| Skill gaps, roadmap, hours, week estimates, progress, pace | **Rule-based** |
| Careers, skills, requirements, resources, project ideas | **Hand-written sample data** (`public/js/data.js`) |
| Coaching panel on Careers and Progress pages | **AI (Claude)** when a key is set, otherwise **rule-based templates** |

Every coaching panel and the header badge say which of the two you are seeing ("AI-generated by Claude" vs "Demo mode: rule-based text, not AI"). If an AI call fails, the app falls back to demo text and says so.

## How AI is wired

- The browser calls `POST /api/coach` (or `/api/exam` for AI-written questions) on this server. The server holds the key and calls the official `@anthropic-ai/sdk`. **Only signed-in users can use AI**, because every call costs money; guests get the free rule-based demo text.
- Requests are validated and size-capped (60 KB). Budgets: 6 calls per user per minute, 30 per user per day, 300 per server per UTC day (stored in the database, so a restart does not reset them); a failed upstream call is refunded. Only a trimmed summary is sent, the student's name is **not**, and skills, careers and interests are accepted only if they match the built-in catalogue, so free text cannot reach the prompt except the optional question (angle brackets removed, 300 chars).
- Output uses a JSON schema (`output_config.format`) and is clipped before being returned.
- `GET /api/status` tells the page whether AI is on.

## Project layout

```
server.js            static server + /api/status, /api/coach, /api/exam (no framework)
lib/auth.js          OAuth, email sign-in, sessions, /api/data sync
lib/db.js            SQLite store (encrypted fields, sessions, tokens, lockouts, AI budget)
lib/crypto.js        key handling, AES-GCM, keyed hashes
lib/guard.js         client IP, rate limiter, CSRF check
lib/validate.js      server-side check of the progress data
lib/mail.js          SMTP / dev-console email
lib/ai.js            Anthropic calls, prompt input allow-lists
lib/config.js        environment settings
tools/               e2e browser test, AI and provider checks, icon builder
public/*.html        one page per action
public/js/data.js    sample careers, skills, resources
public/js/engine.js  scoring, gaps, roadmap, progress, demo coaching (pure functions)
public/js/app.js     shared shell, storage, AI/demo coaching client
public/js/<page>.js  one small script per page
test/*.test.mjs      logic, unit, security, account and AI-proxy tests
```

Performance: no framework, no web fonts, no build step, gzip and ETag caching on the server, small deferred scripts per page.

## Security

- API key is read from the environment only; no key or secret is ever written into a page, script or response (checked by `test/security.test.mjs`).
- Strict Content-Security-Policy (`script-src 'self'`, `style-src 'self'` with no inline scripts or styles, `object-src 'none'`, no external resources), `X-Frame-Options: DENY`, `nosniff`, no-referrer, and a restrictive Permissions-Policy.
- Only the `public/` folder is served; traversal attempts, source files and dotfiles return errors.
- Sign-in: scrypt hashes, HttpOnly + SameSite cookies (`__Host-` and `Secure` in production), signed OAuth `state` bound to a cookie, Apple `id_token` claims checked, email confirmation and reset by single-use hashed tokens, no account enumeration, persisted lockout, session list and revocation.
- State-changing calls need the `X-Orbit` header, a matching `Origin`, and `Sec-Fetch-Site: same-origin` when the browser sends it.
- Rate limits are per client (IPv4 address or IPv6 /64) with bounded memory; blocked clients stay blocked when the table is flooded. Behind a proxy set `TRUST_PROXY=1` or every user shares one limit.
- `/api/coach` and `/api/exam`: signed-in only, POST only, 60 KB cap, budgets above, input allow-listed, output clipped; model output is HTML-escaped in the browser.
- Data at rest: AES-256-GCM for emails, names and progress (checked by reading the raw database file in `test/auth.test.mjs`).
- Everything the student types is escaped before display. Portfolio links must be `https://` with no credentials; the server drops anything else.
- Passwords: scrypt at the OWASP cost (N=2^16, r=8, p=2) with the parameters stored in each hash; older hashes are upgraded at the next sign-in; common passwords are refused; at most 2 hashes run at once so a flood cannot exhaust memory.
- Email links (confirm, reset) are single use. Confirming also asks for the sign-up password, so a stranger's sign-up mail cannot be confirmed by the real owner by accident. Deleting an account or removing a sign-in method needs the password (or a sign-in within 15 minutes for social-only accounts).
- Lockout is per account and client (8 failures) plus a per-account cap (40), so a stranger cannot lock you out of your own account, and spread-out guessing is still capped.
- Email is capped per address (3/hour), per client (`ORBIT_MAIL_IP_HOURLY`) and per day for the whole server (`ORBIT_MAIL_DAILY`); at most 10 sessions per account.
- Encryption: each value is bound to its row and column (AAD), so swapped ciphertexts do not decrypt. Key rotation: set the new key in `ORBIT_DATA_KEY`, the old one in `ORBIT_DATA_KEY_OLD`, restart once (rows are re-sealed), then remove the old key.
- Dev mode (plain-http localhost) listens on `127.0.0.1` only and refuses to start if `HOST` is public. Behind a proxy with `TRUST_PROXY=1`, plain-http requests are redirected to https. The old plaintext JSON import file is deleted after it is imported.
- `/api/status` reveals only whether AI, email and each provider are on.

## Verified

- `npm test` (all pass, including `test/hardening.test.mjs`): scoring and roadmap logic, limiter/validator units, security headers and traversal, accounts (mock identity provider, SMTP delivery through a fake mail server, production flags, lockout across restart, sync conflicts, encryption at rest, migration), AI proxy against a fake upstream (sign-in required, budgets, refunds, prompt allow-lists).
- `npm run test:e2e` in **Chromium**: every page opens for guests, onboarding, careers, exam, progress, sign-up with email confirmation, sign-in, password reset, cross-browser sync, sign-out, no horizontal scroll at 390 px, **no WCAG 2.0/2.1 A and AA violations found by axe-core on all pages in light and dark**.

## Limitations

- **Not run against real services:** the Google, Microsoft, Facebook and Apple sign-in (mock-tested only), real SMTP providers (tested against a fake SMTP server), and the live Anthropic API (tested against a fake upstream). `tools/check-ai.mjs` and the steps above let you verify each in minutes.
- **Firefox and WebKit** are exercised only by the GitHub Actions matrix; I could run only Chromium here. **Screen readers** were not tested by a person; axe-core catches rule-based problems, not whether the experience makes sense when spoken.
- One server process only (SQLite file, in-memory rate limits). Run several instances and you need a shared database and limiter. `node:sqlite` is marked experimental by Node.
- The encryption key sits in an environment variable on the same host. It protects a leaked database file or backup, not a compromised server.
- Apple's `id_token` signature is not re-checked (allowed by the OIDC spec for a token fetched directly from Apple over TLS); its claims are. GitHub Actions are pinned to major versions, not commit hashes (Dependabot keeps them current).
- No two-factor sign-in, no CAPTCHA, no email-change flow, and no admin tools. A determined attacker with many IP addresses can still send many sign-in attempts; the per-account lockout limits the damage but also lets someone lock a known address for 15 minutes.
- Skill levels are self-reported; fit scores are a rough guide, not a validated assessment.
- Hour estimates are rough averages. Resource links were opened and checked on 2026-11-24 but may change or move; they are not endorsements.
- Only 15 careers and 31 skills are included. No salary or job-market data is shown, on purpose.
- The AI coach cannot browse the web and sees only the summary the app sends.
- Static hosting (for example GitHub Pages) works in demo mode only; accounts and AI need the Node server.

## Hackathon submission

Publish this repository on GitHub and submit its public URL through the Unstop competition portal before the deadline.
