# Dispatch E3 — content validated at load

2026-09-25. Coordinator: Claude. Builder: the builder seat. Reviewer: a different family, on a scratch clone, before merge. Depends on E1 and E2b, merged at `c2d132c`. The plan row is E3 in `docs/PHASE-1.md`.

## What it is

Phase 0 promised that authored content re-validates at load, whether a person or a model wrote it, and that zone identity stays as a gameplay partition above the bodies. Today the only content is one scene file with a goal, checked for shape. This slice makes the world a file the engine admits or refuses with a reason, gives it zones the tick can answer questions about and the hash covers, and lets a static box in that file carry an orientation, so a wall or a ramp can be a rotated box and not only an axis-aligned one. E2b said an oriented static box is E3's world record. It is.

## Pins

1. **The world file.** `worlds/<name>.json` is `{ name, seed, bodies, colliders, zones, heightfield?, goal? }`. Unknown fields anywhere are refused, at every level, as the scene loader does now. `bodies` are the E2b body record; the seven orientation floats are optional and default to identity and rest. `colliders` are the static record below. `zones` is an array of `{ id, minX, maxX, minY, maxY, minZ, maxZ }`. `goal` is `{ actor, zone }` where `zone` is a zone id; it is read by the host alone and the tick never sees it. Ids are unique within bodies, within colliders, and within zones; the empty string is not an id.
2. **The static record gains an orientation.** `StaticCollider` keeps `minX..maxZ` and gains optional `qx, qy, qz, qw`, default identity. A non-identity quaternion rotates the box about the centre of its `min`/`max` extent; the extent stays the local shape so every axis-aligned collider on `main` is unchanged in bytes and meaning. The loader refuses a quaternion whose norm differs from one by more than `1e-9`; content is authored, so it is refused, not renormalized. The product law builds the cuboid at that pose. The box and reference laws refuse a world with a rotated collider, with a reason: the reference kernel is E2's gate-one reference and does not grow.
3. **Admission sees the rotation.** The swept segment test for an intent transforms the segment into the collider's local frame and runs the same slab clip there, colliders still expanded by the moving body's half-extents, touching still not crossing. A path that crosses a rotated wall is refused; a path through the wall's axis-aligned bounds that misses the rotated box is admitted. Both are tests.
4. **Zones are a partition.** A body is in the zone whose box contains its centre, with `min <= c < max` on each axis so a point on a shared face has one owner. Zones may not overlap one another, so the answer is unique; overlapping zones are refused at load. `world.zoneOf(id)` returns the zone id or `null` and is exact on f64. `reachedGoal` becomes that query: the actor's zone equals the goal zone.
5. **The hash covers it.** When a world declares zones, the load hash mixes the zone table (count, then each zone's id bytes and six bounds in file order), and every quantum mixes each body's zone index as a `u32` after the body's floats, `0xffffffff` for none. A world with no zones hashes exactly as it does today, so the E1, E2, and E2b fixtures stay proofs unchanged. The product scene becomes a world with zones and a rotated ramp, so the product golden covers both; `write-golden` rewrites `fixtures/golden.txt` once with the reason in the commit. The arithmetic golden does not move.
6. **Refused at load, each with a test and a reason.** Unknown field. Duplicate id. Missing or non-finite number. A body overlapping a body. A body overlapping a static collider. A quaternion that is not unit. A degenerate zone (`min >= max` on any axis). A zone outside the colliders' extent. A zone lying entirely inside one static collider. Zones that overlap. A goal naming an actor or a zone that does not exist. A heightfield whose `heights` length is not `rows * cols`.
7. **Hazards at load, the way verbs have them.** `load world worlds/<name>.json` runs the loader, then two hazards on the product law: the world settles, meaning every body is asleep or at rest within 512 quanta with no NaN and no body below the lowest collider; and loading the file twice gives one load hash. On admission it writes the name and load hash into `worlds/index.json` and prints the hash; on refusal it prints the reason and exits 1. The host serves only a world whose file hashes to what the index holds; a drifted or unlisted world is refused before the first frame. This is the sentence in Phase 0 about content checked again before it can enter a running world.
8. **The scene file becomes a world file.** `scenes/crate-and-door.json` becomes `worlds/crate-and-door.json` with a zone named `door` and `goal: { actor: 'walker', zone: 'door' }`, and `scenes/` is gone. `fixtures/first-scene-played.json` still replays frame for frame, because a log carries the world it was played in and that world has no zones. `host --scene` becomes `host --world`; `play` and `replay` read the world from the file or the log the same way.
9. **The debug view** draws a rotated collider as its projected outline, using what E2b built for bodies, and shows the zone id of the walker beside the tick and hash. Nothing else changes in it.
10. **The binary changes once.** The collider stride grows to carry the quaternion. While the binary is being rebuilt, `rebuild_snapshot` in `solver/src/rapier_law.rs` stops skipping a body whose quaternion fails to canonicalize and returns failure instead, so a snapshot can never be silently shorter; it is unreachable today and this makes it stay unreachable by construction. Digest pinned from the Linux build as E2 set it: only Linux writes `fixtures/solver.sha256`, the Windows build reports its own digest.
11. **The seat stays frozen.** Its grammar takes nothing new. No verb changes; `move` and `push` are the only verbs until E4.
12. **The plan.** `docs/PHASE-1.md` E3 row gains one sentence saying static colliders carry an orientation and the reference law refuses it. No other prose changes.

## Acceptance

- Three engines print the new product golden from the Linux binary; the arithmetic golden is `0d38671370d12d1e`.
- Every refusal in pin 6 has a test with its reason. `load world` admits the crate-and-door world and refuses a world that fails a hazard, each with a test.
- A body sliding down a rotated ramp collider on the product law is a behavior fixture that replays frame for frame; the reference law refuses that world with a reason.
- The two admission cases in pin 3 are tests.
- `zoneOf` is tested on a body inside a zone, on a shared face, and in no zone; two worlds identical except for zone bounds give different quantum hashes.
- The host refuses an unlisted world and a drifted world, each with a test.
- `fixtures/first-scene-played.json` replays.
- Typecheck clean, 55 or more tests, Atlas check green with the map generated by the published Atlas 1.17.0, digest pinned from the Linux build.

## Not in E3

No verbs beyond `move` and `push`, no NPC, no model run, no pathfinding, no zone adjacency or graph, no oriented zones, no triggers or scripts on zones, no rotated heightfield, no content pack, no art.
