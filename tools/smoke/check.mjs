/* ==========================================================================
   The console's smoke test.

   It runs from the first commit, before there is a single screen, and that is
   the point: the console IS a shell today, and a shell is the cheapest thing to
   get wrong. A module that throws on import, a router that stops resolving, a
   gate that quietly stops standing in front of the router — none of them fails
   a build, and none is visible in a diff.

   IT WORKS EMPTY AND IT WORKS FULL, on purpose. The console starts with no
   sections and the next change will add one; a suite that only knew the empty
   shape would have to be rewritten on the day it matters most. So it reads
   `app/sections.js` and checks whichever shape it finds there.

   THE FOUR GATED STATES ARE DRIVEN, NOT SIMULATED. The page ships with
   `<meta name="backend">` empty, so on its own it can never reach any of them.
   This suite rewrites that tag to `same-origin` as the document is served and
   answers `/api/session` itself — the console's real fetch, its real branches,
   its real screens. Nothing in the product knows this is happening, and there
   is no test hook left behind in it.

   WHAT IT CHECKS
     the shell        the bar and the brand are painted, whatever else is;
     the navigation   with no sections: no rail at all, no empty column left
                      behind, and a stage that says the console is empty rather
                      than showing an error. With sections: one rail entry each,
                      every route rendering and naming itself, and an unrouted
                      path saying so without taking the rail with it;
     the notice       the banner appears when, and only when, there is no
                      backend configured at all;
     the gate         anonymous gets a form, a signed-in student gets a refusal
                      that names no data, an unreachable API says which two
                      causes look alike, and staff gets the console. And the
                      router does NOT start for any of the first three, which
                      is the difference between a screen that is hidden and a
                      screen whose loader never ran;
     signing in       the form opens the console, a two-factor challenge asks
                      for the code without asking for the password again, and a
                      wrong password says the API's own words and stays put;
     no scrollbar     the shell does not push the page sideways;
     the theme        the toggle applies, stores under the vitrine's key and
                      survives a reload.

   Run it against any static server:

     python3 -m http.server 8899      # at the repository root
     node tools/smoke/check.mjs

     CONSOLE=http://localhost:3000 node tools/smoke/check.mjs
     CHROME=/path/to/chrome
   ========================================================================== */

import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const BASE = process.env.CONSOLE || 'http://127.0.0.1:8899';
const PAGE = process.env.CONSOLE_PAGE || '/index.html';
const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = process.env.CHROME
  || (existsSync(CONTAINER_CHROME) ? CONTAINER_CHROME : undefined);

/* The sections are read from the source rather than written down here: a list
   in two places is a list that disagrees with itself the week somebody adds
   one. An empty registry is a valid answer, and is what the console ships with.
   Only the SECTIONS array is scanned, so an `id:` in the comment above it — the
   example of how to add one — is not counted as a section. */
const source = await readFile(new URL('../../app/sections.js', import.meta.url), 'utf8');
const from = source.indexOf('export const SECTIONS = [');
const array = source.slice(from, source.indexOf('\n]', from) + 2);
const IDS = [...array.matchAll(/\bid:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);

const errors = [];
let failures = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) failures += 1;
  console.log((cond ? '  ok   ' : '  FAIL ') + ' ' + name + (extra ? ' — ' + extra : ''));
};

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctx.newPage();
/* The fonts are the one thing loaded off-site, and whether Google answers is
   not what this suite tests — the portal's own smoke makes the same call. */
await p.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
  route.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {}));
p.on('console', (m) => {
  if (m.type() !== 'error') return;
  /* An aborted request is logged by the browser, not thrown by the page, and
     one scenario below aborts on purpose. Everything else counts. */
  if (/Failed to load resource/.test(m.text())) return;
  errors.push('console: ' + m.text());
});
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

/* ---------- driving the API ----------
   `api.session` is what GET /api/session answers, `api.down` aborts everything,
   and `wired` decides whether the document is rewritten to believe it has a
   backend. Same origin, so no CORS stands between the console and its own
   fetch — and no product code knows any of this is happening. */
const api = { wired: false, session: null, down: false, signedIn: false, mfa: false };

await p.route((url) => url.pathname.endsWith(PAGE), async (route) => {
  if (!api.wired) return route.fallback();
  const res = await route.fetch();
  const body = (await res.text())
    .replace('<meta name="backend" content="" />',
      '<meta name="backend" content="same-origin" />');
  await route.fulfill({ response: res, body, contentType: 'text/html' });
});

