/* ==========================================================================
   Retention — what is waiting to be swept.

   IT DOES NOT SAY WHEN THE SWEEP LAST RAN, and that is not an omission to fix
   later with a bigger query. Nothing records a run: the sweep is a separate
   command that prints what it removed and exits. Building a table to hold that
   history before anything schedules the command would produce a screen with one
   row in it, from the day somebody ran it by hand.

   WHAT IS ACCUMULATING IS THE MORE USEFUL HALF ANYWAY. Two purges sat written,
   tested and never called in the API for months. A screen of numbers that only
   ever went up would have said so.

   THE POLICY COLUMN IS WHY THIS IS NOT FIVE NUMBERS THAT LOOK ALIKE. Three of
   these are dead things a sweep removes with nobody's permission. One is an
   exam paper that gets CLOSED rather than deleted — and its count is not a
   table growing, it is students who cannot start that exam again. And one is a
   record kept for ever unless somebody decides otherwise, where the count IS
   the size of the decision.
   ========================================================================== */

import { esc } from '../dom.js';
import { get, RequestError } from '../request.js';

/* What each policy word means, in the reader's terms rather than the server's,
   and how it is drawn. `unknown` is deliberately not styled as a problem: it is
   an honest answer, not a fault. */
const POLICY = {
  swept: ['removed automatically', 'tag-quiet'],
  closed: ['closed, never deleted', 'tag-pass'],
  unknown: ['not visible from here', 'tag-warn'],
};

export default async function retention(section) {
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML =
    '<header class="view-head">' +
      '<span class="eyebrow mono">Govern</span>' +
      '<h1>Retention</h1>' +
      '<p>What is stored and waiting to be removed. Not a history of sweeps — ' +
      'nothing records those — but the state they would act on if one ran now.</p>' +
    '</header>' +
    '<div id="body"><p class="checking mono">reading…</p></div>';

  const body = el.querySelector('#body');

  let data;
  try {
    data = await get('/api/staff/retention');
  } catch (e) {
    if (e instanceof RequestError && e.refused) return { title: section.name, el };
    body.innerHTML =
      '<section class="block block-empty">' +
        '<p class="empty-line mono">[could not read what is stored]</p>' +
        '<p class="empty-note">' + esc(e.message) + '</p>' +
      '</section>';
    return { title: section.name, el };
  }

  const rows = (data && data.rows) || [];

  body.innerHTML =
    '<section class="block block-warn">' +
      '<div class="block-top"><h2>Nothing here knows whether the sweep runs</h2>' +
        '<span class="block-score mono">by design</span></div>' +
      '<p class="aside">The sweep is a separate command — ' +
      '<span class="mono">cmd/maintenance</span> — run as its own job, from ' +
      'outside the API. This console can see what is <b>stored</b>; it cannot ' +
      'see whether anything is scheduled to remove it, and a screen that ' +
      'guessed would be worse than one that says so.</p>' +
      '<p class="aside">If these numbers only ever grow, nothing is running it. ' +
      'The commands are in <span class="mono">portal-backend/DEPLOY.md</span>, ' +
      'under “Scheduling the retention sweep”.</p>' +
    '</section>' +
    table(rows) +
    '<section class="block">' +
      '<div class="block-top"><h2>How to read the policy</h2></div>' +
      '<p class="aside"><b>Removed automatically</b> — already refused or ' +
      'already delivered. Deleting it changes nothing anybody can observe, so ' +
      'it needs nobody’s permission.</p>' +
      '<p class="aside"><b>Closed, never deleted</b> — an exam paper opened and ' +
      'never handed in. It is closed so the student can sit that exam again; ' +
      'the record that they started stays, and it does not count against them. ' +
      'This is the one row where a big number means <b>people are stuck</b>, ' +
      'not that a table is growing.</p>' +
      '<p class="aside"><b>Not visible from here</b> — learning events are kept ' +
      'for ever unless a window is configured, and that setting lives on the ' +
      'sweep’s own job. The API cannot see it, so it does not claim to. The ' +
      'count is the size of a decision nobody has made: an event is the only ' +
      'evidence a student ever opened a lesson, with no backfill and no second ' +
      'copy.</p>' +
    '</section>';

  return { title: section.name, el };
}

function table(rows) {
  if (!rows.length) {
    return '<section class="block block-empty">' +
      '<p class="empty-line mono">[nothing to report]</p>' +
      '<p class="empty-note">The API returned no rows at all, which is not a ' +
      'state it should reach.</p>' +
    '</section>';
  }
  return '<div class="table-wrap"><table class="grid">' +
    '<thead><tr>' +
      '<th scope="col">What</th>' +
      '<th scope="col" class="num">Stored</th>' +
      '<th scope="col">Oldest</th>' +
      '<th scope="col">What happens to it</th>' +
    '</tr></thead><tbody>' +
    rows.map(row).join('') +
  '</tbody></table></div>';
}

function row(r) {
  const [label, cls] = POLICY[r.policy] || [r.policy || '—', 'tag-quiet'];
  return '<tr>' +
    '<td><span class="cell-main mono">' + esc(r.kind || '') + '</span>' +
      '<span class="cell-sub">' + esc(r.note || '') + '</span></td>' +
    '<td class="num mono">' + (r.count || 0) + '</td>' +
    /* Nothing stored has no age, and "0s" would read as "something arrived a
       moment ago" — the opposite of an empty shelf. */
    '<td class="mono">' + (r.count ? esc(age(r.oldestSeconds)) : '<span class="none">—</span>') + '</td>' +
    '<td><span class="tag ' + cls + ' mono">' + esc(label) + '</span></td>' +
  '</tr>';
}

/* Rounded up. "0 days" for something that has sat for twenty hours is the kind
   of tidy number that hides the thing being measured. */
function age(seconds) {
  const n = Math.round(seconds || 0);
  if (n < 60) return n + 's';
  if (n < 3600) return Math.ceil(n / 60) + 'm';
  if (n < 172800) return Math.ceil(n / 3600) + 'h';
  return Math.ceil(n / 86400) + 'd';
}
