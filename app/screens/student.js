/* ==========================================================================
   One student's record — what the list opens into.

   THE LIST ANSWERS "WHO IS HERE" AND THIS ANSWERS "HOW IS THIS ONE DOING",
   which is the question a support conversation opens with. It is one call,
   `GET /api/staff/students/{id}`, and the API composes it: identity for the
   person, progress for the track and the sections, assessment for the papers,
   certificates for the documents. Nothing here joins anything.

   IT IS AUDITED WITH A SUBJECT, on the server, and that is the whole reason the
   endpoint is separate from the list. Opening this page writes a row saying who
   looked at whom — including every page of the timeline below, because paging
   through somebody's history is looking at it.

   THE NOTES ARE COUNTED AND NOT SHOWN, and this screen says so out loud rather
   than leaving a number with no text beside it. A note is a student writing to
   themselves while they learn; that one exists, and where, is what a support
   call needs. A count with no explanation reads as a feature somebody forgot to
   finish, which is exactly how it would get "finished".

   NOTHING IS DERIVED. Every number is a number the API sent. No completion
   percentage, no pace, no "at risk" — a school's console is where somebody
   decides whether to trust its figures, and the fastest way to lose that is a
   number nobody can trace back to a row.
   ========================================================================== */

import { esc } from '../dom.js';
import { deedOf } from '../kinds.js';
import { get, RequestError } from '../request.js';

/* How much of the timeline arrives with the record, and how much each "more"
   asks for after that. The same number twice on purpose: a first page that
   differed from the rest would make the offsets arithmetic nobody can check by
   reading the screen. */
const TIMELINE = 30;

export default async function student(params) {
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML = '<p class="checking mono">reading the record…</p>';

  let record = null;
  let shown = [];
  let dead = false;

  try {
    record = await get('/api/staff/students/' + encodeURIComponent(params.id),
      { events: TIMELINE });
  } catch (e) {
    /* A refusal has already taken the page over — see app/request.js. Drawing
       an error under a sign-in form would be two answers at once. */
    if (e instanceof RequestError && e.refused) return { title: 'Student', el };
    el.innerHTML = head({ name: 'Student' }) + problem(e);
    return { title: 'Student', el };
  }

  shown = (record.timeline && record.timeline.entries) || [];
  paint();

  function paint() {
    const s = record.student || {};
    el.innerHTML =
      head(s) +
      facts(s, record.enrollment) +
      forks(record.enrollment) +
      courses(record.courses, record.notes) +
      exams(record.exams) +
      certificates(record.certificates) +
      timeline(record.timeline, shown);
    wire();
  }

  function wire() {
    const more = el.querySelector('#more');
    if (!more) return;
    more.addEventListener('click', async () => {
      more.disabled = true;
      more.textContent = 'reading…';
      let page;
      try {
        page = await get(
          '/api/staff/students/' + encodeURIComponent(params.id) + '/events',
          { limit: TIMELINE, offset: shown.length });
      } catch (e) {
        if (e instanceof RequestError && e.refused) return;
        if (dead) return;
        more.disabled = false;
        more.textContent = 'could not read more — try again';
        return;
      }
      if (dead) return;
      shown = shown.concat(page.entries || []);
      /* The total comes from the page that was just read, not from the one the
         record arrived with: somebody active while this screen is open makes
         the first answer stale, and a "more" button that never turns off is
         how that shows. */
      record.timeline.total = page.total;
      paint();
    });
  }

  return {
    title: (record && record.student && record.student.name) || 'Student',
    el,
    /* Nothing here listens outside its own element, but a click on "more" can
       still be in flight when the screen is replaced — and a paint into a
       detached element is a wasted repaint at best and a stale screen at worst
       if it is the same element re-entering. */
    onLeave() { dead = true; },
  };
}

/* ---------- the pieces ---------- */

function head(s) {
  return '<header class="view-head record-head">' +
    '<a class="back mono" href="#/students">← Students</a>' +
    '<h1>' + esc(s.name || 'Student') + tag(s.staff, 'tag-staff') + '</h1>' +
    '<p class="mono record-email">' + esc(s.email || '') +
      (s.email && s.emailVerified === false
        ? ' <span class="tag tag-warn mono">unverified</span>' : '') +
    '</p>' +
  '</header>';
}

const tag = (text, cls) => text
  ? ' <span class="tag ' + cls + ' mono">' + esc(text) + '</span>' : '';

