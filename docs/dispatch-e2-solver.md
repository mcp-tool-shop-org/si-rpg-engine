# Dispatch E2 — the solver is one Rust binary

2026-09-24. Verdict: **B**. The consult replies on main (`consult-reply-grok-e2-solver.md`, `consult-reply-gemini-e2-solver.md`) both said A. That answer is withdrawn. The five-operation JavaScript step is a scar from three JIT engines with three math libraries. It is the reference the migration gate runs against. It is not the law to grow. Builder: the builder seat. Reviewer: a different family, on a scratch clone, before merge. Depends on E1, merged at `23fe5fe`. Main is `f293390` or later.

## What it is

The law's step moves to Rust and is compiled to one WebAssembly binary. The binary carries its own math library, so IEEE arithmetic inside it is the same bytes on V8, SpiderMonkey, and JavaScriptCore. The hash of every quantum, replay from the seed and the admitted log, the checker classes, the pump, the host boundary, and the load gate stay. The host stays JavaScript, because it is presentation. The JavaScript kernel is not given new physics. The kinematic character controller stands: a box, a step sweep, ground snap, no floor bounce. Stacking is allowed, because the solver state that makes a stack rest is hashed instead of forbidden.

A Rapier step will not reproduce `735363523983fbb6`. The migration gate and the solver are two commits in this one pull request, in this order. The first proves the binary. The second changes the law.

## Pins

1. **The crate.** `solver/` is a Rust crate. The toolchain is pinned in `solver/rust-toolchain.toml`. CI uses that file. The target is `wasm32-unknown-unknown`, no threads, no WASI. The bytes the three shells execute are produced by the build. They are not committed.
2. **The library.** `rapier3d-f64`, with `enhanced-determinism` on and every SIMD feature off, including relaxed SIMD. f64 because the reference kernel and the E1 fixtures are JavaScript numbers. If `enhanced-determinism` does not build on that crate, stop. Do not drop to f32. Do not switch to Jolt in the same pull request.
3. **The build flags.** Precise mode, contraction off, no fast-math, subnormals not flushed. The flags are written beside the crate. A dump of them is in the pull request. Relaxed SIMD does not appear in the binary.
4. **The hash.** NaN aborts the step, as it does today. Signed zero is canonicalized to `+0` before it is mixed. Sleep is a count of quanta, never seconds. The full solver snapshot is hashed in canonical order: body poses and velocities, the sleep counter, and the warm-start impulse cache sorted by body pair. Islands and broadphase order are recomputed each step and are not hashed. An opaque heap is not a snapshot.
5. **The character.** A kinematic cuboid. Horizontal velocity is the admitted intent. Vertical velocity integrates gravity and is set to zero on a walkable snap. It is not reflected. A step is a second sweep, taken only when the body was grounded, up by at most the step height, forward, then down, and only when the floor on top of the rise is at least the stored minimum width. The slope limit is a number stored with the collider. The shape is not a capsule.
6. **Stacking.** Two dynamic boxes may rest on each other. The warm-start cache that keeps them at rest is part of the hash. A world that needs a stack is not refused.
7. **What does not move.** `harness/arith.mjs` and `fixtures/golden-arith.txt` stay `0d38671370d12d1e`. The proposer seat stays frozen and is not run. The debug view stays a projection. No zone, no new verb, no NPC.

## Gate 1 — the binary matches the reference

Port the current box step, the one E1 hashes, into the crate. `packages/tick/world.js` calls the binary for that step and does not grow a new capability. The JavaScript function remains in the tree as the reference.

- `fixtures/behavior-3d.json` replays frame for frame with the same hashes the JavaScript kernel produces.
- The product scene prints `735363523983fbb6` from the binary under V8 `15.6.61`, SpiderMonkey `156.0.1`, and JavaScriptCore `319571`.
- The arithmetic golden is unchanged.
- The shells load the module the way they load `harness/sim.mjs` today. The harness does not read the filesystem. The build writes the bytes into a module those shells can import.

This commit's message says the binary matches the reference and names `735363523983fbb6`.

## Gate 2 — the solver replaces the box step

Only after gate 1 is green. The product step becomes the Rapier world: the kinematic controller, static boxes, a static heightfield, dynamic boxes, stacking, sleep by quanta.

