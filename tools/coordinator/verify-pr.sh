#!/usr/bin/env bash
# verify-pr.sh <name> <sha> [--native]: the coordinator's check of a pull request. A fresh detached
# worktree of <sha> at $SCRATCH/<name> is built from clean and run: npm ci, the solver build, the
# typecheck, the suite, and both goldens with the behaviour numbers. With --native it also runs the
# solver's own tests in release. It writes $SCRATCH/<name>-summary.txt (the lines that matter) and
# $SCRATCH/<name>-*.log (everything), and records whether the suite left the tracked tree unchanged.
#
# SCRATCH must name a directory outside the repository; REPO defaults to the checkout this script is
# in. Copy the script before running it if you may edit it meanwhile: bash reads a script as it runs,
# and an edit mid-run corrupts the run.
set -u
NAME="${1:?usage: verify-pr.sh <name> <sha> [--native]}"
SHA="${2:?usage: verify-pr.sh <name> <sha> [--native]}"
NATIVE="${3:-}"
REPO="${REPO:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel)}"
SCRATCH="${SCRATCH:?set SCRATCH to a directory outside the repository}"
W="$SCRATCH/$NAME"
SUM="$SCRATCH/$NAME-summary.txt"
LOG="$SCRATCH/$NAME-verify.log"
: > "$SUM"
: > "$LOG"
cd "$REPO" || exit 1
git fetch -q origin >> "$LOG" 2>&1
if [ ! -d "$W" ]; then
  git worktree add --detach "$W" "$SHA" >> "$LOG" 2>&1 || { echo "worktree add failed" >> "$SUM"; exit 1; }
fi
cd "$W" || { echo "no checkout at $W" >> "$SUM"; exit 1; }
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$SHA^{commit}")" ] || { echo "checkout is not at $SHA" >> "$SUM"; exit 1; }
echo "head $(git rev-parse HEAD)" >> "$SUM"
npm ci --no-audit --no-fund >> "$LOG" 2>&1; echo "npm ci exit $?" >> "$SUM"
node solver/build.mjs >> "$LOG" 2>&1; echo "solver build exit $?" >> "$SUM"
npm run typecheck > "$SCRATCH/$NAME-tsc.log" 2>&1; echo "typecheck exit $?" >> "$SUM"
START=$(date +%s)
npm test > "$SCRATCH/$NAME-test.log" 2>&1; echo "npm test exit $? in $(( $(date +%s) - START )) s" >> "$SUM"
grep -E "^# (tests|pass|fail|skipped|todo|cancelled) " "$SCRATCH/$NAME-test.log" >> "$SUM"
grep -E "^not ok" "$SCRATCH/$NAME-test.log" | cut -c1-200 >> "$SUM"
npm run check > "$SCRATCH/$NAME-check.log" 2>&1; echo "check exit $?" >> "$SUM"
grep -E "matches|differs|behaviour" "$SCRATCH/$NAME-check.log" >> "$SUM"
echo "tracked changes after the suite and the check:" >> "$SUM"
git status --short >> "$SUM"
echo "(end of changes)" >> "$SUM"
if [ "$NATIVE" = "--native" ]; then
  ( cd solver && cargo test --release --locked > "$SCRATCH/$NAME-cargo.log" 2>&1; echo "cargo test exit $?" >> "$SUM" )
  grep -E "^test result:" "$SCRATCH/$NAME-cargo.log" >> "$SUM"
fi
echo "all done" >> "$SUM"
