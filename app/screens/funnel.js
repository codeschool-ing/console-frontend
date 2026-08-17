/* ==========================================================================
   Funnel — where a course loses people.

   THE ONE SCREEN THAT COULD NOT HAVE BEEN BUILT BEFORE THE EVENT STREAM.
   `section_progress` records completions and never openings, so the
   denominator — who reached the lesson at all — did not exist. A funnel drawn
   from completions alone shows every course keeping everybody, because the
   people it lost are exactly the ones with no completion to count. That is
   worth saying on the screen, and it is: the empty state says so.

   THE COURSE LIST IS THE STREAM'S, NOT THE CATALOGUE'S. The console carries no
   catalogue and should not start carrying a fourth copy of one, and a list of
   122 would bury the handful anybody is actually in. A course nobody has opened
   simply is not here — which is the honest answer to "where does it lose
   people": nowhere yet.

   NOTHING IS DERIVED, as everywhere else in this console. The API sends two
   counts per lesson; the bars are those two counts to scale. No completion
   rate, no "at risk" threshold — the moment a number cannot be traced back to a
   row, nobody can be argued out of distrusting the rest.
   ========================================================================== */

import { esc } from '../dom.js';
import { get, RequestError } from '../request.js';

export default async function funnel(section) {
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML =
    '<header class="view-head">' +
      '<span class="eyebrow mono">Measure</span>' +
      '<h1>Funnel</h1>' +
      '<p>Where a course loses people, lesson by lesson. Only courses somebody ' +
      'has opened appear — the list comes from the event stream, not from the ' +
      'catalogue.</p>' +
    '</header>' +
    '<div id="body"><p class="checking mono">reading…</p></div>';

  const body = el.querySelector('#body');

  let list;
  try {
    list = await get('/api/staff/courses');
  } catch (e) {
    if (e instanceof RequestError && e.refused) return { title: section.name, el };
    body.innerHTML =
      '<section class="block block-empty">' +
        '<p class="empty-line mono">[could not read the courses]</p>' +
        '<p class="empty-note">' + esc(e.message) + '</p>' +
      '</section>';
    return { title: section.name, el };
  }

  const courses = (list && list.courses) || [];
  if (!courses.length) {
    body.innerHTML =
      '<section class="block block-empty">' +
        '<p class="empty-line mono">[no course has been opened yet]</p>' +
        '<p class="empty-note">A course appears here once somebody opens a ' +
        'section in it. The event stream also started on the day it was ' +
        'deployed, so anything before that is missing rather than quiet — a ' +
        'funnel cannot be drawn backwards.</p>' +
      '</section>';
    return { title: section.name, el };
  }

  body.innerHTML =
    '<div class="table-wrap"><table class="grid">' +
      '<thead><tr>' +
        '<th scope="col">Course</th>' +
        '<th scope="col" class="num">Students</th>' +
        '<th scope="col" class="num">Events</th>' +
      '</tr></thead><tbody>' +
      courses.map((c) => '<tr>' +
        '<td><a class="cell-main cell-link" href="#/funnel/' +
          encodeURIComponent(c.courseId) + '">' + esc(c.courseId) + '</a></td>' +
        /* The people first and the events second, in that column order, for the
           reason the Activity screen draws them that way: which number is read
           as "the" number is decided by how it is laid out. */
        '<td class="num mono">' + (c.students || 0) + '</td>' +
        '<td class="num mono">' + (c.total || 0) + '</td>' +
      '</tr>').join('') +
    '</tbody></table></div>';

  return { title: section.name, el };
}

/* ---------- one course ---------- */

