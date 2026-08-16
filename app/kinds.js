/* ==========================================================================
   What an event is called on screen.

   ONE LIST, BECAUSE TWO SCREENS READ IT. Activity counts the kinds and the
   student's record lists them one by one; the same `exam.submitted` naming
   itself two different ways in two places is a console that reads as two
   products. It lived in `activity.js` until the record needed it.

   A KIND THAT IS NOT LISTED STILL SHOWS, under its own dotted name. The
   backend adds one by adding a constant and calling it — no migration, no
   registry — so this file is always allowed to be a release behind, and a
   screen that silently dropped what it did not recognise would hide exactly
   the new thing somebody wanted to see.
   ========================================================================== */

/* The order they are worth reading in, which is not alphabetical: the two that
   carry the funnel come first, and the ones that happen once per account come
   last. */
export const KINDS = [
  ['section.viewed', 'Sections opened', 'Opened a section'],
  ['section.completed', 'Sections completed', 'Completed a section'],
  ['exam.started', 'Exams started', 'Started an exam'],
  ['exam.submitted', 'Exams submitted', 'Submitted an exam'],
  ['enrolled', 'Enrolled', 'Enrolled on a track'],
  ['track.changed', 'Changed track', 'Changed track'],
  ['fork.chosen', 'Fork chosen', 'Chose a fork'],
  ['account.registered', 'Registered', 'Registered'],
  ['note.saved', 'Notes saved', 'Saved a note'],
  ['progress.erased', 'Erased their progress', 'Erased their progress'],
];

/* Two vocabularies for the same kinds, because they answer two questions. A
   tally is a plural counted over everybody — "Sections opened, 412" — and a
   timeline entry is one thing one person did — "Opened a section". Sharing the
   first form would have the record saying "Sections opened" about a single
   click. */
export const LABELS = new Map(KINDS.map(([kind, plural]) => [kind, plural]));
export const DEEDS = new Map(KINDS.map(([kind, , deed]) => [kind, deed]));
export const ORDER = new Map(KINDS.map(([kind], i) => [kind, i]));

export const deedOf = (kind) => DEEDS.get(kind) || kind;
