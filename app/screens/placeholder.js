/* ==========================================================================
   The screen every section has until it has a real one.

   It is not a "coming soon" card. It renders that section's entry from
   sections.js — what the screen is for, and the capabilities it has to carry
   with the status each one is in today. So an empty console is still readable
   as a plan, and the plan cannot drift away from the screens, because it is the
   same file both are built from.

   The same principle the portal already applies one level down: an assessment
   with no exercises written still appears, and says what is coming, instead of
   vanishing and rearranging the screen the day it arrives.
   ========================================================================== */

import { esc } from '../dom.js';

const LABEL = { ready: 'works today', partial: 'partial', none: 'not built' };

export default function placeholder(section) {
  const el = document.createElement('div');
  el.className = 'view view-plan';

  const done = section.plan.filter((p) => p[0] === 'ready').length;

  el.innerHTML =
    '<header class="view-head">' +
      '<span class="eyebrow mono">' + esc(section.group) + '</span>' +
      '<h1>' + esc(section.name) + '</h1>' +
      '<p>' + esc(section.blurb) + '</p>' +
    '</header>' +

    '<section class="block block-empty">' +
      '<p class="empty-line mono">[nothing is built behind this screen yet]</p>' +
      '<p class="empty-note">What it has to carry is below, with where each piece stands. ' +
        'Nothing on this page calls the API.</p>' +
    '</section>' +

    '<section class="block">' +
      '<div class="block-top">' +
        '<h2>What goes here</h2>' +
        '<span class="block-score mono">' + done + ' of ' + section.plan.length + ' already exist</span>' +
      '</div>' +
      '<ul class="plan">' +
        section.plan.map(([status, name, note]) => (
          '<li class="plan-row">' +
            '<span class="mark mark-' + status + '" title="' + LABEL[status] + '" aria-hidden="true"></span>' +
            '<span>' +
              '<span class="plan-name">' + esc(name) + '</span>' +
              '<span class="plan-status mono">' + LABEL[status] + '</span>' +
              (note ? '<span class="plan-note">' + esc(note) + '</span>' : '') +
            '</span>' +
          '</li>'
        )).join('') +
      '</ul>' +
    '</section>';

  return { title: section.name, el };
}
