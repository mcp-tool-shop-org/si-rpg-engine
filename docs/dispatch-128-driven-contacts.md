# Dispatch 128 — a driven character's contacts do not become a dynamic body's speed

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Issues #128 and #121. This slice changes the law. It merges after T7c's measurement pull request, so both of T7c's bars run on one law. #127 has landed, so the slice rebases onto current `main`.

The measurement is the overseer's, standing in for the Archivist, on `main` at `1da5f6a` with the product law `fd4b46bb45f299894d31e8745a3649f986c08b95ad3acba7ec20d70bfef2fde2`, rapier3d-f64 0.35.3 with enhanced-determinism, and parry3d-f64 0.30.2. It is summarised below. #121's measurement is the Archivist's crate-eject reading, relayed on 2026-09-26.

## What the measurement showed

**#128 is a stored squeeze impulse released by the in-place switch.** It is not depenetration, and it is not the character's velocity bookkeeping. While driven, the walker's velocity is only `vy = record vy + G·DT`, set to 0 when grounded (`solver/src/rapier_law.rs:810-831`).

- The witness is the `behavior-verbs` `refusals` fixture: move (0.75, −0.25), move (1.25, 0.25), climb (1.75, 0.25), move (1.25, 0.25). From t322 the walker walks west across the dynamic crate, which it pushes and which tips from 0° to 42.5° by t355. Its feet are 0.08 to 0.09 below the crate's AABB top.
- The kinematic walker has infinite mass, so the contact solve pushes the crate against the static ledge. The decoded warm-starts for t350 to t355 are walker–crate Σ 3.11 to 3.42 N·s over 4 points, and ledge–crate Σ 3.12 to 3.32 N·s. The crate's weight impulse per quantum is 0.027 N·s, so the squeeze is about 120 times that.
- At t355 the move ends. At t356 `solverModes` gives the walker mode 0 (`packages/tick/world.js:127`), and `to_dynamic` flips it in place (F1). The flip keeps the pose, the contact pairs, and their warm-starts. The first dynamic step applies the stored ~3.1 N·s to a walker of 0.125 kg. The walker leaves at (−1.29, 11.12, −0.70) m/s and the crate at (−2.57, 3.06, 0.57). Both warm-starts read 0 after that step. The walker reaches y 8.9 and leaves the world.
- The control: a fresh product world loaded from the exact t355 bodies, both dynamic, the walker's velocity zeroed, no stored impulses. Stepped once, the walker gets 0.81 m/s and the crate 0.33 m/s. The geometry does not throw. The stored impulse does.

**#121.** The 0.25 autostep is a pose change of the kinematic body. Rapier turns it into 16.0 m/s with `interpolate_velocity`, and the contact solve writes that onto a dynamic box the walker overlaps, or onto a box that only meets the walker's head. A carried body is not in the solver. `pinCarried` copies it to the walker's head and sets its velocity to 0, and the crate-eject measurement recorded that case at speed 0. The push copy (`solver/src/impulses.rs`) does not write the 16 m/s, and F5's guard does not see it. The reading is [`requests/crate-eject.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/crate-eject.md).

**What the two share.** A driven character in deep contact with a dynamic body. The contact solve turns something that only makes sense for an infinite-mass body into dynamic velocity: the pose change in #121, the squeeze in #128.

**The product golden.** The product scene's 10,000 quanta make one driven→dynamic switch, the climber at t261, with no contact pairs. No quantum of the run holds a warm-started contact between a driven body and a dynamic body. Neither route below has a reason to move `69a671f962665563`. The slice confirms that by hash.

## The choice, stated contrastively

The conservative course is the one `main` takes: Rapier's contact solve runs between a kinematic character and every dynamic body it touches, and the engine's push routine (F3, F5) runs beside it. The narrower change would clear a switched body's contact state at driven→dynamic (route A). It fixes #128 alone. Rapier 0.35.3 has no public mutable access to a pair's warm-start, a physics hook can only drop the pair's solver contacts for one quantum, and removing and re-adding the collider changes its handle generation and so the snapshot's pair keys.

