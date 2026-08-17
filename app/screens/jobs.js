/* ==========================================================================
   Grading queue — is it moving, and what is stuck in it.

   `code` and `expression-answer` are not marked in the request that submits
   them. They go on a queue that a separate node runs, and until this screen
   nothing could say whether that node was doing anything. A queue nobody
   watches is one that stops without telling anybody, and the student it stops
   for sees an answer that stays "not checked" for ever.

   THE FIRST THING IT SAYS IS WHETHER ANYTHING CAN DRAIN IT. The API attaches
   the queue whether or not an executor is configured, so jobs pile up on a
   deployment that has none. "0 running, 4 queued" reads as a lull; the same
   numbers with "no executor configured" over them read as what they are. That
   banner is the point of the screen, not decoration on it.

   THREE SHAPES OF STUCK, ONE LIST, as the API sends them: failed was tried and
   broke, long-queued means nothing ever tried, and running-with-a-dead-lease
   means something tried and vanished. To an operator they are one question.

   NOTHING HERE WRITES. Requeuing a job is a write and this screen does not do
   it — it says what is wrong, and the fixing is still a deploy or a psql
   statement. That is a real limit and the screen says so rather than implying
   a button exists somewhere.
   ========================================================================== */

import { esc } from '../dom.js';
import { get, RequestError } from '../request.js';

export default async function jobs(section) {
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML =
    '<header class="view-head">' +
      '<span class="eyebrow mono">Operate</span>' +
      '<h1>Grading queue</h1>' +
      '<p>Answers that a separate node has to run — code, and algebra that has ' +
      'to be checked symbolically. Everything else is marked in the request ' +
      'itself and never reaches this queue.</p>' +
    '</header>' +
    '<div id="body"><p class="checking mono">reading…</p></div>';

  const body = el.querySelector('#body');

  let data;
  try {
    data = await get('/api/staff/jobs');
  } catch (e) {
    if (e instanceof RequestError && e.refused) return { title: section.name, el };
    body.innerHTML =
      '<section class="block block-empty">' +
        '<p class="empty-line mono">[could not read the queue]</p>' +
        '<p class="empty-note">' + esc(e.message) + '</p>' +
      '</section>';
    return { title: section.name, el };
  }

  const s = data.stats || {};
  const stuck = data.stuck || [];
  const absent = data.executor !== 'configured';
  const idle = !s.queued && !s.running && !s.failed;

  body.innerHTML =
    banner(absent, idle) +
    '<section class="facts">' +
      fact('Queued', s.queued || 0, 'waiting for a worker') +
      fact('Running', s.running || 0, 'claimed, being run now') +
      fact('Failed', s.failed || 0, 'tried and broke') +
      fact('Oldest wait', wait(s.oldestSeconds), 'the longest anything has waited') +
    '</section>' +
    stuckBlock(stuck, data.staleAfterSeconds || 600, idle);

  return { title: section.name, el };
}

/* ---------- the banner that is the point ---------- */

function banner(absent, idle) {
  if (absent) {
    return '<section class="block block-warn">' +
      '<div class="block-top"><h2>No executor is configured</h2>' +
        '<span class="block-score mono">nothing will claim these</span></div>' +
      '<p class="aside"><b>Work still goes on to this queue.</b> The API adds ' +
      'a job whenever an answer needs running, whether or not there is a node ' +
      'to run it — so anything queued below is queued for ever, and the ' +
      'student sees “not checked” for ever with it.</p>' +
      '<p class="aside">It is turned on with ' +
      '<span class="mono">PORTAL_EXECUTOR_TOKEN</span> on the API, plus a node ' +
      'to run the worker. <span class="mono">portal-backend/DEPLOY.md</span> ' +
      'has the section.</p>' +
    '</section>';
  }
  if (idle) {
    return '<section class="block">' +
      '<div class="block-top"><h2>The queue is empty</h2>' +
        '<span class="block-score mono">executor configured</span></div>' +
      '<p class="aside">Nothing waiting, nothing running, nothing broken. On a ' +
      'school this size that is the ordinary state — the queue only fills when ' +
      'somebody submits code.</p>' +
    '</section>';
  }
  return '';
}

const fact = (key, value, note) =>
  '<div class="fact"><span class="fact-key mono">' + esc(key) + '</span>' +
  '<span class="fact-val mono">' + esc(String(value)) + '</span>' +
  '<span class="fact-since">' + esc(note) + '</span></div>';

/* Seconds are what the API sends, because it is a duration and not a date.
   Rounded up rather than down: "0 minutes" for something that has waited fifty
   seconds is the kind of tidy number that hides the thing being measured. */
function wait(seconds) {
  const n = Math.round(seconds || 0);
  if (!n) return '—';
  if (n < 90) return n + 's';
  if (n < 3600) return Math.ceil(n / 60) + 'm';
  if (n < 172800) return Math.ceil(n / 3600) + 'h';
  return Math.ceil(n / 86400) + 'd';
}

/* ---------- what is not getting done ---------- */

const WHY = {
  failed: 'ran and broke',
  queued: 'nothing has picked it up',
  running: 'claimed by a worker that never came back',
};

function stuckBlock(list, staleAfter, idle) {
  if (!list.length) {
    return '<section class="block">' +
      '<div class="block-top"><h2>Nothing stuck</h2></div>' +
      '<div class="block-empty">' +
        '<p class="empty-line mono">[nothing is waiting on a problem]</p>' +
        '<p class="empty-note">' + (idle
          ? 'There is nothing in the queue at all.'
          : 'Everything in the queue is moving — a job counts as stuck once it ' +
            'has failed, or waited more than ' + Math.round(staleAfter / 60) +
            ' minutes, or been claimed by a worker that never came back.') +
        '</p>' +
      '</div>' +
    '</section>';
  }

  return '<section class="block">' +
    '<div class="block-top"><h2>Not getting done</h2>' +
      '<span class="block-score mono">' + list.length + ' job' +
        (list.length === 1 ? '' : 's') + ', newest first</span></div>' +
    '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th scope="col">Exercise</th>' +
        '<th scope="col">Why</th>' +
        '<th scope="col" class="num">Tries</th>' +
        '<th scope="col">Waiting</th>' +
        '<th scope="col">What broke</th>' +
      '</tr></thead><tbody>' +
      list.map(row).join('') +
    '</tbody></table></div>' +
    '<p class="aside">A job counts as stuck once it has failed, or waited more ' +
    'than ' + Math.round(staleAfter / 60) + ' minutes, or been claimed by a ' +
    'worker that never came back. <b>Nothing here requeues them</b> — this ' +
    'console reads the queue and does not move it.</p>' +
  '</section>';
}

function row(j) {
  const since = j.createdAt ? Math.round((Date.now() - new Date(j.createdAt).getTime()) / 1000) : 0;
  return '<tr>' +
    '<td><span class="cell-main mono">' + esc(j.exerciseId || '') + '</span>' +
      '<span class="cell-sub mono">' + esc(j.kind || '') + '</span></td>' +
    '<td>' + esc(WHY[j.state] || j.state || '') +
      '<span class="cell-sub mono">' + esc(j.state || '') + '</span></td>' +
    '<td class="num mono">' + (j.tries || 0) + '</td>' +
    '<td class="mono">' + esc(wait(since)) + '</td>' +
    /* The error wraps and the rest of the row does not: a stack trace is the
       one cell worth reading in full, and letting it widen the table would
       push everything else off the screen. */
    '<td class="detail">' + (j.error
      ? esc(j.error)
      : '<span class="none">nothing was reported</span>') + '</td>' +
  '</tr>';
}
