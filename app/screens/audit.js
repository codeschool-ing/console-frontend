/* ==========================================================================
   Audit — who did what, to whom.

   THE SCREEN THAT WATCHES THIS ONE'S NEIGHBOURS. Everything else in the console
   reads student data; this is where that reading is visible. It is deliberately
   in `Govern` and not in `Measure`: it is not a number about the school, it is
   a record about the people running it — including whoever is reading it.

   READING IT IS NOT ITSELF RECORDED, and the API decides that, not this screen.
   A log that wrote a row every time somebody opened it would grow fastest
   exactly when it most needs to be readable.

   AN ERASED SUBJECT IS SHOWN AS ERASED, not as blank. The row survives an
   account being closed and the name does not — that asymmetry is the whole
   privacy design of the table, and a screen that rendered the gap as an empty
   cell would hide the one thing it proves: the action still happened.
   ========================================================================== */

import { esc } from '../dom.js';
import { get, RequestError } from '../request.js';

const PAGE = 50;

/* What each action is called on screen. An action the API sends that is not
   listed still shows, under its dotted name — a log that hid a line it did not
   recognise would be worse than useless. */
const ACTIONS = new Map([
  ['staff.students.list', 'Listed students'],
  ['staff.student.view', 'Opened a student'],
  /* The writes. They were missing here, which meant the two entries worth
     finding fastest — somebody granted access, somebody was given a
     subscription — were the two this filter could not select, and showed under
     their dotted names among thousands of reads. */
  ['staff.role.granted', 'Granted staff access'],
  ['staff.role.revoked', 'Revoked staff access'],
  ['staff.plan.changed', 'Changed a plan'],
]);

export default async function audit(section) {
  const el = document.createElement('div');
  el.className = 'view';

  let action = '';
  let offset = 0;
  let inFlight = 0;

  el.innerHTML =
    '<header class="view-head">' +
      '<span class="eyebrow mono">Govern</span>' +
      '<h1>Audit</h1>' +
      '<p>Every staff action that touched somebody’s data, including your ' +
      'own. Append-only: nothing here can be edited or removed.</p>' +
    '</header>' +
    '<div class="list-bar">' +
      '<label class="search">' +
        '<span class="visually-hidden">Filter by action</span>' +
        '<select id="action">' +
          '<option value="">every action</option>' +
          [...ACTIONS].map(([id, label]) =>
            '<option value="' + esc(id) + '">' + esc(label) + '</option>').join('') +
        '</select>' +
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
      page = await get('/api/staff/audit', { action, limit: PAGE, offset });
    } catch (e) {
      if (e instanceof RequestError && e.refused) return;
      if (ticket !== inFlight) return;
      rows.innerHTML =
        '<section class="block block-empty">' +
          '<p class="empty-line mono">[could not read the log]</p>' +
          '<p class="empty-note">' + esc(e.message) + '</p>' +
        '</section>';
      count.textContent = '';
      pager.hidden = true;
      return;
    }
    if (ticket !== inFlight) return;
    paint(page);
  }

  function paint(page) {
    const list = page.entries || [];
    const total = page.total || 0;

    count.textContent = total === 0 ? ''
      : (offset + 1) + '–' + (offset + list.length) + ' of ' + total;

    if (!list.length) {
      rows.innerHTML =
        '<section class="block block-empty">' +
          '<p class="empty-line mono">[nothing recorded yet]</p>' +
          '<p class="empty-note">' + (action
            ? 'No entries for that action.'
            : 'The log fills as staff use the console. It starts empty, and ' +
              'an empty log is the honest state of a console nobody has ' +
              'opened yet — not a sign that recording is off.') +
          '</p>' +
        '</section>';
      pager.hidden = true;
      return;
    }

    rows.innerHTML =
      '<div class="table-wrap"><table class="grid">' +
        '<thead><tr>' +
          '<th scope="col">When</th>' +
          '<th scope="col">Who</th>' +
          '<th scope="col">Did</th>' +
          '<th scope="col">To</th>' +
          '<th scope="col">Detail</th>' +
        '</tr></thead>' +
        '<tbody>' + list.map(row).join('') + '</tbody>' +
      '</table></div>';

    pager.hidden = false;
    prev.disabled = offset === 0;
    next.disabled = offset + list.length >= total;
  }

  function row(e) {
    return '<tr>' +
      '<td class="mono nowrap" title="' + esc(e.at || '') + '">' + stamp(e.at) + '</td>' +
      '<td>' +
        '<span class="cell-main">' + esc(e.actor || 'unknown') + '</span>' +
        (e.role ? '<span class="cell-sub mono">' + esc(e.role) + '</span>' : '') +
      '</td>' +
      '<td>' + esc(ACTIONS.get(e.action) || e.action) +
        '<span class="cell-sub mono">' + esc(e.action) + '</span></td>' +
      '<td>' + subject(e) + '</td>' +
      '<td class="mono detail">' + detail(e.detail) + '</td>' +
    '</tr>';
  }

  /* The three states of a subject, and the third is the one worth drawing
     properly: no subject at all, a subject who is still here, and a subject
     whose account has been erased since. The last one keeps the action on the
     record and loses the person, which is the point of the table's design. */
  function subject(e) {
    if (e.erased) return '<span class="tag tag-quiet mono">erased</span>';
    if (!e.subject) return '<span class="none">—</span>';
    return esc(e.subject);
  }

  function detail(d) {
    const entries = Object.entries(d || {}).filter(([, v]) => v !== '' && v !== null);
    if (!entries.length) return '<span class="none">—</span>';
    return entries.map(([k, v]) =>
      '<span class="pair">' + esc(k) + '=' + esc(String(v)) + '</span>').join(' ');
  }

  /* Date and time, not a distance. An audit line is read to be quoted back —
     "at 14:02 on the third" — and "2 hours ago" cannot be. */
  function stamp(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return esc(d.toISOString().slice(0, 16).replace('T', ' '));
  }

  el.querySelector('#action').addEventListener('change', (e) => {
    action = e.target.value;
    offset = 0;
    load();
  });
  prev.addEventListener('click', () => { offset = Math.max(0, offset - PAGE); load(); });
  next.addEventListener('click', () => { offset += PAGE; load(); });

  await load();

  return {
    title: section.name,
    el,
    onLeave() { inFlight += 1; },
  };
}
