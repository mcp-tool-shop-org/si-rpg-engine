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

A world restores two ways: by replaying its accepted inputs up to a step, and by copying the physics module's whole linear memory and putting it back. Neither writes into the physics engine's internal state. The restore tests save each fixture and the product scene at several steps chosen from its own run (just after the first contact, the first sleep, and the first wake where the run has them, and at a third and two thirds of the way), restore, run on, and require the trace to match the uninterrupted run from that step to the end. The memory image is restored twice in a row to show a restore is repeatable, and a separate test shows that without the image, a solver evicted and reloaded does not rerun the same, so the image is what carries the state. The restores also straddle every step on which a body switches between moving on its own and being driven, or is picked up or put down, and each reruns identically.

The tick's own save restores without any replay. Each fixture and the product scene is saved at the same chosen steps, restored twice into a run that has since gone on elsewhere, and traced on identically. So is a live role session, whose save carries the role gate's window of frames and admission ticks. A planted save missing any one field goes red, one for each: the hasher's lanes, a scheduled action, a mind's memory, the quanta owed, the gate's window, its labels, and its admission ticks. A malformed save is refused before anything is written, and the run then traces on as if no restore had been tried. That includes the save's committed frame, which is checked record by record, as the world checks its own records. A record missing a number, a field that is not a number, a record naming another body, and a frame with a record too few or too many are each refused. A body drafted at the saved step reaches the frame only at the next step, so a save taken between the two is one record short and still restores; a test holds both sides.

A restore is refused, with a test for each, when the image came from another binary, has the wrong length, has a changed byte, or was taken while a call was still running. A planted one-velocity difference after a restore is caught by the trace, so the restore tests cannot pass vacuously.

## A failure you can hand over

Any failing check that has a world and a log writes a bundle: the seed, the world, the accepted inputs, the hashes up to the failure, and optionally the physics module's memory, stored as only the pages in use. `npx replay <bundle>` reproduces it in one command and prints the same first difference. A bundle recorded on an older build still replays and compares every hash; only its stored memory image is skipped, and a fresh one is taken and restored instead, so a bundle stays useful across builds and fails only when the physics itself has changed.

A scheduled job runs every week, and on demand, far longer than a pull request can: every bundle in `fixtures/corpus/`, every behaviour fixture, every log, and the product scene run to 100,000 steps with memory restores at ten points chosen from its own contacts, sleeps, and wakes. It also sweeps every indexed world, every fixture world, and the product scene under a larger budget than `load world` uses, and fails when a verdict differs from its record. On a failure it opens an issue with the first difference and attaches the bundles; it never pushes a change. A sweep that throws is reported like any other sweep failure, with a block naming the world and the throw, which titles the issue. A defect that is fixed keeps its bundle in the corpus, so it stays fixed.

## A world explored before it runs

The sweep's tests are closed rooms in `fixtures/sweep/`, each walled past the climb's reach so it shows one check:
- a zone walled in on four sides is refused by name, and admitted with a witness once one wall is gone;
- a zone on a plateau above the climb is refused, and admitted with a climbing witness when it is low enough;
- a gap in the floor is refused with a bundle whose replay reproduces the fall.

Every zone's witness replays from the load to the sweep's own hashes, which is the check that exploring by restore explores the real world and not a copy that drifted. Two sweeps of one world give the same archive, witnesses, and verdicts. Two sweeps of the floor gap, a world with a finding, also give the same findings in the same order, and the same bundles byte for byte. A test-only plant that throws after a push is refused with its bundle, and `replay` reproduces the throw.

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

A 45° slope is never tested, because at the exact limit the character creeps.

A flat walk of 10,000 steps at 0.4 units per second takes its full stride on every step, at the origin and a million units away. Rapier's own controller loses most of a step's travel on 332 and 323 of those steps, when the floor's normal comes out vertical but for its last bit. The engine moves the character through its own copy of that routine, with one branch for that case. A native test runs the copy without the branch beside Rapier's controller and requires them to agree bit for bit, and with the branch they differ on exactly those steps.

