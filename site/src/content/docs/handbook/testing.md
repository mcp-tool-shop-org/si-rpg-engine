---
title: Testing
description: How the engine is checked on every commit, and what is not yet proven.
sidebar:
  order: 5
---

Every claim the engine makes is a test that runs on every commit. This page lists what is checked, how a failure is reported, and what is still open.

## Two fingerprints, and the numbers beside them

`harness/sim.mjs` runs the product scene for 10,000 steps and prints one fingerprint, the product golden in `fixtures/golden.txt`. `harness/arith.mjs` prints the arithmetic contract in `fixtures/golden-arith.txt`, `0d38671370d12d1e`, which has not moved since the first harness.

A fingerprint says two runs agree. It does not say what happened, so `fixtures/golden-behaviour.json` records numbers beside it: the step on which each dynamic body falls asleep, every body's final position to full precision, the walker's final zone, and the solver snapshot's length and digest at load and at the end. `npm run check` verifies all of them and names the body when one moves. `npx write-golden` rewrites both files together and prints every number that moved, so a commit that moves the golden has to say which behaviour changed and why.

## Every engine, two architectures

CI builds the physics on Linux x64 and compares its SHA-256 to `fixtures/solver.sha256`. It then runs both harnesses under V8 15.6.61, SpiderMonkey 156.0.1, and JavaScriptCore 319571, and traces the product scene under all four runtimes, node included, requiring the traces to be identical. A second job runs on an ARM64 runner: it takes the x64 job's binary rather than rebuilding it, runs both harnesses under node, and requires the same fingerprints and a trace identical to the x64 one.

Only the Linux build is pinned. Cargo tags the parts of a build that run on the build machine with that machine's platform, so a Windows build, or a build on an ARM machine, writes different bytes from the same source. The fingerprint, not the digest, is the promise across machines.

## Where two runs part

`harness/trace.mjs` prints one line per step: the fingerprint, then every body's thirteen numbers (position, velocity, orientation, angular velocity) as exact IEEE bit patterns, its zone, what it carries or is carried by, the snapshot's length and digest, and each mind's goals and newest belief. `harness/first-difference.js` reads two traces a chunk at a time and prints `identical`, or the first differing step with the first differing body and field and both values. It exits 0 when identical, 1 when different, and 2 when a trace is malformed or cut short.

When an engine leaves the golden, CI traces the scene under node and under that engine and prints the first difference, so a failure reads as a step and a field rather than two hashes. The fixtures trace the same way.

## Save and restore, proven

A world restores two ways: by replaying its accepted inputs up to a step, and by copying the physics module's whole linear memory and putting it back. Neither writes into the physics engine's internal state. The restore tests save each fixture and the product scene at several steps chosen from its own run (just after the first contact, the first sleep, and the first wake where the run has them, and at a third and two thirds of the way), restore, run on, and require the trace to match the uninterrupted run from that step to the end. The memory image is restored twice in a row to show a restore is repeatable, and a separate test shows that without the image, a solver evicted and reloaded does not rerun the same, so the image is what carries the state.

A restore is refused, with a test for each, when the image came from another binary, has the wrong length, has a changed byte, or was taken while a call was still running. A planted one-velocity difference after a restore is caught by the trace, so the restore tests cannot pass vacuously.

## What the world did, not only its fingerprint

`harness/outcome.test.js` and `harness/course.test.js` assert outcomes with stated numbers and tolerances. None of them asserts a fingerprint.

| Case | At 0.4 units per second | Outcome |
|---|---|---|
| Step of 0.29 | the controller's limit is 0.3101 | climbed |
| Step of 0.33 | | stopped short of the riser |
| Slope of 44° | within 960 steps | reaches the top |
| Slope of 46° | within 960 steps | gains less than 0.05 |
| Drop of 0.19 | between 0.200 and 0.2105 the outcome depends on the exact geometry, so the course tests either side | snapped to the lower floor |
| Drop of 0.22 | | falls |
| Starting inside the floor | | stands up on it |
| Two characters walking at each other | at 1 unit per second | stay apart |

A 45° slope is never tested, because at the exact limit the character creeps. The same test records two characters at 8 units per second, where they overlap, without asserting that they stay apart.

The other outcome tests: a small box launched at 20 units per second at a thin wall stays on the near side, with a native Rust test showing it would pass through if the physics' sweep of fast bodies were turned off; a body sliding across terrain seams, including the edge row, stays within the contact skin of the surface; and the terrain surface the actions read is checked against where a real box comes to rest when dropped on it.

`npx write-golden` runs the course and the outcome tests first and refuses to write while any fails.

## The compiled physics

`solver/lint.mjs` decodes the binary instruction by instruction and refuses it if it contains a relaxed-SIMD instruction, whose result a host may choose; a `memory.grow` or `table.grow`; a memory that can grow; a start function; a passive data or element segment; or any of `memory.init`, `data.drop`, `table.init`, and `elem.drop`. An instruction it cannot decode is itself a refusal. Each refusal has a test with a small planted module. A test at the limits packs 64 bodies into contact against 64 static colliders for 1,000 steps without running out of memory, and a crush test shows a world too dense for the fixed memory stops rather than growing it.

## Content

Twelve load refusals for world files, a hazard suite for each action effect, and the minds' refusals are tests; see [World files](../world-files/).

## Not yet proven

- Whether the solver's warm-start data steers the next step is not proven. The tests show it is inside the fingerprint and inside the memory image; a proof that it changes the next step needs a test-only native build.
- A world moved a million units from the origin does not run identically to the original. The test records exactly which bodies differ and fails if that set changes, in either direction. Both causes are known and have fixes dispatched. The physics world is rebuilt when a character starts or finishes an action, which wakes sleeping bodies anywhere in the world; the fix switches only the affected body in place. And the character loses most of a step's movement on about one step in 30 on flat ground, because Rapier's character controller discards the step's travel when the floor's collision normal rounds one unit in the last place short of vertical; the fix is an engine-owned copy of the controller's movement routine with that case handled.
- On a few steps the character's first downward-diagonal check misses the floor and it sinks about 0.002 into its contact skin while keeping its movement. It is recorded and not yet investigated.
