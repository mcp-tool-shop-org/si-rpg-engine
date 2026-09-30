# si-rpg-engine: how it works

Mapped at 2026-09-30 from commit 07894f1 by Atlas 1.24.0.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

17 parts, mostly JSON data (619 files) and Markdown (108); code in JavaScript (141), Rust (6), TypeScript (3), shell (3), CSS (2), Astro (1) and HTML (1). Work enters through 15 doors; the busiest is CI, which reaches 9 parts. It deploys a site to GitHub Pages. People run host, load, play and replay. bench, host, load, play, propose, replay and write-golden are commands of a private package (nothing ships them).

## What changed since 2026-09-30 (3fda2e5)

- CI now also runs solver/build.rs, solver/src/kcc.rs and solver/src/rapier_law.rs.
- .release is now written by tools/stage-release.mjs.
- .release/frame is now written by tools/stage-release.mjs.
- .release/frame/packages is now written by tools/stage-release.mjs.
- And 30 more new writers and readers of places.
- 923 files changed content, across 17 parts.

## What comes in

1. **CI.** On a pull request touching 13 paths; on a push to main touching 13 paths; or by hand. Runs harness/binding.test.js, harness/bundle.mjs, harness/bundle.test.js and 55 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 105 more.
2. **Corpus.** On a schedule (`17 6 * * 1`), Monday at 06:17 UTC; or by hand. Runs harness/corpus.mjs and solver/build.mjs.
3. **Release.** When a release is published; or by hand. Runs solver/build.mjs, tools/publish-release.sh and tools/stage-release.mjs.
4. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **propose** (a command of a private package, which nothing ships). Runs packages/propose/bin/propose.js.
6. **bench** (a command of a private package, which nothing ships). Runs packages/bench/bin/bench.js.
7. **host** (a command of a private package, which nothing ships, from package.json). Runs packages/host/bin/host.js.
8. **host** (a command people run, from packages/host/package.json). Runs packages/host/bin/host.js.
9. **load** (a command of a private package, which nothing ships, from package.json). Runs packages/load/bin/load.js.
10. **load** (a command people run, from packages/load/package.json). Runs packages/load/bin/load.js.
11. **write-golden** (a command of a private package, which nothing ships). Runs harness/sim.mjs and harness/write-golden.js.
12. **play** (a command of a private package, which nothing ships, from package.json). Runs packages/tick/bin/play.js.
13. **play** (a command people run, from packages/tick/package.json). Runs packages/tick/bin/play.js.
14. **replay** (a command of a private package, which nothing ships, from package.json). Runs packages/tick/bin/replay.js.
15. **replay** (a command people run, from packages/tick/package.json). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 10 files in bench, 24 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js and packages/propose/record.test.js in propose, and 20 files in 7 more places; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 16 files in harness, packages/bench/ in bench, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, and 52 files in 9 more places.
   1. Inside harness/bundle.mjs, `makeBundle` does, in order: `withRecords` and `captureBundle` (tick).
   2. Inside harness/course.test.js, `stepRun` does, in order: `recordRun` and `createWorld` (tick).
   3. Inside harness/outcome.test.js, `translatedRun` does, in order: `productInit`, `recordRun`, `createWorld` (tick), `sleepWatch` and `applyProductAct`.
   4. Inside harness/restore.test.js, `plantedRerun` does, in order: `replayTo`, `events.mjs` (4 steps), `replayTo`, `createWorld` (tick), `createHasher` (frame), `endLine` and `endLine`.
   5. Inside harness/soundness.test.js, `evict` does, in order: `createWorld` (tick) and `createHasher` (frame).
   6. Inside harness/sweep.test.js, `sweepOf` does, in order: `loadScene` (tick) and `sweep.js` (load, 3 steps).
   7. **`loadScene`** (tick) runs, in order: `createWorld`, `validateMesh` and `beliefRefusal`.
   8. **`sweep`** (load) runs, in order: `loadIntentRules` (tick), `createWorld`, `createMemory`, `createRestorableTick` and `worldFloor`.
   9. Inside packages/bench/finding.test.js, `run` does, in order: `copyCheckout`, `plants.js` (3 steps) and `runBench`.
   10. **`runBench`** runs, in order: `samePath`, `oneTreePerProcess`, `listFiles`, `readAnchors`, `trees.js` (4 steps) and `build.js` (4 steps).
   11. Inside packages/bench/rungs.test.js, `run` does, in order: `copyCheckout`, `apply` and `runBench`.
   12. **`runBench`** runs, in order: `samePath`, `oneTreePerProcess`, `listFiles`, `readAnchors`, `trees.js` (4 steps) and `build.js` (4 steps).
   13. Inside packages/propose/propose.test.js, `probeSession` does, in order:
      1. `loadRoles` (tick)
      2. `scratchWorld`
      3. `loadIntentRules`
      4. `createWorld`
      5. `createMemory`
      6. `createTick`
      7. `runSession`
      8. `settle`
      9. `writeSession`
   14. **`createTick`** (tick) runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   15. **`runSession`** runs, in order: `templateSlots`, `renderTemplate`, `beliefKeys` (tick), `buildSchema` and `record.js` (3 steps).
   16. Inside packages/propose/record.test.js, `verifyInHead` does, in order: `find` (bench), `copyCheckout`, `apply` and `apply`.
   17. Or, when `!p || p.inBase`, `verifyInHead` does `verifySession` instead.
   18. **`verifySession`** runs, in order:
      1. `manifestHash` (tick)
      2. `validateManifest`
      3. `canonical`
      4. `sha256`
      5. `canonical`
      6. `sha256`
      7. `canonical`
      8. `sha256`
      9. `canonical`
      10. `readRoleOutput`
      11. `stampProposal`
      12. `canonical`
   19. **`copyCheckout`** (bench) runs, in order: `copyTree` and `copyProduct`.
   20. Inside packages/tick/gate.test.js, `roleTick` does, in order: `catalogOf`, `loadIntentRules`, `createMemory`, `fixtureWorld`, `createWorld` and `createTick`.
   21. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   22. Inside packages/tick/load-hash.test.js, `snapshotAtLoad` does, in order: `createWorld` and `createHasher` (frame).
   23. Inside packages/tick/order.test.js, `firstHashes` does, in order: `createWorld`, `loadIntentRules`, `createMemory` and `createTick`.
   24. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   25. Inside packages/tick/tick.test.js, `fresh` does, in order: `fixtureWorld`, `createWorld`, `loadIntentRules`, `createMemory` and `createTick`.
   26. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
