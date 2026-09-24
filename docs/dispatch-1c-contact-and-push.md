# Dispatch 1C — contact and push

2026-09-24. Coordinator: Claude. Builder: the builder seat. Reviewer: a different family, on a scratch clone, against the acceptance list below, before merge. Depends on 1A (`5f47e58`) and 1B (`c379802`), both on `main`.

## What it is

Two bodies can touch, and a walker can push a crate. `world.step` grows on the five exact operations. `push` is a verb draft admitted through `load admit`, not hand-added. The product golden is rewritten once because the solver changes, and the product scene grows so the golden covers the contact.

## Pins

1. **Contact is between dynamic bodies, resolved in array order, pairs `i < j`.** Overlap along the smaller penetration axis, like the static case. Who yields is a property the tick knows and the world does not: `world.step(driven)` takes the set of body ids with a scheduled action. Between a driven body and an undriven one, the undriven body yields the full penetration and takes the driver's velocity on the contact axis. Between two undriven bodies, each yields half and both zero their velocity on that axis. Two driven bodies touching is refused at admission, not resolved: a `push` whose target body has a scheduled action is refused with `target is mid-action`. The harness calls `step` with an empty set unless the scene says otherwise.
2. **An undriven body loses horizontal velocity.** Each quantum, a body with no scheduled action multiplies `vx` by a constant written in `world.js` next to `G` and `MAX_SPEED`. That is one multiply, deterministic. A pushed crate stops. The walker's `vx` is already zeroed when its action completes, so the legacy log is unaffected; the test proves it.
3. **`push` targets a body.** The rule schema gains one optional field, `targetKind: 'point' | 'body'`, default `point`. The intent type gains `target: { x, y } | { body: string }`. The compile step in `packages/load` allows the field and refuses any other new field, as it does today. The predicate for a body target: the body exists, is not the actor, is within `maxDistance`, is not mid-action, and the swept path to the near face of its box is clear of static colliders. Resolution is a move toward the target body's `x` for the rule's quanta; contact does the pushing.
4. **The hazard suite runs body verbs.** A scenario may carry `targetBody` beside `target`. For a rule with `targetKind: 'body'` the suite uses `targetBody` and fails the scenario, not skips it, when the field is absent. The three existing scenarios gain a `targetBody` each, placed so their verdicts hold for `push` as they do for `move`. A fourth scenario refuses a push whose target is on the far side of a static collider.
5. **The product scene covers the contact.** `harness/product-scene.mjs` adds two bodies that meet on the first quantum, one driven, and the Node test asserts the yield rule fired. `write-golden` rewrites `fixtures/golden.txt`; the reason is the solver change, stated in the commit. `fixtures/golden-arith.txt` does not move.
6. **`push` is admitted at load.** `predicates/intents/push.json` is written by `load admit` from a draft in the pull request, and the index names it. The pull request shows the command's output.

## Acceptance

- A play log shows the walker pushing the crate at least one unit and the crate coming to rest; the log replays green.
- `fixtures/legacy-play-log.json` replays green, frame for frame.
- The hazard suite passes with four scenarios for both `move` and `push`.
- Both goldens print under the three engines; the arithmetic golden is unchanged.
- A body draft that overlaps another body is still refused at admission, as now.
- Typecheck clean; every new rule above has a test.

## Not in 1C

No scene file, no door, no goal zone, no host change, no seat run. Those are 1D and 1E.
