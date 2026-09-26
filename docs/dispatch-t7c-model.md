# Dispatch T7c — the model in the bench

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T7a and T7b, both merged. #113's pull request merges before this one. This slice adds no law build. The plan row is T7 in `docs/PHASE-2.md`. The research is `docs/study-swarm/seat-instrument.dispatch.md`; numbers in parentheses are its findings.

Rewritten after the overseer's review at `ed05b61`. The first text could not be built: a frozen role cannot run, one call per session never carries feedback, and the stall's n was unset. Round 1 of the design review, on #123, is the stopping round.

The builder does not start until this dispatch is on `main` after that round. `test-instrument` stays frozen in this pull request.

## What it is

The bench already has two proposers, the sweep and the grammar, and a ladder of verdicts that come only from the engine. This slice adds a third proposer, `model`, off unless a run asks for it. The grammar still runs to its budget. The model is one more session in the sweep process, where the proposers already run (T7b pin 2), because a fake client cannot cross the bench's IPC. It proposes intents only and never states an expected outcome (7). The checker admits or refuses. The ladder is the one T7b built.

CI never calls a model. Its sessions use a test-only role in a test catalog, thawed there, and never `predicates/roles/test-instrument.json` (T7a: the recorded sessions use a test-only role, never this one). `sessionRefusal` refuses a role that is not thawed (`packages/propose/seat.js:207`), and the gate refuses a frozen role's proposals (`packages/tick/gate.js:180`).

## Pins

1. **The tests first.** Each test named below as red fails on `main` and passes here, and the pull request shows both. A test that already passes on `main` is named as a regression test. Every new test file is added to `package.json`'s `npm test` list.

2. **A failed record's time is already bounded (#100, item 1).** `else if (record.timing.ms > budgetMs)` at `packages/propose/record.js:434` applies to a failed record, because `failedTiming` sets `timedOut` false. Item 1 was a misreading. A planted failed record with `timing.ms` above the budget fails verification and names the record. This test passes on `main`. It closes the misreading.

