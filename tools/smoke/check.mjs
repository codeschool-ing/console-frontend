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
                      path saying so without taking the rail with it. The detail
                      routes have no rail entry, so they are read from
                      `DETAILS` and driven at the end — one that stopped being
                      registered would look like "no such screen" and nothing
                      else;
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
/* ANCHORED AT THE START OF A LINE, and that is not cosmetic. The doc comment
   above the array shows an example declaration, indented; `indexOf` found THAT
   one first and then ran to the real array's closing bracket, so the example's
   section was counted as a real one. It was invisible while the list was empty
   and appeared the moment the first section landed — which is this suite
   catching itself, one release later than it should have. */
const from = source.search(/^export const SECTIONS = \[/m);
const array = source.slice(from, source.indexOf('\n]', from) + 2);
const IDS = [...array.matchAll(/\bid:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);

/* The detail routes, read the same way and for the same reason. They have no
   rail entry, so nothing in section 3 walks them — a record route that stopped
   being registered would show up as "no such screen" and nowhere else. */
const dfrom = source.search(/^export const DETAILS = \[/m);
const DETAILS = dfrom < 0 ? []
  : [...source.slice(dfrom, source.indexOf('\n]', dfrom) + 2)
      .matchAll(/\bpath:\s*'([^']+)'/g)].map((m) => m[1]);

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
const api = {
  wired: false, session: null, down: false, signedIn: false, mfa: false,
  /* What GET /api/staff/students answers, and every URL it was asked for — so
     the search can be checked by what it SENT and not only by what it drew. */
  students: null,
  studentsStatus: 200,
  /* One student's record, and what "show more" is served after it. The record's
     own first page of events is inside `record.timeline`; `timelinePage` is
     what GET .../events answers from then on. */
  record: null,
  recordStatus: 200,
  timelinePage: null,
  // What PUT .../role answers. 409 is the interesting one: both refusals the
  // server can give are conflicts, and their wording is what the console shows.
  roleStatus: 200,
  roleMessage: '',
  metrics: null,
  auditLog: null,
  asked: [],
};

const ANA = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ana Ribeiro', email: 'ana@codeschool.ing', emailVerified: true,
  joinedAt: '2026-01-05T10:00:00Z', planId: 'pro', planSince: '2026-01-05T10:00:00Z',
  trackId: 'backend', enrolledAt: '2026-01-06T10:00:00Z',
  sections: 12, lastActiveAt: new Date(Date.now() - 2 * 86400000).toISOString(),
};
const BRUNO = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Bruno Alves', email: 'bruno@codeschool.ing', emailVerified: false,
  joinedAt: '2026-02-10T10:00:00Z', planId: 'guest', planSince: null,
  staff: 'admin', trackId: '', enrolledAt: null, sections: 0, lastActiveAt: null,
};

/* An account that has done nothing — every list empty, every count zero. It is
   the shape the record has to survive without drawing a wall of blanks, and it
   is what an id nothing was seeded for answers with. */
const emptyRecord = () => ({
  student: BRUNO, enrollment: null, courses: [], notes: 0,
  resume: null, exams: [], certificates: [],
  timeline: { entries: [], total: 0, limit: 30, offset: 0 },
});

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

  if (path === '/api/staff/metrics') {
    api.asked.push(req.url());
    return json(200, api.metrics
      || { since: '2026-07-17T00:00:00Z', days: 30, tallies: [], daily: [] });
  }
  if (path === '/api/staff/audit') {
    api.asked.push(req.url());
    if (api.studentsStatus !== 200) {
      return json(api.studentsStatus, {
        error: { code: 'forbidden', message: 'this account is not staff' },
      });
    }
    return json(200, api.auditLog || { entries: [], total: 0, limit: 50, offset: 0 });
  }
  if (path === '/api/staff/students') {
    api.asked.push(req.url());
    if (api.studentsStatus !== 200) {
      return json(api.studentsStatus, {
        error: {
          code: api.studentsStatus === 403 ? 'forbidden' : 'unauthorized',
          message: 'this account is not staff',
        },
      });
    }
    return json(200, api.students || { students: [], total: 0, limit: 25, offset: 0 });
  }
  /* The role change — the console's only write. It answers what a PUT means:
     the state that is now stored, and whether storing it changed anything. */
  if (/^\/api\/staff\/students\/[^/]+\/role$/.test(path) && req.method() === 'PUT') {
    api.asked.push(req.method() + ' ' + req.url() + ' ' + req.postData());
    if (api.roleStatus !== 200) {
      return json(api.roleStatus, {
        error: { code: 'conflict', message: api.roleMessage },
      });
    }
    const asked = JSON.parse(req.postData() || '{}').role || '';
    return json(200, { role: asked, changed: true });
  }
  /* The record and its timeline. Matched by shape rather than by id, because
     the screen builds the path from the row it was opened from and checking
     that it asked for the RIGHT id is one of the things below. */
  if (/^\/api\/staff\/students\/[^/]+\/events$/.test(path)) {
    api.asked.push(req.url());
    return json(200, api.timelinePage || { entries: [], total: 0, limit: 30, offset: 0 });
  }
  if (/^\/api\/staff\/students\/[^/]+$/.test(path)) {
    api.asked.push(req.url());
    if (api.recordStatus !== 200) {
      return json(api.recordStatus, api.recordStatus === 404
        ? { error: { code: 'not_found', message: 'no such student' } }
        : { error: { code: 'forbidden', message: 'this account is not staff' } });
    }
    return json(200, api.record || emptyRecord());
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
  api.students = state.students ?? null;
  api.record = state.record ?? null;
  api.timelinePage = state.timelinePage ?? null;
  api.recordStatus = state.recordStatus || 200;
  api.roleStatus = state.roleStatus || 200;
  api.roleMessage = state.roleMessage || '';
  api.metrics = state.metrics ?? null;
  api.auditLog = state.auditLog ?? null;
  api.studentsStatus = state.studentsStatus || 200;
  api.asked = [];
  /* A `goto` that changes only the hash does NOT reload — so without this the
     next scenario would run against the previous one's document, with the
     previous one's answers already in it. Leaving the page first makes every
     `open` a real navigation, hash or no hash. */
  await p.goto('about:blank');
  await p.goto(BASE + PAGE + (state.at || ''));
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

/* The screens themselves. They only exist once app/sections.js has one, so the
   block is skipped on the empty shape rather than failing it — the same way the
   navigation block above branches. */
if (IDS.includes('students')) {
  const STAFF = { name: 'Ana', email: 'ana@codeschool.ing', staff: 'admin' };
  const twoRows = { students: [ANA, BRUNO], total: 2, limit: 25, offset: 0 };

  console.log('\n== 13. the students screen ==');
  await open({ session: STAFF, students: twoRows, at: '#/students' });
  await p.waitForSelector('table.grid', { timeout: 4000 });
  const table = await p.locator('table.grid').innerText();
  ok('both students are on the page', /Ana Ribeiro/.test(table) && /Bruno Alves/.test(table));
  ok('the track is shown', /backend/.test(table));
  ok('and "no track" is said in words, not left blank',
    /no track/i.test(table));
  ok('the sections count is there', /\b12\b/.test(table));
  ok('the last activity reads as a distance', /2 days ago/.test(table), table.match(/\d+ days ago/)?.[0]);
  ok('somebody who has never been active says so', /never/i.test(table));
  ok('the staff role is marked on the row', /admin/i.test(table),
    'so "who can open this console" stops being a psql question');
  ok('an unconfirmed address is flagged', /unverified/i.test(table));
  ok('the count says how many of how many',
    /1–2 of 2/.test(await p.locator('#count').innerText()),
    await p.locator('#count').innerText());
  ok('and the page does not scroll sideways',
    (await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);

  console.log('\n== 14. the search is the server\'s ==');
  api.asked = [];
  await p.fill('#q', 'ribeiro');
  await p.waitForTimeout(600);
  ok('typing sends a query rather than filtering the page in hand',
    api.asked.some((u) => /[?&]q=ribeiro/.test(u)), api.asked.join(' | ') || 'nothing asked');

  api.students = { students: [], total: 0, limit: 25, offset: 0 };
  await p.fill('#q', 'nobody at all');
  await p.waitForTimeout(600);
  const empty = await p.locator('#rows').innerText();
  ok('an empty result names what was searched for', /nobody at all/.test(empty), empty);
  ok('and says where the search looks', /name and the e-mail/i.test(empty));
  ok('the pager is gone with nothing to page', await p.evaluate(() =>
    document.getElementById('pager').hidden));

  console.log('\n== 15. the pager ==');
  await open({
    session: STAFF, at: '#/students',
    students: { students: [ANA], total: 40, limit: 25, offset: 0 },
  });
  await p.waitForSelector('table.grid', { timeout: 4000 });
  ok('there is nothing before the first page',
    await p.evaluate(() => document.getElementById('prev').disabled));
  ok('and there is something after it',
    await p.evaluate(() => !document.getElementById('next').disabled));
  api.asked = [];
  await p.click('#next');
  await p.waitForTimeout(400);
  ok('next asks for the following page',
    api.asked.some((u) => /[?&]offset=25/.test(u)), api.asked.join(' | '));

  console.log('\n== 16. REFUSED MID-SESSION ==');
  /* The gate decided at boot. This is the case it could not see: the role is
     revoked, or the session ends, while the console is open — every screen
     starts getting 403 and, without the shared request layer, the page would
     sit there loading forever and say nothing. */
  await open({
    session: STAFF, at: '#/students',
    students: { students: [ANA], total: 1, limit: 25, offset: 0 },
  });
  await p.waitForSelector('table.grid', { timeout: 4000 });
  ok('the console is open to begin with', !(await gated()));

  api.studentsStatus = 403;
  api.session = { name: 'Ana', email: 'ana@codeschool.ing' }; // the role is gone
  await p.fill('#q', 'anything');
  await p.waitForTimeout(900);

  ok('the refusal put the gate back up', await gated());
  ok('and it is the right gate', /not staff/i.test(await stageText()), await stageText());
  ok('the rail went with it', (await p.locator('.rail-link').count()) === 0);
  ok('the bar caught up too',
    /not staff/i.test(await p.locator('#bar-state').innerText()),
    await p.locator('#bar-state').innerText());
  ok('and no half-drawn screen was left underneath',
    (await p.locator('table.grid').count()) === 0);

  console.log('\n== 17. and a hash cannot walk back in ==');
  /* The router's listener is still attached — `start()` is not undoable — so a
     bookmark clicked while the gate is up must not draw over it.

     BOTH HASHES ARE CHANGES, deliberately. The gate went up while the page was
     at #/students, and assigning a hash the value it already has fires no
     `hashchange` at all — a check that only did that would pass against a
     console with no guard whatsoever, which is exactly what it did before this
     comment was written. */
  await p.evaluate(() => { location.hash = '#/nowhere-at-all'; });
  await p.waitForTimeout(400);
  ok('an unrouted hash does not replace the gate with "no such screen"',
    await gated() && !/no such screen/i.test(await stageText()), await stageText());

  await p.evaluate(() => { location.hash = '#/students'; });
  await p.waitForTimeout(600);
  ok('and a routed one does not render the section either', await gated());
  ok('with nothing drawn underneath', (await p.locator('table.grid').count()) === 0);
}


if (IDS.includes('activity')) {
  const STAFF2 = { name: 'Ana', email: 'ana@codeschool.ing', staff: 'admin' };

  console.log('\n== 18. activity: every number carries its people ==');
  await open({
    session: STAFF2, at: '#/activity',
    metrics: {
      since: '2026-07-17T00:00:00Z', days: 30,
      tallies: [
        { kind: 'section.viewed', total: 412, students: 9 },
        { kind: 'section.completed', total: 180, students: 8 },
      ],
      daily: [
        { day: '2026-08-14T00:00:00Z', total: 30, students: 4 },
        { day: '2026-08-15T00:00:00Z', total: 90, students: 6 },
        { day: '2026-08-16T00:00:00Z', total: 60, students: 5 },
      ],
    },
  });
  await p.waitForSelector('.tally-grid', { timeout: 4000 });
  const measured = await p.locator('#body').innerText();
  ok('the kinds are named in words, not dotted ids',
    /Sections opened/.test(measured) && /Sections completed/.test(measured), measured.slice(0, 120));
  /* The whole reason this screen exists rather than a count: a thousand events
     from one insomniac is not a busy week. */
  ok('the PEOPLE are the headline number',
    await p.evaluate(() => {
      const people = document.querySelector('.tally-people');
      const total = document.querySelector('.tally-total');
      if (!people || !total) return false;
      const size = (el) => parseFloat(getComputedStyle(el).fontSize);
      return people.textContent.trim() === '9' && size(people) > size(total) * 1.6;
    }));
  ok('and the events are there too, said as events', /412 events/.test(measured));
  ok('the bars are drawn from the days', (await p.locator('.bar').count()) === 3);
  /* No scale trickery: the tallest is the busiest day and the others are true
     fractions of it. A y-axis that did not start at zero would make a flat week
     look like a climb. */
  ok('and the tallest bar is the busiest day, to scale',
    await p.evaluate(() => {
      const h = [...document.querySelectorAll('.bar')].map((b) => b.getBoundingClientRect().height);
      return h[1] > h[2] && h[2] > h[0] && Math.abs(h[0] / h[1] - 30 / 90) < 0.05;
    }));

  console.log('\n== 19. activity: an empty window says why ==');
  await open({ session: STAFF2, at: '#/activity', metrics: { since: '2026-07-17T00:00:00Z', days: 30, tallies: [], daily: [] } });
  await p.waitForTimeout(500);
  const quiet = await p.locator('#body').innerText();
  ok('it does not draw a wall of zeroes', (await p.locator('.tally').count()) === 0);
  ok('and it warns that "before the stream" is missing, not quiet',
    /missing/i.test(quiet) && /deployed/i.test(quiet), quiet);

  console.log('\n== 20. activity: the window picker asks the server ==');
  await open({ session: STAFF2, at: '#/activity' });
  await p.waitForTimeout(400);
  api.asked = [];
  await p.click('.seg[data-days="7"]');
  await p.waitForTimeout(400);
  ok('choosing 7 days re-asks for 7 days',
    api.asked.some((u) => /[?&]days=7/.test(u)), api.asked.join(' | '));
}

if (IDS.includes('audit')) {
  const STAFF3 = { name: 'Ana', email: 'ana@codeschool.ing', staff: 'admin' };

  console.log('\n== 21. audit: the log, and what an erased subject looks like ==');
  await open({
    session: STAFF3, at: '#/audit',
    auditLog: {
      entries: [
        {
          id: 2, at: '2026-08-16T14:02:00Z', actor: 'ana@codeschool.ing', role: 'admin',
          action: 'staff.students.list', detail: { q: 'ribeiro', matched: 1 },
        },
        {
          id: 1, at: '2026-08-15T09:30:00Z', actor: 'ana@codeschool.ing', role: 'admin',
          action: 'staff.student.view', erased: true, detail: {},
        },
      ],
      total: 2, limit: 50, offset: 0,
    },
  });
  await p.waitForSelector('table.grid', { timeout: 4000 });
  const log = await p.locator('table.grid').innerText();
  ok('the action is in words and in its id', /Listed students/.test(log) && /staff\.students\.list/.test(log));
  ok('the actor is named', /ana@codeschool\.ing/.test(log));
  ok('the detail carries what was searched for', /q=ribeiro/.test(log), log);
  /* The row outlives the account and the name does not. Drawing the gap as an
     empty cell would hide the one thing the table's design proves: the action
     still happened. */
  ok('AN ERASED SUBJECT IS SHOWN AS ERASED, not as blank', /erased/i.test(log));
  ok('the timestamp is a date and a time, not a distance',
    /2026-08-16 14:02/.test(log), log.slice(0, 80));

  console.log('\n== 22. audit: an empty log is an honest state ==');
  await open({ session: STAFF3, at: '#/audit' });
  await p.waitForTimeout(500);
  const none = await p.locator('#rows').innerText();
  ok('it says nothing is recorded yet', /nothing recorded yet/i.test(none));
  ok('and that this is not recording being off', /not a sign/i.test(none), none);

  console.log('\n== 23. audit: the filter asks the server ==');
  await open({ session: STAFF3, at: '#/audit' });
  await p.waitForTimeout(400);
  api.asked = [];
  await p.selectOption('#action', 'staff.student.view');
  await p.waitForTimeout(400);
  ok('choosing an action re-asks for it',
    api.asked.some((u) => /[?&]action=staff\.student\.view/.test(u)), api.asked.join(' | '));
}

if (DETAILS.includes('/students/:id')) {
  const STAFF4 = { name: 'Ana', email: 'ana@codeschool.ing', staff: 'admin' };
  const HERE = '#/students/' + ANA.id;
  const full = {
    student: ANA,
    enrollment: {
      trackId: 'backend',
      since: '2026-01-06T10:00:00Z',
      choices: { 'backend:2': 1 },
    },
    courses: [
      { courseId: 'javascript', lessons: 3, sections: 9 },
      { courseId: 'python', lessons: 1, sections: 3 },
    ],
    notes: 4,
    resume: null,
    exams: [
      { scope: 'course', scopeId: 'javascript', attempts: 2, best: 84, passed: true,
        lastPct: 84, lastAt: '2026-08-01T12:00:00Z' },
    ],
    certificates: [
      { code: 'CS-JS-0001', scope: 'course', scopeId: 'javascript',
        title: 'JavaScript', issuedAt: '2026-08-02T09:00:00Z', revokedAt: null },
    ],
    timeline: {
      entries: [
        { id: 9, at: '2026-08-16T14:02:00Z', kind: 'exam.submitted',
          courseId: 'javascript', detail: { pct: 84, passed: true } },
        { id: 8, at: '2026-08-16T13:40:00Z', kind: 'section.completed',
          courseId: 'javascript', lessonIx: 0, sectionId: 'intro', detail: {} },
      ],
      total: 5, limit: 30, offset: 0,
    },
  };

  console.log('\n== 24. the list opens a record ==');
  await open({
    session: STAFF4, at: '#/students', record: full,
    students: { students: [ANA, BRUNO], total: 2, limit: 25, offset: 0 },
  });
  await p.waitForSelector('table.grid', { timeout: 4000 });
  api.asked = [];
  await p.click('.cell-link');
  await p.waitForSelector('.facts', { timeout: 4000 });
  ok('the hash carries the id it was clicked from',
    (await p.evaluate(() => location.hash)) === HERE,
    await p.evaluate(() => location.hash));
  ok('and the API was asked for that id, not another',
    api.asked.some((u) => u.includes('/api/staff/students/' + ANA.id)),
    api.asked.join(' | ') || 'nothing asked');
  /* Opening a record is not leaving the section. A rail that unlit itself here
     would read as having navigated away from a page plainly still inside it. */
  /* `.first()` rather than the bare locator, so a rail with none lit — or two —
     reports a readable failure instead of dying on a strict-mode violation
     before it can print one. */
  const lit = await p.locator('.rail-link.on').count() === 1
    ? (await p.locator('.rail-link.on').first().innerText()).trim() : '';
  ok('THE RAIL STAYS LIT ON STUDENTS', lit === 'Students', lit || 'nothing lit');

  console.log('\n== 25. the record, reloaded straight from its address ==');
  await open({ session: STAFF4, at: HERE, record: full });
  await p.waitForSelector('.facts', { timeout: 4000 });
  const rec = await stageText();
  ok('a pasted link opens the record, not the list',
    (await p.locator('.facts').count()) === 1 && (await p.locator('#q').count()) === 0);
  ok('the student is named', /Ana Ribeiro/.test(rec));
  ok('the plan and the track are there', /pro/.test(rec) && /backend/.test(rec));
  ok('the forks are shown per track', /backend step 2/.test(rec), rec.match(/backend step.*/)?.[0]);
  ok('the courses are rolled up', /javascript/.test(rec) && /\b9\b/.test(rec));
  ok('the exam carries its verdict', /passed/i.test(rec) && /84/.test(rec));
  ok('the certificate says it still stands', /CS-JS-0001/.test(rec) && /valid/i.test(rec));
  ok('the timeline names the deeds in words, not dotted ids',
    /Submitted an exam/.test(rec) && !/exam\.submitted/.test(rec), rec.slice(-300));
  ok('and a timeline entry carries a date AND a time',
    /2026-08-16 14:02/.test(rec));
  ok('there is a way back to the list', (await p.locator('.back').count()) === 1);
  ok('and the page does not scroll sideways',
    (await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);

  console.log('\n== 26. THE NOTES ARE COUNTED AND NOT QUOTED ==');
  /* The one deliberate subtraction from what the export carries — and the
     screen says so, because a bare number with no text beside it reads as a
     half-built feature, which is exactly how it would get "finished". */
  ok('the count is shown', /4 notes/.test(rec), rec.match(/\d+ notes?/)?.[0]);
  ok('and the screen says the console does not show what they say',
    /does not show what they say/i.test(rec));

  console.log('\n== 27. the timeline pages, and each page is a fresh read ==');
  api.timelinePage = {
    entries: [
      { id: 7, at: '2026-08-15T10:00:00Z', kind: 'note.saved',
        courseId: 'javascript', lessonIx: 0, sectionId: 'intro', detail: {} },
      { id: 6, at: '2026-08-15T09:00:00Z', kind: 'enrolled', detail: { trackId: 'backend' } },
      { id: 5, at: '2026-08-14T09:00:00Z', kind: 'account.registered', detail: {} },
    ],
    total: 5, limit: 30, offset: 2,
  };
  api.asked = [];
  ok('"show more" says how many are left', /3 left/.test(await p.locator('#more').innerText()),
    await p.locator('#more').innerText());
  await p.click('#more');
  await p.waitForTimeout(500);
  ok('it asks for the next page by offset',
    api.asked.some((u) => /\/events\?.*offset=2/.test(u)), api.asked.join(' | '));
  const grown = await stageText();
  ok('the older events joined the ones already there',
    /Registered/.test(grown) && /Submitted an exam/.test(grown));
  ok('and the button is gone once there is nothing left',
    (await p.locator('#more').count()) === 0);

  console.log('\n== 28. a student who is not there, and one who has done nothing ==');
  await open({ session: STAFF4, at: HERE, recordStatus: 404 });
  await p.waitForTimeout(500);
  const gone = await stageText();
  ok('an erased account says so rather than showing an empty record',
    /no such student/i.test(gone), gone);
  ok('and it says the audit keeps what was done to it', /audit/i.test(gone));

  await open({ session: STAFF4, at: '#/students/' + BRUNO.id });
  await p.waitForSelector('.facts', { timeout: 4000 });
  const blank = await stageText();
  ok('an account that has done nothing draws a record, not an error',
    (await p.locator('.facts').count()) === 1 && !/could not/i.test(blank));
  ok('and says the empty parts in words', /no track/i.test(blank) && /no notes/i.test(blank),
    blank);
  ok('including that a quiet timeline may be missing history, not idleness',
    /missing history/i.test(blank));

  console.log('\n== 29. REFUSED WHILE READING A RECORD ==');
  await open({ session: STAFF4, at: HERE, record: full });
  await p.waitForSelector('.facts', { timeout: 4000 });
  api.recordStatus = 403;
  api.session = { name: 'Ana', email: 'ana@codeschool.ing' };
  await p.evaluate(() => { location.hash = '#/students'; });
  await p.waitForTimeout(300);
  await p.evaluate((h) => { location.hash = h; }, HERE);
  await p.waitForTimeout(900);
  ok('the refusal put the gate back up', await gated());
  ok('and no half-drawn record was left underneath',
    (await p.locator('.facts').count()) === 0);
}

if (DETAILS.includes('/students/:id')) {
  /* THE CONSOLE'S FIRST WRITE, and the one that hands out the keys to every
     other screen. Signed in as somebody with a DIFFERENT address from the
     records below, so the self-guard is exercised on its own and not by
     accident. */
  const ROOT = { name: 'Root', email: 'root@codeschool.ing', staff: 'admin' };
  const recordOf = (who) => ({
    student: who, enrollment: null, courses: [], notes: 0,
    resume: null, exams: [], certificates: [],
    timeline: { entries: [], total: 0, limit: 30, offset: 0 },
  });

  console.log('\n== 30. granting: a confirm stands between the click and the write ==');
  await open({ session: ROOT, at: '#/students/' + ANA.id, record: recordOf(ANA) });
  await p.waitForSelector('#role-ask', { timeout: 4000 });
  ok('a student is offered the grant',
    /Grant staff access/.test(await p.locator('#role-ask').innerText()),
    await p.locator('#role-ask').innerText());
  ok('and the block says what the account can do today',
    /cannot open/i.test(await stageText()));

  api.asked = [];
  await p.click('#role-ask');
  await p.waitForTimeout(200);
  /* A click must not be the write. This one hands somebody every student's
     record, and a button that acted on the first click is a button somebody
     brushes past. */
  ok('THE FIRST CLICK WRITES NOTHING', api.asked.length === 0, api.asked.join(' | '));
  ok('it asks first', (await p.locator('#role-yes').count()) === 1);
  ok('and says what granting means, not just "are you sure"',
    /every screen in this console/i.test(await stageText()));
  ok('the confirm has the focus', await p.evaluate(() =>
    document.activeElement && document.activeElement.id === 'role-yes'));

  await p.click('#role-no');
  await p.waitForTimeout(200);
  ok('cancel puts it back without writing',
    (await p.locator('#role-ask').count()) === 1 && api.asked.length === 0);

  await p.click('#role-ask');
  await p.waitForTimeout(150);
  await p.click('#role-yes');
  await p.waitForTimeout(400);
  ok('confirming sends a PUT naming the destination',
    api.asked.some((u) => /PUT .*\/role .*"role":"admin"/.test(u)), api.asked.join(' | '));
  ok('and it went to the right student',
    api.asked.some((u) => u.includes('/students/' + ANA.id + '/role')));
  /* Straight from the PUT's answer. Re-reading the record would write a second
     `staff.student.view` entry nobody asked for and make the audit say this
     record was opened twice. */
  ok('the block redraws as staff without re-reading the record',
    /Revoke staff access/.test(await stageText())
      && !api.asked.some((u) => /^http.*\/students\/[^/]+$/.test(u)),
    api.asked.join(' | '));

  console.log('\n== 31. revoking, and what the confirm warns about ==');
  await open({ session: ROOT, at: '#/students/' + BRUNO.id, record: recordOf(BRUNO) });
  await p.waitForSelector('#role-ask', { timeout: 4000 });
  ok('an account that is staff is offered the revoke',
    /Revoke staff access/.test(await p.locator('#role-ask').innerText()));
  await p.click('#role-ask');
  await p.waitForTimeout(200);
  ok('the confirm says when it takes effect', /very next request/i.test(await stageText()));
  ok('and that nothing else about the account changes',
    /Nothing else about the account/i.test(await stageText()));
  api.asked = [];
  await p.click('#role-yes');
  await p.waitForTimeout(400);
  ok('revoking sends an empty role, not a delete',
    api.asked.some((u) => /PUT .*"role":""/.test(u)), api.asked.join(' | '));
  ok('and the block redraws as a student', /Grant staff access/.test(await stageText()));

  console.log('\n== 32. the two refusals, in the server\'s own words ==');
  /* The console hides the button on your own record because the API refuses
     it — but the API is the control, so when it does refuse, what it says is
     what is shown. Reimplementing its reasons here would be a second copy to
     keep true. */
  await open({
    session: ROOT, at: '#/students/' + ANA.id, record: recordOf(ANA),
    roleStatus: 409,
    roleMessage: 'that is the last staff account; granting the role to somebody ' +
      'else first is what keeps this console reachable',
  });
  await p.waitForSelector('#role-ask', { timeout: 4000 });
  await p.click('#role-ask');
  await p.waitForTimeout(150);
  await p.click('#role-yes');
  await p.waitForTimeout(400);
  const refusedText = await stageText();
  ok('the refusal is shown in the API\'s own sentence',
    /last staff account/.test(refusedText), refusedText.match(/last staff.*/)?.[0]);
  ok('and the block still says what the account is',
    /Grant staff access/.test(refusedText) || (await p.locator('#role-yes').count()) === 1);
  ok('nothing was drawn as if it had worked', !/Revoke staff access/.test(refusedText));

  console.log('\n== 33. your own record offers no button at all ==');
  const me = { ...ANA, email: ROOT.email, name: 'Root' };
  await open({ session: ROOT, at: '#/students/' + ANA.id, record: recordOf(me) });
  await p.waitForSelector('.facts', { timeout: 4000 });
  const own = await stageText();
  ok('THE BUTTON IS GONE ON YOUR OWN RECORD', (await p.locator('#role-ask').count()) === 0);
  ok('and it says why, rather than leaving a gap',
    /change their own role/i.test(own), own.match(/.*own role.*/)?.[0]);
  ok('naming what that guard protects',
    /last staff account/i.test(own) || /signing itself out/i.test(own));

  console.log('\n== 34. REFUSED MID-WRITE puts the gate up, like a read ==');
  /* A 403 from a WRITE is the same stale answer as one from a read. Without the
     shared layer this would have drawn "could not save" over a console the
     caller is no longer allowed to use. */
  await open({ session: ROOT, at: '#/students/' + ANA.id, record: recordOf(ANA) });
  await p.waitForSelector('#role-ask', { timeout: 4000 });
  api.roleStatus = 403;
  api.session = { name: 'Root', email: 'root@codeschool.ing' }; // the role is gone
  await p.click('#role-ask');
  await p.waitForTimeout(150);
  await p.click('#role-yes');
  await p.waitForTimeout(900);
  ok('the gate went up', await gated());
  ok('and it is the right one', /not staff/i.test(await stageText()));
  ok('with no error panel left under it', (await p.locator('.role-error').count()) === 0);
}

console.log('\n== JavaScript errors ==');
ok('none', errors.length === 0, errors.join(' | ') || 'none');

await b.close();
console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\neverything passed');
process.exit(failures ? 1 : 0);
