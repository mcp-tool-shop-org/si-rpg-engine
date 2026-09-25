# Dispatch T4 — outcome tests, issue-named

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on T1. The plan row is T4 in `docs/PHASE-2.md`. Findings 13, 14, 15, and 16 of `docs/study-swarm/testing-3d.dispatch.md`.

## What it is

A hash says two runs agree. It does not say a box stayed above a floor. Rapier keeps one permanent test per defect, named for the issue, asserting the outcome; Jolt asserts character positions computed by formula, just below and just above each limit; Box2D translates a whole scene by 1e7 and requires the same relative path. This slice gives the engine those three habits and a course built around its own limits, so that a bump of the solver or a change to the law is measured against what the world promises, not against a digest.

## Pins

1. **Outcome tests live in `harness/outcome.test.js`, one `test` per outcome, each named for what it asserts and carrying its number.** They run in `npm test`. Each builds its world inline from plain records, runs the product law for a stated number of quanta, and asserts positions, velocities, or sleep quanta with a stated tolerance. None asserts a hash.
2. **A thin fast body over a thin slab.** A dynamic box of half-extents 0.05 launched at 20 units per second toward a static slab of half-thickness 0.02 must end on the near side of the slab. At 1/64 s that body moves 0.31 per quantum, so the law as it stands passes through. The law changes here: dynamic bodies get continuous collision detection (`ccd_enabled(true)`), the product golden and the fixtures' frames move once with that reason, and the test then holds. The character stays kinematic and unchanged.
3. **A heightfield seam.** A box slides down a heightfield whose slope crosses a cell boundary; its centre height must stay within the skin, 0.01, of the surface height under it at every quantum, and it must not hitch upward by more than the skin at the seam.
4. **The whole scene translated.** The product scene offset by `(1e6, 0, 1e6)` must produce the same sleep quantum for every dynamic body and the same final positions relative to the offset within `1e-6`, over the full 10000 quanta. Bit-exact agreement is not expected at that magnitude and is not asserted.
5. **The character course, `harness/course.test.js`.** Each case builds a floor and one feature, drives the walker at it for a stated number of quanta, and asserts the outcome from the setup's numbers:
   - a step of 0.29 is climbed: the walker's feet end at the step's top within `1e-3`; a step of 0.31 stops the walker: its feet stay at floor height and its x stops short of the riser;
   - a slope of 44° is climbed to its top; a slope of 46° is not: the walker's height gain is below 0.05 after the run;
   - a ledge drop of 0.19 is snapped: the walker is grounded on the next quantum and its feet are at the lower floor; a drop of 0.21 is a fall: the walker is airborne for at least one quantum;
   - a walker starting with its centre inside the floor by 0.1 ends standing on the floor, never below it;
   - two walkers driven at each other end separated by at least the sum of their half-extents minus the skin, and neither passes the other's starting x.
   Both members of each pair are asserted, so the limit is shown to be real, not merely permissive.
6. **The course gates the golden.** `write-golden` runs `harness/course.test.js` and the outcome tests first and refuses to write when any fails, printing the failing test's name. `solver/FLAGS.md` gains one sentence: any bump of the toolchain or of `rapier3d-f64` reruns the course before a golden may move.
7. **CI order.** The course and outcome tests run in `npm test`, which CI runs before the golden compare, so a broken outcome is reported by name before a hash mismatch.
8. **The debug view is untouched.** The seat stays frozen. No fixture changes shape beyond the frame and behaviour moves pin 2 forces, each stated in the commit.
9. **The binary changes once**, for pin 2. Digest pinned from the Linux build. The arithmetic golden does not move.
10. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.

## Acceptance

- Every test in pins 2 through 5 exists, is named for its outcome, states its number and tolerance, and passes.
- The fast-body test is shown failing on the binary before pin 2 and passing after, in the pull request.
- `write-golden` refuses on a failing course, in a test.
- The product golden, the fixtures, and the behaviour numbers moved once, with the reason in one commit.
- Typecheck clean, tests at or above T1's count, three engines print the goldens from the Linux binary, digest pinned, Atlas check green.

## Not in T4

No restore, no ARM lane, no scheduled job, no change to the character's shape or the controller's constants, no hash assertion in any outcome test.
