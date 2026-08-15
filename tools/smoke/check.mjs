/* ==========================================================================
   The console's smoke test.

   It exists from the first commit, before there is a single real screen, and
   that is the point: the console is seven routes and a shell today, and the
   cheapest thing to get wrong is the shell. A screen module that throws, a
   route that stops resolving, a rail that empties — none of them fails a build,
   and none of them is visible in a diff.

   WHAT IT CHECKS
     the shell        the bar, the rail and a section for every entry in
                      sections.js — so adding a section without routing it fails
                      here rather than on somebody's screen;
     every route      each one renders, names itself, and raises nothing;
     the notice       while the backend has no staff role, the banner saying so
                      must be on the page. It is the console's only access
                      control, and a console that quietly stopped saying it had
                      none would be worse than one that never said it;
     no scrollbar     the shell does not push the page sideways;
     both themes      the toggle survives a reload, as it does in the portal.

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
   the eighth section. */
const source = await readFile(new URL('../../app/sections.js', import.meta.url), 'utf8');
const IDS = [...source.matchAll(/^\s{4}id: '([a-z-]+)',$/gm)].map((m) => m[1]);

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
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

console.log('\n== 1. the shell ==');
await p.goto(BASE + PAGE);
await p.waitForFunction(() => location.hash.length > 1);
ok('an empty hash lands on a screen', (await p.evaluate(() => location.hash)) === '#/overview',
  await p.evaluate(() => location.hash));
ok('sections.js was read', IDS.length > 0, IDS.length + ' sections');
ok('the rail carries every section',
  (await p.locator('.rail-link').count()) === IDS.length,
  (await p.locator('.rail-link').count()) + ' links for ' + IDS.length + ' sections');
ok('the bar says what it is connected to', (await p.locator('#bar-state').innerText()).length > 0,
  await p.locator('#bar-state').innerText());

console.log('\n== 2. the notice, while there is no staff role ==');
/* When the role check lands, `session.state.staff` stops being null and this
   flips. Then this block becomes the check that the console REFUSES a caller
   without the role — same test, opposite expectation. */
const gated = await p.evaluate(() => !document.getElementById('gate').hidden);
ok('the console says it has no access control', gated);
ok('and says it in words, not only in colour',
  /no staff role/i.test(await p.locator('#gate').innerText()));

console.log('\n== 3. every route renders ==');
for (const id of IDS) {
  await p.goto(BASE + PAGE + '#/' + id);
  await p.waitForSelector('.view-head h1');
  await p.waitForTimeout(120);
  const title = (await p.locator('.view-head h1').innerText()).trim();
  const named = (await p.locator('#stage').getAttribute('aria-label')) || '';
  ok('/' + id, title.length > 0 && named === title, title);
}

console.log('\n== 4. an unrouted path does not break the shell ==');
await p.goto(BASE + PAGE + '#/there-is-no-such-screen');
await p.waitForTimeout(200);
ok('it says so', /no such screen/i.test(await p.locator('#stage').innerText()));
ok('and the rail is still there', (await p.locator('.rail-link').count()) === IDS.length);

console.log('\n== 5. layout ==');
await p.goto(BASE + PAGE + '#/overview');
await p.waitForTimeout(250);
ok('the page does not scroll sideways',
  (await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
const rail = await p.locator('.rail').boundingBox();
ok('the rail runs the height of the window', rail.height > 700, Math.round(rail.height) + 'px');

console.log('\n== 6. the theme, and that it is the vitrine\'s key ==');
await p.click('#theme-btn');
await p.waitForTimeout(150);
ok('the toggle applies', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
ok('and it is stored under the shared key',
  (await p.evaluate(() => localStorage.getItem('codeschool-theme'))) === 'light');
await p.reload();
await p.waitForTimeout(300);
ok('and it survives a reload', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
await p.click('#theme-btn');

console.log('\n== JavaScript errors ==');
ok('none', errors.length === 0, errors.join(' | ') || 'none');

await b.close();
console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\neverything passed');
process.exit(failures ? 1 : 0);
