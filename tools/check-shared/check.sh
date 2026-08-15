#!/bin/sh
# ==========================================================================
# The files this repository carries a COPY of, and the check that keeps the
# copies honest.
#
# WHY COPIES AT ALL. The console is a separate repository because GitHub Pages
# serves one custom domain per repository and this one answers for
# console.codeschool.ing. That is a deploy constraint, and it does not come with a
# way to share a stylesheet: there is no build step here, no package manager and
# no submodule, all three on purpose.
#
# WHAT THE PROJECT ALREADY DOES. `assets/style.css` in the vitrine and
# `assets/base.css` in portal-frontend are the same file byte for byte, and the
# root CLAUDE.md says so: "Edit one and copy it across; `diff` between the two is
# the check that nobody forgot." That diff has always been somebody remembering
# to run it. Here it is a step in CI, so the third copy is better guarded than
# the first two.
#
# WHAT IS AND IS NOT IN THE LIST. A file belongs here when it is used WHOLE and
# is expected to stay identical. app/text.js is not in the list: the console uses
# one function out of two hundred lines and owns those four lines in app/dom.js
# instead — see the comment there.
#
#   ./tools/check-shared/check.sh              # against a sibling checkout
#   SOURCE=/path/to/portal-frontend ./tools/check-shared/check.sh
#
# CI checks out portal-frontend beside this one and points SOURCE at it.
# ==========================================================================
set -eu

SOURCE="${SOURCE:-../portal-frontend}"

# local path : path in portal-frontend
FILES="
assets/base.css:assets/base.css
app/routes.js:app/routes.js
assets/favicon.svg:assets/favicon.svg
"

if [ ! -d "$SOURCE" ]; then
  echo "the source checkout is not at $SOURCE"
  echo "set SOURCE to a portal-frontend checkout, or clone one beside this repository"
  exit 2
fi

fail=0
for pair in $FILES; do
  mine="${pair%%:*}"
  theirs="${pair##*:}"
  if [ ! -f "$SOURCE/$theirs" ]; then
    echo "MISSING  $theirs is not in $SOURCE — has it been renamed there?"
    fail=$((fail + 1))
    continue
  fi
  if diff -q "$mine" "$SOURCE/$theirs" >/dev/null 2>&1; then
    echo "  ok     $mine"
  else
    echo "DIVERGED $mine differs from portal-frontend's $theirs"
    diff -u "$SOURCE/$theirs" "$mine" | head -40 || true
    fail=$((fail + 1))
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "$fail shared file(s) have drifted."
  echo
  echo "Which way to copy:"
  echo "  - the portal changed it        bring the change here"
  echo "  - the console needs something  it does not belong in a shared file."
  echo "    the portal does not          Put it in assets/console.css or app/."
  echo
  echo "AND MIND THE ORDER, because this check reads portal-frontend's MAIN, not"
  echo "its open pull requests. A change to a shared file lands portal-side first;"
  echo "copying it here before that merges leaves this repository red for exactly"
  echo "as long as the other pull request stays open. That has happened once"
  echo "already, and the check was right both times."
  exit 1
fi

echo
echo "every shared file is identical to portal-frontend's"
