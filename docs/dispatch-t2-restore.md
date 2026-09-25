# Dispatch T2 — restore

2026-09-25, revised the same day. Coordinator: Claude. Builder: the seat that built the first version. Reviewer: a different family, on a scratch clone, before merge. Depends on T1, merged. The plan row is T2 in `docs/PHASE-2.md`. Findings 6 and 12 of `docs/study-swarm/testing-3d.dispatch.md`, and answers 1 to 4 of `docs/rust-kb-answers.md`.

## Why this is revised

The first version asked the binary to rebuild a Rapier world from a snapshot and write the warm-start impulses back. Its builder did that and its restore-then-rerun test showed the snapshot was not the whole state, so the law was changed to rebuild a fresh world every quantum and carry the impulses across (PR #43). The Rust knowledge base then showed two things, checked against the pinned sources. First, rapier3d-f64 0.35.3 has no sound public path that writes a contact manifold point; the engine's write went through `core::ptr::from_ref(pair) as *mut ContactPair`, which is undefined behaviour, on `main` since E2 in `solver_clear_warmstart` and at the core of PR #43. Second, even a sound write of all seven warm-start floats does not reproduce the next step, because the solver also reads the frozen lever arms, parry's persisted point geometry, the recycle state, and the pair colours that set the solver's order, all crate-private (answers 1 to 3). No write-back route can reproduce Rapier's own continuous run. PR #43 is closed unmerged; its restore harness, its refusal tests, and its finding carry over.

## What it is

Rapier's running world is the law, exactly as on `main`. A world is restored two ways, both sound by construction because neither writes into Rapier: by replaying the seed and the log to a tick, and by copying the WebAssembly module's whole linear memory, which is every byte of Rapier's state, including the private parts no call can reach. The first is the proof; the second is the checkpoint T6's sweep needs.

## Pins

1. **The law is `main`'s.** `solver/src/rapier_law.rs` keeps one Rapier world running across quanta. Nothing from PR #43's per-quantum rebuild, `pairs_mut`, `carry_warmstart`, or `solver_restore` enters. `solver_clear_warmstart` is removed from `main`'s law and from the binding, with the cast; the product golden stays `fd2f6c03fb982d77` and no fixture moves. The binary changes once, for that removal, and the Linux digest is re-pinned from CI.
2. **Restore by replay.** `harness/replay-to.mjs` exports `replayTo(spec, tick)`: it builds a fresh world from the spec's world, replays the admitted inputs up to `tick`, and returns the world. `harness/restore.test.js`, for the product scene and every case of every behaviour fixture: run to a third of the way and keep the T1 trace from there to the end; then `replayTo` the same tick in a fresh world, run the remainder, and require `first-difference` to report `identical`. The replay cost per quantum is measured and printed by the test once, so the number is on record.
3. **Checkpoint by image.** The module that `solver/build.mjs` generates exports `imageSolver()`, returning `{ digest, bytes }`: a copy of the instance's whole linear memory and the SHA-256 of the running binary's bytes, plus an FNV digest of the image; and `restoreImage(image)`, which writes the bytes back and returns true, or returns false and changes nothing when the binary digest differs, the length differs, or the image digest does not match its bytes. An image is taken only between exported calls, when the stack pointer is at its base, so linear memory is the whole state; the generated module's comment says so. `world.save()` returns the body records, the lifted and carried sets, and the image; `world.restore(save)` puts them back.
4. **Image restore reruns identically.** The same fixtures and the product scene: take an image a third of the way, continue to the end with the T1 trace, restore the image, run the remainder, and require `identical`. Then restore the same image twice in a row and require the second rerun to match too, so a restore is shown to be repeatable. Image size, copy-out time, and copy-in time are printed once.
5. **Refusals that go red.** An image from a binary with a different digest is refused; an image of the wrong length is refused; an image with one byte changed is refused by its digest; each with a test. A restore whose rerun was planted to differ by one velocity after the restore is caught by the diff, in a test, so the harness cannot pass vacuously.
6. **What replaces the clear test.** `solver_clear_warmstart` proved the warm-start cache is inside the hash by clearing it in place. Two tests replace it without writing into Rapier: the snapshot of a resting stack carries non-zero warm-start fields, and flipping those bytes in a copy of the snapshot changes the hash that mixes them; and a structural test that every manifold point in the snapshot carries all seven warm-start floats. Neither proves the cache steers the next quantum, and the knowledge base showed that a pair of runs differing only in the warm-start coefficient parts on quantum 1, before any cache exists, so that is not a proof either. Steering is left unproven in this slice and the pull request says so; a sound proof needs a test-only native build and is not in T2.
7. **The tick does not change.** Saving the tick itself, with memory, minds, actions in flight, and the input log, is T5's bundle. T2 gives it the solver half and the replay function.
8. **Native tests run in release.** Rapier's `debug_assert` in the island manager fires when bodies touch at load, so any native Rust test of loading or restoring runs with `--release`.
9. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.

## Acceptance

- The law on the branch is `main`'s, with `solver_clear_warmstart` and every cast from a shared reference gone; the product golden is `fd2f6c03fb982d77`.
- Replay restore and image restore each rerun identically for the product scene and every fixture, with the T1 diff as the oracle, and the image restore is repeatable.
- The three refusals and the planted difference each have a test.
- The pull request states replay cost per quantum, image size, and copy times, and says the steering of the next quantum is unproven.
- Typecheck clean, tests at or above T1's count, three engines print the goldens from the Linux binary, digest pinned, Atlas check green.

## Not in T2

No write into Rapier's state from any path, no per-quantum rebuild, no serde of the world (held in reserve, answer 4), no tick-level save, no ARM lane, no lint, no outcome tests.
