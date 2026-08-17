# console-frontend

The staff console for codeschool.ing, served at **console.codeschool.ing**. No build
step and no dependencies: plain HTML, CSS and ES modules, like the other two
front-ends.

The student portal is `codeschool-ing/portal-frontend`, the public site is
`codeschool-ing/codeschool-ing.github.io`, and the API both talk to is
`codeschool-ing/portal-backend`. There is no console backend and there should
not be one — see below.

## Why this is a repository and not a folder

It was a folder first, under `portal-frontend/admin/`, and the reason it moved is
narrow: **GitHub Pages serves one custom domain per repository.** `CNAME` holds
exactly one, and portal-frontend's is already `app.codeschool.ing`. A console at
`console.codeschool.ing` needs its own Pages site, and a Pages site is per
repository.

Two things came free with the move: a bad deploy here cannot take the student
portal down, and the console can sit behind an allow-list at the edge that
nobody would ever put in front of `app.codeschool.ing`.

**Pages being public is not a leak and privacy is not the protection.** A private
repository hides the source, not the site. What protects the console is the role
check on the API.

## There is no console backend, and adding one would be a mistake

The console's endpoints read and write the same tables as the student API —
`accounts`, `certificates`, `jobs`, `subscriptions`. A second service against
one database is two copies of the domain logic and a schema nobody owns.

The backend is already shaped for it: every domain has `internal/<domain>/http.go`
with a `Routes(mux)`. Staff routes are more handlers there, behind
`web.RequireStaff` — which exists, with no route mounted behind it yet. Same
binary, same deploy, same migrations.

**What this repository costs the API is one line of configuration.** Its config
already anticipated a second front-end origin, in as many words: *"A SUBDOMAIN IS
NOT A DIFFERENT SITE… what a subdomain costs is this list and a CookieDomain."*
So `https://console.codeschool.ing` joins `PORTAL_ALLOWED_ORIGINS`, and
`PORTAL_COOKIE_DOMAIN` is already set because `app.codeschool.ing` needed it. The
server refuses to start with one and not the other, so this cannot be half-done.

## Three files here are copies, and CI is what keeps them honest

| here | source |
| --- | --- |
| `assets/base.css` | portal-frontend `assets/base.css` |
| `app/routes.js` | portal-frontend `app/routes.js` |
| `assets/favicon.svg` | portal-frontend `assets/favicon.svg` |

`assets/base.css` now exists **three** times byte for byte — the vitrine's
`style.css`, the portal's `base.css`, and this one. That is the price of the
custom domain, and it is paid with `tools/check-shared/check.sh`, which runs in
CI and fails on any drift. The two older copies have never had that: between the
vitrine and the portal, the diff is somebody remembering to run it.

**`app/routes.js` is byte-identical on purpose.** Its `currentPath()` falls back
to the portal's `/dashboard` when the hash is empty, which is wrong here — so
`app/main.js` sets `#/overview` before `start()` and the fallback is never
reached. A router edited to know about a second application could not be
diff-checked, and that check is worth more than the two lines it costs.

**`app/text.js` is deliberately NOT copied.** It is 200+ lines and the console
uses one function from it. `app/dom.js` owns those four lines instead. The line
between the two lists: a file is shared when it is used whole.

## No i18n

The console is staff-only and English-only. Translating an internal tool for a
team of three buys nothing, and English is this project's source language
everywhere anyway. The saving that matters is not the translating — it is that
there are no dictionaries here to keep in step, and no validator to run.

## The rule that governs every screen

`RequireStaff` shipped, so the rule this section used to hold — *a screen that
reads or writes real data cannot ship before the role check does* — is
**satisfied**, and the one replacing it is narrower:

> **What the console shows is a courtesy. What the API refuses is the control.**

`accounts.staff_role` is a column on the backend, `web.RequireStaff` answers 401
without a session and 403 with one that carries no role, and `GET /api/session`
reports the role as `staff`. `app/session.js` reads that field.

It reads it to decide **which screen to show**, never to decide what a caller may
have. Every screen calls an endpoint behind `RequireStaff`; a screen that forgets
to is a bug the API catches, and a console that hid its own screens while calling
an API that answered anyway would be a lock painted on a door.

