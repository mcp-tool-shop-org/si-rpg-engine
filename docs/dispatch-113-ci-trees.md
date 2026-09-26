# Dispatch 113 — coverage targets keep their file times

2026-09-26. Coordinator: Grok. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T7b, merged. Issue #113. It lands before T7c. T7c's dispatch adds no law build.

Rewritten after measurement on 4 cores with the pinned toolchain, rustc 1.98.1, the product law `fd4b46bb45f299894d31e8745a3649f986c08b95ad3acba7ec20d70bfef2fde2`. Seeding product targets does not shorten a build. Fixing `seedCoverage` does.

## What it is

`seedCoverage` in `packages/bench/build.js` copies a coverage target with `cpSync` and does not keep file times (`build.js:126`). The dependencies look newer than the copy and Cargo rebuilds them. Measured: 59.0 s and 30 units, including nalgebra, parry, and rapier. The same copy with `preserveTimestamps: true` takes 4.7 s and compiles 1 unit, `si-solver`. The law tree's reference build is effectively cold today. That is the slice's gain.

Seeding a product target gains nothing. `solver/build.mjs:50-52` puts each tree's absolute path in the rustflags (`--remap-path-prefix=<tree>=/solver`), so a tree at another path rebuilds every wasm unit (`RustflagsChanged`). Cold 46.0 s, seeded 46.2 s. This slice does not seed product targets.

A coverage build passes its flags to every crate through `CARGO_ENCODED_RUSTFLAGS` (`packages/bench/build.js:150-158`). A product cache gives it nothing. Cold 59.7 s, seeded from a product target 59.1 s.

One smaller item rides along. Every build of the law warns `unexpected cfg condition name: law_coverage` once. `solver/build.rs` prints `cargo::rustc-check-cfg=cfg(law_coverage)`. The warning count goes from 1 to 0, and `node solver/build.mjs --check` keeps `fd4b46bb45f299894d31e8745a3649f986c08b95ad3acba7ec20d70bfef2fde2`. A `Cargo.toml` change would change rust-cache's key and cold-start the cache in the slice that measures time, so the entry is in `build.rs` and not there. Without `--check`, `build.mjs` rewrites the pin file. The builder uses `--check`.

T7b pin 12 names the coverage shim as T7b's one Rust change. It did not leave a later change to the law's build for this warning. `packages/bench/source.test.js:96-99` refuses `law_coverage` in `solver/build.rs`. This slice changes that test to allow exactly the one `check-cfg` line, and no other occurrence.

## Pins

1. **The tests first.** The tests below fail on `main` and pass here, and the pull request shows both. No test in `law.test.js` is deleted or weakened.

2. **Coverage targets only, with file times kept.** `seedCoverage` copies a coverage target built with the same flags, the head's, and passes `preserveTimestamps: true`. It leaves out every `Cargo.lock` package with no source. It refuses if `Cargo.lock` lists a path package other than `si-solver`, since the filter goes by name. Product targets are not seeded.
   - The gate is deterministic. A seeded coverage build compiles exactly one unit, `si-solver`, counted from cargo's `Compiling` lines. A build that compiles nothing has reused the head's law, and it fails the gate. The control follows the bench's own order. The base tree is checked out, the head is built after it, and the base is seeded unfiltered with file times kept. The base then compiles no law unit and fails the gate. With the filter it compiles `si-solver`. Both are tests, red on `main` for the unfiltered case: today's `seedCoverage` rebuilds the dependencies.
   - There is no permanent test that times a cold build. A cold product build and a cold coverage build are about 46 s and 60 s, and a test that repeats them puts that time back into the job this slice shortens. Seeded against empty is measured once, in the pull request, not in CI.

3. **The cfg warning is one line in `build.rs`.** The line is `println!("cargo::rustc-check-cfg=cfg(law_coverage)");`. A build that passes `--cfg law_coverage` does not warn, and a build that does not pass it does not warn either. `node solver/build.mjs --check` prints the digest already in `fixtures/solver.sha256`. The file is not edited.
   - `packages/bench/source.test.js` allows that one line in `solver/build.rs` and still refuses every other `law_coverage` outside `solver/src/lib.rs`'s shim. The test is red on `main` once the line exists and the allowance does not.

4. **The job is measured, and the number is not a gate.** The same engine code ran the engines job in 14:08 at T7b's merge, 13:22 at the release (`npm test` 11:09), and 11:29 on #120, which changed docs only. 14:14 is T7b's pull-request run, not the release. "Shorter than 14:14" would close #113 on noise.
   - Three `workflow_dispatch` runs of `ci.yml` on `main` and three on the head, one at a time. The pull request quotes `law.test.js`'s `duration_ms` from each run's test output, the two medians, and each run's cache status. No workflow file changes. `workflow_dispatch` only runs a workflow that is on the default branch, so a new measuring workflow would first have to land on `main`. The concurrency group `ci-<branch>` cancels a run already in progress on the same branch, so the six runs are one at a time.
   - #113 closes on those medians together with pin 2's gate: the head's median is shorter, and a seeded coverage build compiles exactly one unit, `si-solver`. A build that compiles nothing fails the gate. A head whose median is not shorter still merges the mechanism and the warning fix, and the pull request leaves #113 open with the six durations named.

5. **Nothing else moves.** The goldens and the behaviour numbers do not move. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- A seeded coverage build compiles exactly one unit, `si-solver`. A build that compiles nothing fails the gate. The control follows the bench's own order: the base is checked out, the head is built after it, and an unfiltered seed of the base with file times kept compiles no law unit. With the filter the base compiles `si-solver`. Product targets are not seeded.
- `solver/build.rs` carries the one `check-cfg` line. The warning count is 0. `node solver/build.mjs --check` keeps the digest in `fixtures/solver.sha256`. The source test allows that line and no other new occurrence.
- The pull request quotes `law.test.js`'s `duration_ms` from three `workflow_dispatch` runs of `ci.yml` on `main` and three on the head, one at a time, the two medians, and each run's cache status. No workflow file changes. Closing #113 waits on the head's median being shorter and on pin 2's gate. A head that is not shorter still merges, and #113 stays open.
- No `law.test.js` assertion is weakened. The typecheck is clean, the test count is at or above `main`, and the Atlas check is green.
