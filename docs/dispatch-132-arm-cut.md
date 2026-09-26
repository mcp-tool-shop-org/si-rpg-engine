# Dispatch 132 — arm G stops at either limit, and the arms run on a real change

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T7c (#130), merged at `04f826d`. Issue #132. It lands before any real model call.

## What it is

Arm G is the grammar's candidates after the start point, until their cost reaches the quanta and restores arm M spent (T7c pin 8). `withinCost` (`packages/bench/report.js:171`) takes candidates until arm G has reached both arm M's quanta and its restores. The extension loop in `packages/bench/bench.js`, `while (!(q >= mQuanta && r >= mRestores))`, does the same. With two limits the overshoot is not one candidate. If arm M spent 1000 quanta and 10 restores, and each grammar candidate costs 500 quanta and 1 restore, arm G takes 10 candidates and 5000 quanta, five times arm M's simulation.

Every other budget in the bench runs out at the first limit reached, including arm M's own loop (`bench.js:864`). Arm G does the same.

The arms have no CI test with a change that reaches anchors, or with mutants on. Every model bench in `packages/bench/model.test.js` runs a head equal to its base, with an empty diff and mutants off. `newFindings` has a unit test (`7da7d09`). The arm mutant pass and a model candidate reaching a real change have not run in CI.

## Pins

1. **The tests first.** Each red below fails on `main` and passes here, and the pull request shows both.

2. **Arm G stops at either limit.** Arm G stops as soon as either limit is reached, and it keeps the candidate that crosses. It ignores a limit on which arm M spent nothing. When arm M spent nothing on both, arm G is empty, as today.
   - In `withinCost`, the loop breaks when `quanta > 0 && q >= quanta` or `restores > 0 && r >= restores`.
   - The extension loop in `bench.js` makes the same change.
   - The red: arm M at 1000 quanta and 10 restores, against grammar candidates at 500 quanta and 1 restore each, gives arm G 2 candidates, not 10. A second case with arm M at 0 restores stops on quanta alone.
   - The overshoot is then at most one candidate in each limit.

3. **The arms run on a real change, with mutants on.** One bench test in `packages/bench/model.test.js` plants a change the room reaches (one of T7b's planted changes in `packages/bench/plants.js`), runs with mutants on, and gives the fake client an intent that the checker admits and that reaches the change. The test reads the report's arms and checks arm M's new lines, its new difference keys, and its mutants against what that candidate's own record shows. Arm G's findings come from its own records the same way. A mutant is credited to an arm only when its first separating input is that arm's candidate.
   - The red on `main` is the pin 2 cut, which this test also checks: arm G's quanta and restores each overshoot arm M's by at most one grammar candidate.
   - The test adds its time to the job. It uses the smallest budgets that still reach the change, and the pull request states its duration.

4. **Nothing else.** The start point, `newFindings`, arm M's loop, and the report's shape do not change. The goldens, the Linux digest, and the behaviour numbers do not move. No Rust source and no workflow file changes. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- Arm M at (1000, 10) against grammar candidates at (500, 1) gives arm G 2 candidates. A limit arm M spent nothing on is ignored.
- A bench test with mutants on and a real planted change shows arm M's lines, differences, and mutants matching its candidate's record.
- The typecheck is clean, the test count is at or above `main`, and the Atlas check is green.