- `write-golden` rewrites `fixtures/golden.txt` once. The commit says the solver replaced the box step and names the new digest.
- A new behavior fixture is captured the same day: a step up onto a rise under the step height, a rise over the step height that stops the body, a walkable slope, a slope past the limit that does not walk, a snap to ground with no reflected vertical velocity, and two boxes at rest in a stack. It replays frame for frame under the binary.
- A test shows that clearing the warm-start cache changes the next quantum's hash, so the cache is actually in the snapshot.
- A test shows that `-0` and `+0` mix to the same digest, and that a NaN aborts.
- `fixtures/behavior-3d.json` still replays under the reference kernel. Its hashes do not change. The product path no longer calls the reference. No new physics is added to the JavaScript file.

## Acceptance

- Gate 1 and gate 2 are both in the pull request, in that order.
- Three engines print the new product golden from the binary. The arithmetic golden is `0d38671370d12d1e`.
- The E1 behavior fixture replays frame for frame under the reference. The new solver fixture replays frame for frame under the binary.
- The build flags in the pull request show precise mode, contraction off, subnormals retained, and no relaxed SIMD.
- `rapier3d-f64` with `enhanced-determinism` is the dependency. SIMD features are off.
- Typecheck clean. Atlas check green. The seat was not run.

## Not in E2

No Godot extension, no Unreal plugin, no zone loader, no verb beyond the move and push already admitted, no NPC, no model run. The Rust source is what a later game embed would link. This slice does not ship that embed. Content zones are E3. Further verbs are E4. NPC records are E5.

## Coordinator additions (review, 2026-09-24)

The pins above stand. These close what a WebAssembly law needs that the brief did not spell out. They are part of the contract.

8. **How the shells get the bytes.** The three shells have three different file APIs and the harness must not read the filesystem. The build emits `solver/dist/solver.mjs`, an ES module that exports the binary as a `Uint8Array` literal and a synchronous `instantiate()` built on `new WebAssembly.Module` and `new WebAssembly.Instance`. No `wasm-bindgen`, no `wasm-pack`, no JavaScript glue generator: the ABI is plain exported functions over linear memory, bodies in and out as `f64` arrays. That module is a build output and is not committed. `harness/sim.mjs`, `packages/tick/world.js`, and the debug host all import the same module.
9. **The binary is pinned.** `solver/Cargo.lock` and `solver/rust-toolchain.toml` are committed. `fixtures/solver.sha256` holds the digest of the built `.wasm` **as built on Linux**, the artifact CI runs; a Windows build differs in the path separators its dependencies embed and reports its own digest without being the pin. CI rebuilds and asserts equality before any engine runs it. A toolchain or crate bump changes that digest by pull request and either reprints the same product golden or says in the commit why the golden moved. A binary the shells run that no fixture names is a moving target.
10. **Rotation is locked this slice.** The kinematic controller and every dynamic box have rotations locked. The body record stays translation-only, so the frame contract, the log, and the E1 fixture keep their shape. Orientation and angular velocity enter the contract in a later slice with their own fixture. Tumbling crates are not E2.
11. **Rapier's controller runs the step sweep.** `KinematicCharacterController` with autostep (`max_height`, `min_width`), `max_slope_climb_angle`, `min_slope_slide_angle`, and `snap_to_ground` is the implementation of pin 5. The slope limit is the controller's angle; an angle is allowed now because the binary owns its math library. Per-collider slope limits are not this slice. The push rule keeps its verb semantics, a driven body displacing an undriven one, through the controller's dynamic-body interaction, and the four hazard scenarios pass with the same verdicts.
12. **Sleep by quanta, stated precisely.** The integration step is `1/64` and never changes. Rapier's sleep threshold is set as a count of quanta multiplied by that step, and its accumulated sleep time is the counter pin 4 hashes.
13. **The heightfield is a world record.** Gate 2's world file gains a heightfield: rows, columns, cell size, and heights. The loader validates that shape minimally for gate 2's fixture; full content validation is E3. The heights are mixed once at load, row-major, before the first frame.
14. **CI.** The pinned toolchain is installed from `rust-toolchain.toml`, the `wasm32-unknown-unknown` target is added, cargo is cached, and the job timeout rises from 10 to 20 minutes. Path filters gain `solver/**`. Atlas gains a `solver` boundary with role `code` when the directory exists, and the built module is recorded in `docs/atlas-design.md` as a generated file the map cannot follow.
15. **This rig has no Rust toolchain on the shell path.** The builder installs `rustup` and the pinned toolchain before gate 1 and puts `rustup show` in the pull request.
