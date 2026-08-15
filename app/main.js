/* ==========================================================================
   Console — boot.

   A second application in this repository, staff-side, sharing the portal's
   stylesheet and its router rather than copying either. `assets/base.css` is
   the vitrine's file byte for byte and already carries the tokens, the reset
   and the fixed bar; `app/routes.js` is 71 lines and one of them is the screen
   contract. Two routers diverge the day somebody fixes one.

   WHAT IT DOES NOT SHARE: the i18n runtime. The console is staff-only and
   English-only — translating an internal tool for a team of three buys nothing,
   and English is this project's source language anyway. The saving that matters
   is that there are no dictionaries here to keep in step.

   THE SCREEN CONTRACT is the portal's: a screen is
   `async (section) => ({ title, el, after?, onLeave? })`. `after` runs once the
   element is in the document, for anything that has to measure.

   IT STARTS WITH NOTHING, and everything below is written for that: no
   sections, no rail, and a stage that says so. The shell is not a placeholder —
   the bar, the notice, the router and the theme all work — but the navigation
   stays empty until `app/sections.js` has an entry. Adding one is the whole
   change: the route, the rail and the disappearance of the empty state all
   follow from it.
   ========================================================================== */

import { route, whenChanged, start } from './routes.js';
import { esc } from './dom.js';
import { SECTIONS, GROUPS } from './sections.js';
import * as session from './session.js';

const $ = (s) => document.querySelector(s);
const stage = $('#stage');

/* ---------- routes ----------
   One per section, from the same list the rail is built from — so a section
   that exists is reachable, and one that does not, is not. */
SECTIONS.forEach((s) => {
  route('/' + s.id, async () => s.screen(s));
});

let leaving = null;

whenChanged(async (path, found) => {
  if (leaving) { leaving(); leaving = null; }

  if (!found) {
    /* Two different nothings, and confusing them would be the whole bug: with
       no sections at all the console is empty by design and says how it grows;
       with sections, a path matching none of them is a wrong address. */
    const [title, html] = SECTIONS.length ? notFound(path) : emptyConsole();
    stage.innerHTML = html;
    stage.setAttribute('aria-label', title);
    document.title = 'Console · codeschool.ing';
    paintRail(path);
    return;
  }

  const { title, el, after, onLeave } = await found.r.load(found.params);
  stage.textContent = '';
  stage.appendChild(el);
  stage.scrollTop = 0;

  /* The tab keeps one name, as the portal's does: a long screen title pushes
     the brand off the end and the tab stops being recognisable among others.
     The screen's name goes to the content region instead, so it is still
     announced to anyone who cannot see it. */
  document.title = 'Console · codeschool.ing';
  stage.setAttribute('aria-label', title);

  if (after) after();
  leaving = onLeave || null;
  paintRail(path);
});

function emptyConsole() {
  return ['The console is empty',
    '<div class="view">' +
      '<header class="view-head">' +
        '<span class="eyebrow mono">Nothing here yet</span>' +
        '<h1>The console is empty</h1>' +
        '<p>The shell is real — the bar reports what it is connected to, the ' +
        'router works, the theme is the school’s. What it has none of is ' +
        'screens.</p>' +
      '</header>' +
      '<section class="block block-empty">' +
        '<p class="empty-line mono">[no sections]</p>' +
        '<p class="empty-note">A section is one object in ' +
        '<span class="mono">app/sections.js</span> and the module it names. ' +
        'The route, the rail and this page follow from it — see ' +
        '<span class="mono">CLAUDE.md</span>.</p>' +
      '</section>' +
    '</div>'];
}

function notFound(path) {
  return ['No such screen',
    '<div class="view"><header class="view-head">' +
      '<h1>No such screen</h1>' +
      '<p>Nothing is routed at <span class="mono">' + esc(path) + '</span>.</p>' +
    '</header></div>'];
}

/* ---------- the rail ----------
   Built from the sections, which means it is empty when they are — and an empty
   216px column with a border down one side reads as a broken page rather than
   as an honest nothing, so the shell drops it entirely until there is something
   to put in it. */
function paintRail(path) {
  const here = path.replace(/^\//, '');
  document.body.classList.toggle('no-rail', SECTIONS.length === 0);
  $('#rail').innerHTML = GROUPS.map((g) => {
    const items = SECTIONS.filter((s) => s.group === g);
    if (!items.length) return '';
    return '<span class="rail-head mono">' + esc(g) + '</span>' +
      items.map((s) =>
        '<a class="rail-link' + (s.id === here ? ' on' : '') + '" href="#/' + esc(s.id) + '">' +
          '<span>' + esc(s.name) + '</span>' +
        '</a>').join('');
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
    '<span class="gate-text">The backend has no staff role — ' +
      '<span class="mono">accounts</span> carries no such column and no table ' +
      'does. <b>A screen that reads or writes real data cannot ship before the ' +
      'role check does.</b></span>' +
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
   The hash is set to the first section before the router starts, because
   `currentPath()` falls back to the PORTAL's default on an empty hash — the one
   thing the shared router assumes about its caller. Setting it first means that
   fallback is never reached, instead of teaching the router about a second
   application and losing the byte-for-byte check on it.

   With no sections there is nothing to point at, so the hash is left alone and
   the empty state answers. */
if (SECTIONS.length && (!location.hash || location.hash === '#')) {
  location.hash = '#/' + SECTIONS[0].id;
}

paintBar();
paintGate();
start();

/* Fire and forget: the shell is drawn from what is known and repainted when the
   answer arrives. A console that waits on the network to render its own frame
   is a console that looks broken whenever the API is slow. */
session.load().then(() => { paintBar(); paintGate(); });
