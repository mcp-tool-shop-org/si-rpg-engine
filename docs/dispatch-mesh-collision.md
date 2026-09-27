# Dispatch — mesh collision

2026-09-27. The survey counted eleven glbs named by facet's canon docs. Armature stores no glb. The engine's fixtures have no glb. Each of the eleven is one mesh and one node, with no collision sibling in the same directory and no node named as a collider. Triangle counts run from 199,998 (`drell_rigged_mixamo.glb`) to 999,474 (both longsword files). A 32 by 32 grid of upward faces, a cell stacked when two such faces sit more than 2% of the mesh's height apart, found stacked cells in every file, including the sword and the shield. `validateScene` on a scene that adds `mesh: "canon.glb"` returns `unknown field: mesh`.

## The choice, stated contrastively

The conservative course keeps that refusal. Worlds stay boxes and a heightfield, and the eleven files stay outside the solver. This slice takes the other course. A scene may name a mesh. Load validates it. The law builds one fixed trimesh from the positions and indices in the order given. The heightfield stays the ground of a world that does not name a mesh. The product scene does not name one.

The survey found no collision sibling, so the source is the mesh the file already has. The slice does not vendor those glbs and does not read their UVs.

## Pins

1. **The field.** `mesh` is an optional scene field, `{ positions: number[], indices: number[] }`. On main, `validateScene` returns `unknown field: mesh`. The test that sends that scene is red on main and green on the branch.
2. **Validation.** `positions` has a length divisible by 3. Every value is finite. `indices` has a length divisible by 3, and each index is an integer in range. There is at least one triangle and at most 999,474, the survey's maximum. A triangle with a repeated index is refused. The reason strings name the failure. A count of 999,475 is refused. A mesh of one triangle with three distinct finite positions is accepted.
3. **The collider.** The law builds one fixed trimesh with `ColliderBuilder::trimesh`, friction 0.8 and restitution 0.0, the same pair the heightfield uses. Vertices and indices are the validated arrays, in that order. There is no JavaScript switch and no trimesh flag beyond what `trimesh` sets. The mesh bytes join the geometry the signature compares, so a changed mesh reloads the world.
4. **The outcome.** A fixture whose mesh is two triangles forming a floor, and a dynamic box set on it, sleeps with the box's bottom within the contact skin of that floor. The box does not fall through. Replay of that run matches. Restore of that run matches. On main the fixture is refused before the run, so the test is red there.
5. **What moves.** The Linux digest moves, because `solver/src/rapier_law.rs` changes, and it is pinned from CI. The product golden stays `69a671f962665563`, because the product scene gains no mesh. A law-run file moves only if that run's trace parts, and the commit names the run.

## Acceptance

- Pin 1's test is red on main and green on the branch. Pin 2's refusals each fail a dropped check.
- The outcome in pin 4 passes, including replay and restore.
- Typecheck clean. Tests at or above the count on main. Three engines print the goldens. The digest is the Linux build. Atlas check green.

## Not in this slice

No change to the product scene. No heightfield change. No UVs, no materials, and no copy of the eleven canon glbs into the repository. No reordering or quantizing of vertices. No host renderer.
