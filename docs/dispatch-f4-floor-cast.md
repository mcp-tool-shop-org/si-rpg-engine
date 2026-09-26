# Dispatch F4 — the character stays on the floor it starts on

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. It depends on F2, whose copy of Rapier's controller, `solver/src/kcc.rs`, this slice changes a second time. It is grounded in two answers of the Rust knowledge base (wave 3, si-rpg-engine):
- [`requests/floor-cast-miss.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/floor-cast-miss.md), the mechanism, measured on F2's law;
- [`requests/floor-cast-retry.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/floor-cast-retry.md), the fix, measured again on `main` at 29e1c52, after F3.

Parry has the defect as dimforge/parry#452, open.

## What it is

On a few quanta the character's first cast of its move finds no floor, and it sinks into its skin. `docs/PHASE-2.md` has recorded this as known and not fixed since F2.
- **The start.** The cast is the character's box, dilated by the controller's 0.01 skin, cast along the quantum's move. Its bottom starts on the floor's top face to within rounding, so the ray inside parry's GJK cast starts on the surface of the shapes' Minkowski difference.
- **The miss.** GJK's projected distance falls to about 2.5e-15. That is the rounding floor for a difference whose support points carry coordinates near 56, and just above GJK's absolute tolerance of 2.2e-15. The search direction it then takes is rounding noise. When that direction points along the cast, the half-space test declares a miss, and the cast returns nothing.
- **What follows.** The character takes its whole move, gravity step included. It sinks 1.953125e-3 into its skin and climbs back at the controller's 1e-4 nudge over 20 quanta.
- **How often.** On the flat walk of 10,000 quanta it comes 8 times at the origin and 7 at an offset of a million: 80 and 70 sunk quanta, counting the climbs back. The product scene has the same 8, on the same quanta.
- **Whose it is.** Rapier's own controller does the same, since the cast is parry's. Parry 0.31.1, which Rapier 0.36.0 brings, has the same `gjk.rs`.

## The choice, stated contrastively

The conservative course would leave it. The character keeps its full stride, stays grounded, and climbs back. But a character that sinks into its floor on a rounding coin toss is a defect in what the engine simulates, and the sweep and the instrument will meet it on any long floor. The fix costs the product golden, which moves from `6e0d351693b18c93` to `69a671f962665563`. The knowledge base measured that value on F2's law, and again on 29e1c52.

Parry has not fixed it, so there is nothing upstream to backport. This slice changes the engine's own copy of the controller, as F2 did. The change stays switchable, so the control test can show that the copy with it off is exactly today's.

## Pins

1. **The change.** In `solver/src/kcc.rs`, when `move_shape`'s first cast finds nothing while the character was grounded at the start of the move, it casts once more with the skin 1e-9 larger. The start is then clearly inside the dilated shape, and parry's contact fallback answers.
   - A second const parameter beside F2's `BRANCH`, `RETRY`, switches it off for the control test. The product binary has no instance with it off.
   - The file's header and `solver/NOTICE` name this change and parry#452.
2. **The control test.**
   - With the retry off, the copy is today's law bit for bit, over every recorded law run, the course, the flat walks, and the product scene.
   - With it on, the law parts from today's only on quanta where the retry fires and hits. The knowledge base counted 93 firings over the course, the outcome tests, and the fixture runs, and 22 hits:
     - 8 in the flat walks and 8 in the product scene;
     - 2 and 1 in course cases 5.9 and 5.10;
     - 3 in outcome 4c.
   - Every hit is a boundary start: the start's distance to the collider it hits equals the skin to within 2.4e-15. A native test asserts that for every hit, and counts the firings and hits per run.
   - The other firings find nothing on the retry either, so they change nothing.
3. **Red on `main`, green here.** The pull request shows each case failing on `main`.
   - **One quantum.** A walker at x 7.51119, y 0.25999999999999984 (0.26 less 3 units in the last place), z 0, moving at 0.4 in x, on the product floor. On `main` it ends the quantum at y 0.25804687499999984, sunk; here at 0.2601000000000001.
   - **Nine hundred worlds.** Single-quantum worlds at x = 5 + k·0.00617 for k from 400 to 419, at 0 to 44 units in the last place under 0.26. On `main` 3 sink; here none. This case does not rest on one start's exact bits.
   - **The flat walk.** At the origin and at an offset of a million: 80 and 70 sunk quanta on `main`, none here. Outcome 4b now asserts that no quantum sinks, where it only printed them.
4. **What moves, named.**
   - **The product golden:** `6e0d351693b18c93` becomes `69a671f962665563`, written by `write-golden`, which names what moved. The arithmetic golden `0d38671370d12d1e` does not move.
   - **The product scene's records,** each through its own capture path:
     - its recorded behaviour and its perturbations in `fixtures/golden-behaviour.json`;
     - its snapshot digests;
     - the golden trace's last quantum;
     - its law run (`node harness/law-runs.mjs --write`).
   - **Nothing else.** All 16 fixture replays are identical at every tick, the other 17 law runs are unchanged, and the sweep's record, `fixtures/sweep/verdicts.json`, is byte-identical. The pull request shows each.
   - **The Linux digest,** pinned from a Linux build.
5. **The known item closes.** `docs/PHASE-2.md`'s known item for the floor cast is marked fixed by F4, with its numbers.
6. **F5 is independent of it.** The first cast is planned before any push, and the push writes velocities only. The knowledge base measured F4 with F5 on top, and the golden is `69a671f962665563` with both. Whichever of the two lands second rebases, re-records the law runs, and re-pins the digest. No number in this dispatch moves.
7. **Costs on record.** The copy's time per quantum with the retry on against off, on the product scene and on the flat walk.
8. **Public surfaces are the coordinator's.** The builder does not edit `README.md`, its translations, anything under `site/`, or `CHANGELOG.md`.

## Acceptance

- The one-quantum case and the nine-hundred-world case sink on `main` and not here. The flat walk has 80 and 70 sunk quanta on `main` and none here.
- The control test passes with the retry off. With it on, every hit is a boundary start.
- The product golden moves to `69a671f962665563`. Nothing else moves but the product scene's records and the digest, each named.
- The header and the notice name the change and parry#452.
- Typecheck clean, tests at or above the count on `main`, three engines and ARM64 print the goldens from the Linux binary, lint clean, digest pinned from a Linux build, Atlas check green.

## Not in F4

- No change to the controller's settings, to F2's branch, or to parry.
- No upstream report, since parry#452 is filed.
- No public-surface edits.