await p.route('**/api/**', async (route) => {
  if (api.down) return route.abort('failed');

  const req = route.request();
  const path = new URL(req.url()).pathname;
  const json = (status, value) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  const ana = { name: 'Ana', email: 'ana@codeschool.ing' };

  if (path === '/api/session' && req.method() === 'POST') {
    if (api.mfa) return json(200, { mfaRequired: true });
    api.signedIn = true;
    return json(200, ana);
  }
  if (path === '/api/session/mfa' && req.method() === 'POST') {
    api.mfa = false;
    api.signedIn = true;
    return json(200, ana);
  }
  if (path === '/api/session' && req.method() === 'DELETE') {
    api.signedIn = false;
    return route.fulfill({ status: 204, body: '' });
  }
  if (path === '/api/session') {
    return json(200, api.signedIn ? { ...ana, staff: 'admin' } : api.session);
  }
  return json(404, { error: { code: 'not_found', message: 'no such route' } });
});

/* Opens the console in a named state and waits for the gate to have decided. */
async function open(state) {
  api.wired = true;
  api.session = state.session ?? null;
  api.down = !!state.down;
  api.signedIn = !!state.signedIn;
  api.mfa = !!state.mfa;
  await p.goto(BASE + PAGE);
  await p.waitForFunction(() => !/checking the session/.test(document.body.innerText));
  await p.waitForTimeout(150);
}

const stageText = () => p.locator('#stage').innerText();
/* True when a gate screen is showing — which is exactly when the router was
   never started. The class is the observable form of that decision. */
const gated = () => p.evaluate(() => document.body.classList.contains('gated'));

/* ========================================================================== */

console.log('\n== 1. the shell, with no backend at all ==');
api.wired = false;
await p.goto(BASE + PAGE);
await p.waitForSelector('#stage .view');
await p.waitForTimeout(200);
console.log('   ' + IDS.length + ' section(s) in app/sections.js' +
  (IDS.length ? ': ' + IDS.join(', ') : ''));
ok('the bar says what it is connected to',
  (await p.locator('#bar-state').innerText()).length > 0,
  await p.locator('#bar-state').innerText());
ok('the brand is in the bar', (await p.locator('nav .brand-name').count()) === 1);

console.log('\n== 2. the notice, while there is no backend ==');
ok('the console says it is connected to nothing',
  await p.evaluate(() => !document.getElementById('gate').hidden));
ok('and says it in words, not only in colour',
  /no backend/i.test(await p.locator('#gate').innerText()));
ok('and it no longer claims to have no access control',
  !/no staff role|no access control/i.test(await p.locator('#gate').innerText()),
  'that sentence retired with RequireStaff');
ok('with nothing to call, the console still opens', !(await gated()));

console.log('\n== 3. the navigation ==');
if (IDS.length === 0) {
  ok('no rail is drawn while there are no sections',
    (await p.locator('.rail-link').count()) === 0);
  ok('and no empty column is left behind',
    await p.evaluate(() => document.body.classList.contains('no-rail')
      && getComputedStyle(document.querySelector('.rail')).display === 'none'));
  const stage = await stageText();
  ok('the stage says the console is empty', /console is empty/i.test(stage));
  ok('and says how it grows', /sections\.js/.test(stage));
  ok('and it is not an error page', !/no such screen/i.test(stage));
} else {
  ok('the rail carries every section',
    (await p.locator('.rail-link').count()) === IDS.length,
    (await p.locator('.rail-link').count()) + ' links for ' + IDS.length + ' sections');
  for (const id of IDS) {
    await p.goto(BASE + PAGE + '#/' + id);
    await p.waitForSelector('#stage .view');
    await p.waitForTimeout(120);
    const named = (await p.locator('#stage').getAttribute('aria-label')) || '';
    ok('/' + id + ' renders and names itself', named.length > 0, named);
  }

  console.log('\n== 3b. an unrouted path does not break the shell ==');
  await p.goto(BASE + PAGE + '#/there-is-no-such-screen');
  await p.waitForTimeout(200);
  ok('it says so', /no such screen/i.test(await stageText()));
  ok('and the rail is still there', (await p.locator('.rail-link').count()) === IDS.length);
}

