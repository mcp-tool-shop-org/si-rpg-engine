---
title: World files
description: The content format, what each record holds, and every reason a file is refused.
sidebar:
  order: 3
---

A world is a JSON file under `worlds/`. Unknown fields are refused at every level.

```json
{
  "name": "crate-and-door",
  "seed": 7,
  "bodies": [
    { "id": "walker", "x": 0.5, "y": 0.6, "z": 0, "vx": 0, "vy": 0, "vz": 0, "hx": 0.25, "hy": 0.25, "hz": 0.25 },
    { "id": "crate",  "x": 2.0, "y": 0.6, "z": 0, "vx": 0, "vy": 0, "vz": 0, "hx": 0.25, "hy": 0.25, "hz": 0.25 }
  ],
  "colliders": [
    { "id": "floor", "minX": -1, "maxX": 5, "minY": -1, "maxY": 0, "minZ": -2, "maxZ": 2 }
  ],
  "zones": [
    { "id": "door", "minX": 3.3, "maxX": 4, "minY": 0, "maxY": 2, "minZ": -0.5, "maxZ": 0.5 }
  ],
  "goal": { "actor": "walker", "zone": "door" }
}
```

## Records

**Body.** `id`, position `x y z`, linear velocity `vx vy vz`, half-extents `hx hy hz`. Optional: a unit quaternion `qx qy qz qw` with `w` last, and an angular velocity `wx wy wz`. Absent orientation means identity and rest. The ground plane is `x`/`z`; `y` is up.

**Static collider.** `id` and bounds `minX maxX minY maxY minZ maxZ`. Optional: a unit quaternion that rotates the box about the centre of its bounds. The bounds stay the local shape, so an axis-aligned collider without a quaternion is unchanged in meaning by that option.

**Heightfield.** `rows`, `cols`, `cell`, and `heights`, one finite height per cell in row-major order, `rows * cols` long. Rows advance along z and columns along x. The surface is two flat triangles per cell, cut along the diagonal from the cell's (x0, z1) corner to its (x1, z0) corner, which is the surface the physics collides with and the one the actions stand on. Cell seams are smoothed so a body sliding across one does not catch.

**Zone.** `id` and bounds. Zones are a partition: a body is in the zone whose box contains its centre, with `min <= c < max` on each axis, so a point on a shared face has one owner. Zones may not overlap.

**Goal.** `actor` and `zone`, naming a body and a zone. The host alone reads it; the tick never sees it.

**Mind.** A mind belongs to one body: `{ "body": "watcher", "sight": 3, "goals": [], "beliefs": [] }`. `sight` is a radius; a body is in sight when it is within that distance and the segment between centres crosses no static collider. Goals are `{ "kind": "reach", "zone": "door" }` or `{ "kind": "use", "target": "crate" }`. Authored beliefs cite the load episode and use the key table in `predicates/beliefs/keys.json`.

## Refused at load

Each of these has a test, and the reason names the record.

| Reason | Example |
|---|---|
| unknown field | `"colour"` on a body |
| duplicate id | two bodies named `crate` |
| missing or non-finite number | `"x": "1"` or `NaN` |
| a body overlapping a body | two boxes sharing volume |
| a body overlapping a static collider | a box inside the floor |
| a quaternion that is not unit | norm off one by more than `1e-9` |
| a degenerate zone | `minX >= maxX` |
| a zone outside the colliders' extent | a zone floating past the floor |
| a zone entirely inside one static collider | a zone buried in a wall |
| zones that overlap | two zones sharing volume |
| a goal naming nothing | an actor or zone that does not exist |
| a heightfield of the wrong length | `heights` shorter than `rows * cols` |

Minds add their own: a mind on a body that does not exist, two minds on one body, a belief whose key is not in the table or whose value has the wrong type, and a goal naming a zone or body that does not exist.

The reference law, which is the JavaScript kernel the first solver commit had to match, refuses any world with a rotated collider. The product law accepts it.

## Hazards

After validation, `load world` runs the world on the product law. It must settle: every body asleep or at rest within 512 quanta, no NaN, no body below the lowest collider. Loading the file twice must give one load hash. The load hash covers everything the file holds but its name:
- the seed's bits;
- every body, with its id and numbers;
- every collider, with its id, bounds, and rotation;
- the heightfield, the zones, the minds, and the goal;
- the solver's snapshot after load.

The name is left out because the index is keyed by it. A collider nothing touches at load still moves the hash.

## The sweep

Then `load world` explores the world's reachable states with the admitted actions, as its actors could reach them one action at a time.
- **The actors** are the goal's actor and every body with a mind.
- **The states.** From each settled state it has not seen, it returns by the tick's own save and tries every admitted verb, aimed at the neighbouring grid points and at the bodies. Each action goes through the checker, so a refusal costs nothing.
- **What it refuses:**
  - a zone no explored state reached, with the zone, the actors, and the cells explored;
  - an action after which a body leaves the world, with its bundle;
  - an action after which the tick throws, with its bundle.
- **What it only reports:** an action after which the world does not settle within 512 quanta.
- **Every witness** is a log of intents from the load that `replay` reproduces, hash for hash.
- **The budget.** The sweep runs under a budget of quanta and restores. When the budget runs out first, the world is admitted and the sweep is reported as deferred. The weekly corpus job then sweeps every indexed world, every fixture world, and the product scene under a larger budget, and fails when a verdict differs from its record, `fixtures/sweep/verdicts.json`.
- **The action set.** A route that needs two actors at once is not explored, so a refusal reads as "not reached by these actions", never as a proof of the impossible.

## The index

`worlds/index.json` maps each admitted world's name to its load hash. The host refuses a world that is not listed or whose file no longer hashes to its entry, so content that changed after admission cannot enter a running world.