function problem(e) {
  const gone = e instanceof RequestError && e.status === 404;
  return '<section class="block block-empty">' +
    '<p class="empty-line mono">' +
      (gone ? '[no such student]' : '[could not read the record]') + '</p>' +
    '<p class="empty-note">' + (gone
      ? 'The account is not there. It may have been erased since the list was ' +
        'drawn — the audit log keeps what was done to it either way.'
      : esc(e.message)) +
    '</p>' +
  '</section>';
}

/* The facts a support call opens with, in the order they get asked for. They
   are the list's own columns, from the same row the list drew — so a record and
   the line it was opened from cannot disagree. */
function facts(s, enrolment) {
  const items = [
    ['Plan', s.planId ? '<span class="mono">' + esc(s.planId) + '</span>' : none('none')],
    ['Track', s.trackId
      ? '<span class="mono">' + esc(s.trackId) + '</span>' +
        (s.enrolledAt ? ' <span class="fact-since">since ' + day(s.enrolledAt) + '</span>' : '')
      : none('no track')],
    ['Sections done', '<span class="mono">' + (s.sections || 0) + '</span>'],
    ['Last active', when(s.lastActiveAt)],
    ['Joined', '<span class="mono">' + day(s.joinedAt) + '</span>'],
  ];
  /* Choices with no enrolment is a real state and not a glitch: a fork can be
     settled before the track it belongs to is joined. */
  if (enrolment && !enrolment.trackId) {
    items.push(['Enrolment', none('forks chosen, no track joined')]);
  }
  return '<section class="facts">' + items.map(([k, v]) =>
    '<div class="fact"><span class="fact-key mono">' + esc(k) + '</span>' +
    '<span class="fact-val">' + v + '</span></div>').join('') + '</section>';
}

function forks(enrolment) {
  const keys = Object.keys((enrolment && enrolment.choices) || {}).sort();
  if (!keys.length) return '';
  return block('Forks', 'Which side of each branching step, kept per track so ' +
    'they outlive a change of track.',
    '<ul class="chips">' + keys.map((k) => {
      /* "<trackId>:<stepIx>" — split at the LAST colon, because a track id is
         allowed to contain one and the step is always the tail. */
      const cut = k.lastIndexOf(':');
      const track = cut < 0 ? k : k.slice(0, cut);
      const step = cut < 0 ? '' : k.slice(cut + 1);
      return '<li class="chip mono">' + esc(track) +
        (step ? ' step ' + esc(step) : '') +
        ' → ' + esc(String(enrolment.choices[k])) + '</li>';
    }).join('') + '</ul>');
}

