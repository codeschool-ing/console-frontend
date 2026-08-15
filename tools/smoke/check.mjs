/* ==========================================================================
   The console's smoke test.

   It runs from the first commit, before there is a single screen, and that is
   the point: the console IS a shell today, and a shell is the cheapest thing to
   get wrong. A module that throws on import, a router that stops resolving, a
   notice that quietly stops being painted — none of them fails a build, and
   none is visible in a diff.

   IT WORKS EMPTY AND IT WORKS FULL, on purpose. The console starts with no
   sections and the next change will add one; a suite that only knew the empty
   shape would have to be rewritten on the day it matters most. So it reads
   `app/sections.js` and checks whichever shape it finds there.

   WHAT IT CHECKS
     the shell        the bar and the brand are painted, whatever else is;
     the navigation   with no sections: no rail at all, no empty column left
                      behind, and a stage that says the console is empty rather
                      than showing an error. With sections: one rail entry each,
                      every route rendering and naming itself, and an unrouted
                      path saying so without taking the rail with it;
     the notice       while the backend has no staff role, the banner saying so
                      must be on the page. It is the console's only access
                      control, and one that quietly stopped saying it had none
                      would be worse than one that never said it;
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
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

console.log('\n== 1. the shell ==');
await p.goto(BASE + PAGE);
await p.waitForSelector('#stage .view');
await p.waitForTimeout(200);
console.log('   ' + IDS.length + ' section(s) in app/sections.js' +
  (IDS.length ? ': ' + IDS.join(', ') : ''));
ok('the bar says what it is connected to',
  (await p.locator('#bar-state').innerText()).length > 0,
  await p.locator('#bar-state').innerText());
ok('the brand is in the bar', (await p.locator('nav .brand-name').count()) === 1);

console.log('\n== 2. the notice, while there is no staff role ==');
/* When the role check lands, `session.state.staff` stops being null and this
   flips. Then this block becomes the check that the console REFUSES a caller
   without the role — the same test, the opposite expectation. */
ok('the console says it has no access control',
  await p.evaluate(() => !document.getElementById('gate').hidden));
ok('and says it in words, not only in colour',
  /no staff role/i.test(await p.locator('#gate').innerText()));

console.log('\n== 3. the navigation ==');
if (IDS.length === 0) {
  ok('no rail is drawn while there are no sections',
    (await p.locator('.rail-link').count()) === 0);
  ok('and no empty column is left behind',
    await p.evaluate(() => document.body.classList.contains('no-rail')
      && getComputedStyle(document.querySelector('.rail')).display === 'none'));
  const stage = await p.locator('#stage').innerText();
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
  ok('it says so', /no such screen/i.test(await p.locator('#stage').innerText()));
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

console.log('\n== JavaScript errors ==');
ok('none', errors.length === 0, errors.join(' | ') || 'none');

await b.close();
console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\neverything passed');
process.exit(failures ? 1 : 0);
