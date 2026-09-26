# Build flags

Toolchain `1.98.1`, target `wasm32-unknown-unknown`, profile release, panic abort.

`solver/.cargo/config.toml` passes these rustc flags:

```
-C target-feature=-relaxed-simd
-C link-arg=--export=__stack_pointer
```

`build.mjs` passes them again, with the three `--remap-path-prefix` flags below, in `CARGO_ENCODED_RUSTFLAGS`, and runs `cargo build --release --locked` with its working directory at `solver/`, so `rust-toolchain.toml` pins the toolchain and no dependency outside `Cargo.lock` is resolved. Two facts decide that shape (S1 pin 7):

- **Environment rustflags replace the flags in `.cargo/config.toml`; they do not add to them.** So every flag the build needs lives in `CARGO_ENCODED_RUSTFLAGS`, and the file's copy serves a bare `cargo build` only.
- **`CARGO_ENCODED_RUSTFLAGS` instead of `RUSTFLAGS`.** It builds the same digest (measured by the knowledge base). Its flags are separated by `0x1f`, not spaces, so a path with a space in it stays one flag, and it takes precedence over `RUSTFLAGS`, so a value inherited from the environment cannot override the build's flags. `build.mjs` also drops any inherited `RUSTFLAGS`.

`solver/build.rs` passes the memory to the linker for the cdylib, where environment rustflags cannot drop it:

```
cargo::rustc-link-arg-cdylib=--initial-memory=33554432
cargo::rustc-link-arg-cdylib=--no-growable-memory
```

The relaxed-SIMD flag sets the default feature set only. On 1.98.1, `rustc --print cfg --target wasm32-unknown-unknown` lists bulk-memory, multivalue, mutable-globals, nontrapping-fptoint, reference-types, and sign-ext; neither simd128 nor relaxed-simd is on by default. The flag does not reach a function marked `#[target_feature(enable = "relaxed-simd")]`: in any crate of the graph such a function still compiles and emits `f64x2.relaxed_madd` under this flag, and node 22 on x86 returns the fused result (measured by the Rust knowledge-base session on 1.98.1). What keeps relaxed instructions out of the pinned binary is `solver/lint.mjs`, which refuses any of them. On this toolchain `rustc -C llvm-args=-fno-fast-math` fails with `Unknown command line argument '-fno-fast-math'`, so that clang spelling is not how the flag is spelled. The base WebAssembly f64 operations are add, sub, mul, div, and sqrt. Fused multiply-add is not in that set. It arrives only with relaxed SIMD, which the flag leaves out of the default and the lint refuses in the binary. Nothing in the flags flushes subnormals, so they stay subnormals.

`fixtures/solver.sha256` is the digest of `si_solver.wasm`. CI rebuilds and compares it before any engine runs the module.

The product step links `rapier3d-f64` 0.35.3 with `enhanced-determinism`. The crate's default features stay on (`dim3`, `f64`, `std`, `block-solver`). `parallel` is off. This version has no `simd-stable` or `simd-nightly` feature; `wide` is still a transitive crate and no SIMD target feature is enabled. Integration `dt` is `1/64`. Dynamic sleep uses `time_until_sleep = 32 * dt`. Contact clustering is off, so the warm-start cache in the snapshot is the manifold points. `max_ccd_substeps` is written as 1: at this version every fast dynamic body is swept against fixed colliders whatever its `ccd_enabled`, 0 turns that off, and above 1 a restore would need crate-private state. Heightfields carry `HeightFieldFlags::FIX_INTERNAL_EDGES`.

Any bump of the toolchain or of `rapier3d-f64` reruns the character course (`harness/course.test.js`) and the outcome tests (`harness/outcome.test.js`) before a golden may move; `write-golden` runs both first and refuses to write when either fails. A bump of `rapier3d-f64` reruns the controller's control test and the push's control test before either (below).

## The character controller is the engine's copy

The law moves every character through `solver/src/kcc.rs`, the engine's copy of Rapier's `KinematicCharacterController::move_shape` and the private functions it calls, from rapier3d-f64 0.35.3 (F2). It adds one branch to `decompose_hit`: when the hit normal crossed with `up` has no direction, the tangent's part along `up` is vertical and the rest horizontal, where Rapier files all of it as vertical. With a floor normal vertical but for its last bit, which GJK returns on about one flat-ground quantum in 30 at the product walker's speed, Rapier's routine keeps none of the horizontal travel (https://github.com/dimforge/rapier/issues/1019); the product walker lost 332 of 10,000 quanta that way at the origin and 323 at an offset of a million. The routine is unchanged at rapier 0.36.0. The file is under the Apache License 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`); the rest of the repository is MIT.

