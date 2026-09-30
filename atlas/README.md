# si-rpg-engine: how it works

Mapped at 2026-09-30 from commit d08872b.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

17 parts, mostly JavaScript (141 files). Work enters through 15 doors; the busiest is CI, which reaches 9 parts. People run bench, host, load, play, propose, replay and write-golden.

## What changed since 2026-09-30 (6865b1c)

- CI now also runs tools/stage-release.test.js.
- CI now also checks tools/stage-release.mjs.
- Release (.github/workflows/release.yml) is a new door. It starts when a release is published; or by hand. It runs solver/build.mjs, tools/publish-release.sh and tools/stage-release.mjs.
- And 4 more changes to doors.
- LICENSE is now read by tools/stage-release.test.js.
- README.md is now read by tools/stage-release.test.js.
- package.json is now also read by tools/stage-release.test.js.
- And 23 more new writers and readers of places.
- tools/publish-release.sh is new and belongs to no part, so atlas check fails on it against the previous map.
- tools/stage-release.mjs is new and belongs to no part, so atlas check fails on it against the previous map.
- tools/stage-release.test.js is new and belongs to no part, so atlas check fails on it against the previous map.
- 13 files added and 15 changed content, across 8 parts.

## What comes in

1. **CI.** On a pull request touching 13 paths; on a push to main touching 13 paths; or by hand. Runs harness/binding.test.js, harness/bundle.mjs, harness/bundle.test.js and 52 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 29 more.
2. **Corpus.** On a schedule (`17 6 * * 1`), Monday at 06:17 UTC; or by hand. Runs harness/corpus.mjs and solver/build.mjs.
3. **Release.** When a release is published; or by hand. Runs solver/build.mjs, tools/publish-release.sh and tools/stage-release.mjs.
4. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **propose** (a command people run). Runs packages/propose/bin/propose.js.
6. **bench** (a command people run). Runs packages/bench/bin/bench.js.
7. **host** (a command people run, from package.json). Runs packages/host/bin/host.js.
8. **host** (a command people run, from packages/host/package.json). Runs packages/host/bin/host.js.
9. **load** (a command people run, from package.json). Runs packages/load/bin/load.js.
10. **load** (a command people run, from packages/load/package.json). Runs packages/load/bin/load.js.
11. **write-golden** (a command people run). Runs harness/sim.mjs and harness/write-golden.js.
12. **play** (a command people run, from package.json). Runs packages/tick/bin/play.js.
13. **play** (a command people run, from packages/tick/package.json). Runs packages/tick/bin/play.js.
14. **replay** (a command people run, from package.json). Runs packages/tick/bin/replay.js.
15. **replay** (a command people run, from packages/tick/package.json). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 10 files in bench, 24 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js and packages/propose/record.test.js in propose, and 17 files in 7 more places; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 16 files in harness, packages/bench/ in bench, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, and 52 files in 9 more places.
   1. Inside harness/binding.test.js, holds does, in order: world record, frame and frame record.
   2. Inside harness/bundle.mjs, make bundle does, in order: with records and capture bundle (tick).
   3. **Capture bundle** (tick) runs, in order: replay to and subarray.
   4. Inside harness/course.test.js, step run does, in order: record run, create world (tick) and body.
   5. Inside harness/outcome.test.js, translated run does, in order: product init, record run, create world (tick), sleep watch and apply product act.
   6. Inside harness/restore.test.js, planted rerun does, in order:
      1. replay to
      2. events (4 steps)
      3. replay to
      4. create world (tick)
      5. create hasher (frame)
      6. end line
      7. line
      8. advance
      9. line
      10. end line
   7. Inside harness/soundness.test.js, evict does, in order: create world (tick) and create hasher (frame).
   8. Inside harness/sweep.test.js, sweep of does, in order: load scene (tick) and sweep (load, 3 steps).
   9. **Load scene** (tick) runs, in order: create world, validate mesh and belief refusal.
   10. **Sweep** (load) runs, in order:
      1. load intent rules (tick)
      2. create world
      3. create memory
      4. create restorable tick
      5. world floor
      6. restore
      7. body
      8. carrying of
      9. zone index
      10. open
      11. refused
      12. admitted
   11. Inside packages/bench/finding.test.js, run does, in order: copy checkout, plants (3 steps) and run bench.
   12. **Run bench** runs, in order: same path, one tree per process, list files, read anchors, trees (4 steps) and build (4 steps).
   13. Inside packages/bench/rungs.test.js, run does, in order: copy checkout, apply and run bench.
   14. **Run bench** runs, in order: same path, one tree per process, list files, read anchors, trees (4 steps) and build (4 steps).
   15. Inside packages/propose/propose.test.js, probe session does, in order:
      1. load roles (tick)
      2. scratch world
      3. load intent rules
      4. create world
      5. create memory
      6. create tick
      7. on tick
      8. run session
      9. settle
      10. write session
   16. **Create tick** (tick) runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   17. **Run session** runs, in order:
      1. template slots
      2. frame
      3. render template
      4. belief keys (tick)
      5. build schema
      6. observe
      7. ask
      8. while out
      9. loaded
      10. record (3 steps)
   18. **Settle** (tick) runs, in order: idle and advance.
   19. Inside packages/propose/record.test.js, verify in head does, in order: find (bench), copy checkout, apply and apply.
   20. Or, when `!p || p.inBase`, verify in head does verify session instead.
   21. **Verify session** runs, in order:
      1. manifest hash (tick)
      2. validate manifest
      3. canonical
      4. sha 256
      5. canonical
      6. sha 256
      7. canonical
      8. sha 256
      9. canonical
      10. read role output
      11. stamp proposal
      12. canonical
   22. **Copy checkout** (bench) runs, in order: copy tree and copy product.
   23. Inside packages/tick/gate.test.js, role tick does, in order: catalog of, load intent rules, create memory, fixture world, create world and create tick.
   24. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   25. Inside packages/tick/load-hash.test.js, snapshot at load does, in order: create world and create hasher (frame).
   26. Inside packages/tick/order.test.js, first hashes does, in order: create world, load intent rules, create memory and create tick.
   27. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   28. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.
   29. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   30. Inside solver/lint.mjs, lint wasm does, in order:
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
2. It writes to fixtures/law-runs/ and fixtures/sweep/verdicts.json.
3. It runs git.

