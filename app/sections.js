/* ==========================================================================
   The console's map of itself.

   One entry per section, and inside it the capabilities that section is meant
   to carry, each with the status the capability map recorded. Nothing here is
   decoration: it is what the placeholder screens render, it is what the rail is
   built from, and it is the checklist a real screen is measured against.

   WHY THE PLAN LIVES IN THE CODE. An empty console with seven blank pages says
   nothing about what it is for, and the first thing anyone would do is guess.
   This file is the answer to "what goes here", written down where it cannot
   drift away from the screens.

   As a section is built, its `screen` field stops being null and points at a
   module. The entries below are how the finished screen will be judged, so they
   are not deleted when it lands — they are the acceptance list.

   Status vocabulary, from the capability map:
     ready    exercised end to end today, by an endpoint or a screen
     partial  the hard half exists; `note` says what is missing
     none     nothing yet
   ========================================================================== */

export const SECTIONS = [
  {
    id: 'overview',
    name: 'Overview',
    group: 'Measure',
    blurb: 'The four numbers that say whether the school is working, and the short list of things a person has to decide today.',
    plan: [
      ['partial', 'Active students, sign-ups, pass rate',
        'the rows exist; nothing aggregates or serves them'],
      ['none', 'Guest to Student conversion',
        'blocked: needs the events table and something to convert to'],
      ['none', 'Where students stop',
        'blocked: the visits call already reaches the server and is discarded'],
      ['none', 'What needs a person',
        'dead-lettered jobs, bounced e-mail, flagged certificates'],
      ['ready', 'Enrolments by track',
        'needs no new data at all — every student already carries one'],
    ],
  },
  {
    id: 'events',
    name: 'Events',
    group: 'Measure',
    blurb: 'What the platform remembers, and what it throws away. The screen exists to make the cost of waiting visible: events do not backfill.',
    plan: [
      ['partial', 'An append-only events table',
        'POST /api/progress/{course}/{lesson}/visits/{section} is routed and called; its handler overwrites a pointer instead of appending'],
      ['none', 'Coverage: which events record and which do not', ''],
      ['none', 'Retention and volume per kind', ''],
    ],
  },
  {
    id: 'students',
    name: 'Students',
    group: 'Operate',
    blurb: 'Somebody writes in. Who they are, what they paid for, where they stopped — and the handful of actions that today need a database client.',
    plan: [
      ['none', 'Find an account', 'by name, e-mail or id'],
      ['none', 'The record: plan, progress, sessions, exams, certificates', ''],
      ['partial', 'Act on an account',
        'the student’s own endpoints exist; nothing lets staff act for them'],
      ['ready', 'Export a student’s data', 'GET /api/account/export, as themselves'],
      ['ready', 'Delete an account', 'as themselves; certificates survive it'],
    ],
  },
  {
    id: 'certificates',
    name: 'Certificates',
    group: 'Operate',
    blurb: 'The staff side of a document that is already careful. The public page, the code and the revocation rules are built; nothing surfaces them.',
    plan: [
      ['ready', 'Public validation page',
        'non-sequential code, 200 for a code that does not exist, revocation honoured'],
      ['partial', 'Revoke', 'Revoke exists in the service layer and has no route'],
      ['none', 'Issued list, search, reissue', ''],
    ],
  },
  {
    id: 'operations',
    name: 'Operations',
    group: 'Operate',
    blurb: 'Three things break quietly today: the grading queue, outbound e-mail, and the API. None of them tells anybody.',
    plan: [
      ['partial', 'Grading queue',
        'GET /internal/jobs/stats exists; no per-job view, no requeue'],
      ['none', 'Dead letter and requeue', 'a job that keeps killing its worker stops silently'],
      ['none', 'E-mail deliverability', 'the mailer sends and never reads what came back'],
      ['none', 'Service metrics', '/healthz and /readyz only — up and working are different questions'],
    ],
  },
  {
    id: 'audit',
    name: 'Audit trail',
    group: 'Govern',
    blurb: 'Append-only, one row per staff action, with the value before and after. It cannot be reconstructed later, which is why it is written from the first action.',
    plan: [
      ['none', 'The table', 'zero occurrences of `audit` in the backend today'],
      ['none', 'Every console action writes one before it writes anything else', ''],
      ['none', 'System events in the same stream',
        'a revoked session, an expired plan — so “why did my access stop?” has one answer'],
    ],
  },
  {
    id: 'team',
    name: 'Team & roles',
    group: 'Govern',
    blurb: 'Who can get in here. This is the first thing that has to exist, and the decision it encodes is the most expensive one to change later.',
    plan: [
      ['none', 'A role on the account', 'no role column on accounts, and none on any table'],
      ['partial', 'Two-factor required for staff',
        'TOTP is built for students; the rule that makes it mandatory is not'],
      ['none', 'Invite, change role, remove', ''],
    ],
  },
];

/* The order the rail groups appear in. Measure first on purpose: the console is
   read before it is used, and most days nobody has anything to operate. */
export const GROUPS = ['Measure', 'Operate', 'Govern'];

export const sectionById = (id) => SECTIONS.find((s) => s.id === id) || null;

/* Every section is a placeholder today. When one is built, its module goes here
   and the router picks it up — see app/main.js. */
export const SCREENS = {};
