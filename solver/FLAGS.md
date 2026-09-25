# Build flags

Toolchain `1.98.1`, target `wasm32-unknown-unknown`, profile release, panic abort.

`solver/.cargo/config.toml` passes these rustc flags, and `build.mjs` repeats them because RUSTFLAGS overrides the file:

```
-C target-feature=-relaxed-simd
-C link-arg=--initial-memory=16777216
-C link-arg=--max-memory=16777216
```

The first is the pin for relaxed SIMD. On 1.98.1, `rustc --print cfg --target wasm32-unknown-unknown` lists bulk-memory, multivalue, mutable-globals, nontrapping-fptoint, reference-types, and sign-ext; neither simd128 nor relaxed-simd is on by default, and the flag keeps relaxed-simd off if a later default turns it on. The flag is not the proof: `solver/lint.mjs` is. On this toolchain `rustc -C llvm-args=-fno-fast-math` fails with `Unknown command line argument '-fno-fast-math'`, so that clang spelling is not how the flag is spelled. The base WebAssembly f64 operations are add, sub, mul, div, and sqrt. Fused multiply-add is not in that set. It arrives only with relaxed SIMD, which this build disables. Nothing in the flags flushes subnormals, so they stay subnormals.

`fixtures/solver.sha256` is the digest of `si_solver.wasm`. CI rebuilds and compares it before any engine runs the module.

The product step links `rapier3d-f64` 0.35.3 with `enhanced-determinism`. The crate's default features stay on (`dim3`, `f64`, `std`, `block-solver`). `parallel` is off. This version has no `simd-stable` or `simd-nightly` feature; `wide` is still a transitive crate and no SIMD target feature is enabled. Integration `dt` is `1/64`. Dynamic sleep uses `time_until_sleep = 32 * dt`. Contact clustering is off, so the warm-start cache in the snapshot is the manifold points.

## The pinned artifact is the Linux build

Dependencies embed source paths in panic-location strings. Before remapping, the binary carried 132 strings naming the cargo home and the user; that is why the Linux and Windows builds differed in bytes while printing the same golden. `build.mjs` passes `--remap-path-prefix` for the cargo home, the crate, and the repository. Windows still writes backslashes into each remapped remainder, so the two hosts never produce identical bytes. Therefore `fixtures/solver.sha256` is the digest of the Linux build only: CI enforces it, `build.mjs --check` on another host reports its own digest without failing, and `build.mjs` without `--check` refuses to write the digest anywhere but Linux. The golden hash, not the digest, is the cross-host invariant; the digest pins the artifact CI runs.

## The memory is fixed

Before T3 the binary declared 22 pages with no maximum and carried one `memory.grow`, in std's allocator. Wasmtime names memory growth as a host-chosen outcome, so the build now removes both:

- **Size.** The linker's `--initial-memory` and `--max-memory` are both 16777216 bytes, 256 pages. Stable rustc passes them with `-C link-arg=`; no `-Z` flag is needed. At the solver's capacity (64 bodies, 64 colliders, 256 heights, a resting pile, 2000 quanta) the growable build peaked at 71 pages, of which about 22 are the stack and static data; the product run and every test peaked at 25.
- **Allocator.** On wasm32, std's global allocator is dlmalloc 0.2.13, and it asks `memory.grow` for pages. `src/arena.rs` links the same crate at the same version (`dlmalloc = "=0.2.13"`, default features off) as the `#[global_allocator]`, with one change: its only source of memory is the span from the linker's `__heap_base` to the end of the fixed memory, handed over once. With no reference to std's system allocator, the linker drops it and no `memory.grow` remains. When the arena is exhausted an allocation fails and the binary aborts; it never grows. Both goldens and every behaviour number were unchanged by this; the digest moved once.

## The lint

`solver/lint.mjs` decodes the binary and refuses it, exit 1 with each reason, when it holds a relaxed-SIMD instruction, a `memory.grow`, or a memory whose maximum is absent or differs from its initial size. `build.mjs` runs it after every build and emits no module when it refuses; CI runs it on Linux and again on the ARM lane against the bytes it tests.

The encodings it relies on, from the WebAssembly binary format: `memory.grow` is the single opcode byte `0x40` followed by a memory index (`0x00`). SIMD instructions are the prefix byte `0xfd` followed by the sub-opcode as an unsigned LEB128; relaxed SIMD is sub-opcodes `0x100` through `0x113` (`i8x16.relaxed_swizzle` through `i32x4.relaxed_dot_i8x16_i7x16_add_s`), so each is `0xfd` then two LEB128 bytes, `0x80 0x02` through `0x93 0x02`. A byte scan cannot tell these from `0x40` as the empty block type or from the inside of any immediate, so the lint decodes the code section instruction by instruction, skipping each immediate by its encoding, and refuses an opcode it does not know rather than pass a binary it cannot read. On the pinned binary it decodes 1228 function bodies and 598036 instructions, none of them SIMD.

These are the builder's decisions for questions 5 and 6 in `docs/rust-kb-requests.md`, taken from the toolchain before `docs/rust-kb-answers.md` existed. Whether `-C target-feature=-relaxed-simd` alone guarantees the 1.98.1 backend emits none is not assumed; the lint answers it for every build.