The copy is part of the law, and a bump of `rapier3d-f64` is a change to it:

1. Re-sync `kcc.rs` from the new version's `src/control/character_controller.rs`, applying upstream's changes to the copied functions. The file's header lists what was copied, with line numbers, and every place the copy differs from the source.
2. Run the control test first: `cargo test --release --locked` in `solver/`, test `the_copy_with_its_branch_off_moves_the_character_as_rapiers_controller_does_bit_for_bit`. It calls Rapier's own controller and the copy with the branch off with the same inputs at every quantum of the flat walk at the origin and at 1e6, the ten course cases, the 0.29 step from 20 starts in four directions, and the verb fixture's capsule carry, and at zero desired translation, and requires every movement to match bit for bit. A copy that parts from Rapier fails it with the run, the quantum, and both movements.
3. Then the course and the outcome tests, and only then may a golden move.

If upstream has fixed the degenerate case, the branch and the copy can go together, and the law calls Rapier's routine again.

## The character's push is the engine's copy

After the characters move, the law pushes the dynamic bodies each one touched through `solver/src/impulses.rs`, the engine's copy of Rapier's `KinematicCharacterController::solve_character_collision_impulses` and the private function it calls for one collision, from rapier3d-f64 0.35.3 (F3), with the character mass of 1 it always passed. It carries one change, which is Rapier's own: pull request dimforge/rapier#1004 (commit bd7a2f2e, released in 0.36.0) gathers each dynamic collider's contact manifolds into a vec of their own. At 0.35.3 they share one, and for a convex pair parry writes into the vec's first manifold instead of appending, so when two dynamic bodies are near the character the second body's manifold replaces the first's, and the first body is pushed at the second body's contact points. In red room A (`fixtures/push/red-room-a.json`) that launched the crate at 26.06 units a second at tick 53; through the copy no body in the room moves faster than 2.05. The file is under the Apache License 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`); the rest of the repository is MIT.

The native tests replay the product's own runs. `fixtures/law-runs/` holds, for the product scene, every behaviour fixture run on the product law, and every fixture with a push, what the tick hands the solver: the records the load wrote, and before each quantum each slot the tick wrote differently from what the law left. `harness/law-runs.mjs --write` records them, and `harness/push.test.js` fails until each file is the tick's own. Pushed through the law's own push, each replays to its file's digest of every quantum's records and snapshot (`each_law_run_replays_through_the_law_to_the_product_binarys_digest`).

The copy is part of the law, and a bump of `rapier3d-f64` is a change to it:

1. Run the push's control test first, beside the controller's: `cargo test --release --locked` in `solver/`, test `the_copy_with_its_change_off_pushes_as_rapiers_routine_does_bit_for_bit`. It gives Rapier's own routine, the copy with the change off, and the copy with the change on the same world before every push of the flat walks, the ten course cases, the capsule carry, and every law run, and compares the body sets after each push whole. The copy with the change off must leave them as Rapier's routine does, and run whole it must keep every quantum with it; the copy with the change on may differ only on a quantum on which a collision had two or more dynamic colliders near the character. A copy that parts from Rapier fails it with the run, the quantum, and where the two sets differ. Its red is `the_change_parts_from_rapiers_routine_in_red_room_a_only_where_two_dynamic_colliders_are_near`.
2. A version that carries #1004, 0.36.0 or later, retires the copy: the law pushes through Rapier's routine again, and `impulses.rs`, its NOTICE entry, and its control test go.
3. The guard stays either way. #1004 removes the overwrite, not the amplifier: the impulse's mass ratio counts linear mass only, so a light body pushed at points far from its centre over-corrects, and 0.36.0 keeps that ratio. `no_body_leaves_a_push_faster_than_eight_times_its_pushers_speed_and_through_rapiers_routine_red_room_a_does` fails when a body leaves a push, or ends the quantum's step, faster than eight times the speed its character is driven at, over every law run. Eight sits above what an ordinary push reaches: the engine's smallest crate, struck square on its face and listed twice or more among the character's collisions, leaves at 6.375 times the character's speed along the normal (4.575 listed once), the knowledge base's measurement on rapier3d-f64 0.36.0, which `a_crate_listed_twice_among_the_collisions_leaves_the_push_at_about_six_and_a_half_times_the_pushers_speed_under_the_guard` reproduces through the law's push; eight is 1.25 times that. Over every law run the highest is 3.70 as the push leaves the body (the verb fixture's carry, the crate as the walker reaches it) and 2.88 after the step. Eight sits below the launch: through Rapier's 0.35.3 routine red room A goes over at quantum 53, at 25.27 times the pusher's speed, 3.16 times the bound. `harness/push.test.js` holds every fixture with a push to the same bound on the product binary. A fix to the mass ratio itself changes every push of a light body and is a slice of its own; the guard's multiple is measured again then.

## The toolchain is part of the law

A toolchain bump can move results with `Cargo.lock` untouched (S1 pin 14, measured by the knowledge base's float-determinism lane). `enhanced-determinism` routes the math in simba and glam through the crates.io `libm`, but parry and glamx call some transcendentals as methods, and on wasm32 those resolve to the toolchain's own copy of libm. A build of `solver/` links the toolchain's `sin`, `cos`, `acos`, and `log2` beside crates.io `libm`, and `log2` is reachable from `solver_step` through parry's tree optimizer. The toolchain's `hypot` already differs from `libm` 0.2.16 on a 100,000-input sweep. So the pin in `rust-toolchain.toml` is a pin of the law's arithmetic, not only of the compiler: any toolchain bump reruns the T4 course and the outcome tests above before a golden may move, as a bump of `rapier3d-f64` does.

Two rules the law keeps, for the same reason:

- **No explicit `mul_add`.** It computes a fused result: deterministic on wasm, where it runs in software, but a different number from the multiply and the add it replaces.
- **No iteration over a `hashbrown` map where the order reaches the hash.** Its default hasher is randomly seeded, so the order can differ from run to run. Rapier's own maps are `IndexMap`s under `enhanced-determinism`; a map the law adds must be one too, or never be iterated into the snapshot.

## The relaxed sites the flag keeps out

Two crates in the solver's dependency graph carry relaxed-SIMD code, both behind `#[cfg(target_feature = "relaxed-simd")]`, which `-C target-feature=-relaxed-simd` keeps false (docs/rust-kb-answers.md, answer 6):

