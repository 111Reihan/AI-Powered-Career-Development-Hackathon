# Browser end-to-end check. Usage: python3 tools/e2e.py http://localhost:3300
# Env: ORBIT_LOG = file with the server's console output (dev-mode emails are read from it); BROWSER = chromium|firefox|webkit;
#      AXE_PATH = path to axe.min.js (adds an automated accessibility scan of every page).
import sys, time, os, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1]; errors = []; fails = 0
def ok(c, m):
    global fails
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails += 1
def watch(pg):
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('response', lambda r: errors.append(f'HTTP {r.status} {r.request.method} {r.url}') if r.status == 403 else None)
    pg.on('requestfailed', lambda r: errors.append('reqfail ' + r.url))
PAGES = ['index', 'onboarding', 'careers', 'assessment', 'exam', 'gaps', 'roadmap', 'progress', 'settings', 'login']
with sync_playwright() as p:
    b = getattr(p, os.environ.get('BROWSER', 'chromium')).launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page(); watch(pg)
    for n in PAGES:
        pg.goto(f'{BASE}/{n}.html'); pg.wait_for_selector('#view h1, #view h2, .page-head h1, .split h1', timeout=5000)
        ok(pg.url.endswith(f'/{n}.html'), f'guest can open {n}.html without a redirect')
    pg.goto(BASE + '/'); pg.wait_for_selector('#view .hero')
    ok('Get started' in pg.inner_text('#view'), 'home shows welcome')
    pg.goto(BASE + '/roadmap.html'); pg.wait_for_selector('#view')
    ok('onboarding' not in pg.url and 'guest' in pg.inner_text('body').lower(), 'roadmap shows its own guest state, not the details form')
    # onboarding -> careers
    pg.goto(BASE + '/onboarding.html'); pg.fill('#name', 'Priya Sharma'); pg.fill('#study', 'Computer science'); pg.select_option('#year', 'Year 2')
    pg.fill('#hours', '6'); pg.check('input[value=data]'); pg.check('input[value=ai]'); pg.fill('#weeks', '20'); pg.click('button[type=submit]')
    pg.wait_for_url('**/careers.html'); pg.wait_for_selector('#list .card')
    ok(pg.locator('#list .card').count() == 15, '15 careers listed')
    ok(pg.locator('#list .logo, #list svg').count() > 10, 'career cards show logos')
    pg.locator('#list h2 a').first.click(); pg.wait_for_selector('#choose'); pg.click('#choose'); time.sleep(.3)
    # exam, gaps scope
    pg.goto(BASE + '/exam.html'); pg.wait_for_selector('#setup')
    ok(pg.locator('input[name=scope]').count() >= 4, 'exam offers scopes tied to the chosen career')
    pg.check('input[name=scope][value=gaps]'); pg.select_option('#count', '5'); pg.click('#setup button[type=submit]')
    for i in range(5):
        pg.wait_for_selector('input[name=a]'); pg.locator('input[name=a]').first.check(); pg.click('#next')
    pg.wait_for_selector('text=correct (')
    ok('%' in pg.inner_text('#view'), 'exam finishes with a score')
    # progress
    pg.goto(BASE + '/progress.html'); pg.wait_for_selector('#view svg')
    t = pg.inner_text('#view'); ok('streak' in t.lower(), 'progress shows streak'); ok(pg.locator('svg.hm-svg').count() >= 1, 'progress shows heatmap')
    # register -> data synced -> new browser context sees it
    ctx2 = b.new_context(); pg2 = ctx2.new_page(); watch(pg2)
    email = f'e2e{int(time.time())}@example.com'
    LOG = os.environ.get('ORBIT_LOG')
    def mail_token(kind, n=-1):
        for _ in range(60):
            t = re.findall(r'#' + kind + r'=([A-Za-z0-9_-]+)', open(LOG).read())
            if t: return t[n]
            time.sleep(.1)
        raise Exception('no ' + kind + ' email in server log')
    pg.goto(BASE + '/login.html'); pg.wait_for_selector('#emailForm'); pg.click('[data-mode=up]')
    pg.fill('#nm', 'Priya'); pg.fill('#em', email); pg.fill('#pw', 'correct horse 9'); pg.click('#sub')
    pg.wait_for_selector('text=we have sent an email'); ok(True, 'sign-up asks the user to confirm the email')
    pg.goto(BASE + '/login.html'); pg.wait_for_selector('#emailForm'); pg.fill('#em', email); pg.fill('#pw', 'correct horse 9'); pg.click('#sub')
    pg.wait_for_selector('#ferr:not([hidden])'); ok('confirm' in pg.inner_text('#ferr').lower(), 'unconfirmed account cannot sign in')
    pg.goto(BASE + '/login.html#verify=' + mail_token('verify')); pg.wait_for_selector('text=Email confirmed')
    ok('#' not in pg.url, 'token removed from the address bar'); ok(True, 'email confirmed through the mailed link')
    pg.fill('#em', email); pg.fill('#pw', 'correct horse 9'); pg.click('#sub'); pg.wait_for_url('**/index.html'); time.sleep(1.5)
    pg.goto(BASE + '/settings.html'); pg.wait_for_selector('#allBtn'); ok(pg.locator('.sess li').count() >= 1, 'settings lists signed-in devices')
    pg.reload(); pg.wait_for_selector('#logoutBtn'); ok(True, 'signed in; sidebar shows Sign out')
    pg2.goto(BASE + '/login.html'); pg2.wait_for_selector('#emailForm')
    pg2.fill('#em', email); pg2.fill('#pw', 'wrong'); pg2.click('#sub'); pg2.wait_for_selector('#ferr:not([hidden])'); ok(True, 'wrong password rejected')
    # forgot + reset through the UI
    pg2.click('[data-mode=forgot]'); pg2.fill('#em', email); pg2.click('#sub'); pg2.wait_for_selector('text=we have sent an email')
    pg2.goto(BASE + '/login.html#reset=' + mail_token('reset')); pg2.wait_for_selector('#pw'); pg2.fill('#pw', 'new horse battery 7'); pg2.click('#sub'); pg2.wait_for_selector('text=Password changed')
    ok(True, 'password reset through the mailed link')
    pg.reload(); pg.wait_for_selector('#account h2'); ok(pg.locator('#logoutBtn').count() == 0, 'reset signed the other device out')
    pg2.fill('#em', email); pg2.fill('#pw', 'new horse battery 7'); pg2.click('#sub'); pg2.wait_for_url('**/index.html'); time.sleep(1)
    pg2.goto(BASE + '/progress.html'); pg2.wait_for_selector('#view svg'); time.sleep(.8)
    ex = pg2.evaluate("JSON.parse(localStorage.getItem('orbit.v2')||'{}').exams?.length||0")
    ok(ex >= 1, f'exam result followed the account to a fresh browser ({ex} exam)')
    pg2.goto(BASE + '/settings.html'); pg2.wait_for_selector('#logoutBtn, #outBtn'); pg2.click('#outBtn'); time.sleep(.8); pg2.goto(BASE + '/settings.html'); pg2.wait_for_selector('#account h2')
    ok(pg2.locator('#logoutBtn').count() == 0, 'sign out works')
    # mobile + dark
    pg3 = b.new_page(viewport={'width': 390, 'height': 844}); watch(pg3)
    for n in ['index', 'careers', 'exam', 'progress', 'login']:
        pg3.goto(f'{BASE}/{n}.html'); pg3.wait_for_selector('#view h1, #view h2, .page-head h1, .split h1')
        ok(pg3.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'{n} has no horizontal scroll at 390px')
    if os.environ.get('AXE_PATH'):
        axe = open(os.environ['AXE_PATH']).read(); pg4 = b.new_page(viewport={'width': 1280, 'height': 900}); watch(pg4)
        for theme in ['light', 'dark']:
            for n in PAGES:
                pg4.goto(f'{BASE}/{n}.html'); pg4.wait_for_selector('#view h1, #view h2, .page-head h1, .split h1')
                pg4.evaluate("t => { document.documentElement.dataset.theme = t }", theme); time.sleep(1.2)  # let entrance animations finish
                pg4.evaluate(axe); res = pg4.evaluate("axe.run({runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa']}).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ')))")
                ok(not res, f'axe ({theme}) {n}.html: ' + (str(res) if res else 'no WCAG A/AA violations'))
    b.close()
bad = [e for e in errors if 'favicon' not in e and '401' not in e and not e.startswith('HTTP 403 POST') and 'status of 403' not in e]  # 401 comes from the deliberate wrong-password check
ok(not bad, 'no console errors or failed requests ' + str(bad[:3]))
print('FAILED' if fails else 'ALL PASSED'); sys.exit(1 if fails else 0)
