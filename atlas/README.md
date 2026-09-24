# si-rpg-engine: how it works

Mapped at 2026-09-24 from commit e631b2f.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

8 parts, mostly JavaScript (14 files). Work enters through 4 doors; the busiest is CI, which reaches 4 parts. People run play, replay and write-golden.

## What changed since 2026-09-24 (73c244d)

- harness now imports frame.
- tick now imports frame.
- CI's pull request trigger now also names `package-lock.json`, `packages/**`, `predicates/**` and `tsconfig.json`.
- CI's push trigger now also names `package-lock.json`, `packages/**`, `predicates/**` and `tsconfig.json`.
- CI now also runs packages/tick/tick.test.js.
- And 5 more changes to doors.
- harness/sim.mjs is now read by harness/check.js and harness/write-golden.js.
- harness/write-golden.js is now read by package-lock.json.
- packages/tick/bin/play.js is now read by package-lock.json.
- And 4 more new writers and readers of places.
- frame is a new part, drawn from `packages/frame/**`.
- intents is a new part, drawn from `predicates/intents/**`.
- tick is a new part, drawn from `packages/tick/**`.
- 17 files added, 1 removed and 5 changed content, across 6 parts.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; or by hand. Runs packages/tick/tick.test.js; checks fixtures/golden.txt, harness/sim.mjs, harness/check.js and 13 more.
2. **play** (a command people run). Runs packages/tick/bin/play.js.
3. **replay** (a command people run). Runs packages/tick/bin/replay.js.
4. **write-golden** (a command people run). Runs harness/sim.mjs and harness/write-golden.js.

## What happens through CI

1. The workflow runs packages/tick/tick.test.js in tick; it checks fixtures/golden.txt in fixtures, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, harness/sim.mjs, harness/check.js and harness/write-golden.js in harness, and packages/tick/ in tick.
   1. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js and reaches frame.

**write-golden** (a command people run) runs harness/sim.mjs and harness/write-golden.js, reaches frame, and writes to fixtures/golden.txt.

## What breaks what

- **frame** is imported by 2 parts (harness, tick) and sits on the path of 4 doors.
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

People write .github/, docs/, predicates/intents/ and the repository root. Nothing in this repository writes to them.

## Where to start

packages/tick/bin/play.js

Read those in order to follow one run of play end to end. This path follows play (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 1 write and 3 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