2. It writes to solver/dist/, which is not tracked.
3. It runs git.
4. It uploads coverage to Codecov.

## Who reads the results

CI writes only to solver/dist/, which is not tracked.

## The other doors

**Corpus** runs harness/corpus.mjs and solver/build.mjs, reaches frame, load and tick, writes to fixtures/sweep/verdicts.json and to solver/dist/, which is not tracked, runs git, and opens an issue when it fails.

**Release** runs solver/build.mjs, tools/publish-release.sh and tools/stage-release.mjs, and writes to .release and solver/dist/, which are not tracked.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**propose** (a command of a private package, which nothing ships) runs packages/propose/bin/propose.js and reaches frame, harness and tick.

**bench** (a command of a private package, which nothing ships) runs packages/bench/bin/bench.js, reaches solver and tick, writes to fixtures/solver.sha256 and to solver/dist/, which is not tracked, and runs git.

**host** (a command of a private package, which nothing ships, from package.json) runs packages/host/bin/host.js and reaches frame and tick.

**host** (a command people run, from packages/host/package.json) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command of a private package, which nothing ships, from package.json) runs packages/load/bin/load.js, reaches frame and tick, and runs git.

**load** (a command people run, from packages/load/package.json) runs packages/load/bin/load.js, reaches frame and tick, and runs git.

**write-golden** (a command of a private package, which nothing ships) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command of a private package, which nothing ships, from package.json) runs packages/tick/bin/play.js and reaches frame.

**play** (a command people run, from packages/tick/package.json) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command of a private package, which nothing ships, from package.json) runs packages/tick/bin/replay.js, reaches frame, and runs git.

**replay** (a command people run, from packages/tick/package.json) runs packages/tick/bin/replay.js, reaches frame, and runs git.

## What breaks what

- **tick** is imported by 5 parts (bench, harness, host, load, propose) and sits on the path of 13 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 12 doors.
- **harness** is imported by 1 part (propose), and by 1 more only from tests; it sits on the path of 4 doors.
- **load** is imported by 1 part (harness), and by 1 more only from tests; it sits on the path of 4 doors.
- **propose** is imported by 1 part (bench) and sits on the path of 2 doors.
- **solver** is run as a child process by 1 part (bench) and sits on the path of 4 doors.
- **host** is imported only from tests, by 1 part (harness), and sits on the path of 3 doors.
- **fixtures/golden.txt** is written by harness and read by harness and workflows, and by 3 tests; a hand edit reaches every reader.

## What tends to change together

- **packages/propose/bin/propose.js** and **packages/propose/seat.js** changed together in 10 of 14 commits, inside the propose part.
- **packages/host/host.test.js** and **packages/host/session.js** changed together in 9 of 13 commits, inside the host part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 9 of 13 commits, inside the propose part.
- **packages/load/load.test.js** and **packages/load/suite.js** changed together in 4 of 6 commits, inside the load part.
- **packages/bench/bench.js** and **packages/bench/neutral.test.js** changed together in 5 of 8 commits, inside the bench part.

2 files changed together with their own tests, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 20 source files reach 10 revisions and the floor had fallen; it rises back to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **fixtures/law-runs/** is written by harness/law-runs.mjs and read by nothing else in this repository.
- **fixtures/t7c-runs/** is written by tools/coordinator/t7c-runs.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **fixtures/golden-behaviour.json** has a block written by harness/write-golden.js.
- **fixtures/golden.txt** is written by harness/write-golden.js.
- **fixtures/law-runs/** is written by harness/law-runs.mjs.
- **fixtures/solver.sha256** has a block written by solver/build.mjs when run without --check.
- **fixtures/sweep/verdicts.json** has a block written by harness/corpus.mjs.
- **fixtures/t7c-runs/** is written by tools/coordinator/t7c-runs.mjs.

## Hand-authored

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, predicates/roles/, the repository root and worlds/; 2 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → harness/bundle.mjs → packages/tick/bundle.js → packages/tick/runs.js → packages/tick/difference.js → packages/tick/trace-line.js → packages/frame/hash.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 19 imports could not be resolved: `harness/bundle.test.js` imports `../solver/dist/solver.mjs`, which a build generates; `harness/caps.test.js` imports `../solver/dist/solver.mjs`, which a build generates; `harness/corpus.mjs` imports `../solver/dist/solver.mjs`, which a build generates; and 16 more.
- 2 writes and 7 reads use paths built at run time and are not named here.
- 11 writes go to places this repository does not track, so they are not listed as generated.
- 37 writes and 83 reads go to a path their caller passes, not to this repository.
- 4 writes and 47 reads go to the directory the command is run in, not to this repository.
- 9 writes and 1 read go to a temporary directory or a path their caller passes, not to this repository.
- 2 writes and 6 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 1 read goes to a temporary directory, not to this repository.
- 10 commands are built at run time and not followed, 5 of them in tests.
- 36 files belong to no part: packages/tool/guard.js, site/astro.config.mjs, site/package-lock.json and 33 more.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
