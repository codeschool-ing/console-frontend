/* ==========================================================================
   The console's sections — the rail, and the route behind each entry.

   IT IS EMPTY ON PURPOSE. The console starts from nothing: no screens, no
   navigation, no placeholder standing in for work that has not been decided.
   The shell around it is real — the bar, the standing notice, the router, the
   theme, and the suite that watches all four — and this list is where it grows.

   Adding the first section is adding the first object below and writing the
   module it names. The rail, the route and the empty state follow from it;
   nothing else has to be told.

     import students from './screens/students.js';

     export const SECTIONS = [
       { id: 'students', name: 'Students', group: 'Operate', screen: students },
     ];

   `id`     the route (`#/students`) and the rail's key. Lower case, no spaces.
   `name`   what the rail shows.
   `group`  the heading it sits under. A group with no sections is skipped, so
            GROUPS below can hold names before it holds entries.
   `screen` the module: `async (section) => ({ title, el, after?, onLeave? })`,
            which is the portal's screen contract, because this is the portal's
            router.

   EVERY SECTION HAS A SCREEN. There is no "planned" state and no placeholder to
   fall back on: a section exists once something is built behind it, and until
   then the rail is quieter for not naming it.
   ========================================================================== */

import activity from './screens/activity.js';
import funnel, { courseFunnel } from './screens/funnel.js';
import jobs from './screens/jobs.js';
import students from './screens/students.js';
import student from './screens/student.js';
import audit from './screens/audit.js';

export const SECTIONS = [
  { id: 'activity', name: 'Activity', group: 'Measure', screen: activity },
  { id: 'funnel', name: 'Funnel', group: 'Measure', screen: funnel },
  { id: 'students', name: 'Students', group: 'Operate', screen: students },
  { id: 'jobs', name: 'Grading queue', group: 'Operate', screen: jobs },
  { id: 'audit', name: 'Audit', group: 'Govern', screen: audit },
];

/* ---------- what a section opens into ----------

   A DETAIL IS A ROUTE WITH NO RAIL ENTRY. One student's record is not a place
   in the navigation — there is no "a student" to click, only the one you came
   from — but it is a real address that has to survive a reload and a pasted
   link, which is what a route is for.

   It is a second list rather than a field on a section because the two mean
   different things: a `SECTIONS` entry means "draw a rail link and route it",
   and giving one an optional child would leave every reader of `paintRail`
   working out which entries produce links.

   THE PATH SITS UNDER ITS SECTION'S ID BY CONSTRUCTION, and that is what keeps
   the rail lit while a record is open — `paintRail` marks the first segment of
   the path. Naming the parent in a field here would be the same fact written
   twice, and the copy that goes stale is always the second one.

     `path`    the route, with `:name` for each parameter
     `screen`  `async (params) => ({ title, el, after?, onLeave? })` — the same
               contract a section's screen has, called with the matched
               parameters instead of with the section. */
export const DETAILS = [
  { path: '/students/:id', screen: student },
  { path: '/funnel/:courseId', screen: courseFunnel },
];

/* The order the rail's groups appear in, when there are sections to put in
   them. A group with none is skipped — so this list can be settled before the
   screens are, without leaving empty headings on the screen. */
export const GROUPS = ['Measure', 'Operate', 'Govern'];

export const sectionById = (id) => SECTIONS.find((s) => s.id === id) || null;
