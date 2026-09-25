# Dispatch T3 — platforms and the binary

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on T1. The plan row is T3 in `docs/PHASE-2.md`. Findings 1, 3, 4, 5, and 12 of `docs/study-swarm/testing-3d.dispatch.md`.

## What it is

Every golden so far was printed on one CPU architecture. Box2D's determinism broke on fused multiply-add and Rapier's snapshot diverged for months on ARM before an ARM job noticed. WebAssembly 3.0 names the instructions whose results a host may choose, and Wasmtime names memory growth as a source of divergence. This slice adds the second architecture, refuses the instructions and the growth the build is supposed to exclude, and records the snapshot golden the way Rapier learned to.

## Pins

1. **The ARM lane.** CI gains a job on `ubuntu-24.04-arm` that checks out, installs Node 22, and runs `node harness/sim.mjs`, `node harness/arith.mjs`, and `harness/trace.mjs` against the goldens and against the trace the x64 job uploads as an artifact, using `first-difference.js`. jsvu publishes no ARM builds of the three shells, so this lane runs node's V8 on ARM, which is the architecture drift the lane exists to catch. It does not rebuild the solver: it downloads the x64 job's `solver/dist/solver.mjs` artifact, so the bytes under test are the pinned Linux build. The job has a timeout and shares the concurrency group.
2. **The lint.** `solver/lint.mjs` parses the built binary and refuses it, exit 1 with the reason, when it contains any relaxed-SIMD instruction (the `0xfd` prefix with opcodes `0x100` through `0x113`), any `memory.grow`, or a memory whose maximum is absent or differs from its initial size. `solver/build.mjs` runs the lint after every build; CI runs it on Linux. The build sets the memory fixed with the linker's initial and maximum memory arguments if it is not already so, and that change moves the digest once.
3. **The lint goes red.** `solver/lint.test.js` builds three tiny hand-written WebAssembly modules as byte arrays, one with a relaxed-SIMD instruction, one with `memory.grow`, one with a growable memory, and asserts the lint refuses each with the right reason, and accepts a fourth that has none.
4. **The snapshot golden is size plus digest.** `fixtures/golden-behaviour.json` gains the FNV digest of the snapshot at load and at the last quantum beside the lengths T1 records; `harness/check.js` verifies both; a changed length means the encoding changed, a same-length changed digest means the values changed, and `write-golden`'s output says which.
5. **Insertion order is part of the record.** A test builds one world twice with the bodies in a different order and asserts the load hash and the first quantum's hash differ, so a loader that reorders content cannot pass silently. The world-file loader keeps file order and a test holds that.
6. **Event order is not hashed apart.** Finding 12's separate hash of collision-event order guards thread-count differences; this binary runs one thread and the snapshot already sorts pairs canonically. The trace from T1 records the pair list in snapshot order, which is enough to locate a pairing difference. No new hash.
7. **Authored values are literals already.** A world file is JSON, which can hold only literals; finding 3's warning about trigonometric starting values applies to scenes built in code. `harness/product-scene.mjs` and the fixture builders are checked by a test that reads their source and refuses `Math.sin`, `Math.cos`, `Math.tan`, `Math.atan2`, and `Math.hypot`.
8. **Nothing in the law changes.** The digest moves only if pin 2 fixes the memory; the goldens do not move. The seat stays frozen.
9. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.

## Acceptance

- The ARM job prints both goldens and `identical` for the trace against the x64 artifact, linked in the pull request.
- The lint refuses the three planted modules and accepts the clean one, in a test, and passes on the pinned binary.
- The behaviour file carries snapshot digests and the check verifies them.
- The insertion-order test and the source check pass.
- Typecheck clean, tests at or above T1's count, three engines print the goldens from the Linux binary, digest pinned, Atlas check green, two push-triggered workflow files at most.

## Not in T3

No restore, no outcome tests, no scheduled job, no second operating system, no change to the hash's shape.
