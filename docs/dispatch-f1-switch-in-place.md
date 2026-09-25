# Dispatch F1 — actions switch bodies in place

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. Depends on S1 and T5, which touch the same code and add the bundle this slice is measured against. Grounded in the Rust knowledge base's answer `requests/driven-switch.md` (wave 3, si-rpg-engine), measured at rapier3d-f64 0.35.3 with a counter build on `main` and a prototype on a scratch clone.

## What it is

On `main` the Rapier world is rebuilt from the body records whenever the set of driven or carried bodies changes, which is every time a character starts or finishes an action and at every pick-up and drop: 11 rebuilds in 12,242 quanta of fixtures, and three in the product scene, at trace ticks 201, 261, and 401. Each rebuild drops every warm-start impulse and wakes every sleeping body in the world. The knowledge base showed what that does to a world: a stack that had settled leaning 2.1e-2 off-axis, far from the actor, was woken by an unrelated verb boundary and straightened itself to within 5e-4. One character's action changed a distant stack's resting pose. That is a defect in what the engine simulates, and this slice removes it by switching a body's type in place on the running world, through public Rapier calls, so only the switched body and what it touches notice.

## The choice, stated contrastively

A reader might expect the rebuild to be the safer law, because it resets Rapier's hidden state at every verb boundary and leaves only the records. It is deterministic, and so is the in-place switch, but the rebuild's reset is itself visible physics: sleepers wake anywhere, stacks re-solve cold, and poses move. The in-place switch keeps Rapier's continuous run across verb boundaries, so hidden state (tree shape, solver colours, island links, active-set order, handle generations) now accumulates over the whole run instead of resetting. Replay and the memory image already carry exactly that, which is the contract T2 chose; S1 pin 11 already forbids restoring by reloading records. So the in-place switch is the law this engine's restore contract was built for, and the rebuild at a verb boundary was the exception.

## Pins

1. **The reload test splits.** `ensure()` rebuilds only when the world id, the body or collider counts, the heightfield shape, the geometry bytes (S1 pin 15), or the character shape differ. The driven and carried masks stay in `Signature` as the last state applied and leave the reload test. `build_world` stays for the first load and for any geometry change.
2. **A switch applies in record order.** When only the masks differ, the law walks the bodies in record order, never a map's iteration order, applies each body's transition, stores the new masks, and rebuilds the snapshot. The transitions, in this order, because Rapier ignores velocity setters on a position-based kinematic body:
   - to driven: `set_linvel(0)` and `set_angvel(0)` while the body is still dynamic, then `set_body_type(KinematicPositionBased)`, `lock_rotations(true)`, `set_additional_mass(1.0)`, `set_rotation(identity)`, the sleep thresholds a driven body is built with, and `wake_up(true)`; in a capsule world, `Collider::set_shape` to the capsule.
   - to dynamic: `set_body_type(Dynamic)` first, then `lock_rotations(false)`, `set_additional_mass_properties(MassProperties::default())`, `set_rotation` to the record's quaternion through `canon_quat`, the record's linear and angular velocity, the default sleep thresholds with `time_until_sleep` of 32 quanta, and `wake_up(true)`; in a capsule world, `set_shape` back to the cuboid.
   - lifted to driving and back (modes 2 and 1): no switch, as today, since both are kinematic.
   - picked up: `remove_body`. Dropped: `insert`, with `build_world`'s builder applied to the record. Handle generations then depend on the carry history and reach the hash through the snapshot's pair keys; that is deterministic and S1 pin 9's removal case now runs through carry.
3. **No load pass for a switch.** `warm_broadphase` is never called on a running world (S1 pin 12: it consumes the type-change flags without updating the islands, and trips Rapier's island-manager debug assertion). The consequence is pinned rather than hidden: in the quantum of a switch, a removed body disappears from the character's queries at once, and a dropped body is invisible to them until the step's broad-phase update. A test holds each.
4. **A rebuild counter.** The binary exports `solver_rebuilds()`, the number of times `ensure()` has built a world since instantiation, so a test can say when the world was rebuilt. It is the harness this slice ships.
5. **Red on `main`, green in place.** Each of these is shown failing on `main` in the pull request:
   - untouched sleepers stay asleep through every switch: in the product scene, `lower`, `upper`, `tip`, `slider`, and `parcel` stay asleep through ticks 199 to 202 and 259 to 262, and all but the carried `parcel` through 399 to 402;
   - untouched warm starts survive: every resting pair not involving the switched body keeps its warm-start fields through the switch quantum (on `main`, lower and upper's impulse goes from 3.906509e-3 to 4.592406e-3 at tick 201);
   - no rebuild after load, in the product scene and in every fixture, by the counter.
6. **Tests that hold the contract.**
   - restores straddle every switch: replay and image restores at points on both sides of each switch, 200 and 201, 260 and 261, 400 and 401 in the product scene, and 42, 104, 251, and 252 in the carry case, each rerunning identically;
   - velocities survive the return to dynamic: a body switched back keeps its record velocity, and a planted wrong order (velocity set before the type) is caught;
   - generations reach the hash: after a drop, a pair key in the snapshot carries generation 1;
   - a switch in a capsule-shape world: no fixture has one, so this slice adds a case;
   - the verb-boundary reload is gone: the minds fixture's quaternions keep their bits across its verb boundaries, and S1 pin 11's contract comment is updated to say the law now canonicalizes at the output boundary, at the first load, and on a geometry change only.
7. **What moves, named.** The product golden, about eleven numbers in `fixtures/golden-behaviour.json`, the carry case of `behavior-verbs.json`, `behavior-minds.json`, and the Linux digest. The T5 corpus bundle for the rebuild at trace tick 261 is recaptured, since the run it records changes on purpose. T4 pin 4's characterization test turns red where the rebuild caused a divergence and is rewritten to the divergences that remain, which are the walker's stall on flat ground until its own slice lands. `write-golden` names every moved number and each commit says why.
8. **Costs on record.** The runtime of a switch against a rebuild, measured on the product scene and the carry case, stated in the pull request; the knowledge base did not measure it.
9. **Native tests run in release**, and the map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the check drifts.
10. **Public surfaces are the coordinator's.** The builder does not edit `README.md`, its translations, anything under `site/`, or `CHANGELOG.md`; the pull request body says what a reader of those needs to know.

## Acceptance

- The three tests in pin 5 are red on `main` and green on the branch, with the red run linked.
- Every test in pin 6 passes, including restores on both sides of every switch.
- `solver_rebuilds()` reads one after load in the product scene and every fixture, and stays there.
- The goldens and fixtures moved once, each named with its reason; T4 pin 4 is rewritten to what remains.
- Typecheck clean, tests at or above the count on `main`, three engines and ARM64 print the goldens from the Linux binary, lint clean, digest pinned, Atlas check green.

## Not in F1

No fix to the walker's stall on flat ground, no change to how a geometry change rebuilds, no capsule character by default, no change to the tick's verbs, no public-surface edits.
