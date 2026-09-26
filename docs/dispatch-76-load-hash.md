# Dispatch 76 — the load hash covers the world file

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T6, which changed `packages/tick/admit-world.js`. The defect is issue #76, and the builder's brief added the scope of pin 2's second half and pins 4 and 5. This document records the dispatch as the builder received it, so the review has one contract to read.

## What it is

`loadHash` in `packages/tick/admit-world.js` mixes the seed, then `world.mixLoad`, then the solver's snapshot after load. `mixLoad` mixes the zones, the minds, and the heightfield, and loads the solver. It never mixes the static colliders themselves. The snapshot holds the dynamic bodies' state and the contact manifolds, so a collider reaches the hash only when some body touches it at load. A wall that touches nothing does not change the load hash.

The host refuses a world whose file no longer matches its entry in `worlds/index.json`, and that check (`indexReason`) compares load hashes. So a world file edited after admission, to add, move, or remove a wall that touches nothing at load, passes the check. Changed content then enters a running world without being admitted again. The handbook's World files page says the load hash covers the colliders; for untouched colliders it does not.

It was first seen when T6's walls left `worlds/crate-and-door.json`'s load hash at `f0fa75010a65e41b`. T6's own test worlds `fixtures/sweep/walled.json` and `walled-open.json`, which differ by one wall, both load to `036a8dee4e9ee9f9`.

## Pins

1. **The test first.** Two worlds that differ only by a wall nothing touches at load get different load hashes. The pull request shows it failing on `main`, with the walled and walled-open pair among the cases.
2. **The fix.** Mix every static collider, its id, bounds, and rotation, as exact bits in file order, into `loadHash` itself, not into `world.mixLoad`. Frame hashes, the goldens, and every fixture's frames then do not move; only load hashes and index entries do.
   - A comment states what the load hash covers.
   - Anything else a world file holds that is still outside the hash is covered, or the pull request says why not.
3. **Re-admission.** Every world in `worlds/index.json` is admitted again with the ordinary `load world` command. Anything else that records a load hash is updated through its own recording path, and each change is named.
4. **The gap closed.** A planted test shows `indexReason` refusing a world file edited after admission by adding a wall nothing touches.
5. **Nothing the law is made of.**
   - The goldens `6e0d351693b18c93` and `0d38671370d12d1e` and the behaviour numbers do not move, and no Rust source, law, or binary byte changes.
   - The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The handbook's sentence is the coordinator's to update.
   - The map is regenerated on Linux if a file is added.

## Acceptance

- The new tests fail on `main` and pass here.
- The load hash covers the colliders, and the pull request names what else it now covers and what it leaves out, with reasons.
- Every index entry is re-admitted through `load world`.
- The goldens and every fixture are unchanged.
- Typecheck clean, tests at or above the count on `main`.
