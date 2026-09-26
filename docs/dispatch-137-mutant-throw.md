# Dispatch 137 — a mutant whose run throws is not scored

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Issue #137. It lands before T7c's hand runs, because one of the seven value runs ends on it. It rebases onto #135 if that lands first.

## What it is

`separate()` in `packages/bench/bench.js` runs a mutant's process over each input the ladder ran. A throw from `proc.call('candidate', …)` or `proc.call('control', …)` is not caught, so it ends the whole bench run.

Measured at T7c's value settings with the model off (seed 1, share 0.5, pitch 0.5, sweep 6000 quanta and 60 restores with the sweep proposing nothing, ladder 12000 and 120, mutants on, `fixtures/bench/room.json`): five of T7b's six plants finish. The `quanta` plant ends with `mutant m4 candidate: restore refused: the actions are actor ids, each with an action and its quanta still to run`. The mutant multiplies `quantaFor`'s `+ 1` by 1.1 or 0.9, the quanta count is fractional, and the restore check refuses it.

## The choice, stated contrastively

A throw on the mutant and not on the head could count as caught: the mutant parted from the head. This slice does not count it. The throw comes from the harness refusing a state it cannot restore, so it measures the harness and not the candidate's sensitivity at the change. T7c's value bar counts newly caught mutants for whichever arm's candidate separated first, and an input that happens to reach a harness refusal would score for that arm. The mutant is `not scored`, the verdict the bench already gives a mutant that does not load or fails before any candidate acts. It counts for neither arm.

## Pins

1. **The tests first.** The red fails on `main` and passes here, and the pull request shows both.
   - The red: the `quanta` plant (`FINDING.quanta` in `packages/bench/plants.js`) on the room with mutants on. On `main` the run throws. Here it finishes, the throwing mutant's verdict is `not scored`, and its reason names the input and the first line of the throw. Every other mutant's verdict equals the one it gets from a run with that mutant's input left out, or the test picks budgets where no other mutant is affected. The pull request states the test's duration and uses the smallest budgets that reach the throw.

2. **The catch.** A throw from the mutant process's call on any input ends that mutant's pass. Its verdict is `not scored`, with `why` set to `its run throws on <input>: <first line>`. The process is closed as it is today. The bench goes on to the next mutant. A `BenchRefusal` the bench raises itself, such as a law mutant with no coverage run to compare with, still refuses the run as today.

3. **Nothing else.** The other verdicts, their order, the arm crediting, and the report's shape do not change. No Rust source and no workflow file changes. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- The `quanta` plant's run with mutants on finishes, and the throwing mutant is `not scored` with the input and the throw named.
- A bench refusal the bench raises itself still refuses the run.
- The typecheck is clean, the test count is at or above `main`, and the Atlas check is green.