- **matrixmultiply 0.3.11**, `src/sgemm_kernel.rs`: `muladd` becomes `f32x4_relaxed_madd` when the feature is on, and `f32x4_add(f32x4_mul(..))` otherwise.
- **wide 1.7.1**, `src/u8x16_.rs`: `shuffle` becomes `u8x16_relaxed_swizzle` when the feature is on.

The flag is what keeps these gated paths out if simd128, or a CPU level that implies relaxed SIMD, is ever turned on. The lint is what guarantees that none of them, and nothing enabled per function, reaches the pinned binary.

## The pinned artifact is the Linux build

Dependencies embed source paths in panic-location strings. Before remapping, the binary carried 132 strings naming the cargo home and the user. `build.mjs` passes `--remap-path-prefix` for the cargo home, the crate, and the repository. Of the three, only the cargo-home remap changes bytes today; the crate and repository remaps are guards against a path of either reaching the binary later, and they are kept.

Two causes keep another host's bytes from matching the Linux build, and path separators are only the first (S1 pin 7, measured by the knowledge base's ci-reproducible-builds lane):

- **Separators.** Windows writes backslashes into each remapped remainder.
- **The host triple.** Cargo hashes build scripts and proc-macros with the build machine's host triple, and every wasm crate inherits that hash through `-C metadata`. Replacing every backslash still leaves the Windows bytes different. The same mechanism very likely makes x86_64 and aarch64 Linux builds differ too, which is why T3's ARM lane downloads the x64 artifact and checks its digest instead of rebuilding.

Therefore `fixtures/solver.sha256` is the digest of the x86_64 Linux build only: CI enforces it, `build.mjs --check` on another host reports its own digest without failing, and `build.mjs` without `--check` refuses to write the digest anywhere but Linux. The golden hash, not the digest, is the cross-host invariant; the digest pins the artifact CI runs.

