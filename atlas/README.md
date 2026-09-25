# si-rpg-engine: how it works

Mapped at 2026-09-25 from commit cd21fe8.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

15 parts, mostly JavaScript (58 files). Work enters through 8 doors; the busiest is CI, which reaches 8 parts. People run host, load, play, propose, replay and write-golden.

## What changed since 2026-09-25 (2e82fc7)

- CI now also runs harness/check.test.js, harness/first-difference.js, harness/trace.mjs and 1 more.
- CI now also checks harness/behaviour.mjs, harness/product-run.mjs and harness/trace-line.mjs.
- fixtures/golden-behaviour.json is now written by harness/write-golden.js.
- fixtures/behavior-ramp.json is now also read by harness/trace.test.js.
- fixtures/golden-behaviour.json is now read by harness/check.js, harness/check.test.js and harness/write-golden.js.
- And 4 more new writers and readers of places.
- 10 files added and 47 changed content, across 6 parts.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push to main touching 11 paths; or by hand. Runs harness/check.js, harness/check.test.js, harness/first-difference.js and 12 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 17 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **host** (a command people run). Runs packages/host/bin/host.js.
4. **load** (a command people run). Runs packages/load/bin/load.js.
5. **propose** (a command people run). Runs packages/propose/bin/propose.js.
6. **write-golden** (a command people run). Runs harness/sim.mjs and harness/write-golden.js.
7. **play** (a command people run). Runs packages/tick/bin/play.js.
8. **replay** (a command people run). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 7 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js in propose, solver/build.mjs in solver, and 4 files in tick; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 10 files in harness, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, packages/load/ in load, and 27 files in 3 more places.
   1. Inside packages/propose/propose.test.js, fresh does, in order: load intent rules (tick), fixture world, create world, create memory and create tick.
   2. **Create tick** (tick) runs, in order: create hasher (frame), install minds, mix load, mix minds, snapshot, u 32 and commit frame.
   3. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.
   4. **Create tick** runs, in order: create hasher (frame), install minds, mix load, mix minds, snapshot, u 32 and commit frame.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**host** (a command people run) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command people run) runs packages/load/bin/load.js and reaches frame and tick.

**propose** (a command people run) runs packages/propose/bin/propose.js and reaches frame and tick.

**write-golden** (a command people run) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js and reaches frame.

## What breaks what

- **tick** is imported by 4 parts (harness, host, load, propose) and sits on the path of 7 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 7 doors.
- **harness** is imported only from tests, by 1 part (tick), and sits on the path of 2 doors.
- **load** is imported only from tests, by 1 part (tick), and sits on the path of 2 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **propose** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **packages/frame/types.d.ts** and **packages/tick/tick.js** changed together in 9 of 10 commits, and the tick part imports the frame part.
- **packages/propose/prompt.js** and **packages/propose/propose.test.js** changed together in 6 of 7 commits, inside the propose part.
- **packages/propose/propose.test.js** and **packages/propose/seat.js** changed together in 6 of 7 commits, inside the propose part.
- **packages/load/load.test.js** and **packages/tick/predicates.js** changed together in 5 of 6 commits, and the load part and the tick part import each other.
- **harness/product-scene.mjs** and **harness/sim.mjs** changed together in 8 of 10 commits, inside the harness part.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 5 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **solver** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **reachedGoal** is exported by packages/propose/scene.js (propose) and packages/tick/scene.js (tick); the two look alike.

## Generated, never hand-edited

- **fixtures/golden-behaviour.json** has a block written by harness/write-golden.js.
- **fixtures/golden.txt** is written by harness/write-golden.js.
- **fixtures/solver.sha256** has a block written by solver/build.mjs when run without --check.

## Hand-authored

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, the repository root and worlds/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → harness/check.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 6 import sites could not be resolved.
- 2 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 6 writes and 16 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 7 commands are built at run time and not followed, 5 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
