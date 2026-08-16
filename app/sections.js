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
import students from './screens/students.js';
import audit from './screens/audit.js';

export const SECTIONS = [
  { id: 'activity', name: 'Activity', group: 'Measure', screen: activity },
  { id: 'students', name: 'Students', group: 'Operate', screen: students },
  { id: 'audit', name: 'Audit', group: 'Govern', screen: audit },
];

/* The order the rail's groups appear in, when there are sections to put in
   them. A group with none is skipped — so this list can be settled before the
   screens are, without leaving empty headings on the screen. */
export const GROUPS = ['Measure', 'Operate', 'Govern'];

export const sectionById = (id) => SECTIONS.find((s) => s.id === id) || null;
