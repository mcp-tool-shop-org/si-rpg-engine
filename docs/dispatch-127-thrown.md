# Dispatch 127 — the sweep names a throw

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on nothing now on `main`. Issue #127. It runs beside #132. This slice does not change the law.

## What it is

The sweep records a body carried out of the world as `leaves` (`packages/load/sweep.js`, `FindingKind`), whether it walked off an unwalled floor or the law threw it. `fixtures/sweep/verdicts.json` holds each world to its findings, and a finding on the record is never looked at again. #128, a walker thrown to y 8.9 in the `behavior-verbs` `refusals` fixture, is on the record as `leaves walker by walker`.

The overseer replayed 29 recorded `leaves` findings: 21 in the fixture worlds on `main`, and 8 in the product scene on #126's head. Exactly one is a throw. In `refusals` the walker rises 8.62 above its start and peaks at 12.7 m/s. Its vertical speed jumps from 0 to 11.1 at t356 with no action running. The other 28 are falls. None rises more than 0.45 above its start, which is a carried height. Their peaks of 2.3 to 4.6 m/s are the fall. No fall has an upward jump.

The sweep already has a kind named `throws`: a sweep whose run threw an exception. The new kind is `thrown`, and it is a different kind.

## Pins

1. **The tests first.** Each red below fails on `main` and passes here, and the pull request shows both.

2. **A thrown finding.** A `leaves` finding is `thrown` when the body that leaves either:
   - rose more than the climb rule's `maxRise` (1.5, read from the loaded climb rule) above its start, or
   - had its vertical speed jump upward by more than 2 m/s within one quantum while no action lifted it. The climb's lift is 1 m/s, and a quantum in a climb's rise lifts only its own actor.
   - The body's start is its height when the witness begins, at the load. The replay above measures it from there. The rise and the jump are read from the frames the sweep already runs, from the witness's start to the tick the body leaves.
   - The finding's detail names the rise, the largest upward jump, and the tick of that jump.

3. **The record never absorbs a thrown finding silently.** `node harness/corpus.mjs --record-sweep` names each `thrown` finding it writes. The scheduled job's comparison treats a `thrown` finding in a world's record as a difference from a record that had it as `leaves`, and names it.
   - The red: the `refusals` fixture's walker is recorded as `thrown walker by walker`. On `main` it is `leaves walker by walker`.
   - A planted fall, a body pushed off an unwalled edge, stays `leaves`.

4. **Exactly one verdict moves.** Re-recording `fixtures/sweep/verdicts.json` reclassifies `leaves walker by walker` in `fixture behavior-verbs refusals` to `thrown walker by walker`, and nothing else. The pull request lists every `leaves` finding in the record with its rise and its largest upward jump, so the margin is visible. If any other verdict moves, the pull request names it with those numbers and does not re-record it.

5. **Nothing else.** The checker, the tick, the law, the goldens, the Linux digest, and the behaviour fixtures do not change. `load world` refuses a world with a `thrown` finding, as it does a `leaves` one, with a bundle `replay` reproduces. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- The `refusals` walker is `thrown`. A planted fall stays `leaves`.
- `fixtures/sweep/verdicts.json` moves by exactly that one finding, and the pull request lists every `leaves` finding's rise and jump.
- A re-record names each `thrown` finding. The weekly comparison names a `leaves` that became `thrown`.
- The typecheck is clean, the test count is at or above `main`, and the Atlas check is green.