console.log('\n== 4. layout ==');
await p.goto(BASE + PAGE);
await p.waitForTimeout(250);
ok('the page does not scroll sideways',
  (await p.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);

console.log('\n== 5. the theme, and that it is the vitrine\'s key ==');
await p.click('#theme-btn');
await p.waitForTimeout(150);
ok('the toggle applies',
  (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
ok('and it is stored under the shared key',
  (await p.evaluate(() => localStorage.getItem('codeschool-theme'))) === 'light');
await p.reload();
await p.waitForTimeout(300);
ok('and it survives a reload',
  (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
await p.click('#theme-btn');

console.log('\n== 6. the gate: nobody is signed in ==');
/* The live API answers 200 with a body of `null` rather than 401, so the portal
   can store the answer. The console has to read that as "anonymous". */
await open({ session: null });
ok('the stage is a sign-in form', (await p.locator('#signin-form').count()) === 1);
ok('the bar says nobody is signed in',
  /not signed in/i.test(await p.locator('#bar-state').innerText()),
  await p.locator('#bar-state').innerText());
ok('THE ROUTER DID NOT START', await gated());
ok('and no rail came with it', (await p.locator('.rail-link').count()) === 0);
ok('the empty-console page is nowhere near it',
  !/console is empty/i.test(await stageText()));

await p.goto(BASE + PAGE + '#/anything');
await p.waitForFunction(() => !/checking the session/.test(document.body.innerText));
await p.waitForTimeout(150);
ok('and a hash cannot get past it either',
  (await p.locator('#signin-form').count()) === 1 && await gated());

console.log('\n== 7. the gate: signed in, and not staff ==');
await open({ session: { name: 'Ana', email: 'ana@codeschool.ing' } });
const refused = await stageText();
ok('it says the account is not staff', /not staff/i.test(refused));
ok('and names who is signed in', /Ana/.test(refused));
ok('and says the role is granted at the database, not here',
  /DEPLOY\.md/.test(refused) && /database/i.test(refused));
ok('the bar agrees', /not staff/i.test(await p.locator('#bar-state').innerText()),
  await p.locator('#bar-state').innerText());
ok('THE ROUTER DID NOT START', await gated());
ok('there is a way out', (await p.locator('#gate-signout').count()) === 1);

console.log('\n== 8. the gate: the API did not answer ==');
await open({ down: true });
const dead = await stageText();
ok('it says the API did not answer', /did not answer/i.test(dead));
ok('and names BOTH causes, because they look identical from here',
  /PORTAL_ALLOWED_ORIGINS/.test(dead) && /down/i.test(dead));
ok('the bar says unreachable',
  /unreachable/i.test(await p.locator('#bar-state').innerText()),
  await p.locator('#bar-state').innerText());
ok('THE ROUTER DID NOT START', await gated());

console.log('\n== 9. staff: the console opens ==');
await open({ session: { name: 'Ana', email: 'ana@codeschool.ing', staff: 'admin' } });
ok('no gate screen stands in the way', !(await gated()));
ok('the bar says connected',
  /connected/i.test(await p.locator('#bar-state').innerText()),
  await p.locator('#bar-state').innerText());
ok('the notice is gone, because there IS a backend',
  await p.evaluate(() => document.getElementById('gate').hidden));
ok('the whoami names the account', /Ana/.test(await p.locator('#whoami').innerText()));
if (IDS.length === 0) {
  ok('and the console it opens is the empty one',
    /console is empty/i.test(await stageText()));
} else {
  ok('and the rail is drawn', (await p.locator('.rail-link').count()) === IDS.length);
}

console.log('\n== 10. signing in ==');
await open({ session: null });
await p.fill('#signin-email', 'ana@codeschool.ing');
await p.fill('#signin-password', 'a passphrase worth typing');
await p.click('#signin-submit');
await p.waitForTimeout(500);
ok('the form opens the console', !(await gated()));
ok('and the bar caught up',
  /connected/i.test(await p.locator('#bar-state').innerText()),
  await p.locator('#bar-state').innerText());

console.log('\n== 11. signing in, with two-factor on ==');
await open({ session: null, mfa: true });
await p.fill('#signin-email', 'ana@codeschool.ing');
await p.fill('#signin-password', 'a passphrase worth typing');
await p.click('#signin-submit');
await p.waitForTimeout(400);
ok('the code field appears',
  await p.evaluate(() => !document.getElementById('mfa-field').hidden));
ok('and the password is not asked for a second time',
  (await p.inputValue('#signin-password')).length > 0);
await p.fill('#signin-code', '123456');
await p.click('#signin-submit');
await p.waitForTimeout(500);
ok('the code opens the console', !(await gated()));

console.log('\n== 12. a wrong password says so, and stays put ==');
await open({ session: null });
await p.route('**/api/session', (route) => {
  if (route.request().method() !== 'POST') return route.fallback();
  return route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'unauthorized', message: 'that is not the password' } }),
  });
});
await p.fill('#signin-email', 'ana@codeschool.ing');
await p.fill('#signin-password', 'wrong');
await p.click('#signin-submit');
await p.waitForTimeout(400);
ok('the message is the API\'s own',
  /not the password/i.test(await p.locator('#signin-error').innerText()));
ok('the form is still there', (await p.locator('#signin-form').count()) === 1);
ok('and the console did not open', await gated());

console.log('\n== JavaScript errors ==');
ok('none', errors.length === 0, errors.join(' | ') || 'none');

await b.close();
console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\neverything passed');
process.exit(failures ? 1 : 0);