3. **A record that read no model says so (#100, item 2).** `driftReport` (`packages/propose/bin/propose.js:234`) skips a record whose output is null, so it never reaches the fallback the first text described. The red record holds an output, has its model unread, and cites a manifest with no pin. It is run under the `noModel()` stub (`packages/propose/propose.test.js:1344`). The report says that the record read no model, and it does not ask the server. On `main` the fallback is `String(digestOf(record))`, the words "not the pinned null".

4. **A failed call names a model change (#100, item 3).** `callRead` returns `call-failed` when `failure` is set, before it looks at the loaded model. That order stays. When `loadedBefore` or `loaded` names a digest other than the pin, the reason names both the failure and the model change. A test plants that record. On `main` the reason is the failure alone. A failed record whose readings match the pin is unchanged.

5. **The grammar's saves carry the world (#115, item 1).** `grammarNext` in `packages/bench/runner.js` stores saves under a key that hashes the witness and its end tick and not the world. The orchestrator's `witnessKey(world, witness, witnessEnd)` in `packages/bench/bench.js` already hashes the world. The grammar uses that key.
   - A test runs the grammar over two worlds whose first cells share a witness, including the empty witness at the same tick. The second world's draw is not a restore of the first world's state. The test is red on `main`.

6. **The three small items from #115.** Each has a test that fails on `main`.
   - A `--control` path outside the four roots `withoutPaths` names is not written verbatim into the record's world or `report.controls`. It is named relative to the head, or added to the paths the environment block holds. The test plants an absolute path and reads the record.
   - The report's environment section ends the file. A test writes a line after `## Environment`, and both the cut and `leaks` refuse it.
   - The comment on `separate()` says which candidates are offered to the mutants: those both trees ran soundly. The code is unchanged.

7. **The model proposer is off unless named, and it runs in the sweep process.** The invocation is `npx bench run --base <tree> --head <tree> --out <dir> --world <file> --model`. `--model` without `--diff <file>` is refused. The diff file's text is the session's `diff` input. The access input is a `Record` of function name to verb names, the shape `accessText` reads (`packages/propose/prompt.js:103`), built from the sweep's reach before the session starts. The end-of-run `access.json` is not that shape and is not what the session reads.
   - The bench may import `packages/propose` from `packages/bench/model.js` only. No bench file imports `model.js` statically. The sweep process loads it when `--model` is set. `packages/bench/source.test.js` scans `packages/bench/` and `packages/bench/bin/`, and still refuses every other import of `packages/propose`.
   - With the proposer off, the report has no `model` proposer. A test holds that with an `--import` or `registerHooks` hook, as `packages/bench/runner.js:1284` does, so a load of `packages/propose` fails the test.
   - With the proposer on, tests use a fake client in the sweep process. No test starts Ollama or opens a socket.

8. **One session per world.** `runSession` starts `feedback` empty for every session (`packages/propose/seat.js:460`), and `feedbackText` has no field for what a candidate reached. A run that made each call its own session would drop that feedback, and `callsPerSession` would never bind. A refused proposal spends no ladder budget (`packages/bench/bench.js:508`, `618`), so a client that always proposes a refusal would not stop.
   - The model is one seat session per world, of at most `callsPerSession` calls. `Feedback` gains the anchors reached and the rungs, and `feedbackText` renders them with the checker's refusal. The bench appends each call's feedback before the next. A refused proposal costs one call against `callsPerSession` and is tallied as refused. The session stops at the role's call budget or at the ladder budget, whichever comes first.
   - The grammar runs its whole ladder budget before the model session. The model starts when that budget is spent (pin 9).

9. **The stall's n.** T7b's reporting grid is n of 8, 16, 32, 64, and 128. T7b leaves the choice to this slice: the model is called at the n the grid's numbers justify. The grammar does not stop at that n. It runs on to its budget, and the report's late gain is unchanged.
   - The n the grid justifies is not a point inside this budget. Five of the six plants never stall at 8, 16, 32, 64, or 128. push stalls only at 8. The model does not start at 8, where five plants are still gaining, and it does not start at 128, which this budget never reaches. It starts when the grammar has spent its ladder budget. The grammar still runs that whole budget first.
   - Measured at seed 1, share 0.5, pitch 0.5, the sweep proposing nothing, mutants off, the room `fixtures/bench/room.json`, sweep budget 6000 quanta and 60 restores, ladder budget 12000 quanta and 120 restores. Each plant took about 10 s. A null stall means the grammar never went that many admitted candidates without a new changed line or a new difference.

     | plant | n=8 | n=16 and above |
     |---|---|---|
     | rule | no stall | no stall |
     | comparison | no stall | no stall |
     | stepHeight | no stall | no stall |
     | push | stalled at c70, 9 admitted, late gain 0 lines and 0 differences | no stall |
     | quanta | no stall | no stall |
     | ruleFlag | no stall | no stall |

     No grid value is a stall with zero late gain on every plant. The model session starts when the grammar's ladder budget is spent.

10. **What a steered proposal must show.** On `main`, an unknown `--model` is ignored, so a test that the ladder's verdicts are unchanged already passes. That is not the red.
    - The red: the report shows the steered proposal refused, with the parser's reason or the checker's. The fake client returns a verb outside the catalog and a stated hash. The session uses the test-only thawed role.
    - Every sweep candidate's rungs and every grammar candidate's rungs equal the model-off run's, matched by world, witness, and intent.

11. **Time stays out of the report body.** `timing.ms`, wall-clock, and the count of timeouts go in the environment block. Two runs with one seed give the same report outside that block (T7b: comparisons are at equal budgets, and wall time sits beside them in the environment block). A timeout is counted and the call is the seat's cut-off record (5).

12. **Earning a place is measured, and it is not this pull request's thaw.** On each of T7b's planted changes and on F2's law change, the model is given one proposer's budget after the grammar has spent its own, and the grammar is given the same budget again to continue. They are compared on the same mutant list: admission rate, changed lines reached, hash differences, mutants caught, and unique findings (the research's list). GPU time, wall-clock, and timeouts are reported beside the results, in the environment block. The report says plainly when the model did not beat the grammar (3, 5). The coordinator runs this by hand. The builder does not run a model.
    - The fake-client session in pin 10 is a version-2 call record, and `verifySession` accepts it with no model running.
    - The thaw is a later pull request. It carries a recorded real-model steering session whose every output lies inside the manifest, verified in CI the way `fixtures/sessions/probe-steer` is (T7a). It names the Director's approval (T7a: a widening waits for that approval and the adversarial run). Pin 10's fake client proves the rails only. This pull request leaves `predicates/roles/test-instrument.json` frozen and does not set `adversarialRun`.

13. **Nothing the law is made of.** The goldens, the Linux digest, and the behaviour numbers do not move. No Rust source and no workflow file changes. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- Pin 2's test passes on `main` and here. The reds in pins 3, 4, 5, 6, and 10 fail on `main` and pass here.
- A record with an output and no model pin says that it read no model, under `noModel()`.
- Two worlds that share a witness do not share a grammar save.
- `--model` without `--diff` is refused. With both, a fake client in the sweep process records one version-2 session per world, `verifySession` accepts it with no model running, a refused proposal costs a call, and the report shows that refusal's reason.
- Sweep and grammar rungs match a model-off run, by world, witness, and intent. Times and timeouts are only in the environment block.
- `test-instrument` is still frozen. No test calls a model.
- The typecheck is clean, the test count is at or above `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.
