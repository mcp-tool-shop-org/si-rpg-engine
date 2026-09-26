# Dispatch 113 — the engines job's law trees start warm

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T7b, merged. Issue #113. It lands before T7c adds any test that builds the law, and T7c's dispatch (`docs/dispatch-t7c-model.md`) adds none.

## What it is

T7b took CI's engines job from about 7 minutes to 14 minutes 14 seconds. `npm test` on that job went from about 4 minutes to 12 minutes 2 seconds. The job's timeout is 20 minutes. The time is `packages/bench/law.test.js`, which builds five trees from scratch on the runner's four cores: the product and coverage builds of the law head, the product and coverage builds of its base, and the product build of the checkout without its shim. `Swatinem/rust-cache` caches `solver/target` only, so none of those trees starts warm.

`seedCoverage` in `packages/bench/build.js` already starts one law tree's coverage target as a copy of the head's, and the caller refuses a reference build that comes out as the head's bytes. This slice starts each tree's product target and coverage target from a copy of the cached `solver/target` the same way. Pin 2 of T7b stands: each tree keeps its own target directory. The copy is not a shared directory.

One smaller item rides along. Every build of the law warns `unexpected cfg condition name: law_coverage`. A `check-cfg` entry silences it. T7b left it, because its pin 12 allowed one change to the law's build. This slice is that later change. The product binary's bytes do not move.

## Pins

1. **The tests first.** The tests below fail on `main` and pass here, and the pull request shows both. No test is deleted, and no assertion in `law.test.js` is weakened.

2. **A tree's targets start from the cache.** Before `buildProduct` and before a coverage build, the tree's `solver/target` is a copy of the cached `solver/target` when that cache exists, minus the law crate's own artifacts, as `seedCoverage` already leaves them out. `CARGO_TARGET_DIR` stays cleared for the build, and the build writes into the tree's own target directory.
   - A test times a second tree's product build and its coverage build with the cache seeded and with it empty, in one process, and records both times in the test's output. The seeded build is the one the slice keeps. The pull request quotes those two times.
   - A seeded build whose sources differ from the tree the cache was made for does not reuse the law crate's wasm. The existing refusal, that a reference build must not come out as the head's bytes, still fires. A test plants a one-line change in the seeded tree and reads a different digest.

3. **The cfg warning is named.** `solver` declares `law_coverage` to rustc with a `check-cfg` entry, so a build that passes `--cfg law_coverage` does not warn, and a build that does not pass it does not warn either. The product wasm's bytes are unchanged: a local `node solver/build.mjs` before the entry and after it prints the same digest. `fixtures/solver.sha256` does not move. The Linux digest is CI's, and the pull request says whether the engines job's digest check stayed green.
   - The warning is the red on `main`: `cargo build` of `solver` prints `unexpected cfg condition name: law_coverage`. Here it does not.

4. **The job is measured.** The pull request quotes the engines job's time on `main` at the release, 14 minutes 14 seconds, and the time of the job on this head. The slice is not done on a time that is not shorter. If the seeded builds are not shorter on the runner, the pull request says so and does not claim the issue closed.

5. **Nothing else moves.** The goldens and the behaviour numbers do not move. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- A seeded tree builds in its own target directory, and a changed law crate does not reuse the cached wasm.
- The `law_coverage` warning is gone, and the product digest is the one already in `fixtures/solver.sha256`.
- The engines job on this head is shorter than 14 minutes 14 seconds, and the pull request quotes both times.
- The typecheck is clean, the test count is at or above `main`, and the Atlas check is green.
