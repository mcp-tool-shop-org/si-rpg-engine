# Dispatch — mesh refusal

2026-09-30. Mesh collision is on main. `validateMesh` refuses a non-finite position, an index out of range, and a repeated index. `createWorld` copies a mesh through without that check. `build_world` hands the buffers to `ColliderBuilder::trimesh`, and parry 0.31.1 indexes `vertices[idx]` with no bounds check, so a bad index aborts the module. The glue keeps that instance. `harness/mesh.test.js` is not on the `npm test` list.

## The choice, stated contrastively

The conservative course leaves the check in the scene loader. A world built in code, and any later host that calls the law directly, can still trap the process. This slice takes the other course. The constructor and the law both refuse before Parry builds the mesh. A trapped call drops the cached module. A refusal does not claim the binary.

## Pins

1. **The constructor.** `createWorld` runs `validateMesh` when a mesh is present and throws that function's reason. A later good world still steps.
2. **The law.** Before `ColliderBuilder::trimesh`, an out-of-range index, a repeated index, or a non-finite vertex returns a refusal. `solver_load` returns 0. A good mesh loaded after that returns 1. A non-finite warm-start value is refused in the snapshot instead of hashed.
3. **The cache.** A `WebAssembly.RuntimeError` from a law call sets the cached instance aside. The next call instantiates a fresh one, and a good world still steps.
4. **The hold.** `hold` runs only after a load or a step that returned success. A failed step does not copy bodies back. `sleeping` on the refused world refuses. The message for a non-finite body stays `NaN`, which the existing tests match.
5. **The suite.** `harness/mesh.test.js` and the new refusal tests are on the `npm test` list.

## What moves

`solver/src/rapier_law.rs` changes, so the Linux digest moves. It is pinned from the Linux CI build, not from a Windows build. The product scene names no mesh. The product golden stays `69a671f962665563`. The arithmetic golden stays `0d38671370d12d1e`.

## Acceptance

- Pins 1 through 4 are green on the branch. Pin 1's bad index is a thrown reason, and pin 2's bad index is a zero from `solver_load`, where main traps.
- The course and the outcome tests pass. No golden is rewritten.
- Typecheck clean. The mesh sleep test runs as part of `npm test`.

## Not in this slice

No product-scene mesh. No host binding. No release tag. Codecov stays the course and the outcome tests; the scorecard says so.
