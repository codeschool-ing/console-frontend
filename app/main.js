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

   THE ROUTER DOES NOT START UNTIL THE SESSION HAS ANSWERED. Nothing below runs
   a screen for a caller the API would refuse — not because the console is what
   protects anything (`web.RequireStaff` is), but because a section rendered
   before the answer arrives is a section whose loader has already fetched. The
   gate screens in `app/gate.js` stand in that place instead.

   IT STARTS WITH NOTHING BEHIND THE GATE, and everything below is written for
   that: no sections, no rail, and a stage that says so. Adding one entry to
   `app/sections.js` is the whole change — the route, the rail and the
   disappearance of the empty state all follow from it.
   ========================================================================== */

import { route, whenChanged, start } from './routes.js';
import { esc } from './dom.js';
import { SECTIONS, GROUPS } from './sections.js';
import { gateScreen } from './gate.js';
import { whenRefused } from './request.js';
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
/* True while a gate screen holds the page. The router's listener is still
   attached — `start()` is not undoable — so without this a hash change while
   the gate is up would draw a section straight over it, rail and all, for a
   caller the API has just refused. */
let gated = false;

whenChanged(async (path, found) => {
  if (gated) return;
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

/* THE NOTICE NOW HAS ONE JOB, and it is a smaller one than it had.
   It used to say the backend had no staff role. The backend has one, so that
   sentence is retired — and what remains worth saying is the case where this
   console is wired to nothing at all: a local run, or a deploy whose
   <meta name="backend"> was never filled in. Then no call can be made, no
   session can be read, and the shell would otherwise look like a working
   console that merely has no data in it. */
function paintGate() {
  const gate = $('#gate');
  const open = !session.hasBackend;
  gate.hidden = !open;
  document.body.classList.toggle('gate-on', open);
  if (!open) { gate.innerHTML = ''; return; }
  gate.innerHTML =
    '<span class="gate-mark mono">no backend</span>' +
    '<span class="gate-text">This console is not connected to an API — ' +
      '<span class="mono">&lt;meta name="backend"&gt;</span> is empty. Nothing ' +
      'is signed in and nothing can be read. <b>It is a shell, and every screen ' +
      'in it will say it has no data.</b></span>';
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
   Draw the shell from what is known, ask who is asking, then decide. The bar is
   painted before the answer arrives on purpose: a console that renders nothing
   until the network replies looks broken every time the API is slow. */

let started = false;

function enterConsole() {
  /* `start()` is the shared router's and is not re-entrant: signing out and
     back in again must not leave two listeners on the hash. A reload is the
     honest way to get a clean one, and it costs a staff member nothing. */
  if (started) { location.reload(); return; }
  started = true;

  gated = false;
  document.body.classList.remove('gated');

  /* The hash is set to the first section before the router starts, because
     `currentPath()` falls back to the PORTAL's default on an empty hash — the
     one thing the shared router assumes about its caller. Setting it first
     means that fallback is never reached, instead of teaching the router about
     a second application and losing the byte-for-byte check on it.

     With no sections there is nothing to point at, so the hash is left alone
     and the empty state answers. */
  if (SECTIONS.length && (!location.hash || location.hash === '#')) {
    location.hash = '#/' + SECTIONS[0].id;
  }
  start();
}

function enterGate(access) {
  gated = true;
  document.body.classList.add('gated', 'no-rail');

  /* The screen on the page may have been mid-flight when the refusal came, so
     it is dismissed the way the router would have dismissed it — a debounce
     left running would fetch into a stage that no longer holds it. */
  if (leaving) { leaving(); leaving = null; }

  const screen = gateScreen(access);
  stage.innerHTML = screen.html;
  stage.setAttribute('aria-label', screen.title);
  $('#rail').innerHTML = '';
  if (screen.wire) screen.wire(stage, decide);
}

/* Re-reads the session and decides again. Every gate screen ends here rather
   than choosing its own successor — a sign-in form that knew the console came
   next would be wrong the first time somebody signs in and turns out to have no
   role. */
async function decide() {
  await session.load();
  paintBar();
  paintGate();

  const access = session.access();
  /* `no-backend` opens the console rather than a gate, and it is not a hole:
     with no API there is nothing to call, every screen reports no data, and the
     banner above says why. It is what a local run and the browser suite both
     need. */
  if (access === 'staff' || access === 'no-backend') enterConsole();
  else enterGate(access);
}

/* THE GATE IS NO LONGER A BOOT-TIME DECISION ONLY. Every screen calls
   `request.get`, and a 401 or 403 from any of them means the answer decided
   below has stopped being true — a role revoked, a session expired, an API that
   fell over while the console was open. Without this the console would sit on a
   screen that never loads and say nothing; with it, the right gate screen takes
   the page over at the moment the server refuses. */
whenRefused(() => { decide(); });

paintBar();
paintGate();
stage.innerHTML = '<div class="view"><p class="checking mono">checking the session…</p></div>';
decide();
