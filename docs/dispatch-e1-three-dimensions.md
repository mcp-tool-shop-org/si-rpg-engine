# Dispatch E1 — the body record in three dimensions

2026-09-24. Coordinator: Claude. Builder: the builder seat. Reviewer: a different family, on a scratch clone, before merge. Depends on nothing; main is `64b827b` or later.

## What it is

The world the tick simulates becomes three-dimensional, as Phase 0 promised. Every body has a position, a velocity, and a half-extent on three axes. Every static collider is a 3D box. The step, the contact rules, the swept admission test, and the hash cover all three axes. Nothing else changes: the pipeline, the pump, the log, the checker classes, the load gate, and the host boundary are as they are.

## Pins

1. **Axes.** `x` and `z` are the ground plane; `y` is up, and gravity acts on `y`. A body is `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`. A static collider is `{ id, minX, maxX, minY, maxY, minZ, maxZ }`. The old `hw` and `hh` are gone, not aliased. The contract in `packages/frame/types.d.ts` says so and the typecheck enforces it everywhere.
2. **The step.** Undriven drag applies to `vx` and `vz`. Integration is three axes. Static resolution picks the smallest of six penetrations and reflects that axis. Body-body resolution picks the smallest of three overlaps with the same driven and undriven rules as today, applied on that axis. The speed clamp uses the three-axis magnitude with one square root. Five operations only.
3. **Admission.** The swept test is Liang-Barsky against six planes, with the collider expanded by the actor's three half-extents. Touching a face or an edge is not a crossing, as the resting-body fix says. `move` targets a point on the ground plane, `{ x, z }`, and the actor's horizontal velocity points from its position to that point at the rule's speed, so a move is no longer sideways only. `push` targets a body as now. Reachability, range, and quanta use ground-plane distance.
4. **The hash.** `mixQuantum` mixes `x, y, z, vx, vy, vz` per body in that order. A belief or body-draft admission mixes what it mixes today. Nothing else enters.
5. **The product scene.** `harness/product-scene.mjs` becomes 3D and fires every branch on the first quantum: each of the six static faces, a corner on each axis, the speed clamp, a driven body meeting an undriven one on each of the three axes. The Node test asserts each. `write-golden` rewrites `fixtures/golden.txt` once; the commit says the law went 3D. `fixtures/golden-arith.txt` and `harness/arith.mjs` do not change.
6. **Fixtures.** The 2D captures cannot replay under a 3D law. `legacy-play-log.json`, `behavior-1c.json`, `push-play-log.json`, and `first-scene-played.json` stay in the tree and their tests become boundary tests: each asserts the loader refuses a 2D body record with a stated reason, so the files are a record and not a lie. New captures replace them the same day: a 3D behavior fixture with a fall, a slide, a push, and contact on the third axis, replayed frame for frame.
7. **The hazards and verbs.** The four hazard scenarios go 3D with the same verdicts. `predicates/intents/move.json` and `push.json` are re-admitted through `load admit` in the pull request, and the output is shown.
8. **The scene file and the debug view.** `scenes/crate-and-door.json` becomes a 3D world file or is deleted; the loader validates the 3D record. The debug view draws a projection, one axis chosen by a key, and says which projection it is showing. It is a debug view and gets nothing else.
9. **The proposer seat.** Its grammar and prompt take the 3D fields. It stays frozen and is not run.

## Acceptance

- Three engines print the new product golden; the arithmetic golden is unchanged.
- A body falls, lands, slides in `x` and `z`, is pushed on `x` and on `z`, and is stopped by a wall on each ground axis, with a test for each.
- The 3D behavior fixture replays frame for frame; each retired 2D fixture is refused with a reason by a test.
- Four hazards pass for `move` and `push`.
- Typecheck clean; no `hw` or `hh` remains in the tree.
- Atlas check green.

## Not in E1

No solver beyond boxes, no slopes, no rotation, no content zones, no new verbs, no NPC, no model run. Those are E2 through E5.
