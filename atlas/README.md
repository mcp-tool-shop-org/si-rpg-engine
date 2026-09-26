# si-rpg-engine: how it works

Mapped at 2026-09-25 from commit de71607.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

15 parts, mostly JavaScript (88 files). Work enters through 9 doors; the busiest is CI, which reaches 8 parts. People run host, load, play, propose, replay and write-golden.

## What changed since 2026-09-25 (39ba1fe)

Nothing structural changed since 2026-09-25; 3 files added and 19 changed content.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs harness/bundle.mjs, harness/bundle.test.js, harness/caps.test.js and 30 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 24 more.
2. **Corpus.** On a schedule (`17 6 * * 1`), Monday at 06:17 UTC; or by hand. Runs harness/corpus.mjs and solver/build.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **host** (a command people run). Runs packages/host/bin/host.js.
5. **load** (a command people run). Runs packages/load/bin/load.js.
6. **propose** (a command people run). Runs packages/propose/bin/propose.js.
7. **write-golden** (a command people run). Runs harness/sim.mjs and harness/write-golden.js.
8. **play** (a command people run). Runs packages/tick/bin/play.js.
9. **replay** (a command people run). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 18 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js in propose, 4 files in solver, and 8 files in 4 more places; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 13 files in harness, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, packages/load/ in load, and 37 files in 7 more places.
   1. Inside harness/bundle.mjs, make bundle does, in order: with records and capture bundle (tick).
   2. **Capture bundle** (tick) runs, in order: replay to and subarray.
   3. Inside harness/course.test.js, step run does, in order: record run, create world (tick) and body.
   4. Inside harness/outcome.test.js, translated run does, in order: product init, record run, create world (tick), sleep watch and apply product act.
   5. Inside harness/restore.test.js, restores at does, in order:
      1. create world (tick)
      2. create hasher (frame)
      3. replay to
      4. line
      5. advance
      6. line
      7. expect identical
      8. replay to
      9. expect identical
   6. **Expect identical** runs, in order: trace difference (tick), with records, capture bundle and write bundle.
   7. **Expect identical** runs, in order: trace difference (tick), with records, capture bundle and write bundle.
   8. Inside harness/soundness.test.js, evict does, in order: create world (tick) and create hasher (frame).
   9. Inside packages/propose/propose.test.js, fresh does, in order: load intent rules (tick), fixture world, create world, create memory and create tick.
   10. **Create tick** (tick) runs, in order: create hasher (frame), install minds, mix load, mix minds, snapshot, u 32 and commit frame.
   11. Inside packages/tick/order.test.js, first hashes does, in order: create world, load intent rules, create memory and create tick.
   12. **Create tick** runs, in order: create hasher (frame), install minds, mix load, mix minds, snapshot, u 32 and commit frame.
   13. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.
   14. **Create tick** runs, in order: create hasher (frame), install minds, mix load, mix minds, snapshot, u 32 and commit frame.
   15. Inside solver/lint.mjs, lint wasm does, in order:
      1. byte
      2. signed
      3. byte
      4. u 32
      5. byte
      6. signed
      7. skip
      8. u 32
      9. byte
      10. u 32
      11. byte
      12. signed, and 8 more
2. It runs git.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Corpus** runs harness/corpus.mjs and solver/build.mjs, reaches frame and tick, runs git, and opens an issue when it fails.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**host** (a command people run) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command people run) runs packages/load/bin/load.js and reaches frame and tick.

**propose** (a command people run) runs packages/propose/bin/propose.js and reaches frame and tick.

**write-golden** (a command people run) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js, reaches frame, and runs git.

## What breaks what

- **tick** is imported by 4 parts (harness, host, load, propose) and sits on the path of 8 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 8 doors.
- **harness** is imported only from tests, by 1 part (tick), and sits on the path of 3 doors.
- **load** is imported only from tests, by 1 part (tick), and sits on the path of 2 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **propose** is imported by no other part and sits on the path of 2 doors.
- **solver** is imported by no other part and sits on the path of 2 doors.
- **fixtures/golden.txt** is written by harness and read by harness and workflows; a hand edit reaches every reader.

## What tends to change together

- **harness/bundle.test.js** and **harness/corpus.mjs** changed together in 6 of 7 commits, inside the harness part.
- **packages/propose/prompt.js** and **packages/propose/propose.test.js** changed together in 6 of 7 commits, inside the propose part.
- **packages/propose/propose.test.js** and **packages/propose/seat.js** changed together in 6 of 7 commits, inside the propose part.
- **packages/frame/types.d.ts** and **packages/tick/tick.js** changed together in 9 of 11 commits, and the tick part imports the frame part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 6 of 8 commits, inside the propose part.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 8 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

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

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, the repository root and worlds/; 2 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → harness/bundle.mjs → packages/tick/bundle.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 14 import sites could not be resolved.
- 2 writes and 2 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 12 writes and 23 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 16 commands are built at run time and not followed, 13 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
