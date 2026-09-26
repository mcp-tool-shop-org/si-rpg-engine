# Dispatch T7c — the model in the bench

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T7a and T7b, both merged. The plan row is T7 in `docs/PHASE-2.md`. The research is `docs/study-swarm/seat-instrument.dispatch.md`; numbers in parentheses are its findings.

This slice puts a model into T7b's bench as one more generator. It runs the adversarial run on T7a's rails, with a fake client in CI. It does not thaw `test-instrument`. A thaw is a later commit, after a hand run shows the model earned its place against the bench's own proposers, and the coordinator records that run (3, 4, 5).

Issue #113, the engines job's time, is not this slice. This slice adds no cargo build and no law test. #113 lands before any later slice adds a law build to that job.

## What it is

The bench already has two proposers, the sweep and the grammar, and a ladder of verdicts that come only from the engine. This slice adds a third proposer, `model`, off unless a run asks for it. The sweep and the grammar run first. The model is called when they have stopped reaching anything new in the changed code (4). It proposes intents only. It never states an expected outcome (7). The checker admits or refuses. The ladder is the one T7b built (1, 8, 11, 12).

Two repairs land before that proposer runs. Issue #100 is three corners of the model-calling path, closed before any real call is recorded. Issue #115 is T7b's round-2 review. Its first item, the grammar's save key, lands before the bench runs over more than one world. The other three items of #115 ride along, since they are the same review and the same files.

## Pins

1. **The tests first.** Each test named below as red fails on `main` and passes here, and the pull request shows both. A test that already passes on `main` is named as a regression test, not as a red.

2. **A failed record's time is bounded (#100, item 1).** `verifySession` in `packages/propose/record.js` already refuses a record whose `timing.ms` exceeds the manifest's `secondsPerCall`, in the branch after the failure-shape check. A failed record uses `failedTiming`, whose `timedOut` is false, so that branch applies to it. A planted failed record with `timing.ms` above the budget fails verification and names the record. This test passes on `main`. It is here so the corner cannot reopen.

3. **A record that read no model says so (#100, item 2).** `driftReport` in `packages/propose/bin/propose.js` falls back to `String(digestOf(record))` when the manifest has no model pin. For a version-2 record that read no model, `digestOf` is null, and the refusal says "not the pinned null". The report says that the record read no model, and it does not ask the server.
   - A test plants that record and reads the report's words. The test is red on `main`.

4. **A failed call names a model change (#100, item 3).** `callRead` returns `call-failed` when `failure` is set, before it looks at the loaded model. That order stays: a failure is the call's ending. When `loadedBefore` or `loaded` names a digest other than the pin, the reason names both the failure and the model change.
   - A test plants a failed record whose `loadedBefore` is not the pin. On `main` the reason is the failure alone. Here it names both. A failed record whose readings match the pin is unchanged.

5. **The grammar's saves carry the world (#115, item 1).** `grammarNext` in `packages/bench/runner.js` stores saves under `witnessKey(witness, witnessEnd)`, which hashes the witness and its end tick and not the world. The orchestrator in `packages/bench/bench.js` already hashes the world in its own `witnessKey(world, witness, witnessEnd)`. The grammar uses that key.
   - A test runs the grammar over two worlds whose first cells share a witness, including the empty witness at the same tick. The second world's draw is not a restore of the first world's state. The test is red on `main`. The candidates' own runs stay keyed as they are, world included.
   - No run in this slice's tests, and no default of `bench`, passes more than one world to the model proposer before this pin's test is green.

6. **The three small items from #115.**
   - A `--control` path outside the four roots `withoutPaths` names is not written verbatim into the record's world or `report.controls`. It is named relative to the head, or added to the paths the environment block holds. A test plants an absolute path and reads the record.
   - `report#9`'s cut and `leaks` require that `## Environment` ends the file. A test writes a line after that section and both refuse it.
   - The comment on `separate()` says which candidates are offered to the mutants: those both trees ran soundly. The code is unchanged unless the comment cannot be made true without a code change, in which case the pull request says so.

7. **The model is a proposer, off unless asked.** `proposers.model` defaults to false. `npx bench` does not pass it. No workflow passes it. CI never calls a model.
   - The bench may import `packages/propose` from one file, `packages/bench/model.js`, and from nowhere else. No bench file imports `model.js` statically. `packages/bench/bin/bench.js` loads it only when `--model` is set. `packages/bench/source.test.js` still refuses every other import of `packages/propose`, and refuses a planted import in any file but `model.js`.
   - With the proposer off, a run's report has no `model` proposer, and the process's module list does not include `packages/propose`. A test holds that.
   - With the proposer on, tests use a fake client. No test starts Ollama or opens a socket.

8. **What the model is given, and when.** The sweep and the grammar run to their stall on that world, by T7b's stall rule. Then the model proposer runs, until it has spent the ladder's quanta and restores for one proposer, or the role's `callsPerSession`, whichever comes first. Wall-clock and the call's `timing.ms` are written in the report and decide nothing. T7b's rule stands: nothing the bench decides depends on the time a run takes. The comparison with the cheap proposers is that shared quanta-and-restore budget, not an equal count of proposals (3, 4, 5).
   - Each call is a session of the `test-instrument` role through the seat, on a scratch world, with the role's inputs: the dispatch, the diff, the access map, the catalog, the world, and the feedback. Feedback is what the last proposals reached and why the checker refused any it refused (9, 10, 11).
   - The output is one intent. The seat's parser reads it. The checker admits or refuses. A proposal that names an expected hash, a verb outside the catalog, or a body outside the world is refused, and the refusal is counted (6, 7).
   - An admitted intent is a candidate with `proposer: 'model'`. It climbs the same ladder as a grammar candidate. Its record is a version-2 call record, and `verifySession` accepts the session with no model running.

9. **The adversarial run, in CI, with a fake client.** A fixture diff and a fixture dispatch contain instructions to propose a verb outside the catalog and to state a hash. The fake client returns that proposal. The gate refuses it. A run of the same change with the model proposer off and a run with it on produce the same ladder verdicts. The test is red on `main`, where the proposer does not exist.
   - The role stays `frozen` in `predicates/roles/test-instrument.json`. This pull request does not set `status` to `thawed` and does not set `adversarialRun`. A thaw is a widening, and it waits for the hand run in pin 10.

10. **Earning a place is a hand run, after merge.** The coordinator runs `npx bench --model` on a change the grammar and the sweep have already measured. The model has earned its place when, inside pin 8's budget, one admitted candidate reaches an anchor or a difference that neither the sweep nor the grammar reached. Otherwise the report says the model did not beat the cheap proposers, and the role stays frozen (3, 5). The coordinator records the report. A later commit thaws the role only if that report and pin 9's adversarial result both hold, and that commit names them. The builder does not run a model.

11. **Nothing the law is made of.**
    - The goldens, the Linux digest, and the behaviour numbers do not move. No Rust source and no workflow file changes.
    - The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`.
    - The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- The red tests in pins 3, 4, 5, 6, and 9 fail on `main` and pass here. Pin 2's test passes on `main` and is shown as such.
- A failed record over its budget is refused. A record that read no model says so. A failed call whose loaded model is not the pin names both facts.
- Two worlds that share a witness do not share a grammar save.
- With `--model` unset, the bench loads nothing from `packages/propose` and calls no model. With it set, a fake client records a version-2 session that `verifySession` accepts, and a steered proposal changes no verdict.
- `test-instrument` is still frozen.
- The typecheck is clean, the test count is at or above `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.