This slice takes route B: no solver contacts between a driven character and a dynamic body. A character acts on bodies only through the engine's push routine, which is already the route the engine chose (F3, F5). It is the one route that closes #121 and #128 both. Its cost is semantic. A body falls through a driven character, for example a crate dropped onto one, and a character no longer holds up a body that rests on it. That cost is measured here, on the behaviour fixtures, the outcome tests, the sweep, and T7b's bench.

## Pins

1. **The tests first.** Each red fails on `main` and passes here, and the pull request shows both.
   - The `refusals` witness above: on `main` the walker leaves the world after t356. Here it does not, and no body in that run exceeds the climb rule's `maxRise` above its start.
   - A two-body red room for #121: a walker that autosteps 0.25 while a dynamic box overlaps it, or meets its head and is not carried. On `main` that box leaves at about 16 m/s. A carried box is not this red: the same measurement recorded it at speed 0. Here the overlapping box, and the box that meets the head, do not rise faster than the walker does.

2. **Solver groups, not collision groups.** A driven body's collider and a dynamic body's collider carry solver groups that exclude each other. Static colliders solve against both. The narrow phase still finds the pairs, so the snapshot's pair keys, the character controller's queries, and the push routine's contact reads do not change. Collision groups would remove the pairs and are not this slice.
   - The groups follow the mode. At every in-place switch (`to_dynamic`, `to_kinematic`, and the driven switch F1 made), the switched collider's solver groups are set in place. Its handle does not change.
   - A driven body and a dynamic body in contact show zero warm-start in the snapshot after this slice.

3. **A control test, as F2 to F5 have.** The change sits behind a switch in the law, on in the product law. With it off, the law is `main`'s bit for bit: the product scene's per-quantum trace equals the golden's, and so does every corpus bundle's replay. The switch is named in `solver/FLAGS.md` with its reason and this dispatch.

4. **What moves, named.**
   - The product golden `69a671f962665563` and the arithmetic golden do not move, and the pull request quotes both hashes from CI.
   - The Linux digest moves, and `fixtures/solver.sha256` is written from CI's Linux build. It is never written from Windows.
   - Each behaviour fixture that moves is re-recorded, and the pull request names each frame range that moved and why. A frame that moves for a reason other than a removed driven–dynamic solve is a stop: the builder reports it and does not re-record.
   - `fixtures/sweep/verdicts.json` is re-recorded with `node harness/corpus.mjs --record-sweep`, and every verdict that moves is named. The `refusals` walker's finding goes. Any new finding is listed with its body's rise and largest upward jump.
   - The outcome tests and the character course pass unchanged.

5. **The cost, measured.** The pull request reports T7b's bench with the base at `main` and the head at this branch, on `fixtures/bench/room.json` and the product scene, at seed 1: its differences, the anchors reached, and every candidate that parts. It lists each place in the fixtures, the sweep worlds, and the bench's candidates where a dynamic body now passes through or leaves a driven character it used to rest on or bounce off.
   - If that cost reaches the product golden, an outcome test, or a behaviour fixture beyond removed driven–dynamic solves, the builder stops and reports. Route A for #128, with #121 handled in the controller's autostep, is then a new dispatch. The builder does not switch routes.

6. **Nothing else.** No change to the push routine, the controller copy, F5's guard, the checker, or the tick's modes. No workflow file changes. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with `@dogfood-lab/atlas@1.17.0` if a file is added. The law's native tests and the soundness checks pass.

## Acceptance

- The `refusals` walker is not thrown. The #121 red room's box does not leave at the autostep. Both are red on `main`.
- With the switch off, the law is `main`'s bit for bit on the product scene and the corpus.
- The product and arithmetic goldens are unchanged. The Linux digest is re-pinned from CI.
- Every moved fixture frame and sweep verdict is named, and T7b's bench report on the room and the product scene is linked.
- The typecheck is clean, the test count is at or above `main`, the native tests pass, and the Atlas check is green.
