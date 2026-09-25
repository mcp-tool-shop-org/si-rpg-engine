# Dispatch T4 — outcome tests, issue-named

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on T1. The plan row is T4 in `docs/PHASE-2.md`. Findings 13, 14, 15, and 16 of `docs/study-swarm/testing-3d.dispatch.md`.

## What it is

A hash says two runs agree. It does not say a box stayed above a floor. Rapier keeps one permanent test per defect, named for the issue, asserting the outcome; Jolt asserts character positions computed by formula, just below and just above each limit; Box2D translates a whole scene by 1e7 and requires the same relative path. This slice gives the engine those three habits and a course built around its own limits, so that a bump of the solver or a change to the law is measured against what the world promises, not against a digest.

## Pins

1. **Outcome tests live in `harness/outcome.test.js`, one `test` per outcome, each named for what it asserts and carrying its number.** They run in `npm test`. Each builds its world inline from plain records, runs the product law for a stated number of quanta, and asserts positions, velocities, or sleep quanta with a stated tolerance. None asserts a hash.
2. **A thin fast body over a thin slab.** A dynamic box of half-extents 0.05 launched at 20 units per second toward a static slab of half-thickness 0.02 must end on the near side of the slab. The first act is to run this case on the binary as it stands. The knowledge base measured natively at 0.35.3 that such a body stops in front of the slab with `ccd_enabled(false)` at the default `max_ccd_substeps = 1`, and passes through only at `0`; the law never sets that field, so it stays 1. If the run confirms that, the test stands with no law change and no golden moves for it, and the pull request says so. Only if the run passes through does the law turn on continuous collision detection for dynamic bodies, with the golden and the fixtures moving once for that reason. The character stays kinematic and unchanged either way. Amended 2026-09-25.
3. **A heightfield seam.** A box slides down a heightfield whose slope crosses a cell boundary; its centre height must stay within the skin, 0.01, of the surface height under it at every quantum, and it must not hitch upward by more than the skin at the seam. The cases include a crossing moving +x along row 0, the lowest-z row, because the knowledge base measured that `HeightFieldFlags::FIX_INTERNAL_EDGES` removes seam snags on a 9 by 9 field in every row and direction except that one; `build_world` sets no heightfield flags today, and the pull request states whether the law turns the flag on and what the row-0 case shows. The surface height under the box is `supportAt` after S2, which gives it the physics' two-triangle surface.
4. **The whole scene translated.** The product scene offset by `(1e6, 0, 1e6)` must produce the same sleep quantum for every dynamic body and the same final positions relative to the offset within `1e-6`, over the full 10000 quanta. Bit-exact agreement is not expected at that magnitude and is not asserted.
5. **The character course, `harness/course.test.js`.** Each case builds a floor and one feature, drives the walker at it for a stated number of quanta, and asserts the outcome from the setup's numbers:
   - a step of 0.29 is climbed: the walker's feet end at the step's top within `1e-3`; a step of 0.31 stops the walker: its feet stay at floor height and its x stops short of the riser;
   - a slope of 44° is climbed to its top; a slope of 46° is not: the walker's height gain is below 0.05 after the run;
   - a ledge drop of 0.19 is snapped: the walker is grounded on the next quantum and its feet are at the lower floor; a drop of 0.21 is a fall: the walker is airborne for at least one quantum;
   - a walker starting with its centre inside the floor by 0.1 ends standing on the floor, never below it;
   - two walkers driven at each other at 1 unit per second, the verb speed, end separated by at least the sum of their half-extents minus the skin, and neither passes the other's starting x; the knowledge base measured that walkers planned against the previous step's poses stay apart at 1 and 2 units per second and overlap at 8, so the test states its speed and a second case at 8 records what the law does there without asserting separation.
   Both members of each pair are asserted, so the limit is shown to be real, not merely permissive.
6. **The course gates the golden.** `write-golden` runs `harness/course.test.js` and the outcome tests first and refuses to write when any fails, printing the failing test's name. `solver/FLAGS.md` gains one sentence: any bump of the toolchain or of `rapier3d-f64` reruns the course before a golden may move.
7. **CI order.** The course and outcome tests run in `npm test`, which CI runs before the golden compare, so a broken outcome is reported by name before a hash mismatch.
8. **The climber lands.** T1's behaviour numbers showed the product scene's `climber` at x 2, z 5 with no floor beneath it, falling for the whole run and never sleeping (final y about -50874). That is a scene defect the hash hid. Since this slice moves the golden for pin 2, it also gives the climber a floor, so it lands and sleeps, and records the new sleep quantum in the behaviour file; the commit names both reasons. Added 2026-09-25 after T1.
9. **The debug view is untouched.** The seat stays frozen. No fixture changes shape beyond the frame and behaviour moves pin 2 forces, each stated in the commit.
10. **The binary changes at most once**, for pin 2 if the run requires it. Digest pinned from the Linux build. The arithmetic golden does not move.
11. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.

## Acceptance

- Every test in pins 2 through 5 exists, is named for its outcome, states its number and tolerance, and passes.
- The fast-body case is run on the binary as it stands first, and the pull request states the result and whether the law changed.
- `write-golden` refuses on a failing course, in a test.
- The product golden, the fixtures, and the behaviour numbers moved once, with the reason in one commit.
- Typecheck clean, tests at or above T1's count, three engines print the goldens from the Linux binary, digest pinned, Atlas check green.

The controller's `is_sliding_down_slope` is true on flat ground whenever the move carries gravity, so no test uses it as a steep-slope signal; autostep works while airborne at 0.35.3. Sleep quanta: the knowledge base measured that a body at rest at the origin sleeps after quantum 32 and one away from the origin after 33, because the first sleep check compares against the identity pose; a test that asserts a sleep quantum builds its world where that holds, and says so. Build a 46 degree slope as degrees times `Math.PI / 180` in JavaScript or `d * PI / 180.0` in Rust, never `to_radians()`, which is one ulp off at 46 degrees.

## Not in T4

No restore, no ARM lane, no scheduled job, no change to the character's shape or the controller's constants, no hash assertion in any outcome test.
