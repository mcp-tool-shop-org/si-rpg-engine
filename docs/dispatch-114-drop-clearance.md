# Dispatch 114 — a drop sets the body down clear of the actor

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on nothing now on `main`. Issue #114. Measured on `main` at `db48379`, product law `fd4b46bb45f299894d31e8745a3649f986c08b95ad3acba7ec20d70bfef2fde2`, which matches `fixtures/solver.sha256`. The measurement is [`requests/crate-eject.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/crate-eject.md). This slice does not change the law.

## The choice, stated contrastively

The conservative course is the one `main` takes. `admitRelease` (`packages/tick/predicates.js:257`) checks a clear placement, the carried box 0.05 above the support, and the effect trusts that check. The walker then drives to the same target (`drives('release')` at `packages/tick/tick.js:293`). At `remaining === 1`, `world.release` (`packages/tick/world.js:949`) puts the crate at that point, recomputes the support, and does not check the volume. By then the walker is there, and the crate is inside it.

This slice takes the other course. The actor stops at reach, so the body goes down at the target and not inside the walker, and the effect checks clearance again at release. A release that would overlap another body is refused, and the carried body stays carried.

## What the measurement showed

`SI_RPG_BUNDLES=<dir> node packages/load/bin/load.js world fixtures/bench/room.json` refuses the room. The finding is the one on #114: the crate leaves after drop `(1.25, 1.75)`, tick 806, `(9.623, 1.710)`, y −1.0353.

The witness is five intents: pick-up at 36, move `(1.75, 0.75)` at 184, drop `(0.25, 0.75)` at 255, pick-up at 420, drop `(1.25, 1.75)` at 454. The second drop is admitted at 454 and released at 544. At admission the crate's box is at y 0.305–0.805, 0.05 above the step, and overlaps nothing. At release the walker is at `(0.990, 0.260, 1.740)` and the crate at `(1.25, 0.555, 1.75)` overlaps the walker by about 0.24 × 0.21 × 0.49. In that quantum the walker rises 0.250. The crate leaves at 15.94 m/s upward, goes over the east wall with its bottom at y 10.1, and falls below −1 at tick 806. It never touches the wall.

The first drop in the same witness, released at 351, also places the crate inside the walker. The walker does not rise, and the crate is lifted to about y 0.74 at no more than 1.13 m/s.

`fixtures/behavior-verbs.json`, cases `carry` and `carry-capsule`, record the same placement. The drop target is `(3.1436, 0)`. The walker ends at `(3.141, 0.256, 0)` and the crate at `(3.018, 0.243, −0.007)`, inside the walker. `packages/tick/verbs.test.js:275` asserts `crate.x > 2 && walker.x > 2`, and line 276 asserts `crate.y > 0.2`. Neither asserts that the crate is outside the walker.

With `world.release` refusing a placement whose box overlaps another body, the room's sweep exits 0, both zones are reached, 75 cells, load hash `847ff098be3328e3`. That run was on a scratch worktree and is not the fix. The fix is this dispatch.

The launch at 15.94 m/s is a separate issue, not this slice. F5's guard does not see it: the guard reads horizontal speed from the record at the start of the quantum, and it scores post-step velocity only for bodies the push touched.

## Pins

1. **The tests first.** Each test below fails on `main` and passes here, and the pull request shows both.

2. **The actor stops at reach.** A drop's drive ends with the actor short of the target by enough that the carried body's placement at the target does not overlap the actor. The red is the room's bundle: `load world fixtures/bench/room.json` on `main` exits 1 with the crate leaving; here it exits 0 and both zones are reached.

3. **The effect checks clearance again.** `world.release` refuses a placement whose box overlaps another body, and the carried body stays carried. The carry case's crate is inside the walker on `main`. Here the recorded end of `carry` and `carry-capsule` has the crate clear of the walker.
   - `fixtures/behavior-verbs.json` is re-recorded for `carry` and `carry-capsule`, and for no other case. The pull request names every frame that moved and why.
   - The product golden does not move. The product scene has no drop. The Linux digest does not move. No Rust source changes.

4. **A sweep invariant, considered.** The pull request says whether the sweep refuses an effect that places a body overlapping another, as its own check, and if it does not, why. Today an overlap is invisible to the sweep, and only a launch shows it. Adding the invariant is part of this slice when the room's own sweep can express it without a new world. It is not a reason to change the law.

5. **Nothing else.** The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- The room's sweep exits 0 and both zones are reached.
- `carry` and `carry-capsule` end with the crate outside the walker, and those two cases are the only behaviour records that move.
- The product golden and `fixtures/solver.sha256` are unchanged.
- The typecheck is clean, the test count is at or above `main`, and the Atlas check is green.
