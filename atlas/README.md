# si-rpg-engine: how it works

Mapped at 2026-09-26 from commit 3a2c437.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

17 parts, mostly JavaScript (131 files). Work enters through 10 doors; the busiest is CI, which reaches 9 parts. People run bench, host, load, play, propose, replay and write-golden.

## What changed since 2026-09-26 (00d1c90)

Nothing structural changed since 2026-09-26; 1 file changed content.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs harness/bundle.mjs, harness/bundle.test.js, harness/caps.test.js and 45 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 28 more.
2. **Corpus.** On a schedule (`17 6 * * 1`), Monday at 06:17 UTC; or by hand. Runs harness/corpus.mjs and solver/build.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **propose** (a command people run). Runs packages/propose/bin/propose.js.
5. **bench** (a command people run). Runs packages/bench/bin/bench.js.
6. **host** (a command people run). Runs packages/host/bin/host.js.
7. **load** (a command people run). Runs packages/load/bin/load.js.
8. **write-golden** (a command people run). Runs harness/sim.mjs and harness/write-golden.js.
9. **play** (a command people run). Runs packages/tick/bin/play.js.
10. **replay** (a command people run). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 8 files in bench, 20 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js and packages/propose/record.test.js in propose, and 16 files in 6 more places; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 16 files in harness, packages/bench/ in bench, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, and 51 files in 8 more places.
   1. Inside harness/bundle.mjs, make bundle does, in order: with records and capture bundle (tick).
   2. **Capture bundle** (tick) runs, in order: replay to and subarray.
   3. Inside harness/course.test.js, step run does, in order: record run, create world (tick) and body.
   4. Inside harness/outcome.test.js, translated run does, in order: product init, record run, create world (tick), sleep watch and apply product act.
   5. Inside harness/restore.test.js, planted rerun does, in order:
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
   6. Inside harness/soundness.test.js, evict does, in order: create world (tick) and create hasher (frame).
   7. Inside harness/sweep.test.js, sweep of does, in order: load scene (tick) and sweep (load, 3 steps).
   8. **Load scene** (tick) runs, in order: create world and belief refusal.
   9. **Sweep** (load) runs, in order:
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
   10. Inside packages/bench/finding.test.js, run does, in order: copy checkout, plants (3 steps) and run bench.
   11. **Run bench** runs, in order: same path, one tree per process, list files, read anchors, trees (4 steps) and build (4 steps).
   12. Inside packages/bench/rungs.test.js, run does, in order: copy checkout, apply and run bench.
   13. **Run bench** runs, in order: same path, one tree per process, list files, read anchors, trees (4 steps) and build (4 steps).
   14. Inside packages/propose/propose.test.js, probe session does, in order:
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
   15. **Create tick** (tick) runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   16. **Run session** runs, in order:
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
   17. **Settle** (tick) runs, in order: idle and advance.
   18. Inside packages/tick/gate.test.js, role tick does, in order: catalog of, load intent rules, create memory, fixture world, create world and create tick.
   19. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   20. Inside packages/tick/load-hash.test.js, snapshot at load does, in order: create world and create hasher (frame).
   21. Inside packages/tick/order.test.js, first hashes does, in order: create world, load intent rules, create memory and create tick.
   22. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   23. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.
   24. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   25. Inside solver/lint.mjs, lint wasm does, in order:
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

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**propose** (a command people run) runs packages/propose/bin/propose.js and reaches frame, harness and tick.

**bench** (a command people run) runs packages/bench/bin/bench.js, reaches solver and tick, writes to fixtures/solver.sha256, and runs git.

**host** (a command people run) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command people run) runs packages/load/bin/load.js, reaches frame and tick, and runs git.

**write-golden** (a command people run) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js, reaches frame, and runs git.

## What breaks what

- **tick** is imported by 5 parts (bench, harness, host, load, propose) and sits on the path of 9 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 8 doors.
- **harness** is imported by 1 part (propose), and by 1 more only from tests; it sits on the path of 4 doors.
- **load** is imported by 1 part (harness), and by 1 more only from tests; it sits on the path of 3 doors.
- **solver** is run as a child process by 1 part (bench) and sits on the path of 3 doors.
- **bench** is imported by no other part and sits on the path of 2 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **fixtures/golden.txt** is written by harness and read by harness and workflows; a hand edit reaches every reader.

## What tends to change together

- **packages/bench/bench.js** and **packages/bench/neutral.test.js** changed together in 5 of 5 commits, inside the bench part.
- **harness/bundle.test.js** and **harness/corpus.mjs** changed together in 7 of 10 commits, inside the harness part.
- **packages/propose/bin/propose.js** and **packages/propose/seat.js** changed together in 9 of 13 commits, inside the propose part.
- **packages/host/host.test.js** and **packages/host/session.js** changed together in 8 of 12 commits, inside the host part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 8 of 12 commits, inside the propose part.

2 files changed together with their own tests, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 13 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **fixtures/law-runs/** is written by harness/law-runs.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **fixtures/golden-behaviour.json** has a block written by harness/write-golden.js.
- **fixtures/golden.txt** is written by harness/write-golden.js.
- **fixtures/law-runs/** is written by harness/law-runs.mjs.
- **fixtures/solver.sha256** has a block written by solver/build.mjs when run without --check.
- **fixtures/sweep/verdicts.json** has a block written by harness/corpus.mjs.

## Hand-authored

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, predicates/roles/, the repository root and worlds/; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → harness/bundle.mjs → packages/tick/bundle.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 18 import sites could not be resolved.
- 3 writes and 8 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 49 writes and 99 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 38 commands are built at run time and not followed, 32 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
