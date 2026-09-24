# Dispatch 1D — the scene, played

2026-09-24. Coordinator: Claude. Builder: the builder seat. Reviewer: a different family, on a scratch clone, before merge. Depends on 1C (PR #14) on `main`.

## What it is

The first scene a person plays in the window. A walker, a crate, and a door. The crate must be pushed into the door. The done criterion is not a test: the Director has played it and reached the door.

## Pins

1. **A scene is a file, validated at load.** `scenes/crate-and-door.json`: `name`, `seed`, `bodies`, `colliders`, and `goal`, where `goal` is `{ actor: 'crate', zone: { minX, maxX, minY, maxY } }`. A loader in `packages/tick/scene.js` reads a scene by path, refuses unknown fields, refuses a body that overlaps a collider or another body (the world's own `overlaps` query), refuses a goal actor that is not a body, and refuses a zone outside the colliders' extent. The fixture room stays as it is; `fixtureWorld()` is unchanged, so every existing test and fixture is untouched.
2. **The goal is read from committed frames, not the tick.** `reachedGoal(scene, frame)` is a pure function over the goal zone and the actor's box in a frame. The tick has no goals. The host and the seat call it; the law does not.
3. **The scene.** The room is the fixture room's floor and walls. The walker starts at `x 0.8, y 1`. The crate starts at `x 2.4, y 0.3`, half-extents `0.3`. The door is the zone `x 3.3 to 4, y 0 to 1`. Reaching it means the crate's box is inside that zone. A person walks right, pushes the crate into the door, and is done. The oracle must solve it within eight moves before the file is committed; state the minimum in the pull request.
4. **The host serves a scene.** `host --scene scenes/crate-and-door.json`; with no flag it serves the fixture room as now. The world record on the stream carries the scene's colliders and its goal zone. The page draws the zone, draws every body, and shows "door reached at tick N" when `reachedGoal` is true for the newest frame. `P` sends `push` at the nearest body within the rule's range; the adapter chooses the body from the newest frame and stamps the newest hash, as it does for `move`.
5. **The played log is a fixture.** `host --log <path>` writes `{ seed, scene, log }` when the goal is first reached and again on exit. The Director's play is committed as `fixtures/first-scene-played.json`, and a test replays it with the scene's world and asserts the goal is reached during replay. The screenshot goes in the pull request.
6. **The 1C behavior fixture rides along.** `fixtures/behavior-1c.json`, captured by the coordinator from the 1C engine (a walker pushing a crate, 406 frames, final `8369078f6c54fa26`), lands with a test that asserts every frame hash, the way the legacy fixture did before contact changed the law. It is the proof the next refactor uses.

## Acceptance

- The Director has played the scene and reached the door. Nothing else closes 1D.
- `fixtures/first-scene-played.json` replays green with the goal reached during replay.
- `fixtures/behavior-1c.json` replays frame for frame.
- The loader refuses each malformed scene named in pin 1, each with a test.
- The fixture room, the legacy boundary test, both goldens, and every existing test are unchanged.
- Atlas gains a `scenes` boundary with role `data` when the directory exists, and the check is green.

## Not in 1D

No seat run. No second scene. No NPC. No line. 1E thaws the seat on this scene after this closes.