### The gate is in front of the router, not inside it

`app/gate.js` holds three screens and none of them is a route. When one is
showing, `start()` was never called: no rail, no hash handling, no screen module
loaded. That distinction is the whole point — sections that merely rendered
"access denied" would still have run every loader, and one of those would
eventually fetch something it should not have.

**All three wear the portal's sign-in box** — the terminal chrome with its three
dots, `.field`, `.btn-primary`, `.btn-ghost` — and every one of those classes is
in `assets/base.css`, the file CI diffs. Staff signing in here are looking at
the same product they look at on `app.codeschool.ing`. The only rules
`console.css` spends on it are `.signin-box` and its four neighbours, copied
value for value from the portal's `portal.css` because that file is not shared.

| `access()` | what stands there |
| --- | --- |
| `no-backend` | the console, plus the banner. Nothing can be called, so nothing can be read |
| `unreachable` | the API did not answer — naming both causes, because a blocked origin and a dead service are the same bare `TypeError` in a browser |
| `anonymous` | the sign-in form |
| `not-staff` | the refusal, naming who is signed in and where a role comes from |
| `staff-no-factor` | the errand: a staff role, no second factor, and a link to where one is turned on |
| `staff` | nothing. The console opens |

The console signs staff in itself rather than sending them to the student portal
and back: same endpoint, same cookie — it is issued for the whole of
`codeschool.ing` — so it costs a form and nothing on the server.

**`staff-no-factor` is the one gate screen that is an errand rather than a
refusal**, and the difference is load-bearing. The API stopped opening this
console for a password alone the day it started granting the role, so a staff
account without a confirmed second factor is refused with `mfa_required` — but
**enrolling happens on the portal, not here**, behind an ordinary account check.
That is what keeps the rule from locking every staff account out on the day the
key is set, and it is why the screen's whole job is a link.

The address comes from `<meta name="portal">`, empty in the repository and
filled by the Pages workflow exactly as `backend` is. With none configured the
screen names the portal in words instead: a link to nowhere is worse than a
sentence. **The suite fills it in**, because a suite that left it empty would
only ever exercise the branch that does not ship.

**A role with no factor is not the same as no role**, and the two must not share
a screen — telling somebody who holds a role that they lack one sends them to
ask for something they already have. There is a check for exactly that.

**The banner is not gone, it shrank.** It said the backend had no staff role;
that sentence is retired. What it says now is the one thing left worth a
standing warning: this console is wired to no API at all — a local run, or a
deploy whose `<meta name="backend">` was never filled in.

### The suite drives all five

`tools/smoke/check.mjs` rewrites `<meta name="backend">` to `same-origin` as the
document is served and answers `/api/session` itself. The console's real fetch,
real branches, real screens — and **no test hook left in the product**. Adding a
state means adding a case there, not a flag here.

### Every call goes through `app/request.js`, and this is why

The gate above decides **once, at boot**. Nothing after that re-asks — so a role
revoked, a session expired or an API that fell over *while* the console is open
would turn every screen into a spinner that never resolves, with nothing on the
page saying why.

`app/request.js` is where that is noticed. A **401 or 403 from any screen** means
the shell's answer has stopped being true, so the shell is told to decide again
and the right gate screen takes the page over. Screens get it by calling `get`
or `put` instead of `fetch`, which is the whole reason the file exists.

**Both verbs share every branch**, and that matters most for the write: a 403
from a `PUT` is the same stale answer as one from a `GET`, and a write wired
straight to `fetch` would draw "could not save" over a console its caller is no
longer allowed to use. There is a check that fails if `put` stops going through
the shared path. It is deliberately *not* a general `request(method, …)`: two
verbs are what the console does, and a third should arrive with its own
reasons rather than for free.

Two details it is easy to undo by accident:

- **A refusal is not an error a screen should draw.** It throws with `refused`
  set, and a screen that catches it must paint *nothing* — the shell has already
  replaced the stage, and an error panel under a sign-in form is a page showing
  two answers at once.
