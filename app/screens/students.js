/* ==========================================================================
   Students — the console's first screen, and it only reads.

   ONE ENDPOINT, `GET /api/staff/students`, behind `web.RequireStaff`. Every
   column here is a column the API sends; nothing is derived, guessed or
   averaged, because the first screen of a console is where somebody learns
   whether to trust the numbers on it.

   WHAT IT DOES NOT DO is write. Not an accident of scope: the audit log is
   deferred, and portal-backend's ARCHITECTURE §8 names its trigger as the first
   staff endpoint that writes. A console that can change a student's row before
   anything records who changed it is a console nobody can be asked to account
   for.

   THE SEARCH IS THE SERVER'S. It re-fetches on a debounce rather than filtering
   the page in hand — a filter over 25 rows would silently mean "search the page
   you are looking at", which is the wrong answer and looks like the right one.
   ========================================================================== */

import { esc } from '../dom.js';
import { get, RequestError } from '../request.js';

const PAGE = 25;
/* Long enough that typing a name is one request and not eight; short enough
   that the list still feels like it is following along. */
const DEBOUNCE = 250;

export default async function students(section) {
  const el = document.createElement('div');
  el.className = 'view';

  let query = '';
  let offset = 0;
  let timer = null;
  let inFlight = 0;

  el.innerHTML =
    '<header class="view-head">' +
      '<span class="eyebrow mono">Operate</span>' +
      '<h1>Students</h1>' +
      '<p>Everyone with an account, what they are studying and when they were ' +
      'last here. Read-only.</p>' +
    '</header>' +
    '<div class="list-bar">' +
      '<label class="search">' +
        '<span class="visually-hidden">Search by name or e-mail</span>' +
        '<input type="search" id="q" placeholder="name or e-mail" ' +
          'autocomplete="off" spellcheck="false" />' +
      '</label>' +
      '<span class="list-count mono" id="count" aria-live="polite"></span>' +
    '</div>' +
    '<div id="rows"></div>' +
    '<div class="pager" id="pager" hidden>' +
      '<button type="button" class="btn btn-ghost" id="prev">Previous</button>' +
      '<button type="button" class="btn btn-ghost" id="next">Next</button>' +
    '</div>';

  const rows = el.querySelector('#rows');
  const count = el.querySelector('#count');
  const pager = el.querySelector('#pager');
  const prev = el.querySelector('#prev');
  const next = el.querySelector('#next');

  async function load() {
    const ticket = ++inFlight;
    if (!rows.querySelector('table')) {
      rows.innerHTML = '<p class="checking mono">reading…</p>';
    }

    let page;
    try {
      page = await get('/api/staff/students', { q: query, limit: PAGE, offset });
    } catch (e) {
      /* A refusal has already taken the page over — see app/request.js. Drawing
         an error under a sign-in form would be two answers at once. */
      if (e instanceof RequestError && e.refused) return;
      if (ticket !== inFlight) return;
      rows.innerHTML =
        '<section class="block block-empty">' +
          '<p class="empty-line mono">[could not read the students]</p>' +
          '<p class="empty-note">' + esc(e.message) + '</p>' +
        '</section>';
      count.textContent = '';
      pager.hidden = true;
      return;
    }

    /* A slow first request must not land on top of a faster second one: the
       search fires a call per pause in the typing, and they can answer out of
       order. */
    if (ticket !== inFlight) return;
    paint(page);
  }

  function paint(page) {
    const list = page.students || [];
    const total = page.total || 0;

    count.textContent = total === 0 ? ''
      : (offset + 1) + '–' + (offset + list.length) + ' of ' + total;

    if (!list.length) {
      rows.innerHTML =
        '<section class="block block-empty">' +
          '<p class="empty-line mono">' +
            (query ? '[nobody matches “' + esc(query) + '”]' : '[no accounts yet]') +
          '</p>' +
          '<p class="empty-note">' + (query
            ? 'The search looks at the name and the e-mail address, anywhere in either.'
            : 'The first row appears when somebody registers on the portal.') +
          '</p>' +
        '</section>';
      pager.hidden = true;
      return;
    }

    rows.innerHTML =
      '<div class="table-wrap"><table class="grid">' +
        '<thead><tr>' +
          '<th scope="col">Student</th>' +
          '<th scope="col">Track</th>' +
          '<th scope="col" class="num">Sections</th>' +
          '<th scope="col">Last active</th>' +
          '<th scope="col">Plan</th>' +
          '<th scope="col">Joined</th>' +
        '</tr></thead>' +
        '<tbody>' + list.map(row).join('') + '</tbody>' +
      '</table></div>';

    pager.hidden = false;
    prev.disabled = offset === 0;
    next.disabled = offset + list.length >= total;
  }

  function row(s) {
    return '<tr>' +
      '<td>' +
        '<span class="cell-main">' + esc(s.name) + staffMark(s) + '</span>' +
        '<span class="cell-sub mono">' + esc(s.email) + verifyMark(s) + '</span>' +
      '</td>' +
      '<td>' + (s.trackId
        ? '<span class="mono">' + esc(s.trackId) + '</span>'
        : '<span class="none">no track</span>') + '</td>' +
      '<td class="num mono">' + (s.sections || 0) + '</td>' +
      '<td>' + when(s.lastActiveAt) + '</td>' +
      '<td class="mono">' + esc(s.planId || '') + '</td>' +
      '<td class="mono">' + day(s.joinedAt) + '</td>' +
    '</tr>';
  }

  /* Who can open this console, on the screen — until now it was a question only
     somebody with a psql prompt could answer. */
  const staffMark = (s) => s.staff
    ? ' <span class="tag tag-staff mono">' + esc(s.staff) + '</span>' : '';

  /* An unconfirmed address is worth flagging on sight: every e-mail the school
     sends to it goes nowhere, and the student has no way of knowing. */
  const verifyMark = (s) => s.emailVerified
    ? '' : ' <span class="tag tag-warn mono">unverified</span>';

  el.querySelector('#q').addEventListener('input', (e) => {
    query = e.target.value.trim();
    offset = 0;
    clearTimeout(timer);
    timer = setTimeout(load, DEBOUNCE);
  });

  prev.addEventListener('click', () => {
    offset = Math.max(0, offset - PAGE);
    load();
  });
  next.addEventListener('click', () => {
    offset += PAGE;
    load();
  });

  await load();

  return {
    title: section.name,
    el,
    /* The debounce is the one thing this screen leaves running outside its own
       element: leaving a section mid-type would otherwise fetch into a stage
       that has already been replaced. */
    onLeave() {
      clearTimeout(timer);
      inFlight += 1;
    },
  };
}

/* ---------- dates ----------
   Two formats, because they answer two questions. "Last active" is read as a
   distance — who has gone quiet — and "joined" is read as a date. */

function when(iso) {
  if (!iso) return '<span class="none">never</span>';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '<span class="none">—</span>';

  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  const text = days <= 0 ? 'today'
    : days === 1 ? 'yesterday'
      : days < 30 ? days + ' days ago'
        : days < 365 ? Math.floor(days / 30) + ' months ago'
          : Math.floor(days / 365) + ' years ago';
  /* The exact stamp is one hover away, because "3 months ago" is the right
     thing to scan and the wrong thing to quote back to somebody. */
  return '<span title="' + esc(then.toISOString()) + '">' + text + '</span>' +
    (days >= 30 ? ' <span class="tag tag-quiet mono">quiet</span>' : '');
}

function day(iso) {
  if (!iso) return '<span class="none">—</span>';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '<span class="none">—</span>'
    : esc(d.toISOString().slice(0, 10));
}
