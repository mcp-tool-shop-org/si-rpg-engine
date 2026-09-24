# si-rpg-engine: how it works

Mapped at 2026-09-24 from commit 7ce60c6.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

10 parts, mostly JavaScript (14 files). Work enters through 4 doors; the busiest is CI, which reaches 4 parts. People run play, replay and write-golden.

## What changed since 2026-09-24 (e631b2f)

- write-golden no longer runs harness/sim.mjs.
- hazards is a new part, drawn from `predicates/hazards/**`.
- load is a new part, drawn from `packages/load/**`.
- 23 files changed content, across 7 parts.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; or by hand. Runs packages/tick/tick.test.js; checks fixtures/golden.txt, harness/sim.mjs, harness/check.js and 5 more.
2. **play** (a command people run). Runs packages/tick/bin/play.js.
3. **replay** (a command people run). Runs packages/tick/bin/replay.js.
4. **write-golden** (a command people run). Runs harness/write-golden.js.

## What happens through CI

1. The workflow runs packages/tick/tick.test.js in tick; it checks fixtures/golden.txt in fixtures, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, harness/sim.mjs, harness/check.js and harness/write-golden.js in harness, and packages/tick/ in tick.
   1. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js and reaches frame.

**write-golden** (a command people run) runs harness/write-golden.js and writes to fixtures/golden.txt.

## What breaks what

- **frame** is imported by 2 parts (harness, tick) and sits on the path of 3 doors.
- **tick** is imported by no other part and sits on the path of 3 doors.
- **harness** is imported by no other part and sits on the path of 2 doors.

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
- 1 write and 2 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