- **`main.js` keeps a `gated` flag and the router bails on it.** `start()` is not
  undoable, so its `hashchange` listener is still attached while the gate is up;
  without the flag a bookmark clicked at that moment draws a section straight
  over the gate, rail and all.

## It started with nothing, and now has three

`app/sections.js` has **Activity** and **Funnel** (Measure), **Students** and
**Grading queue** (Operate), and **Audit** and **Retention** (Govern). All six
read; the only thing the console writes is the staff role, on a student's
record — see below. With no sections
the rail is not drawn at all: an empty 216px column with a border down one side
reads as a broken page rather than as an honest nothing, so `body.no-rail`
removes it and the stage says the console is empty instead. That path is still
live and still checked, because it is what a fresh clone with the list emptied
would show.

### `DETAILS` is the second list, and it has no rail

One student's record — `#/students/:id` — is a real address that has to survive
a reload and a pasted link, and it is not a place in the navigation: there is no
"a student" to click, only the one you came from. So `app/sections.js` exports
`DETAILS` beside `SECTIONS`, and only `SECTIONS` draws links.

**A detail's path sits under its section's id by construction**, which is what
keeps the rail lit while a record is open: `paintRail` marks the **first
segment** of the path, not the whole of it. Naming the parent in a field here
would be the same fact written twice, and the copy that goes stale is always the
second one.

Nothing in the suite's route walk reaches them — that walk is built from the
rail — so `check.mjs` reads `DETAILS` from the source too and drives them at the
end. A detail route that stopped being registered would otherwise show up as
"no such screen" and nowhere else.

Reading came first on purpose. `portal-backend`'s standing premise
(`ARCHITECTURE.md` §0.1) is that the system be rich in records: a write needs an
audit entry that fails with it, and the first write is where that rule gets
tested for real — so the log was built before anything here could write to it.

### The first write is on the record, and it is the role

Grant and revoke `staff_role`, on a student's record. It is the console handing
out the keys to itself, so it is worth naming what stands around it:

- **A click is not the write.** The first click opens a confirm that says what
  granting *means* — every screen in this console, every student's record — or,
  for a revoke, when it takes effect and what it leaves alone. "Are you sure"
  would be a speed bump; this is the sentence somebody should read once.
- **The button is a courtesy; the API is the control.** It hides itself on the
  signed-in account's own record because the server answers 409 there, and
  offering a button that cannot work is worse than offering none. The match is
  by **address**, since `GET /api/session` carries no id and
  `accounts.email` is `citext NOT NULL UNIQUE`.
- **A refusal is shown in the server's own words.** Both of them — your own
  role, the last staff account — already explain themselves and say what to do
  instead. Restating them here would be a second copy to keep true.
- **It does not re-read the record afterwards.** The `PUT` answers with the role
  that was stored, which is all the screen needs; fetching again would write a
  second `staff.student.view` audit entry nobody asked for and make the log say
  the record was opened twice.

### Two things these screens are careful about

**Every number carries the people it came from.** A thousand events from one
insomniac is not a busy week, and Activity draws the *student* count as the
headline with the event count beneath it — which number a reader takes as "the"
number is decided by how it is drawn, not by which is listed. The suite asserts
the type sizes, because a CSS change is exactly how that inverts silently.

**The retention screen opens by saying what it cannot know.** The sweep is a
separate command run from outside the API, so nothing here can see whether it is
scheduled or when it last ran — and a screen that guessed would be worse than
one that admits it. It shows what is *stored*, tells the reader that numbers
which only ever grow mean nothing is running, and points at the commands. The
policy column is what stops five counts reading as five of the same thing: three
are swept without asking, an exam paper is **closed rather than deleted** (and a
big number there means people are stuck, not that a table is growing), and
events report `unknown` because their window is set on the sweep's own job.

**The queue screen's first sentence is whether anything can drain it.** The API
adds a job whenever an answer needs running, whether or not an executor is
configured — so on a deployment with none, work piles up for ever and the
student sees "not checked" for ever with it. The same counts without that
banner read as a quiet afternoon, which is why the banner is the point of the
screen rather than decoration on it, and why the suite fails if it stops being
drawn. The screen also says out loud that it **cannot requeue anything**: it
reads the queue and does not move it, and a screen that stayed silent about
that would imply a button somewhere.

