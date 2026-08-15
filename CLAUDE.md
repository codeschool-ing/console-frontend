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

| `access()` | what stands there |
| --- | --- |
| `no-backend` | the console, plus the banner. Nothing can be called, so nothing can be read |
| `unreachable` | the API did not answer — naming both causes, because a blocked origin and a dead service are the same bare `TypeError` in a browser |
| `anonymous` | the sign-in form |
| `not-staff` | the refusal, naming who is signed in and where a role comes from |
| `staff` | nothing. The console opens |

The console signs staff in itself rather than sending them to the student portal
and back: same endpoint, same cookie — it is issued for the whole of
`codeschool.ing` — so it costs a form and nothing on the server. The two-factor
step is implemented even though the deployment has MFA off, because a staff
account is exactly the account somebody turns it on for.

**The banner is not gone, it shrank.** It said the backend had no staff role;
that sentence is retired. What it says now is the one thing left worth a
standing warning: this console is wired to no API at all — a local run, or a
deploy whose `<meta name="backend">` was never filled in.

### The suite drives all five

`tools/smoke/check.mjs` rewrites `<meta name="backend">` to `same-origin` as the
document is served and answers `/api/session` itself. The console's real fetch,
real branches, real screens — and **no test hook left in the product**. Adding a
state means adding a case there, not a flag here.

## It starts with nothing

`app/sections.js` is an empty list. There are no screens, no rail and no
placeholder standing in for work that has not been decided — and the shell
around that is real: the bar reports what it is connected to, the router works,
the theme is the school's, and the suite watches all of it.

With no sections the rail is not drawn at all. An empty 216px column with a
border down one side reads as a broken page rather than as an honest nothing, so
`body.no-rail` removes it and the stage says the console is empty instead.

## Adding a section

1. Write `app/screens/<id>.js` exporting
   `async (section) => ({ title, el, after?, onLeave? })` — the portal's screen
   contract, because this is the portal's router.
2. Add one object to `SECTIONS` in `app/sections.js`:
   `{ id, name, group, screen }`. The route, the rail entry and the
   disappearance of the empty state all follow; nothing else has to be told.
3. Add its checks to `tools/smoke/check.mjs`. The suite already handles both
   shapes — with no sections it checks the empty shell, with sections it walks
   every route — so the first one to land needs no rewrite of it, only its own
   assertions.

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
