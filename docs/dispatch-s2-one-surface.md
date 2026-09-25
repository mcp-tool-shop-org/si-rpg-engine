# Dispatch S2 — one surface

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on nothing; it touches the tick, not the binary. Found by the Director's Rust knowledge-base session (rapier-shapes-kcc lane, native runs at rapier3d-f64 0.35.3 and parry3d-f64 0.30.2) and confirmed by the coordinator against the parry source.

## What it is

The verb predicates stand on `world.supportAt`, and on a heightfield that reads `heightfieldSupport` in `packages/tick/world.js`, which interpolates bilinearly across a cell. The physics does not have that surface. Parry builds each heightfield cell as two triangles: with no subdivision flag set, which is how `build_world` builds it, the triangles are `(p00, p10, p01)` and `(p10, p11, p01)`, so the cell is cut along the diagonal from `(x0, z1)` to `(x1, z0)` (`parry3d-f64-0.30.2/src/shape/heightfield3.rs`, `triangles_at`, around line 338). At the centre of a cell with one off-diagonal corner raised by 1, the tick reads 0.25 and the solver's surface is at 0. A climb, a carry, or a drop can therefore be admitted or refused against ground that is not there. This slice gives the tick the physics' surface, and the physics becomes the oracle for it.

## Pins

1. **The split.** `heightfieldSupport` finds the cell and the fractions `tx` along x and `tz` along z as today, then returns the height of the triangle the point lies in: for `tx + tz <= 1`, the plane through `p00`, `p10`, `p01`, which is `y00 + tx * (y01 - y00) + tz * (y10 - y00)`; otherwise the plane through `p10`, `p11`, `p01`, which is `y11 + (1 - tx) * (y10 - y11) + (1 - tz) * (y01 - y11)`. Here `y00` is row `i0` column `j0`, `y10` is row `i0 + 1` column `j0`, and `y01` is row `i0` column `j0 + 1`, rows advancing z and columns advancing x, as the world record stores them. A comment cites the parry function and says the law sets no subdivision flag; if a later slice sets one, this function changes with it.
2. **The physics is the oracle.** `harness/surface.test.js` builds heightfields with one corner raised in a cell, each of the four corners in turn, plus a random field from a fixed seed. At a grid of points inside cells, including cell centres, points on the diagonal, and points on cell edges, it drops a small dynamic box on the product law, lets it sleep, and requires `supportAt` at that point to equal the box's resting bottom within the contact skin. With the bilinear function the centre cases fail; the test is shown red on `main` in the pull request.
3. **The exact cases.** Beside the oracle test, plain assertions: the centre of a cell with an off-diagonal corner raised by 1 reads 0; with an on-diagonal corner raised by 1 it reads 0.5; a point on a cell edge reads the linear interpolation along that edge in both functions.
4. **What moves.** `supportAt` feeds the climb, carry, and release predicates and their hazard scenarios. Each fixture and hazard scenario on a heightfield is rerun; if an admission changes, the fixture moves and the commit names the scenario and why. The product golden moves only if the product scene admits differently, and the commit says so if it does. The binary does not change.
5. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.

## Acceptance

- The oracle test is red on `main` and green on the branch; the exact cases pass.
- Every fixture and hazard on a heightfield is accounted for in the pull request: unchanged, or moved with the reason.
- Typecheck clean, tests at or above the count on `main`, three engines print the goldens, digest unchanged, Atlas check green.

## Not in S2

No change to the binary, no heightfield flags, no change to how the law builds a heightfield, no mesh collision.
