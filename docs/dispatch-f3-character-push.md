# Dispatch F3 — the character's push

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on F2, whose copy of the controller's movement routine this slice sits beside. Grounded in the Rust knowledge base's answer [`requests/squeeze-launch.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/squeeze-launch.md) (wave 3, si-rpg-engine). It was measured with a native replay of the law proven bit-identical to the engine's own binary at every quantum, and it quotes the rapier3d-f64 0.35.3 and parry3d-f64 0.30.2 sources by line.

## What it is

T6's reachability sweep found a small box that the product law launched at 162.7 units a second. The knowledge base traced the launch to the character's push, not to a squeeze and not to the contact solver.

After the character moves, the law calls Rapier's `solve_character_collision_impulses`, which pushes the dynamic bodies the character touched. At 0.35.3 that function gathers every nearby dynamic collider's contact manifolds into one shared `Vec`, and assumes parry only appends to it. For a convex pair, parry writes into `manifolds[0]` instead. So when two dynamic bodies are near the character, the second body's call overwrites the first body's manifold. The first body is then pushed at the second body's contact points, placed through its own pose, along its own normal.

The impulse's mass ratio uses linear mass only, and re-reads the point's velocity after every impulse. Every hit the character made re-runs the pass. So the error compounds, to 178.8 units a second in one quantum before the solver damps it.

Rapier fixed the overwrite upstream in PR dimforge/rapier#1004 (released in 0.36.0), by building a new `Vec` for each call. The engine pins 0.35.3.

## The choice, stated contrastively

The obvious fix is to bump to rapier3d-f64 0.36.0, which carries #1004 and needs no source change. The knowledge base measured it identical to the backport on everything the engine measures, down to every byte of the red rooms' call logs.

This slice takes the backport instead. The bump also changes parry, in 55 source files, and Rapier's solver, CCD, island manager, narrow phase, and collider set. The suite exercises some of that surface, not all of it. A version bump deserves its own slice, measured by the two-build bench T7b is building, which is the tool for exactly that comparison. The backport is one function the engine owns until that bump lands, and deletes then.

## Pins

1. **The copy.** `solver/src/impulses.rs` holds the engine's copy of rapier3d-f64 0.35.3's `KinematicCharacterController::solve_character_collision_impulses`, and the private function it calls for one collision, adapted to Rapier's public API only (about 70 lines). Its header names:
   - the source: `src/control/character_controller.rs` at 0.35.3;
   - its copyright and its licence, Apache-2.0;
   - the change, and that it is rapier PR #1004's.

   `solver/NOTICE` gains the entry, as it did for `kcc.rs`. The rest of the repository stays MIT.
2. **The one change.** Each collider's manifolds are gathered into a `Vec` of its own, as #1004 does, and a switch turns the change off for the control test only. Everywhere else the copy computes what Rapier's function computes. The product binary has only the change-on form.
3. **The law calls the copy.** `integrate` pushes through the copy with the character mass it passes today, 1.0. Nothing else in the law changes.
4. **The control test.** A native test, run with `--release`, gives the copy with the change off and Rapier's own function the same inputs. It requires every quantum to match bit for bit across the course, the flat walks, the product scene, and the red room. With the change on, the copy may differ only on quanta where two or more dynamic colliders are near the character. `solver/FLAGS.md` says a bump reruns it first, beside F2's.
5. **Red on `main`, green here.** The knowledge base's red room A (section 4.1 of its answer) becomes `fixtures/push/red-room-a.json`: a 5 by 3 room walled 2.0 high on every side, the walker, a crate 0.12 by 0.2 by 0.12, and the shade, with the walker pushing the shade at tick 0.
   - On `main` the crate first exceeds 10 units a second at tick 53, at 26.0642, frame hash `375c78856a5a4b15`; the frame hash at tick 200 is `8936cf832bc642ab`. The pull request shows this failing on `main`.
   - Here no body in the room exceeds the guard's bound (pin 6) in 200 quanta.
6. **The guard.** The fix removes the overwrite, but not the amplifier: the linear-only mass ratio over-corrects each point, and remains in 0.36.0. A law test fails when a pushed body leaves a push faster than a stated multiple of the pusher's speed. It runs over the red room, the product scene, and every fixture with a push. The multiple is measured and stated with its headroom. The knowledge base's highest pushed-crate speed with the fix in place was 2.57 units a second. The guard goes red on `main` in the red room.
7. **What stays.** The product golden `6e0d351693b18c93`, the arithmetic golden, the behaviour numbers, the course, and the outcome tests do not move. The product scene never brings a dynamic collider near the walker (0 of 10,000 quanta). The Linux digest moves, and the commit says why. If the sweep's record (T6's `fixtures/sweep/verdicts.json`) is on `main` when this slice rebases, re-record it with `node harness/corpus.mjs --record-sweep`, and name every verdict that moved and why.
8. **Costs on record.** The time per quantum of the copy against Rapier's function, on the red room and on the product scene, stated in the pull request.
9. **Public surfaces are the coordinator's.** The builder does not edit `README.md`, its translations, anything under `site/`, or `CHANGELOG.md`.

## Acceptance

- The red room launches on `main` (26.0642 at tick 53) and stays under the guard here.
- The control test passes with the change off, and with it on the copy differs only on quanta with two dynamic colliders near the character.
- The guard fails on `main` and passes here.
- The goldens and behaviour numbers are unchanged, and the Linux digest is pinned anew.
- The licence header and the notice entry are present.
- Typecheck clean, tests at or above the count on `main`, three engines and ARM64 print the goldens, lint clean, Atlas check green.

## Not in F3

- No version bump.
- No change to the mass ratio; the guard watches it.
- No change to the character's settings.
- No upstream report.
- No public-surface edits.
