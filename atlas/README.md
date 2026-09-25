# si-rpg-engine: how it works

Mapped at 2026-09-25 from commit 6f19741.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

14 parts, mostly JavaScript (41 files), Rust (2) and TypeScript (1). Work enters through 7 doors; the busiest is CI, which reaches 8 parts. People run host, load, play, propose, replay and write-golden.

## What changed since 2026-09-25 (98f2b07)

Nothing structural changed since 2026-09-25; 81 files changed content.

## What comes in

1. **CI.** On a pull request touching 10 paths; on a push to main touching 10 paths; or by hand. Runs harness/product.test.js, harness/solver.test.js, packages/host/host.test.js and 5 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 38 more.
2. **host** (a command people run). Runs packages/host/bin/host.js.
3. **load** (a command people run). Runs packages/load/bin/load.js.
4. **propose** (a command people run). Runs packages/propose/bin/propose.js.
5. **write-golden** (a command people run). Runs harness/sim.mjs and harness/write-golden.js.
6. **play** (a command people run). Runs packages/tick/bin/play.js.
7. **replay** (a command people run). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs harness/product.test.js and harness/solver.test.js in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js in propose, solver/build.mjs in solver, and packages/tick/scene.test.js and packages/tick/tick.test.js in tick; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 6 files in harness, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, packages/load/ in load, and 20 files in 2 more parts.
   1. Inside packages/propose/propose.test.js, fresh does, in order: load intent rules (tick), fixture world, create world, create memory and create tick.
   2. **Create tick** (tick) runs, in order: create hasher (frame), mix load, snapshot, u 32 and commit frame.
   3. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.
   4. **Create tick** runs, in order: create hasher (frame), mix load, snapshot, u 32 and commit frame.
2. It writes to solver/dist/, which is not tracked.

## Who reads the results

CI writes only to solver/dist/, which is not tracked.

## The other doors

**host** (a command people run) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command people run) runs packages/load/bin/load.js and reaches frame and tick.

**propose** (a command people run) runs packages/propose/bin/propose.js and reaches frame and tick.

**write-golden** (a command people run) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden.txt.

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js and reaches frame.

## What breaks what

- **tick** is imported by 4 parts (harness, host, load, propose) and sits on the path of 7 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 7 doors.
- **harness** is imported by no other part and sits on the path of 2 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **load** is imported by no other part and sits on the path of 2 doors.
- **propose** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **packages/propose/bin/propose.js** and **packages/propose/prompt.js** changed together in 5 of 5 commits, inside the propose part.
- **packages/propose/bin/propose.js** and **packages/propose/propose.test.js** changed together in 5 of 5 commits, inside the propose part.
- **packages/propose/prompt.js** and **packages/propose/propose.test.js** changed together in 5 of 5 commits, inside the propose part.
- **packages/propose/bin/propose.js** and **packages/propose/seat.js** changed together in 5 of 6 commits, inside the propose part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 5 of 6 commits, inside the propose part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **solver** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **reachedGoal** is exported by packages/propose/scene.js (propose) and packages/tick/scene.js (tick); the two look alike.

## Generated, never hand-edited

- **fixtures/golden.txt** is written by harness/write-golden.js.
- **fixtures/solver.sha256** has a block written by solver/build.mjs when run without --check.

## Hand-authored

People write .github/, docs/, predicates/hazards/, predicates/intents/, the repository root and scenes/. Nothing in this repository writes to them.

## Where to start

packages/host/bin/host.js → packages/tick/scene.js

Read those in order to follow one run of host end to end. This path follows host (a command people run) from its entry, since CI runs only tests and scripts that import no code here.

## What this map cannot see

- 4 import sites could not be resolved.
- 1 read uses a path built at run time and is not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 3 writes and 6 reads go to a path their caller passes, not to this repository.
- 2 writes and 2 reads go to the directory the command is run in (harness/ and predicates/), not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
