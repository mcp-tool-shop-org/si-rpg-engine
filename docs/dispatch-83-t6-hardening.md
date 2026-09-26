# Dispatch 83 — T6's four hardening findings

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T6 (the sweep, and the tick's save and restore), merged. The findings are issue #83, from the second external review of #75; the slice merged with them open because each hardens the sweep rather than correcting what it reports.

## What it is

Four gaps, each small, each found by a reviewing family and checked by the coordinator against `main`:
- `saveProblem` in `packages/tick/tick.js` checks a save's committed frame only for its shape: `saved.frame.bodies` must be an array. Every other saved collection is checked record by record before anything is written.
- The sweep's determinism test double-sweeps only `fixtures/sweep/walled-open.json`, a world with no findings. The findings list's own order is never compared across two sweeps.
- The comment on `sweepVerdict` in `packages/load/sweep.js` says the scheduled job finishes a sweep the budget cut short. The job sweeps under a larger budget and compares the verdict with its record; the product scene and the minds fixture are still deferred under it, as `fixtures/sweep/verdicts.json` records.
- In `harness/corpus.mjs`, a sweep that throws inside `sweepCorpus` records a failing result with no `block`. It is the only failing result shaped that way, and the path that writes the job's issue reads `result.block`.

## Pins

1. **The tests first.** Each test below fails on `main` and passes here, and the pull request shows both, except where a pin says why it cannot fail on `main`.
2. **The committed frame is checked whole.** A save's frame is validated before anything is written, record by record, as `world.restoreProblem` validates the world's bodies: one record per body of the world, in the world's order, each with its body's id and every number a committed frame's record holds (`commitFrame` in `packages/frame/frame.js`).
   - A planted save is refused, one test each, when a frame record has a field missing, a field that is not a number, an id that is not its body's, or when the frame has one record too few or too many.
   - After each refusal, the tick traces on as if no restore had been tried, compared frame for frame with a run that was never restored.
3. **The findings' order is deterministic.** The determinism test also double-sweeps `fixtures/sweep/floor-gap.json`, which has findings. The two findings lists are equal, entry for entry and in order, and their bundles are equal byte for byte. This test passes on `main`; it is new coverage of an order nothing compared before, and the pull request says so.
4. **The comment says what the job does.** `sweepVerdict`'s comment says a deferred sweep is swept again by the scheduled job under a larger budget, and that the job fails when the verdict differs from its record. It does not say the job finishes it. No behaviour changes.
5. **A thrown sweep has a block.** A sweep that throws in `sweepCorpus` records a failing result whose `block` names the world and the throw's message, like every other failing result.
   - A test plants a throw in one world's sweep. The result has the block, and the issue body the job's issue path writes for that run holds the throw's message.
6. **Nothing the law is made of.**
   - The goldens `6e0d351693b18c93` and `0d38671370d12d1e`, the Linux digest, the behaviour numbers, and `fixtures/sweep/verdicts.json` do not move, and no Rust source or binary byte changes.
   - The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`.
   - The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- Each new test fails on `main` and passes here, except pin 3's, which the pull request names as new coverage.
- A save corrupt only inside its committed frame is refused before anything is written.
- Two sweeps of `floor-gap` give equal findings and equal bundles.
- A thrown sweep's result carries a block, and the job's issue body names the throw.
- The typecheck is clean, tests are at or above the count on `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.
