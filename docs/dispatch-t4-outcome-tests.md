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

## Amended after the knowledge base's answers 7 and 8 (2026-09-25)

Answer 7: rapier3d-f64 0.35.3 already sweeps every fast dynamic body against fixed colliders with `ccd_enabled(false)`, and the thin-slab box stayed on the near side in 14 of 14 engine runs; it tunnels only at `max_ccd_substeps = 0`. So pin 2's test asserts the near side with no law change, `build_world` sets `max_ccd_substeps = 1` explicitly so the behaviour does not rest on a default, and the red evidence is a native test-only build with `max_ccd_substeps = 0`, where 5 of 7 tunnel, never the product binary. Above 1, a restore would need crate-private state, so the value stays 1.

Answer 8: autostep's limit is `max_height` plus the controller's offset, and feet rest one offset above every surface, so pin 5's numbers change. Every threshold moves with speed, so each case states its speed, and the product walker's is 0.4 units per second. Feet are `y - hy - SKIN`.

- Step: 0.29 is climbed and 0.33 stops the walker; the measured limit is 0.3101. Never test between.
- Drop: 0.19 is snapped and 0.22 is a fall at 0.4 units per second; the threshold is 0.2105 at that speed and 0.2058 at 2 units per second.
- Slope: 44 and 46 degrees, with the speed and a bounded quantum count stated. Never exactly 45, where the walker creeps.
- Starting inside the floor: the walker rises by the controller's 1e-4 nudge and needs about 1,300 quanta; the test runs long enough and says so.
- Native tests of loading run with `--release`, because Rapier's island-manager `debug_assert` fires when bodies touch at load.

## Pin 4, decided after the build (2026-09-25)

The translated scene did not hold. Only `tip` and `climber` agreed within 1e-6; the walker and parcel ended 0.038 apart, the stack by up to 1.2e-3, and the slider 0.47 apart and asleep at quantum 233 instead of 189. The builder traced three causes: the walker loses most of a quantum's travel on about one quantum in 28 on flat ground, and which quanta changes with the offset; the world rebuild at quantum 260, when the climber's lift changes the driven set, re-solves the sleeping stack without its warm start; and the slider tumbles down the ramp, which amplifies any difference.

Decision: pin 4 lands as a characterization test. It asserts exactly the set of divergences above, so it goes red on a new divergence and on a fix, and a fix must rewrite it to the outcome the pin first asked for. The two defects are named work, not tolerances: the walker's stall on flat ground goes to the Rust knowledge base for its cause first, and the rebuild at a driven-set change is the in-place switch the knowledge base is already researching. When both are fixed, pin 4 is rewritten as an outcome test over a scene whose bodies do not tumble.

## Acceptance

- Every test in pins 2 through 5 exists, is named for its outcome, states its number and tolerance, and passes.
- The fast-body case is run on the binary as it stands first, and the pull request states the result and whether the law changed.
- `write-golden` refuses on a failing course, in a test.
- The product golden, the fixtures, and the behaviour numbers moved once, with the reason in one commit.
- Typecheck clean, tests at or above T1's count, three engines print the goldens from the Linux binary, digest pinned, Atlas check green.

The controller's `is_sliding_down_slope` is true on flat ground whenever the move carries gravity, so no test uses it as a steep-slope signal; autostep works while airborne at 0.35.3. Sleep quanta: the knowledge base measured that a body at rest at the origin sleeps after quantum 32 and one away from the origin after 33, because the first sleep check compares against the identity pose; a test that asserts a sleep quantum builds its world where that holds, and says so. Build a 46 degree slope as degrees times `Math.PI / 180` in JavaScript or `d * PI / 180.0` in Rust, never `to_radians()`, which is one ulp off at 46 degrees.

## Not in T4

No restore, no ARM lane, no scheduled job, no change to the character's shape or the controller's constants, no hash assertion in any outcome test.
