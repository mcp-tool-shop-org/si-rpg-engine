# Dispatch S1 — soundness of the law

Amended 2026-09-25 after the knowledge base reviewed it: pins 4, 5, and 7 corrected, pins 10 to 13 added.

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on T2 as rebuilt on the route the Q1 answer decides, and on T3, because all three touch `solver/src/rapier_law.rs`. Every item below comes from the Director's Rust knowledge-base session, cited by its lane; each is either compiler-measured with rustc 1.98.1 against rapier3d-f64 0.35.3 or stated as analysis.

## What it is

The law is a few hundred lines of Rust over `static mut` buffers, exported to WebAssembly and fed by JavaScript. The knowledge base found one instance of undefined behaviour, now handled by T2's route, and a set of places where the law accepts a value it should refuse, depends on a limit it does not state, or uses a form the next edition will reject. This slice closes each, with a test or a compile-time check that goes red, and moves no golden unless a pin says why.

## Pins

1. **No cast from a shared reference to a writable one, anywhere.** After T2's route lands, `solver/` contains no `from_ref(...) as *mut`, no `&mut *` over a pointer derived from `&`, and no `solver_clear_warmstart` unless the route gives it a sound form. A source test under `solver/` greps for the family and fails on any match; the knowledge base measured that rustc's `invalid_reference_casting` lint misses the field-write and the vector-of-pointers forms, so the lint alone is not the gate.
2. **The mode slot is validated.** Body slot 16 is read today as `!= 0.0` by the box step in `lib.rs` and as `== 1.0 || == 2.0`, then `== 3.0`, by `signature()` in `rapier_law.rs`, so `1.5`, `4.0`, and NaN fall through to dynamic in one and to driven in the other. Both read one function that accepts exactly `0, 1, 2, 3` and refuses anything else, NaN included, with the step returning 0. A test writes each bad value and requires the refusal.
3. **The body limit is stated.** `const _: () = assert!(MAX_BODIES <= 64);` beside the masks, because `1u64 << 64` is 1 on host and wasm with overflow checks off, so a larger limit would alias body 64 onto body 0.
4. **Signed zero in the signature.** `signature()` hashes collider bounds and heights as raw bits while the snapshot canonicalizes `-0.0`, so a collider at `-0.0` would make an identical world look different and force a reload; that premise is code reading, unreproduced, and the test settles it. The signature canonicalizes them the same way. A test builds one world with `+0.0` and one with `-0.0` in a bound and requires one load hash and no reload.
5. **Refusals cannot be dropped.** Internal refusals return `Result<(), Refusal>` where they now return `bool` or `Option`, and `solver/src/lib.rs` carries `#![deny(unused_must_use)]`, so a dropped refusal fails the build. `#[must_use]` alone only warns (measured, rustc 1.98.1). The remaining `.unwrap()`, in the function that finds a kinematic body's plan after `integrate` steps the world, becomes a refusal.
6. **Sorts stay stable.** The snapshot's pair sort keeps `sort_by`, with a comment citing the knowledge base: `sort_unstable` lost its deterministic wording in Rust 1.81 and reorders ties from 21 elements up on 1.98.1. The key cannot tie at 0.35.3; the comment says so and why the stable sort stays anyway.
7. **The build is locked.** `solver/build.mjs` runs cargo with `--locked`, passes flags through `CARGO_ENCODED_RUSTFLAGS` instead of `RUSTFLAGS` (same digest, measured; survives paths with spaces; cannot be overridden by an inherited value), and keeps its working directory at `solver/` so `rust-toolchain.toml` pins the toolchain. Environment rustflags replace the flags in `.cargo/config.toml` rather than adding to them, so every flag the build needs lives in `CARGO_ENCODED_RUSTFLAGS`. `solver/FLAGS.md` records both facts.
8. **Edition-2024 forms now.** All ten exports become `#[unsafe(no_mangle)]`, accepted under edition 2021, and the seven `static mut` reference sites take the knowledge base's short-lived `&raw mut` shape, which compiles clean under both editions and runs correctly in the wasm build. The edition stays 2021; `cargo fix --edition` does not make this change and is not used.
9. **Removal history.** Rapier's handle generations come from one counter per set raised on every removal, so removal history decides handles. The insertion-order test T3 adds gains a case with a removal and a re-insertion, and requires the load hash to reflect it.
10. **Non-finite is refused, not only NaN.** `bad()` tests NaN only, so an infinite velocity reaches Rapier, which silently disables the body and keeps its state finite; the step does not abort. `bad()` becomes `!x.is_finite()`, with tests for an infinity in a pose and in a velocity.
11. **`canon_quat` refuses what it cannot normalize.** An infinite component returns a quaternion with a NaN inside, and any component from about 1.34e154 up, where the square overflows, returns `(0, 0, 0, 0)`, which is not unit. It refuses non-finite components and scales by the largest magnitude before normalizing; the knowledge base's property-test cases become tests.
12. **The load pass's comment is true.** In `warm_broadphase`, bodies rejoin the active set because `bodies.iter_mut()` marks them modified, not because `wake_up` re-admits them; the comment says so, since any restore path that reuses the load pass depends on it.
13. **The harness digests carry 64 bits.** The hasher feeds a `u32` to both lanes, so a digest built only from `u32` input, the snapshot digest in the trace and in `fixtures/golden-behaviour.json`, has identical halves and carries 32 bits. Those digests split each byte stream across the lanes the way doubles are split, so the halves differ; the product golden and every frame hash are unchanged, and the digests in the behaviour file move once with that reason. Found by the T3 builder.
14. **The digest moves once, if it moves.** Panic locations carry line numbers, so edits to `rapier_law.rs` change the binary. The Linux digest is re-pinned once, from CI, with the reason. No golden moves unless pin 4 changes a fixture's load hash, which would mean a fixture carried a `-0.0`; the commit says so if it happens.

## Acceptance

- The source test in pin 1 exists and fails on a planted cast.
- Each of pins 2, 4, 9, 10, and 11 has a test that goes red on the bad input, and a dropped refusal fails the build.
- Pins 3, 6, 7, 8, 12, and 13 are visible in the diff, and the build passes with `--locked`.
- Typecheck clean, tests at or above the count on `main`, three engines print the goldens from the Linux binary, digest pinned, Atlas check green.

## Not in S1

No change to the route T2 takes, no new law, no edition change, no Miri run in CI (the knowledge base's Stacked and Tree Borrows analysis is recorded, not gated), no parallel feature, no bump of `rapier3d-f64` (0.36.0 changes the step's signature and moves the contact-pair fields; the pin stays at 0.35.3 through Phase 2).
