# console-frontend — codeschool.ing's staff console

Served at **console.codeschool.ing**. No build step, no dependencies: plain HTML,
CSS and ES modules, like the school's other two front-ends.

Today it is a **shell, and an empty one**: no screens, no rail, no placeholders.
What works is everything around them — the bar reports what it is connected to,
the router resolves, the theme is the school's, and a browser suite watches all
of it. **Nothing in it calls the API.**

```
index.html                  the shell: bar, notice, rail and <main>
assets/base.css             the vitrine's stylesheet — a copy, checked in CI
assets/console.css          only what a console needs and a student product did not
assets/favicon.svg          a copy, checked in CI
app/routes.js               the portal's hash router — a copy, checked in CI
app/main.js                 boot: routes, rail, bar, theme
app/sections.js             the sections — empty, and where the console grows
app/session.js              who is asking, and what the console is connected to
app/dom.js                  the four lines of helper this repository owns
tools/smoke/check.mjs       the browser suite, from the first commit
tools/check-shared/check.sh the copies have not drifted
```

## Running it

```sh
python3 -m http.server 8899
# open http://localhost:8899
```

Checking that it still stands:

```sh
npm i playwright
node tools/smoke/check.mjs                                 # the console, in a browser
SOURCE=../portal-frontend ./tools/check-shared/check.sh    # the copies have not drifted
```

Both run in CI on every pull request and every push to `main`.

## What it is, in four decisions

**It is a repository because Pages serves one custom domain per repository.** It
lived in `portal-frontend/admin/` first. `CNAME` holds exactly one domain and
portal-frontend's is `app.codeschool.ing`, so a console at `console.codeschool.ing`
needs its own Pages site. Two things came free: a bad deploy here cannot take the
student portal down, and this host can sit behind an edge allow-list that
`app.codeschool.ing` never would.

**There is no console backend.** Staff endpoints read the same tables as the
student API and belong in `portal-backend`, behind a `RequireStaff`, as more
handlers in the domain packages that already exist. What this repository costs
the API is one entry in `PORTAL_ALLOWED_ORIGINS` — its configuration anticipated
a second front-end origin and says so in a comment.

**Three files are copies, and CI diffs them.** `assets/base.css` now exists three
times byte for byte across the school's repositories. That is what the custom
domain costs, and `tools/check-shared/check.sh` is what makes it safe — which is
more than the two older copies of the same file have ever had.

**There is no access control, and the console says so on every screen.** The
backend has no staff role, so `app/session.js` reports `staff: null` — *the
concept does not exist yet*, not `false` — and a banner says it in words. The
suite asserts the banner is present. Hence the rule: **a screen that reads or
writes real data cannot ship before the role check does.**

## Two things a person has to switch on, once

**Pages.** Settings → Pages → Build and deployment → **Source: GitHub Actions**.
The deploy workflow cannot do this for itself — creating a Pages site is beyond
what `GITHUB_TOKEN` may do, whatever permissions the workflow declares — so until
it is set the job fails with *"Get Pages site failed … verify that the repository
has Pages enabled"*.

**DNS.** A record for `console.codeschool.ing` pointing at the Pages site. The
`CNAME` file in this repository claims the domain; it only resolves once the
record exists. Until then Pages serves the same build at its `*.github.io`
address and shows an unverified-domain warning.

And one on the API, which is `portal-backend` configuration rather than anything
here: `https://console.codeschool.ing` has to join `PORTAL_ALLOWED_ORIGINS`.
`PORTAL_COOKIE_DOMAIN` is already set — the server refuses to start with one and
not the other, so this cannot be half-done.

## It starts with nothing

`app/sections.js` is an empty list, and the shell is written for that: with no
sections the rail is not drawn at all — an empty column with a border down one
side reads as a broken page — and the stage says the console is empty instead of
showing an error.

A section is one object there plus the module it names, and the route, the rail
entry and the empty state all follow from it. The smoke suite already handles
both shapes, so the first section to land needs no rewrite of it.

To add a real screen, see `CLAUDE.md`.