## The memory is fixed

Before T3 the binary declared its memory with no maximum and carried one `memory.grow`, in std's allocator. Wasmtime names memory growth as a host-chosen outcome, so the build removes both:

- **Size.** 512 pages, 32 MiB, initial and maximum equal. `solver/build.rs` passes `--initial-memory=33554432` and `--no-growable-memory` as `cargo::rustc-link-arg-cdylib=`, which survives the environment rustflags `build.mjs` sets (measured by the knowledge base; the lint confirms 512/512 on every build). No `-Z` flag is needed.
- **Why 512.** The need scales with contact manifolds, not with body count. Under the persistent law the knowledge base measured 21 pages for the product harness over 10,000 quanta, 49 for a settling pile of 64 boxes on a full heightfield, and 147 for 64 heavily overlapping boxes. `harness/caps.test.js` runs 64 overlapping boxes against 64 static colliders for 1,000 quanta and prints the heap's high-water mark: 138 pages. 512 is between three and four times that.
- **A denser world traps, the same way on every host.** No fixed size covers every world the buffer caps admit: 64 boxes on one spot over a full heightfield need about 3,320 pages. When the heap is exhausted an allocation fails and the binary traps with `unreachable`; the memory does not grow, so no host can succeed where another fails. `harness/caps.test.js` holds that too.
- **Allocator.** On wasm32, std's global allocator is dlmalloc 0.2.13, and it asks `memory.grow` for pages. `src/arena.rs` links the same crate at the same version (`dlmalloc = "=0.2.13"`, default features off) as the `#[global_allocator]`, with one change: its only source of memory is the span from the linker's `__heap_base` to the end of the fixed memory, handed over once. With no reference to std's system allocator, the linker drops it and no `memory.grow` remains. The arena also keeps the heap's high-water mark in linear memory, exported as `heap_high_water`.
- **Images.** T2's image of linear memory is now always the full 512 pages. `harness/caps.test.js` prints its size and copy times at this memory.

Both goldens and every behaviour number were unchanged by the fixed memory; the digest moved.

## The lint

`solver/lint.mjs` decodes the binary and refuses it, exit 1 with each reason, when it holds:

- a relaxed-SIMD instruction, a `memory.grow`, or a `table.grow`, whose results or success a host may choose;
- a memory whose maximum is absent or differs from its initial size;
- a start section, a passive data segment, a passive or declared element segment, or any of `memory.init`, `data.drop`, `table.init`, `elem.drop`. T2's image is the whole state only while memory is initialised by active segments and nothing runs at instantiation; the knowledge base measured every build so far at 0 imports, no start, 2 active data segments and 1 active element segment, and a move toward shared memory would change that silently.

`build.mjs` runs it after every build and emits no module when it refuses; CI runs it on Linux and again on the ARM lane against the bytes it tests.

The encodings it relies on, from the WebAssembly binary format: `memory.grow` is the opcode byte `0x40` followed by a memory index; `table.grow` is `0xfc` then 15; SIMD instructions are the prefix byte `0xfd` followed by the sub-opcode as an unsigned LEB128, and relaxed SIMD is sub-opcodes `0x100` through `0x113` (`i8x16.relaxed_swizzle` through `i32x4.relaxed_dot_i8x16_i7x16_add_s`), canonically `fd 80 02` through `fd 93 02`. Every LEB128 may be padded, so `fd 80 82 80 80 00` is a relaxed swizzle and `40 80 00` is a `memory.grow`. A byte scan cannot tell these from `0x40` as the empty block type or from the inside of an immediate (`i32.const 32893` is `41 fd 80 02`), so the lint decodes the code section instruction by instruction, reading every LEB128 with its padding, decoding multi-byte value types in `select t*` and in block types, and refusing any opcode it does not know, including an unassigned `0xfd` sub-opcode below `0x100`, rather than pass a binary it cannot read.

`-C target-feature=-relaxed-simd` alone does not guarantee the 1.98.1 backend emits none: a per-function `target_feature` overrides it. The lint's decode is the guarantee, and `solver/lint.test.js` plants every opcode from `0x100` through `0x113`, the padded encodings, and one module for each other refusal, to prove it catches each.
