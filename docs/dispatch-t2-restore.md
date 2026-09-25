# Dispatch T2 — restore

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on T1. The plan row is T2 in `docs/PHASE-2.md`. Findings 6 and 12 of `docs/study-swarm/testing-3d.dispatch.md`.

## What it is

The solver exports a snapshot every quantum and the hash covers it, but nothing can load one. GGPO's SyncTest and Jolt's state replay both rest on the same act: restore, rerun, compare. Until the engine can do that, the snapshot is a claim about completeness that nothing tests. This slice adds the restore and the test that catches whatever the snapshot has been missing.

## Pins

1. **`solver_restore`.** The binary gains `solver_restore(world_id, n_bodies, n_colliders, rows, cols, cell, shape, len) -> u32`, with the same geometry inputs as `solver_load` read from the body, collider, and height buffers, plus `len` bytes of a snapshot copied into a new input buffer at `restore_ptr()`. It rebuilds the world for that signature as load does, then sets every body's position, orientation, linear and angular velocity, and sleep state from the bytes, runs the same collision pass load runs, and writes the warm-start impulses of every manifold point from the bytes in the same sorted pair order the snapshot uses. It returns 1 and leaves `snapshot_ptr()` holding bytes identical to the input; it returns 0 and changes nothing when the length does not match the layout for the signature, when any float is NaN, when a quaternion is not unit within `1e-9`, or when the pair or point counts after the pass differ from the snapshot's.
2. **The binding.** `solver/build.mjs`'s generated module exports `saveSolver()` returning a copy of the current snapshot bytes and `restoreSolver(worldId, bodies, colliders, heightfield, driven, shape, bytes)` returning true or false, mirroring `loadSolver`.
3. **The world.** `world.save()` returns `{ bodies, lifted, carried, snapshot }`: the body records as plain numbers, the two sets as arrays, and the bytes. `world.restore(save)` writes the records, restores the sets, and calls the binding; it throws with a reason on refusal. The reference and box laws have no snapshot; their `save` returns the records alone and `restore` writes them back.
4. **Round trip.** A test saves after N quanta, restores into a fresh world of the same file, and requires `snapshot()` to equal the saved bytes exactly.
5. **Restore then rerun.** `harness/restore.test.js`: for the product scene and every case of every behaviour fixture, run to a third of the way, save, continue to the end and keep the T1 trace from the save point; then build a fresh world, restore, run the remainder, and require `first-difference` to report `identical`. This is the test that finds state the snapshot misses.
6. **What the test finds goes into the snapshot.** If the rerun differs, the differing field is the missing state, and it is added to the snapshot with a stated reason; the golden and the fixtures' frames move once for it, and the commit names the field. If the culprit is broad-phase internal state that cannot be restored through the public API, the law rebuilds the broad phase from the colliders at every step, which is cheap at 64 bodies, and the golden moves once with that reason. The pull request states which of these happened, or that neither did.
7. **Refusals that go red.** A snapshot with one byte changed is refused; a snapshot from a world of a different signature is refused; a snapshot of the wrong length is refused; each with a test. A restore whose input passed but whose rerun was planted to differ by one velocity is caught by the diff, in a test, so the harness cannot pass vacuously.
8. **The tick does not change.** Saving a tick, with its memory, minds, actions in flight, and input log, is the bundle T5 writes and is not in this slice; T2 gives it the solver half.
9. **The binary changes once.** Digest pinned from the Linux build as before. The arithmetic golden does not move. The product golden moves only under pin 6.
10. **The map.** The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.

## Acceptance

- `saveSolver` and `restoreSolver` exist; the round trip is byte-exact in a test.
- The restore-then-rerun test passes for the product scene and every fixture, with the T1 diff as the oracle.
- The three refusals and the planted rerun difference each have a test.
- The pull request says what the snapshot was missing, if anything, and what moved because of it.
- Typecheck clean, tests at or above T1's count, three engines print the goldens from the Linux binary, digest pinned, Atlas check green.

## Not in T2

No tick-level save, no ARM lane, no lint of the binary, no outcome tests, no change to the hash's shape beyond pin 6.
