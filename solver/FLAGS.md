# Build flags

Toolchain `1.98.1`, target `wasm32-unknown-unknown`, profile release, panic abort.

`solver/.cargo/config.toml` passes one rustc flag:

```
-C target-feature=-relaxed-simd
```

That is the pin for relaxed SIMD. On this toolchain `rustc -C llvm-args=-fno-fast-math` fails with `Unknown command line argument '-fno-fast-math'`, so that clang spelling is not how the flag is spelled. The base WebAssembly f64 operations are add, sub, mul, div, and sqrt. Fused multiply-add is not in that set. It arrives only with relaxed SIMD, which this build disables. Nothing in the flags flushes subnormals, so they stay subnormals.

`fixtures/solver.sha256` is the digest of `si_solver.wasm`. CI rebuilds and compares it before any engine runs the module.
