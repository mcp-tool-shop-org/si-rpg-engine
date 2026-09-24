# si-rpg-engine: how it works

Mapped at 2026-09-24 from commit 4133799.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

10 parts, mostly JavaScript (19 files). Work enters through 5 doors; the busiest is CI, which reaches 5 parts. People run load, play, replay and write-golden.

## What changed since 2026-09-24 (7ce60c6)

- load now imports tick.
- CI now also runs packages/load/load.test.js.
- CI now also checks packages/load/.
- load (package.json) is a new command. It runs packages/load/bin/load.js.
- packages/tick/predicates.js is now read by packages/load/load.test.js.
- packages/tick/tick.js is now read by packages/load/load.test.js.
- predicates/hazards/ is now read by packages/load/suite.js.
- And 3 more new writers and readers of places.
- 8 files added, across 2 parts.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; or by hand. Runs packages/load/load.test.js and packages/tick/tick.test.js; checks fixtures/golden.txt, harness/sim.mjs, harness/check.js and 6 more.
2. **load** (a command people run). Runs packages/load/bin/load.js.
3. **play** (a command people run). Runs packages/tick/bin/play.js.
4. **replay** (a command people run). Runs packages/tick/bin/replay.js.
5. **write-golden** (a command people run). Runs harness/write-golden.js.

## What happens through CI

1. The workflow runs packages/load/load.test.js in load and packages/tick/tick.test.js in tick; it checks fixtures/golden.txt in fixtures, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, harness/sim.mjs, harness/check.js and harness/write-golden.js in harness, packages/load/ in load, and packages/tick/ in tick.
   1. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**load** (a command people run) runs packages/load/bin/load.js and reaches frame and tick.

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js and reaches frame.

**write-golden** (a command people run) runs harness/write-golden.js and writes to fixtures/golden.txt.

## What breaks what

- **frame** is imported by 2 parts (harness, tick) and sits on the path of 4 doors.
- **tick** is imported by 1 part (load) and sits on the path of 4 doors.
- **harness** is imported by no other part and sits on the path of 2 doors.
- **load** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **fixtures/** is written by harness/write-golden.js.

## Hand-authored

People write .github/, docs/, predicates/hazards/, predicates/intents/ and the repository root. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → packages/tick/bin/play.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 read uses a path built at run time and is not named here.
- 3 writes and 4 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