function courses(list, notes) {
  const rows = list || [];
  const note = notesLine(notes);
  if (!rows.length) {
    return block('Courses', '', empty('[nothing opened yet]',
      'Sections appear here as the student finishes them.') + note);
  }
  return block('Courses', '',
    '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th scope="col">Course</th>' +
        '<th scope="col" class="num">Lessons touched</th>' +
        '<th scope="col" class="num">Sections done</th>' +
      '</tr></thead><tbody>' +
      rows.map((c) => '<tr>' +
        '<td class="mono">' + esc(c.courseId) + '</td>' +
        '<td class="num mono">' + (c.lessons || 0) + '</td>' +
        '<td class="num mono">' + (c.sections || 0) + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>' + note);
}

/* SAID OUT LOUD, not left as a bare number. A count with no text beside it
   reads as a half-built feature, and the next person to see it would finish it
   by adding the bodies. */
function notesLine(n) {
  const count = n || 0;
  return '<p class="aside">' +
    (count === 0 ? 'No notes.' : count === 1 ? 'One note.' : esc(String(count)) + ' notes.') +
    ' <b>The console does not show what they say.</b> A note is a student ' +
    'writing to themselves while they learn; that one exists is what this ' +
    'screen is for, and the text is theirs. They can read their own in the ' +
    'data export on the portal.</p>';
}

function exams(list) {
  const rows = list || [];
  if (!rows.length) {
    return block('Exams', '', empty('[no papers]', 'Nothing has been sat yet.'));
  }
  return block('Exams', '',
    '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th scope="col">Exam</th>' +
        '<th scope="col" class="num">Attempts</th>' +
        '<th scope="col" class="num">Best</th>' +
        '<th scope="col">Verdict</th>' +
        '<th scope="col">Last sat</th>' +
      '</tr></thead><tbody>' +
      rows.map((x) => '<tr>' +
        '<td><span class="cell-main mono">' + esc(x.scopeId || '') + '</span>' +
          '<span class="cell-sub mono">' + esc(x.scope || '') + '</span></td>' +
        '<td class="num mono">' + (x.attempts || 0) + '</td>' +
        '<td class="num mono">' + (x.best == null ? '—' : x.best + '%') + '</td>' +
        '<td>' + (x.passed
          ? '<span class="tag tag-pass mono">passed</span>'
          : '<span class="none">not yet</span>') + '</td>' +
        '<td>' + when(x.lastAt) + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>');
}

function certificates(list) {
  const rows = list || [];
  if (!rows.length) {
    return block('Certificates', '',
      empty('[none issued]', 'A certificate is issued when its exam is passed.'));
  }
  return block('Certificates', '',
    '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th scope="col">Code</th>' +
        '<th scope="col">Title</th>' +
        '<th scope="col">Issued</th>' +
        '<th scope="col">Standing</th>' +
      '</tr></thead><tbody>' +
      rows.map((c) => '<tr>' +
        '<td class="mono">' + esc(c.code || '') + '</td>' +
        '<td>' + esc(c.title || '') + '</td>' +
        '<td class="mono">' + day(c.issuedAt) + '</td>' +
        /* Revoked is said in words. A row that only differed by a missing tag
           would read as valid to anybody scanning the column. */
        '<td>' + (c.revokedAt
          ? '<span class="tag tag-warn mono">revoked ' + day(c.revokedAt) + '</span>'
          : '<span class="tag tag-pass mono">valid</span>') + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>');
}

function timeline(page, entries) {
  const total = (page && page.total) || 0;
  if (!entries.length) {
    return block('Timeline', '', empty('[nothing recorded]',
      'The event stream started on the day it was deployed, so a quiet ' +
      'timeline on an old account is missing history rather than an idle ' +
      'student.'));
  }
  const more = entries.length < total
    ? '<div class="pager"><button type="button" class="btn btn-ghost" id="more">' +
      'Show more (' + (total - entries.length) + ' left)</button></div>'
    : '';
  return block('Timeline',
    esc(String(entries.length)) + ' of ' + esc(String(total)) + ', newest first',
    '<ol class="events">' + entries.map(event).join('') + '</ol>' + more);
}

function event(e) {
  return '<li class="event">' +
    '<span class="event-at mono" title="' + esc(e.at || '') + '">' + stamp(e.at) + '</span>' +
    '<span class="event-what">' + esc(deedOf(e.kind)) + '</span>' +
    '<span class="event-where mono">' + esc(place(e)) + '</span>' +
  '</li>';
}

/* Where it happened, in the portal's own coordinates. `lessonIx` can be 0 and
   that is a real lesson, so it is compared against null rather than tested for
   truth — the classic way the first lesson of every course disappears. */
function place(e) {
  if (!e.courseId) return '';
  let out = e.courseId;
  if (e.lessonIx != null) out += ' · lesson ' + e.lessonIx;
  if (e.sectionId) out += ' · ' + e.sectionId;
  return out;
}

/* ---------- chrome ---------- */

/* `.block-top` and `.block-score` are the console's existing panel heading,
   reused rather than reinvented — a second heading style would make this screen
   look like a different application from the two beside it. */
function block(title, note, inner) {
  return '<section class="block">' +
    '<div class="block-top"><h2>' + esc(title) + '</h2>' +
      (note ? '<span class="block-score mono">' + note + '</span>' : '') +
    '</div>' + inner +
  '</section>';
}

const empty = (line, note) =>
  '<div class="block-empty">' +
    '<p class="empty-line mono">' + esc(line) + '</p>' +
    '<p class="empty-note">' + esc(note) + '</p>' +
  '</div>';

const none = (text) => '<span class="none">' + esc(text) + '</span>';

/* ---------- dates ----------
   The same two readings the list uses: "last active" is a distance, because it
   is scanned for who has gone quiet, and a date is a date. */

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
  return '<span title="' + esc(then.toISOString()) + '">' + text + '</span>';
}

function day(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : esc(d.toISOString().slice(0, 10));
}

/* A timeline is read down the page, so the entries carry a date AND a time —
   "3 days ago" twelve times in a row says nothing about the order of a
   morning. */
function stamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—'
    : esc(d.toISOString().slice(0, 16).replace('T', ' '));
}
