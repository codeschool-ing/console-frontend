/* ==========================================================================
   Console — boot.

   A second application in this repository, staff-side, sharing the portal's
   stylesheet and its router rather than copying either. `assets/base.css` is
   the vitrine's file byte for byte and already carries the tokens, the reset
   and the fixed bar; `app/routes.js` is 57 lines and one of them is the screen
   contract. Two routers diverge the day somebody fixes one.

   WHAT IT DOES NOT SHARE: the i18n runtime. The console is staff-only and
   English-only — translating an internal tool for a team of three is work that
   buys nothing, and English is this project's source language anyway.

   ENGLISH-ONLY ALSO MEANS NO DICTIONARIES TO KEEP IN STEP, which is the real
   saving: tools/i18n/check.mjs walks the portal, not this.

   THE SCREEN CONTRACT is the portal's: a screen is
   `async () => ({ title, el, after?, onLeave? })`. `after` runs once the element
   is in the document, for anything that has to measure.
   ========================================================================== */

import { route, whenChanged, start, currentPath } from './routes.js';
import { esc } from './dom.js';
import { SECTIONS, GROUPS, sectionById, SCREENS } from './sections.js';
import placeholder from './screens/placeholder.js';
import * as session from './session.js';

const $ = (s) => document.querySelector(s);
const stage = $('#stage');

/* ---------- routes ----------
   One per section, from the same list the rail is built from. A section with a
   real screen module in SCREENS gets it; everything else gets the plan. */
SECTIONS.forEach((s) => {
  route('/' + s.id, async () => {
    const build = SCREENS[s.id];
    return build ? build(s) : placeholder(s);
  });
});

let leaving = null;

whenChanged(async (path, found) => {
  if (leaving) { leaving(); leaving = null; }

  if (!found) {
    stage.innerHTML =
      '<div class="view"><header class="view-head"><h1>No such screen</h1>' +
      '<p>Nothing is routed at <span class="mono">' + esc(path) + '</span>.</p></header></div>';
    stage.setAttribute('aria-label', 'No such screen');
    paintRail(path);
    return;
  }

  const { title, el, after, onLeave } = await found.r.load(found.params);
  stage.textContent = '';
  stage.appendChild(el);
  stage.scrollTop = 0;

  /* The tab keeps one name, as the portal's does: a long screen title pushes
     the brand off the end and the tab stops being recognisable. The screen's
     name goes to the content region instead, so it is still announced. */
  document.title = 'Console · codeschool.ing';
  stage.setAttribute('aria-label', title);

  if (after) after();
  leaving = onLeave || null;
  paintRail(path);
});

/* ---------- the rail ---------- */
function paintRail(path) {
  const here = path.replace(/^\//, '');
  $('#rail').innerHTML = GROUPS.map((g) => {
    const items = SECTIONS.filter((s) => s.group === g);
    if (!items.length) return '';
    return '<span class="rail-head mono">' + esc(g) + '</span>' +
      items.map((s) => {
        const built = Boolean(SCREENS[s.id]);
        return '<a class="rail-link' + (s.id === here ? ' on' : '') + '" href="#/' + esc(s.id) + '">' +
          '<span>' + esc(s.name) + '</span>' +
          (built ? '' : '<span class="rail-tag mono">plan</span>') +
        '</a>';
      }).join('');
  }).join('');
}

/* ---------- the bar and the standing notice ---------- */
function paintBar() {
  const c = session.connection();
  const bar = $('#bar-state');
  bar.textContent = c.text;
  bar.dataset.tone = c.tone;
  $('#whoami').innerHTML = session.state.account
    ? '<span class="avatar" aria-hidden="true">' +
        esc((session.displayName().trim()[0] || '·').toUpperCase()) + '</span>' +
      '<span class="whoami-name">' + esc(session.displayName()) + '</span>'
    : '';
}

/* THE NOTICE IS THE ACCESS CONTROL, because there is none.
   It goes away on its own the day `session.state.staff` stops being null — and
   until then it is the thing standing between an empty console and somebody
   assuming it is protected. */
function paintGate() {
  const gate = $('#gate');
  const open = session.state.staff === null;
  gate.hidden = !open;
  document.body.classList.toggle('gate-on', open);
  if (!open) { gate.innerHTML = ''; return; }
  gate.innerHTML =
    '<span class="gate-mark mono">no access control</span>' +
    '<span class="gate-text">The backend has no staff role — <span class="mono">accounts</span> ' +
      'carries no such column and no table does. Every screen here is a plan, and nothing on ' +
      'this page calls the API. <b>A screen that touches real data cannot ship before the role ' +
      'check does.</b></span>' +
    (session.state.problem
      ? '<span class="gate-side mono">' + esc(session.state.problem) + '</span>'
      : '');
}

/* ---------- theme: the vitrine's key, so the three apps agree ---------- */
const THEME_KEY = 'codeschool-theme';
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : '';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode */ }
  $('#theme-btn').setAttribute('aria-label',
    theme === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme');
}
$('#theme-btn').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

/* ---------- boot ----------
   The hash is set before the router starts. `currentPath()` falls back to the
   PORTAL's default when the hash is empty, which is the one thing the shared
   router assumes about its caller — setting the hash first means that fallback
   is never reached instead of teaching the router about a second application. */
if (!location.hash || location.hash === '#') location.hash = '#/overview';

paintBar();
paintGate();
start();

/* Fire and forget: the shell is drawn from what is known, and repainted when
   the answer arrives. A console that waits on the network to render its own
   frame is a console that looks broken whenever the API is slow. */
session.load().then(() => { paintBar(); paintGate(); });

void currentPath;
