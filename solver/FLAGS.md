# Build flags

Toolchain `1.98.1`, target `wasm32-unknown-unknown`, profile release, panic abort.

`solver/.cargo/config.toml` passes these rustc flags, and `build.mjs` repeats them because RUSTFLAGS overrides the file:

```
-C target-feature=-relaxed-simd
-C link-arg=--export=__stack_pointer
```

`solver/build.rs` passes the memory to the linker for the cdylib, where RUSTFLAGS cannot drop it:

```
cargo::rustc-link-arg-cdylib=--initial-memory=33554432
cargo::rustc-link-arg-cdylib=--no-growable-memory
```

The relaxed-SIMD flag sets the default feature set only. On 1.98.1, `rustc --print cfg --target wasm32-unknown-unknown` lists bulk-memory, multivalue, mutable-globals, nontrapping-fptoint, reference-types, and sign-ext; neither simd128 nor relaxed-simd is on by default. The flag does not reach a function marked `#[target_feature(enable = "relaxed-simd")]`: in any crate of the graph such a function still compiles and emits `f64x2.relaxed_madd` under this flag, and node 22 on x86 returns the fused result (measured by the Rust knowledge-base session on 1.98.1). What keeps relaxed instructions out of the pinned binary is `solver/lint.mjs`, which refuses any of them. On this toolchain `rustc -C llvm-args=-fno-fast-math` fails with `Unknown command line argument '-fno-fast-math'`, so that clang spelling is not how the flag is spelled. The base WebAssembly f64 operations are add, sub, mul, div, and sqrt. Fused multiply-add is not in that set. It arrives only with relaxed SIMD, which the flag leaves out of the default and the lint refuses in the binary. Nothing in the flags flushes subnormals, so they stay subnormals.

`fixtures/solver.sha256` is the digest of `si_solver.wasm`. CI rebuilds and compares it before any engine runs the module.

The product step links `rapier3d-f64` 0.35.3 with `enhanced-determinism`. The crate's default features stay on (`dim3`, `f64`, `std`, `block-solver`). `parallel` is off. This version has no `simd-stable` or `simd-nightly` feature; `wide` is still a transitive crate and no SIMD target feature is enabled. Integration `dt` is `1/64`. Dynamic sleep uses `time_until_sleep = 32 * dt`. Contact clustering is off, so the warm-start cache in the snapshot is the manifold points. `max_ccd_substeps` is written as 1: at this version every fast dynamic body is swept against fixed colliders whatever its `ccd_enabled`, 0 turns that off, and above 1 a restore would need crate-private state. Heightfields carry `HeightFieldFlags::FIX_INTERNAL_EDGES`.

Any bump of the toolchain or of `rapier3d-f64` reruns the character course (`harness/course.test.js`) and the outcome tests (`harness/outcome.test.js`) before a golden may move; `write-golden` runs both first and refuses to write when either fails.

## The relaxed sites the flag keeps out

Two crates in the solver's dependency graph carry relaxed-SIMD code, both behind `#[cfg(target_feature = "relaxed-simd")]`, which `-C target-feature=-relaxed-simd` keeps false (docs/rust-kb-answers.md, answer 6):

- **matrixmultiply 0.3.11**, `src/sgemm_kernel.rs`: `muladd` becomes `f32x4_relaxed_madd` when the feature is on, and `f32x4_add(f32x4_mul(..))` otherwise.
- **wide 1.7.1**, `src/u8x16_.rs`: `shuffle` becomes `u8x16_relaxed_swizzle` when the feature is on.

The flag is what keeps these gated paths out if simd128, or a CPU level that implies relaxed SIMD, is ever turned on. The lint is what guarantees that none of them, and nothing enabled per function, reaches the pinned binary.

## The pinned artifact is the Linux build

Dependencies embed source paths in panic-location strings. Before remapping, the binary carried 132 strings naming the cargo home and the user; that is why the Linux and Windows builds differed in bytes while printing the same golden. `build.mjs` passes `--remap-path-prefix` for the cargo home, the crate, and the repository. Windows still writes backslashes into each remapped remainder, so the two hosts never produce identical bytes. Therefore `fixtures/solver.sha256` is the digest of the Linux build only: CI enforces it, `build.mjs --check` on another host reports its own digest without failing, and `build.mjs` without `--check` refuses to write the digest anywhere but Linux. The golden hash, not the digest, is the cross-host invariant; the digest pins the artifact CI runs.

## The memory is fixed

Before T3 the binary declared its memory with no maximum and carried one `memory.grow`, in std's allocator. Wasmtime names memory growth as a host-chosen outcome, so the build removes both:

- **Size.** 512 pages, 32 MiB, initial and maximum equal. `solver/build.rs` passes `--initial-memory=33554432` and `--no-growable-memory` as `cargo::rustc-link-arg-cdylib=`, which survives the RUSTFLAGS `build.mjs` sets (measured by the knowledge base; the lint confirms 512/512 on every build). No `-Z` flag is needed.
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
