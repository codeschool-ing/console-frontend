/* ==========================================================================
   Activity — what the school is doing, from the event stream.

   EVERY NUMBER COMES WITH THE PEOPLE IT CAME FROM. A thousand events from one
   insomniac is not a busy week, and a dashboard that showed only the total
   would say it was. Each tally carries both, and the headline reads the second
   one.

   NOTHING HERE IS DERIVED. The API sends counts; this screen arranges them. No
   averages, no rates, no "engagement score" — the first dashboard of a school
   is where somebody decides whether to trust its numbers, and a figure nobody
   can trace back to a row is the fastest way to lose that.

   IT SAYS WHEN IT IS EMPTY AND WHY. A window with no events is the ordinary
   state of a school that has not opened yet, and a screen of zeroes reads as a
   broken query. The event stream also started on the day it was deployed, so
   anything before that is missing rather than quiet — which the empty state
   says out loud, because a chart that starts flat invites the wrong conclusion.
   ========================================================================== */

import { esc } from '../dom.js';
import { get, RequestError } from '../request.js';

/* The windows offered. Thirty days by default: long enough to have a shape,
   short enough that a quiet week is visible in it. */
const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/* What each kind is called on screen, and the order they are worth reading in.
   A kind the API sends that is not listed still shows — under its own dotted
   name, at the end — because a dashboard that silently drops a number it does
   not recognise is worse than one that shows an ugly label. */
const KINDS = [
  ['section.viewed', 'Sections opened'],
  ['section.completed', 'Sections completed'],
  ['exam.started', 'Exams started'],
  ['exam.submitted', 'Exams submitted'],
  ['enrolled', 'Enrolled'],
  ['track.changed', 'Changed track'],
  ['fork.chosen', 'Fork chosen'],
  ['account.registered', 'Registered'],
  ['note.saved', 'Notes saved'],
  ['progress.erased', 'Erased their progress'],
];
const LABELS = new Map(KINDS);
const ORDER = new Map(KINDS.map(([kind], i) => [kind, i]));

export default async function activity(section) {
  const el = document.createElement('div');
  el.className = 'view';

  let days = 30;
  let inFlight = 0;

  el.innerHTML =
    '<header class="view-head">' +
      '<span class="eyebrow mono">Measure</span>' +
      '<h1>Activity</h1>' +
      '<p>What has happened, from the event stream. Every count carries the ' +
      'number of people behind it.</p>' +
    '</header>' +
    '<div class="list-bar">' +
      '<div class="segmented" role="group" aria-label="Window">' +
        WINDOWS.map((w) =>
          '<button type="button" class="seg' + (w.days === 30 ? ' on' : '') + '" ' +
            'data-days="' + w.days + '">' + esc(w.label) + '</button>').join('') +
      '</div>' +
      '<span class="list-count mono" id="window"></span>' +
    '</div>' +
    '<div id="body"></div>';

  const body = el.querySelector('#body');
  const windowLabel = el.querySelector('#window');

  async function load() {
    const ticket = ++inFlight;
    if (!body.querySelector('.tallies')) {
      body.innerHTML = '<p class="checking mono">reading…</p>';
    }

    let data;
    try {
      data = await get('/api/staff/metrics', { days });
    } catch (e) {
      if (e instanceof RequestError && e.refused) return;
      if (ticket !== inFlight) return;
      body.innerHTML =
        '<section class="block block-empty">' +
          '<p class="empty-line mono">[could not read the metrics]</p>' +
          '<p class="empty-note">' + esc(e.message) + '</p>' +
        '</section>';
      windowLabel.textContent = '';
      return;
    }
    if (ticket !== inFlight) return;
    paint(data);
  }

  function paint(data) {
    const tallies = (data.tallies || []).slice().sort(byOrder);
    windowLabel.textContent = 'since ' + (data.since || '').slice(0, 10);

    if (!tallies.length) {
      body.innerHTML =
        '<section class="block block-empty">' +
          '<p class="empty-line mono">[nothing in this window]</p>' +
          '<p class="empty-note">No events were recorded in the last ' + days +
          ' days. The stream started when the server carrying it was deployed, ' +
          'so a window reaching further back than that is <b>missing</b> rather ' +
          'than quiet.</p>' +
        '</section>';
      return;
    }

    body.innerHTML =
      '<section class="block tallies">' +
        '<div class="tally-grid">' + tallies.map(tally).join('') + '</div>' +
      '</section>' +
      chart(data.daily || []);
  }

  const byOrder = (a, b) =>
    (ORDER.has(a.kind) ? ORDER.get(a.kind) : 99) - (ORDER.has(b.kind) ? ORDER.get(b.kind) : 99);

  /* The people first and the events second, and the type sizes say so. Which
     number a reader takes as "the" number is decided by how it is drawn, not by
     which is listed. */
  function tally(t) {
    return '<div class="tally">' +
      '<span class="tally-people mono">' + t.students + '</span>' +
      '<span class="tally-kind">' + esc(LABELS.get(t.kind) || t.kind) + '</span>' +
      '<span class="tally-total mono">' + t.total + ' event' +
        (t.total === 1 ? '' : 's') + '</span>' +
    '</div>';
  }

  /* Bars, drawn from the numbers with no library and no scale trickery: the
     tallest bar is the busiest day and every other is its true fraction. A
     y-axis that did not start at zero would make a flat week look like a
     climb. */
  function chart(daily) {
    if (!daily.length) return '';
    const peak = Math.max(...daily.map((d) => d.total), 1);
    return '<section class="block">' +
      '<div class="block-top"><h2>By day</h2>' +
        '<span class="block-score mono">peak ' + peak + '</span></div>' +
      '<div class="bars">' + daily.map((d) => {
        const height = Math.max(2, Math.round((d.total / peak) * 100));
        const day = String(d.day || '').slice(0, 10);
        return '<span class="bar" style="height:' + height + '%" ' +
          'title="' + esc(day) + ' — ' + d.total + ' events, ' +
          d.students + ' student' + (d.students === 1 ? '' : 's') + '"></span>';
      }).join('') +
      '</div>' +
      '<p class="bars-scale mono">' +
        esc(String(daily[0].day || '').slice(0, 10)) + ' → ' +
        esc(String(daily[daily.length - 1].day || '').slice(0, 10)) +
      '</p>' +
    '</section>';
  }

  el.querySelector('.segmented').addEventListener('click', (e) => {
    const button = e.target.closest('.seg[data-days]');
    if (!button) return;
    days = Number(button.dataset.days);
    el.querySelectorAll('.seg').forEach((b) => b.classList.toggle('on', b === button));
    load();
  });

  await load();

  return {
    title: section.name,
    el,
    onLeave() { inFlight += 1; },
  };
}
