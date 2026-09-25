# Dispatch T5 — the replay corpus

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on T1 and T2, both merged. The plan row is T5 in `docs/PHASE-2.md`. Findings 17, 18, and 24 of `docs/study-swarm/testing-3d.dispatch.md`; the sparse image is the Rust knowledge base's suggestion after T3 fixed the memory at 32 MiB.

## What it is

Riot replays thousands of real games a day against every build and bisects to the first divergence; a study of experienced developers found more than a third of debugging time goes to reproducing a bug. This engine already has both halves of the answer: T1 names the first differing quantum and field, and T2 restores a world by replay or by image. T5 puts them to work. Every failure anywhere becomes a bundle that reproduces in one command, and a scheduled job replays everything the repository holds, far longer than a pull request can afford.

## Pins

1. **The bundle.** `harness/bundle.mjs` defines one file, `<name>.bundle.json`: the engine's commit, the binary's Linux digest, the seed, the world file's contents, the admitted-input log, the tick of the save, the T1 trace hashes from the load to that tick, and, optionally, a solver image stored sparsely: a bitmap of the 512 pages and only the pages that are not all zero, base64, with the FNV digest computed over the whole 32 MiB image so a restore is checked against the image it came from. The tick's own state, meaning memory, minds, actions in flight, lifted and carried sets, is rebuilt by replay, never stored, so a bundle cannot carry a tick that replay would not produce.
2. **One command.** `replay <bundle>` rebuilds the world, replays the log to the save tick, compares every hash to the trace in the bundle, and prints `bundle ok` or the T1 first-difference block. With the image present it also restores the image at the save tick and requires the rerun from there to match the replayed rerun. A bundle from another binary digest is refused with both digests named, since the image and the golden depend on the exact bytes. The `play` and `replay` commands keep their current forms; the bundle is an added input.
3. **Every failure writes one.** A failing restore test, outcome test, course case, trace comparison, or golden check that has a world and a log writes a bundle to the job's temporary directory and prints its path; CI uploads those as artifacts on failure only. A test proves it: a planted failure produces a bundle, and `replay` on that bundle reproduces the failure with the same first-difference block.
4. **The corpus.** `fixtures/corpus/` holds bundles, and the job replays every one of them, every behaviour fixture, every log in `fixtures/`, and the product scene at 100,000 quanta with image restores at ten ticks chosen from its events. It records wall time per bundle. Adding a bundle to the corpus is how a fixed bug stays fixed.
5. **The scheduled job.** `.github/workflows/corpus.yml` runs weekly and on `workflow_dispatch`, on `ubuntu-latest` with a `timeout-minutes` and a concurrency group. It exists because the long runs in pin 4 do not fit the pull-request job's budget, and because the runner image drifts week to week under the pinned toolchain, which a push cannot detect. On failure it opens one issue titled with the first failing bundle and the first-difference block, attaching the bundles as artifacts; it never pushes, never opens a pull request, and never edits a golden. It is not push-triggered, so the repository still has two push-triggered workflow files. Its standards compliance, including the compensator for an opened issue, is written at the top of the workflow file.
6. **A fixture per bug.** Each defect a bundle reveals is fixed in its own slice with the bundle added to `fixtures/corpus/`; the job then carries it forever. This dispatch adds the first two: a bundle of the walker's stall on flat ground that T4 characterized, and a bundle of the product scene's rebuild at quantum 260. Both replay green today, since the engine reproduces them exactly; they are there so a fix is measured against the same run.
7. **Sleep reads the right world.** `world.sleeping(id)` reads the process-wide solver snapshot, so on a product world that has not stepped it reports whichever world stepped last (found by the S2 builder). Before a bundle can be trusted this is fixed: a product world remembers whether it is the world the binary holds, and `sleeping` on a world that is not refuses with a reason instead of answering for another. A test builds two worlds and requires the refusal.
8. **Costs on record.** The job prints replay cost per quantum, sparse image size, and restore time, and the pull request states them for the product scene.
9. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.

## Acceptance

- A planted failure writes a bundle, and `replay <bundle>` reproduces the same first-difference block.
- A bundle with an image restores and reruns identically, is refused from another digest, and its sparse form restores to an image whose digest matches.
- `corpus.yml` runs once by `workflow_dispatch` on the branch, green, with its run linked; it opens an issue on a planted failure in a throwaway run, and that issue is closed and the throwaway reverted.
- `sleeping` on a world the binary does not hold refuses, in a test.
- Typecheck clean, tests at or above the count on `main`, three engines print the goldens, digest unchanged unless pin 7 changes the binary, Atlas check green, two push-triggered workflow files.

## Not in T5

No fix to the walker's stall or the rebuild at a driven-set change, no reachability sweep, no model in the loop, no daily schedule, no push from any job.