When two dynamic bodies are near the character, Rapier 0.35.3's impulse routine pushed one at the other's contact points. In red room A (`fixtures/push/red-room-a.json`), a walled room where the walker pushes a shade with a small crate flush beside its path, that launched the crate at 26 units per second. The engine pushes through its own copy of the routine with Rapier's later fix. A native test runs the copy without the fix beside Rapier's routine over the product scene, the course, the flat walks, and every fixture, and requires them to agree bit for bit; with the fix they differ only where two dynamic bodies are near the character, which happens in red room A and nowhere else. A guard in the physics fails any push that leaves a body faster than eight times its pusher's speed. Red room A passes it, and fails it through Rapier's own routine.

The whole product scene moved a million units from the origin runs the same. Every body that neither tumbles nor hovers sleeps on the same step and ends within 1e-6 of where it ends at the origin. The character's height agrees within its controller's 1e-4 hover. A box that tumbles comes to rest on the floor in both runs, though not at matching places, because far from the origin positions carry fewer bits and a tumble magnifies the difference. The same test records two characters at 8 units per second, where they overlap, without asserting that they stay apart.

The other outcome tests: a small box launched at 20 units per second at a thin wall stays on the near side, with a native Rust test showing it would pass through if the physics' sweep of fast bodies were turned off; a body sliding across terrain seams, including the edge row, stays within the contact skin of the surface; and the terrain surface the actions read is checked against where a real box comes to rest when dropped on it.

`npx write-golden` runs the course and the outcome tests first and refuses to write while any fails.

A native test puts one body down as another is picked up in the same step, in both orders of their records. Before the step, no query finds the dropped body; after it, every query finds it where it is, and none finds anything where the picked-up body was. A counter in the physics module counts every world it builds. In the product scene and every fixture it reads one after load and stays there, and the bodies nothing touches stay asleep, with their contacts' warm starts unchanged bit for bit, through every action's start and end.

## The compiled physics

`solver/lint.mjs` decodes the binary instruction by instruction and refuses it if it contains a relaxed-SIMD instruction, whose result a host may choose; a `memory.grow` or `table.grow`; a memory that can grow; a start function; a passive data or element segment; or any of `memory.init`, `data.drop`, `table.init`, and `elem.drop`. An instruction it cannot decode is itself a refusal. Each refusal has a test with a small planted module. A test at the limits packs 64 bodies into contact against 64 static colliders for 1,000 steps without running out of memory, and a crush test shows a world too dense for the fixed memory stops rather than growing it.

## A model's calls, checked without the model

Every call a role makes to a model is recorded: the rendered prompt, every sampling option, the schema's hash, the model's digest as the server reports it at call time, the server's version and settings, the GPU, the output, and its hash. CI has no GPU and calls no model. Over each committed session it recomputes every record's key and checks each model digest against the pin in the manifest the record cites. It checks each output against its hash and against the log entry that cites it, parses the output again with the seat's own parser and requires the proposal the log admitted, and checks every call against its role's budgets. It replays the session's log to the same step hashes, and fails on a missing record rather than call a model. A planted record for each check goes red. Two sessions are committed, three calls each of a test-only role in `worlds/crate-and-door.json`. One was run with a change written to steer the model, and its proposals stayed inside the role's manifest. When the rails were built, each of the 51 was removed in turn, and each removal turned a test red.

## Content

Twelve load refusals for world files, a hazard suite for each action effect, and the minds' refusals are tests; see [World files](../world-files/).

## Not yet proven

- Whether the solver's warm-start data steers the next step is not proven. The tests show it is inside the fingerprint and inside the memory image; a proof that it changes the next step needs a test-only native build.
- On a few steps the character's first downward-diagonal check finds no floor at all, so the character drops one step of gravity, about 0.002, into its contact skin while keeping its movement, and climbs back over the next 20 steps. On the flat walk it happens on 8 steps at the origin and 7 a million units away. At each of them Rapier's own controller, given the same pose, does the same, so the engine's fix for lost travel does not cause it. It is recorded and not yet investigated.
