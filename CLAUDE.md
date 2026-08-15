# console-frontend

The staff console for codeschool.ing, served at **admin.codeschool.ing**. No build
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
`admin.codeschool.ing` needs its own Pages site, and a Pages site is per
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
with a `Routes(mux)`. Staff routes are more handlers there, behind a
`RequireStaff`. Same binary, same deploy, same migrations.

**What this repository costs the API is one line of configuration.** Its config
already anticipated a second front-end origin, in as many words: *"A SUBDOMAIN IS
NOT A DIFFERENT SITE… what a subdomain costs is this list and a CookieDomain."*
So `https://admin.codeschool.ing` joins `PORTAL_ALLOWED_ORIGINS`, and
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

`app/session.js` reports `staff: null`, meaning **the concept does not exist
yet** — not `false`, which would mean somebody was asked and refused. A banner
states it on every screen and `tools/smoke/check.mjs` asserts the banner is
there.

That is safe only because the console does nothing. So:

> **A screen that reads or writes real data cannot ship before `RequireStaff`
> does.**

When the role lands, `state.staff` stops being `null`, the banner disappears on
its own, and the block of the suite asserting it is present becomes the block
asserting an unauthorised caller is refused — same test, opposite expectation.

## The plan lives in `app/sections.js`

One entry per section and, inside it, the capabilities that section has to carry
with the status each is in today: `ready`, `partial`, `none`. It is what the rail
is built from, what the placeholder screens render, and the acceptance list a
real screen is measured against. It came from the capability map and it lives in
the code so it cannot drift away from the screens.

An empty console with seven blank pages says nothing about what it is for, and
the first thing anybody would do is guess.

## Adding a real screen

1. Write `app/screens/<id>.js` exporting
   `async (section) => ({ title, el, after?, onLeave? })` — the portal's screen
   contract, because it is the portal's router.
2. Register it in `SCREENS` in `app/sections.js`. The route and the rail follow,
   and the `plan` tag drops off that rail entry on its own.
3. Leave the section's `plan` entries and update their statuses. They are the
   acceptance list, not scaffolding.
4. Add its checks to `tools/smoke/check.mjs`.

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
