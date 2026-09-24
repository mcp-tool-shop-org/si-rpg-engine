# Phase 1 — the first scene

2026-09-24. Coordinator: Claude, appointed by the Director after the window merged. Phase 0 closed at `eeed37f` (PR #9). This file is the plan of record for what comes next. `docs/PHASE-0.md` stays the design of record for the engine; where they disagree, this file is later and says so.

## The goal, in one sentence

A scene a person has played, in the window, on the pumped tick: a walker, a crate, and a door, where the crate blocks the door and the person pushes it aside to get through.

That is the studio's own measure, and it is the smallest scene that meets every condition the last phase left open at once. It has more than one verb (`move`, `push`), more than one body (the walker, the crate), and something worth wanting (the door). It thaws the proposer seat honestly. And it forces the one physical capability the box solver does not have, contact between two bodies, so the physics path is decided by a need the scene has rather than by a library someone likes.

## Decisions taken

1. **Phase 0 is closed.** The tick, the golden hash under three engines, verb drafts at load, the pump, and the window are on `main`. Nothing in Phase 0 is reopened by this plan.
2. **The spoken-line gate is not next.** A labeled pair is one record slot against one utterance, and there is no slot vocabulary until an NPC with beliefs exists in a scene. Dataset tooling built now would label a schema that does not exist. It becomes the second scene's work, after this one is played.
3. **No physics library this phase.** The first scene's contact inventory has exactly one entry the box solver cannot do, dynamic bodies against each other, and it is boxes. `world.js` grows on the five exact operations. The WASM path stays what the physics consult said it is: one binary, no relaxed SIMD, its own golden, when a scene needs what boxes cannot give. The question is asked again at the second scene.
4. **The harness proves the product.** The point-mass stub becomes the arithmetic contract, and the harness steps `world.step`. Two goldens, both under three engines. This closes a hole that has been open since slice 2: a change to the solver could pass CI.
5. **The cloud caller is gone.** The spike in `packages/propose/ollama.js` bypassed the grammar and measured JSON shape. It was discarded from the working tree on 2026-09-24; a patch is in the coordinator's scratch, not the repo. Cloud models stay out until a wire can hold them to the grammar.
6. **The seat thaws last.** Only after a person has played the scene, and only on that scene, with the oracle's minimum as the yardstick.

## Slices

Each slice is one pull request, built by the builder seat, reviewed by a different family before merge, CI green before review starts. Owners are seats, not people: the Director ratifies, the builder builds, the reviewer reviews.

| Slice | Depends on | What it is | Done when |
|---|---|---|---|
| **1A. Dual golden** | nothing | `harness/sim.mjs` imports `world.step` from `packages/tick/world.js` and runs a scene built to fire every branch of it: floor, both walls, a corner where each penetration axis wins once, the speed clamp, two bodies. The point-mass stub moves to `harness/arith.mjs` with its digest `0d38671370d12d1e` in `fixtures/golden-arith.txt`. `fixtures/golden.txt` is rewritten once, by `write-golden`, with the reason in the commit. CI runs both files under the three engines. A Node-only test asserts each branch fired in the harness scene. | Three engines print both digests. A deliberate one-line change to `world.step`, made locally and not committed, flips the product golden and leaves the arithmetic golden alone. |
| **1B. Swept admission** | nothing | The intent predicate expands every collider by the actor's half-extents before the Liang-Barsky segment test, which is the exact swept test for an axis-aligned body. A third hazard scenario refuses a corner clip the centre line would have admitted. | Hazards pass with three scenarios. The legacy log still replays. |
| **1C. Contact and push** | 1A | `world.step` resolves overlap between dynamic bodies, equal mass, on the five operations, and the harness scene's two bodies now touch so the product golden covers it. `push` is a verb draft admitted through `load admit`, not hand-added: its rule targets a body id rather than a point, the compile step grows one field to allow that, and the hazard suite runs it. Resolution is a move toward the target body; contact does the pushing. | A play log shows the walker moving the crate. Replay is green. The legacy log still replays, since the fixture room has no crate. |
| **1D. The scene, played** | 1C | A scene file under `scenes/`, validated at load like any content: the room, the walker, the crate against the door, the door as a goal zone. `host` serves it. The page draws the crate and the door. A person plays it in the window and reaches the door. The play log is committed as `fixtures/first-scene-played.json` and replays green; the screenshot goes in the pull request. | The Director has played it. That is the whole criterion. |
| **1E. Seat thaw** | 1D | The oracle solves the scene within the budget. The seat runs `qwen2.5:7b`, ten seeds, budget eight, both conditions, on this scene only. Attempts to the door are reported against the oracle minimum. | One recorded run. No conclusion about any model larger than the numbers support. |

1A and 1B are independent and may run in parallel. Nothing else may start before its dependency has merged.

## What this phase does not do

No NPC, no beliefs in a scene, no spoken line, no labeled pairs, no physics library, no WASM, no cloud model, no second scene. The second scene adds an NPC with a belief record and an `ask` verb, which creates the slot vocabulary the line gate needs; its owner is named when this phase closes.

## The one thing the Director can overturn

The scene. A walker, a crate, and a door is the coordinator's choice, made because it is the smallest scene that satisfies every open condition and because a person can understand it in one look. It is not the only such scene. A different first scene changes 1C and 1D and nothing else, as long as it keeps two bodies, two verbs, and a goal. You probably expected the first scene to come from one of the studio's games; it does not, because a scene from a game needs its content pack, and this engine has no content format yet. 1D writes the first one.

## Standards compliance

Scored against the six workflow standards, 0 to 3.

- **PIN_PER_STEP: 2.** Engine builds are pinned by version in CI, the model is pinned in `model.json`, every golden is a golden of a build. Not 3: no replayable dispatch lock for the review step itself.
- **ANDON_AUTHORITY: 2.** CI blocks merge; the oracle guard refuses an unsolvable scene; the reason guard refuses an unmeasured comparison; the seat's freeze refuses runs by default. Not 3: no receipt ties a halt to the slice it stopped.
- **NAMED_COMPENSATORS: 2.** Irreversible actions and their undo: a merge to `main` is undone with `git revert -m 1 <merge>` by the coordinator, leaving `main` at the pre-merge tree; a golden rewrite is undone by reverting the commit that carried it, since `write-golden` is never run by CI; there are no publishes, tags, releases, or external writes in this phase. Not 3: no receipt.
- **DECOMPOSE_BY_SECRETS: 2.** Packages group by what changes together: `frame` holds the contract and the hash, `tick` the law, `load` the load-time gate, `propose` the instrument, `host` the picture. Scenes and predicates are data. Not 3: `host/session.js` still names the fixture room directly; 1D moves that to a scene file.
- **UNCERTAINTY_GATED_HUMANS: 2.** The Director is asked once, on the scene, and the ask is framed contrastively above. 1D's done criterion is a person playing, not a count. Not 3: no mechanism records the ratification.
- **EXTERNAL_VERIFIER: 2.** Every slice is built by one family and reviewed by another before merge, and CI is the mechanical check neither can talk past. Not 3: reviews are not yet receipts.

## Compensators

| Action | Undo | Owner | State after undo |
|---|---|---|---|
| Merge a slice to `main` | `git revert -m 1 <merge sha>` | coordinator | `main` at the pre-merge tree, history kept |
| Rewrite `fixtures/golden.txt` (1A, 1C) | revert the carrying commit | builder | previous digest restored, CI green against it |
| Discard the cloud caller | apply `ollama-cloud-caller.patch` from the coordinator's scratch | coordinator | the spike back in the working tree, still uncommitted |
