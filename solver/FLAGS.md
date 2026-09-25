# Build flags

Toolchain `1.98.1`, target `wasm32-unknown-unknown`, profile release, panic abort.

`solver/.cargo/config.toml` passes one rustc flag:

```
-C target-feature=-relaxed-simd
```

That is the pin for relaxed SIMD. On this toolchain `rustc -C llvm-args=-fno-fast-math` fails with `Unknown command line argument '-fno-fast-math'`, so that clang spelling is not how the flag is spelled. The base WebAssembly f64 operations are add, sub, mul, div, and sqrt. Fused multiply-add is not in that set. It arrives only with relaxed SIMD, which this build disables. Nothing in the flags flushes subnormals, so they stay subnormals.

`fixtures/solver.sha256` is the digest of `si_solver.wasm`. CI rebuilds and compares it before any engine runs the module.

The product step links `rapier3d-f64` 0.35.3 with `enhanced-determinism`. The crate's default features stay on (`dim3`, `f64`, `std`, `block-solver`). `parallel` is off. This version has no `simd-stable` or `simd-nightly` feature; `wide` is still a transitive crate and no SIMD target feature is enabled. Integration `dt` is `1/64`. Dynamic sleep uses `time_until_sleep = 32 * dt`. Contact clustering is off, so the warm-start cache in the snapshot is the manifold points.
