# si-rpg-engine: how it works

Mapped at 2026-09-26 from commit 83d9caf.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

16 parts, mostly JavaScript (100 files). Work enters through 9 doors; the busiest is CI, which reaches 8 parts. People run host, load, play, propose, replay and write-golden.

## What changed since 2026-09-26 (8d78f1e)

- CI now also runs packages/tick/load-hash.test.js.
- fixtures/sweep/walled-open.json is now also read by packages/tick/load-hash.test.js.
- fixtures/sweep/walled.json is now also read by packages/tick/load-hash.test.js.
- packages/host/bin/host.js is now read by packages/tick/load-hash.test.js.
- And 3 more new writers and readers of places.
- 3 files added and 5 changed content, across 5 parts.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs harness/bundle.mjs, harness/bundle.test.js, harness/caps.test.js and 35 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 26 more.
2. **Corpus.** On a schedule (`17 6 * * 1`), Monday at 06:17 UTC; or by hand. Runs harness/corpus.mjs and solver/build.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **propose** (a command people run). Runs packages/propose/bin/propose.js.
5. **host** (a command people run). Runs packages/host/bin/host.js.
6. **load** (a command people run). Runs packages/load/bin/load.js.
7. **write-golden** (a command people run). Runs harness/sim.mjs and harness/write-golden.js.
8. **play** (a command people run). Runs packages/tick/bin/play.js.
9. **replay** (a command people run). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 19 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js and packages/propose/record.test.js in propose, 4 files in solver, and 11 files in 4 more places; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 15 files in harness, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, packages/load/ in load, and 44 files in 7 more places.
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
   10. Inside packages/propose/propose.test.js, probe session does, in order:
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
   11. **Create tick** (tick) runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   12. **Run session** runs, in order:
      1. template slots
      2. frame
      3. render template
      4. belief keys (tick)
      5. build schema
      6. observe
      7. ask
      8. while out
      9. record (4 steps)
   13. **Settle** (tick) runs, in order: idle and advance.
   14. Inside packages/tick/gate.test.js, role tick does, in order: catalog of, load intent rules, create memory, fixture world, create world and create tick.
   15. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   16. Inside packages/tick/load-hash.test.js, snapshot at load does, in order: create world and create hasher (frame).
   17. Inside packages/tick/order.test.js, first hashes does, in order: create world, load intent rules, create memory and create tick.
   18. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   19. Inside packages/tick/tick.test.js, fresh does, in order: fixture world, create world, load intent rules, create memory and create tick.
   20. **Create tick** runs, in order:
      1. create hasher (frame)
      2. install minds
      3. mix load
      4. mix minds
      5. snapshot
      6. u 32
      7. commit frame
      8. least label
   21. Inside solver/lint.mjs, lint wasm does, in order:
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
2. It writes to fixtures/sweep/verdicts.json.
3. It runs git.

## Who reads the results

Only CI itself reads what it writes.

## The other doors

**Corpus** runs harness/corpus.mjs and solver/build.mjs, reaches frame, load and tick, writes to fixtures/sweep/verdicts.json, runs git, and opens an issue when it fails.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**propose** (a command people run) runs packages/propose/bin/propose.js and reaches frame, harness and tick.

**host** (a command people run) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command people run) runs packages/load/bin/load.js, reaches frame and tick, and runs git.

**write-golden** (a command people run) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command people run) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command people run) runs packages/tick/bin/replay.js, reaches frame, and runs git.

## What breaks what

- **tick** is imported by 4 parts (harness, host, load, propose) and sits on the path of 8 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 8 doors.
- **harness** is imported by 1 part (propose), and by 1 more only from tests; it sits on the path of 4 doors.
- **load** is imported by 1 part (harness), and by 1 more only from tests; it sits on the path of 3 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **propose** is imported by no other part and sits on the path of 2 doors.
- **solver** is imported by no other part and sits on the path of 2 doors.
- **fixtures/golden.txt** is written by harness and read by harness and workflows; a hand edit reaches every reader.

## What tends to change together

- **harness/bundle.test.js** and **harness/corpus.mjs** changed together in 7 of 9 commits, inside the harness part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 8 of 11 commits, inside the propose part.
- **packages/frame/types.d.ts** and **packages/tick/tick.js** changed together in 11 of 16 commits, and the tick part imports the frame part.
- **packages/host/host.test.js** and **packages/host/session.js** changed together in 8 of 12 commits, inside the host part.
- **packages/propose/bin/propose.js** and **packages/propose/seat.js** changed together in 8 of 12 commits, inside the propose part.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 12 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **fixtures/golden-behaviour.json** has a block written by harness/write-golden.js.
- **fixtures/golden.txt** is written by harness/write-golden.js.
- **fixtures/solver.sha256** has a block written by solver/build.mjs when run without --check.
- **fixtures/sweep/verdicts.json** has a block written by harness/corpus.mjs.

## Hand-authored

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, predicates/roles/, the repository root and worlds/; 2 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → harness/bundle.mjs → packages/tick/bundle.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 14 import sites could not be resolved.
- 2 writes and 3 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 14 writes and 41 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 32 commands are built at run time and not followed, 29 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
