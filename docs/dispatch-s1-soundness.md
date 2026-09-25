# Dispatch S1 — soundness of the law

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on T2 as rebuilt on the route the Q1 answer decides, and on T3, because all three touch `solver/src/rapier_law.rs`. Every item below comes from the Director's Rust knowledge-base session, cited by its lane; each is either compiler-measured with rustc 1.98.1 against rapier3d-f64 0.35.3 or stated as analysis.

## What it is

The law is a few hundred lines of Rust over `static mut` buffers, exported to WebAssembly and fed by JavaScript. The knowledge base found one instance of undefined behaviour, now handled by T2's route, and a set of places where the law accepts a value it should refuse, depends on a limit it does not state, or uses a form the next edition will reject. This slice closes each, with a test or a compile-time check that goes red, and moves no golden unless a pin says why.

## Pins

1. **No cast from a shared reference to a writable one, anywhere.** After T2's route lands, `solver/` contains no `from_ref(...) as *mut`, no `&mut *` over a pointer derived from `&`, and no `solver_clear_warmstart` unless the route gives it a sound form. A source test under `solver/` greps for the family and fails on any match; the knowledge base measured that rustc's `invalid_reference_casting` lint misses the field-write and the vector-of-pointers forms, so the lint alone is not the gate.
2. **The mode slot is validated.** Body slot 16 is read today as `!= 0.0` by the box step in `lib.rs` and as `== 1.0 || == 2.0`, then `== 3.0`, by `signature()` in `rapier_law.rs`, so `1.5`, `4.0`, and NaN fall through to dynamic in one and to driven in the other. Both read one function that accepts exactly `0, 1, 2, 3` and refuses anything else, NaN included, with the step returning 0. A test writes each bad value and requires the refusal.
3. **The body limit is stated.** `const _: () = assert!(MAX_BODIES <= 64);` beside the masks, because `1u64 << 64` is 1 on host and wasm with overflow checks off, so a larger limit would alias body 64 onto body 0.
4. **Signed zero in the signature.** `signature()` hashes collider bounds and heights as raw bits while the snapshot canonicalizes `-0.0`, so a collider at `-0.0` makes an identical world look different and forces a reload. The signature canonicalizes them the same way. A test builds one world with `+0.0` and one with `-0.0` in a bound and requires one load hash and no reload.
5. **Refusals cannot be dropped.** Every internal function returning a refusal as `bool` or `Option` is `#[must_use]`, and the remaining `.unwrap()` in `rapier_law.rs` becomes a refusal.
6. **Sorts stay stable.** The snapshot's pair sort keeps `sort_by`, with a comment citing the knowledge base: `sort_unstable` lost its deterministic wording in Rust 1.81 and reorders ties from 21 elements up on 1.98.1. The key cannot tie at 0.35.3; the comment says so and why the stable sort stays anyway.
7. **The build is locked.** `solver/build.mjs` runs cargo with `--locked`, passes flags through `CARGO_ENCODED_RUSTFLAGS` instead of `RUSTFLAGS` (same digest, measured; survives paths with spaces; cannot be overridden by an inherited value), and keeps its working directory at `solver/` so `.cargo/config.toml` applies. `solver/FLAGS.md` records that running cargo from outside `solver/` silently skips the toolchain pin.
8. **Edition-2024 forms now.** All ten exports become `#[unsafe(no_mangle)]`, accepted under edition 2021, and the seven `static mut` reference sites take the knowledge base's short-lived `&raw mut` shape, which compiles clean under both editions and runs correctly in the wasm build. The edition stays 2021; `cargo fix --edition` does not make this change and is not used.
9. **Removal history.** Rapier's handle generations come from one counter per set raised on every removal, so removal history decides handles. The insertion-order test T3 adds gains a case with a removal and a re-insertion, and requires the load hash to reflect it.
10. **The digest moves once, if it moves.** Panic locations carry line numbers, so edits to `rapier_law.rs` change the binary. The Linux digest is re-pinned once, from CI, with the reason. No golden moves unless pin 4 changes a fixture's load hash, which would mean a fixture carried a `-0.0`; the commit says so if it happens.

## Acceptance

- The source test in pin 1 exists and fails on a planted cast.
- Each of pins 2, 4, and 9 has a test that goes red on the bad input.
- Pins 3, 5, 6, 7, and 8 are visible in the diff, and the build passes with `--locked`.
- Typecheck clean, tests at or above the count on `main`, three engines print the goldens from the Linux binary, digest pinned, Atlas check green.

## Not in S1

No change to the route T2 takes, no new law, no edition change, no Miri run in CI (the knowledge base's Stacked and Tree Borrows analysis is recorded, not gated), no parallel feature.
