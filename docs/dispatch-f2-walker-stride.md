# Dispatch F2 — the walker keeps its stride

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on F1, because both change `solver/src/rapier_law.rs` and both move the golden, and this slice rewrites T4 pin 4 once both causes it records are gone. Grounded in the Rust knowledge base's answer [`requests/walker-stall.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/walker-stall.md) (wave 3, si-rpg-engine), measured with a native port proven bit-identical to the engine's own binary at every quantum, and the rapier3d-f64 0.35.3 source quoted by line.

## What it is

On flat ground the character loses most of a quantum's travel on about one quantum in thirty: 332 of 10,000 at the origin, 323 at an offset of a million. It is a bug in Rapier's character controller, unchanged at 0.36.0 and at master. When the floor's collision normal comes out exactly vertical but for its last bit, with y equal to one minus two to the minus 53, `decompose_hit` builds the horizontal direction as the normal crossed with up, which is zero, and files the whole tangent, horizontal travel included, as vertical. With y exactly one that tangent's up component is exactly zero and the character slides with full travel; one unit in the last place below it, the component is about minus 4e-19, `handle_slopes` sees the character slipping while its intent is not, and the non-slip branch allows the horizontal tangent plus the normal part, which is zero. Only the controller's 1e-4 nudge survives. The offset does not cause the stall; it changes which quanta produce the degenerate normal.

## The choice, stated contrastively

The smaller fix is a one-line setting, tilting the controller's up vector by 1e-12, and it removes every stall. It works only inside a measured window, from about 1e-16 to 1e-10, whose upper edge a rapier or parry bump could move, and it changes a threshold the course sits near: a 0.21 drop that falls today would snap. This slice takes the larger fix instead. The engine owns a copy of the controller's movement routine, built on Rapier's public API, with one added branch where the horizontal direction does not exist. It removes every stall with no window, leaves the step limit and the drop outcome exactly as they are today, and, run without the branch, reproduces Rapier's own controller bit for bit, which gives the slice a control test that goes red the moment the copy and Rapier part. The cost is ownership: the copy is re-synced on every Rapier bump, which the engine already treats as a change to the law.

## Pins

1. **The copy.** `solver/src/kcc.rs` holds the engine's copy of Rapier's `KinematicCharacterController::move_shape` and the private functions it calls, adapted to Rapier's public API only, about 500 lines. Its header names the source (rapier3d-f64 0.35.3, `src/control/character_controller.rs`), its copyright (Sébastien Crozet and Dimforge), and its licence, Apache-2.0, and states that the engine modified it and how. `solver/LICENSE-APACHE-2.0` carries the licence text, and `solver/NOTICE` names the copied file and the change, as the licence requires. The rest of the repository stays MIT.
2. **The one change.** In `decompose_hit`, when the normal crossed with up has no direction, the tangent's component along up is the vertical tangent and the rest is horizontal, as the knowledge base's measured branch does; everywhere the direction exists the routine is unchanged. A constant switches the branch off for the control test and is never off in the product binary.
3. **The law calls the copy.** `integrate` drives the character through the copy with the controller settings it uses today. Nothing else in the law changes.
4. **The control test.** A native test, run with `--release`, drives the copy with the branch off and Rapier's own controller over the same flat walk and the same course, and requires every quantum to match bit for bit. It is the harness that keeps the copy honest across a Rapier bump; `solver/FLAGS.md` says a bump reruns it first.
5. **Red on `main`, green here.** Shown failing on `main` in the pull request:
   - a flat walk of 10,000 quanta at 0.4 units per second, at the origin and at an offset of a million, counts the quanta whose travel falls short of what was asked while the character is grounded on a flat floor: 332 and 323 today, zero here;
   - the 0.29 step is taken from 20 start positions in each of four directions, +x, −x, +z, and −z, all 80 here.
6. **What stays.** The course's cases hold unchanged, the step limit is unchanged (0.31 climbs, 0.3101 stops), and the drop outcome is unchanged. The five bodies the character never touches stay bit-identical at every quantum, so their final positions and sleep steps do not move.
7. **T4 pin 4 becomes an outcome test.** With F1's rebuilds and this slice's stalls gone, pin 4 is rewritten from a characterization to an outcome over the translated product scene: every body that neither tumbles nor carries the controller's hover ends within 1e-6 of its untranslated position relative to the offset; the character's horizontal position within 1e-6 and its height within the controller's 1e-4 hover, which the knowledge base measured flipping on about 40% of quanta between offsets and which is stated with that reason; and the slider, which tumbles, is asserted to come to rest on the floor in both runs rather than at matching positions. The flat-walk stall count and the four-direction step from pin 5 join it as permanent tests.
8. **What moves, named.** The Linux digest, the product golden, and in `fixtures/golden-behaviour.json` the walker's and parcel's final positions (the walker's x goes from about 70.53 to about 72.5, because it no longer loses travel) and the last snapshot digest. `write-golden` names each; the commit says why.
9. **Recorded, not fixed.** On a few quanta the first diagonal cast misses the floor and the character sinks about 2e-3 into its skin while keeping its travel. That goes into `docs/PHASE-2.md` as a known item with the knowledge base's quanta.
10. **Costs on record.** The time per quantum of the copy against Rapier's controller on the product scene, stated in the pull request.
11. **Public surfaces are the coordinator's.** The builder does not edit `README.md`, its translations, anything under `site/`, or `CHANGELOG.md`. The pull request body says what a reader needs, including the Apache-2.0 notice, which the coordinator carries into the README's licence section.

## Correction to an earlier number

T4's amendment and the first version of the handbook's Testing page gave the snap-or-fall threshold as 0.2105. The knowledge base corrected it: that value holds for one test geometry only, and in the course's geometry the character falls from 0.205; between 0.200 and 0.2105 the outcome depends on the exact bits. The course's pair, 0.19 snapped and 0.22 fallen, holds under every fix measured, and the course tests stay on either side of that band.

## Acceptance

- The flat-walk stall count is 332 and 323 on `main` and zero here; the four-direction step is 80 of 80.
- The control test passes with the branch off.
- T4 pin 4 is an outcome test as pin 7 states, passing, and no longer lists the walker's stall.
- The licence text, the notice, and the file header are present.
- Typecheck clean, tests at or above the count on `main`, three engines and ARM64 print the goldens from the Linux binary, lint clean, digest pinned, Atlas check green.

## Not in F2

No change to the controller's settings, no capsule character, no fix for the diagonal cast that misses the floor, no change to walker-against-walker contact, no upstream report from the builder, no public-surface edits.