**The funnel's bars are all fractions of one number** — the busiest lesson's
reach. Scaling each row to its own maximum would draw every course as a flat
wall and hide the drop, which is the single thing that screen exists to show;
the suite asserts the ratio, because a CSS change is exactly how that inverts
silently. Its course list comes from the **event stream and not the catalogue**:
the console carries no catalogue, and a list of 122 would bury the handful
anybody is in. A course nobody has opened is absent, which is the honest answer
to "where does it lose people".

**An erased subject is shown as erased, never as blank.** The audit row outlives
the account and the name does not — that asymmetry is the whole privacy design
of the table, and a screen that rendered the gap as an empty cell would hide the
one thing it proves: the action still happened.

**The record counts a student's notes and says out loud that it will not quote
them.** The API sends the count and never the bodies — that is the one
deliberate subtraction from what the portal's own data export carries, because
a note is a student writing to themselves while they learn. The sentence beside
the number is load-bearing: a bare "4 notes" with nothing under it reads as a
half-built feature, which is exactly how somebody would come to "finish" it.

Nothing on any of these screens is derived. The API sends counts; the screens
arrange them. No averages, no rates, no score — the first dashboard of a school
is where somebody decides whether to trust its numbers, and a figure nobody can
trace back to a row is the fastest way to lose that.

**`app/kinds.js` is where an event's name lives**, because two screens read it:
Activity counts the kinds and the record lists them one at a time. It carries
two vocabularies for the same kind — a plural for a tally ("Sections opened,
412") and a deed for a timeline entry ("Opened a section") — since sharing the
first form would have a record saying "Sections opened" about a single click. A
kind that is not in the list still shows, under its dotted name: the backend
adds one by adding a constant and calling it, so this file is always allowed to
be a release behind.

## Adding a section

1. Write `app/screens/<id>.js` exporting
   `async (section) => ({ title, el, after?, onLeave? })` — the portal's screen
   contract, because this is the portal's router.
2. Fetch with **`request.get`** — and write with **`request.put`** — never
   `fetch`. That is what makes a mid-session refusal put the gate back up
   instead of leaving the screen loading forever, and it applies to writes at
   least as much as to reads.
3. Add one object to `SECTIONS` in `app/sections.js`:
   `{ id, name, group, screen }`. The route, the rail entry and the
   disappearance of the empty state all follow; nothing else has to be told.
4. Add its checks to `tools/smoke/check.mjs`. The suite handles both shapes —
   with no sections it checks the empty shell, with sections it walks every
   route — and the screen blocks at the end are guarded by
   `if (IDS.includes('<id>'))`, so emptying the list never fails the suite.

A screen a section **opens into** is one object in `DETAILS` instead, with a
`path` rather than an `id`, and its screen takes the matched params rather than
the section. Its checks are guarded by `if (DETAILS.includes('<path>'))` for the
same reason.

**Its endpoint goes behind `web.RequireStaff` in `portal-backend`, and that is
not optional.** The gate here decides which screen to draw; it decides nothing
about what an API answers. A screen whose endpoint is mounted without the
middleware is readable by every signed-in student, from this very origin,
because the session cookie already reaches it.

**Every section has a screen.** There is no "planned" state and no placeholder
to fall back on: a section exists once something is built behind it, and until
then the rail is quieter for not naming it.

## Before pushing

```sh
SOURCE=../portal-frontend ./tools/check-shared/check.sh   # the copies have not drifted
python3 -m http.server 8899 &                             # at the repository root
node tools/smoke/check.mjs                                # needs npm i playwright + chromium
```

Both run in CI on every pull request and every push to `main` —
`.github/workflows/ci.yml`.

`<meta name="backend">` ships empty, exactly as the portal's does: empty means
"no server", which is what a local run and the suite both need, and the console
says so in its own bar rather than guessing an origin. The Pages workflow fills
it in on the way out.