export async function courseFunnel(params) {
  const el = document.createElement('div');
  el.className = 'view';
  el.innerHTML = '<p class="checking mono">reading…</p>';

  let data;
  try {
    data = await get('/api/staff/courses/' + encodeURIComponent(params.courseId) + '/funnel');
  } catch (e) {
    if (e instanceof RequestError && e.refused) return { title: 'Funnel', el };
    el.innerHTML = head(params.courseId) +
      '<section class="block block-empty">' +
        '<p class="empty-line mono">[could not read the funnel]</p>' +
        '<p class="empty-note">' + esc(e.message) + '</p>' +
      '</section>';
    return { title: params.courseId, el };
  }

  const steps = (data && data.steps) || [];
  if (!steps.length) {
    el.innerHTML = head(params.courseId) +
      '<section class="block block-empty">' +
        '<p class="empty-line mono">[nothing recorded for this course]</p>' +
        '<p class="empty-note">No lesson of it has been opened since the event ' +
        'stream was deployed.</p>' +
      '</section>';
    return { title: params.courseId, el };
  }

  /* Every bar is a fraction of the SAME number — the busiest lesson's reach,
     which is almost always the first. Scaling each pair to its own maximum
     would draw every course as a flat wall and hide the drop entirely, which is
     the one thing this screen exists to show. */
  const peak = Math.max(...steps.map((s) => s.reached || 0), 1);
  const first = steps[0].reached || 0;
  const last = steps[steps.length - 1].reached || 0;

  el.innerHTML = head(params.courseId) +
    '<section class="block">' +
      '<div class="block-top"><h2>Reached and finished, lesson by lesson</h2>' +
        '<span class="block-score mono">' + steps.length + ' lesson' +
          (steps.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<ol class="funnel">' + steps.map((s) => step(s, peak)).join('') + '</ol>' +
      '<p class="aside">' + kept(first, last) + '</p>' +
    '</section>' +
    '<section class="block">' +
      '<div class="block-top"><h2>How to read this</h2></div>' +
      '<p class="aside"><b>Reached</b> is how many people opened a section in ' +
      'that lesson; <b>finished</b> is how many completed one. Both count ' +
      '<b>people</b>, not events, so somebody who re-reads a lesson four times ' +
      'is one person. The gap between the two bars is the lesson\'s own loss; ' +
      'the fall from one row to the next is where people leave the course.</p>' +
      '<p class="aside">The stream started on the day it was deployed. A course ' +
      'taught before that shows only what has happened since — the shape is ' +
      'true, the totals are not the course\'s whole history.</p>' +
    '</section>';

  return { title: params.courseId, el };
}

function head(courseId) {
  return '<header class="view-head record-head">' +
    '<a class="back mono" href="#/funnel">← Funnel</a>' +
    '<span class="eyebrow mono">Measure</span>' +
    '<h1 class="mono">' + esc(courseId) + '</h1>' +
  '</header>';
}

function step(s, peak) {
  const reached = s.reached || 0;
  const finished = s.finished || 0;
  const pct = (n) => Math.round((n / peak) * 100);
  return '<li class="fstep">' +
    '<span class="fstep-ix mono">lesson ' + (s.lessonIx == null ? '—' : s.lessonIx) + '</span>' +
    '<span class="fstep-bars">' +
      '<span class="fbar fbar-reached" style="width:' + pct(reached) + '%" ' +
        'title="' + reached + ' reached"></span>' +
      '<span class="fbar fbar-finished" style="width:' + pct(finished) + '%" ' +
        'title="' + finished + ' finished"></span>' +
    '</span>' +
    '<span class="fstep-n mono">' + reached + ' <span class="dim">/</span> ' + finished + '</span>' +
  '</li>';
}

/* The one sentence on this screen that does arithmetic, and it is subtraction
   of two numbers that are both on the page — not a rate, not a score. It is
   here because "12 down to 3" is the finding, and leaving a reader to do it
   across twenty rows is how a finding gets missed. */
function kept(first, last) {
  if (!first) return 'Nobody has reached the first lesson yet.';
  if (last >= first) {
    return '<b>' + first + '</b> reached the first lesson and <b>' + last +
      '</b> the last. Nobody has dropped out of this one.';
  }
  return '<b>' + first + '</b> reached the first lesson; <b>' + last +
    '</b> reached the last. That is <b>' + (first - last) + '</b> ' +
    (first - last === 1 ? 'person' : 'people') + ' who stopped somewhere in between.';
}
