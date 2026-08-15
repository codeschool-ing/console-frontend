# console-frontend — codeschool.ing's staff console

Served at **admin.codeschool.ing**. No build step, no dependencies: plain HTML,
CSS and ES modules, like the school's other two front-ends.

Today it is a **shell**. Seven routes, a rail, and one screen apiece that states
what that screen is for and where each piece of it stands. **Nothing in it calls
the API.**

```
index.html                  the shell: bar, notice, rail and <main>
assets/base.css             the vitrine's stylesheet — a copy, checked in CI
assets/console.css          only what a console needs and a student product did not
assets/favicon.svg          a copy, checked in CI
app/routes.js               the portal's hash router — a copy, checked in CI
app/main.js                 boot: routes, rail, bar, theme
app/sections.js             the seven sections and what each has to carry
app/session.js              who is asking, and what the console is connected to
app/dom.js                  the four lines of helper this repository owns
app/screens/placeholder.js  the screen every section has until it has a real one
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
portal-frontend's is `app.codeschool.ing`, so a console at `admin.codeschool.ing`
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

## The plan is in the code

`app/sections.js` carries one entry per section and the capabilities it has to
hold, each with the status it is in today. The rail is built from it, the
placeholder screens render it, and a finished screen is measured against it. It
came from the platform's capability map and lives here so the plan cannot drift
away from the screens.

To add a real screen, see `CLAUDE.md`.