## Who reads the results

Only CI itself reads what it writes.

## The other doors

**Corpus** runs harness/corpus.mjs and solver/build.mjs, reaches frame, load and tick, writes to fixtures/sweep/verdicts.json, runs git, and opens an issue when it fails.

**Release** runs solver/build.mjs, tools/publish-release.sh and tools/stage-release.mjs.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**propose** (a command people run) runs packages/propose/bin/propose.js and reaches frame, harness and tick.

**bench** (a command people run) runs packages/bench/bin/bench.js, reaches solver and tick, writes to fixtures/solver.sha256, and runs git.

**host** (a command people run, from package.json) runs packages/host/bin/host.js and reaches frame and tick.

**host** (a command people run, from packages/host/package.json) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command people run, from package.json) runs packages/load/bin/load.js, reaches frame and tick, and runs git.

**load** (a command people run, from packages/load/package.json) runs packages/load/bin/load.js, reaches frame and tick, and runs git.

**write-golden** (a command people run) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command people run, from package.json) runs packages/tick/bin/play.js and reaches frame.

**play** (a command people run, from packages/tick/package.json) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run, from package.json) runs packages/tick/bin/replay.js, reaches frame, and runs git.

**replay** (a command people run, from packages/tick/package.json) runs packages/tick/bin/replay.js, reaches frame, and runs git.

## What breaks what

- **tick** is imported by 5 parts (bench, harness, host, load, propose) and sits on the path of 13 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 12 doors.
- **harness** is imported by 1 part (propose), and by 1 more only from tests; it sits on the path of 4 doors.
- **load** is imported by 1 part (harness), and by 1 more only from tests; it sits on the path of 4 doors.
- **propose** is imported by 1 part (bench) and sits on the path of 2 doors.
- **solver** is run as a child process by 1 part (bench) and sits on the path of 4 doors.
- **host** is imported only from tests, by 1 part (harness), and sits on the path of 3 doors.
- **fixtures/golden.txt** is written by harness and read by harness and workflows; a hand edit reaches every reader.

## What tends to change together

- **packages/propose/bin/propose.js** and **packages/propose/seat.js** changed together in 10 of 14 commits, inside the propose part.
- **packages/host/host.test.js** and **packages/host/session.js** changed together in 9 of 13 commits, inside the host part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 9 of 13 commits, inside the propose part.
- **packages/load/load.test.js** and **packages/load/suite.js** changed together in 4 of 6 commits, inside the load part.
- **packages/bench/bench.js** and **packages/bench/neutral.test.js** changed together in 5 of 8 commits, inside the bench part.

2 files changed together with their own tests, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 18 source files reach 10 revisions; the floor rises to 10 when 25 do.

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

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, predicates/roles/, the repository root and worlds/; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → harness/bundle.mjs → packages/tick/bundle.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 19 import sites could not be resolved.
- 3 writes and 9 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 51 writes and 103 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 42 commands are built at run time and not followed, 36 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
