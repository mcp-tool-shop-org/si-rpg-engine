# Dispatch F5 — the push's mass

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, on a scratch clone, before merge. It depends on F3, whose copy of Rapier's impulse function this slice changes a second time. It is grounded in the Rust knowledge base's answer [`requests/push-mass.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/push-mass.md) (wave 3, si-rpg-engine), which was measured on F3's branch. Rapier has the defect as dimforge/rapier#1020, open.

## What it is

F3 fixed the overwrite that let one body be pushed at another's contact points. A second defect remains in Rapier's `solve_character_collision_impulses`, even at 0.36.0. For each contact point, the impulse's mass ratio uses the two bodies' linear masses only, `m·M/(m+M)`, and leaves out the pushed body's rotation.

A push at a point off the centre of mass turns the body as well as moving it. So the impulse that should bring the point's velocity to the pusher's overshoots it by `1 + k·m·M/(m+M)`, where `k = (r×n)·I⁻¹(r×n)`. For a light body, a point far from the centre, and several hits in one frame, the overshoot compounds.

The knowledge base measured it on F3's law:
- one push leaves the engine's smallest crate at 4.6 times the pusher's speed;
- 6.4 times when the crate is listed twice among the character's collisions;
- a thin, light box launches at 41 times from an ordinary push.

With the effective mass, `1/(1/m + 1/M + k)`, every one of those stays at or under the pusher's speed.

## The choice, stated contrastively

The conservative course would leave the ratio as Rapier has it and keep F3's guard at 8 times, which today's fixtures pass. The engine is measured by what it simulates, though, and a light prop launched by an ordinary push is a defect the sweep would find again as soon as content holds one.

Rapier has not fixed it, so there is nothing upstream to backport. This slice changes the engine's own copy, as F2 did with its branch. The change stays switchable, so the control test can show the copy with it off is exactly F3's. When Rapier fixes #1020, a later bump measures the two against each other.

## Pins

1. **The change.** In `solver/src/impulses.rs`, a third const parameter beside `SEPARATE`, `EFFECTIVE`, off by default. The law's push passes it on. For each contact point, the mass ratio becomes `mass_ratio / (1 + k·mass_ratio)`, with `k = (r×n)·I⁻¹(r×n)`:
   - `r` is the contact point less the body's world centre of mass;
   - `n` is the manifold's normal;
   - `I⁻¹` is the world inverse inertia.

   All three come from Rapier's public `RigidBody::mass_properties()`: `world_com` and `effective_world_inv_inertia`. The knowledge base measured them equal to what `apply_impulse_at_point` itself applies, to 2.8e-16 relative. With `k` exactly 0 the ratio is F3's bit for bit. The file's header and `solver/NOTICE` name this second change, and rapier#1020.
2. **The control test.**
   - With `EFFECTIVE` off, the copy is F3's bit for bit, over every recorded law run, the course, the flat walks, and the product scene.
   - The binary carries two panic line numbers from `impulses.rs`. Add no lines above those two sites, or say in the pull request why the digest moved for that reason alone.
   - With `EFFECTIVE` on, the copy differs only on quanta where the character pushes a dynamic body. The knowledge base counted every such quantum changed, and nothing else.
3. **Red on `main`, green here.** The knowledge base's red world becomes `fixtures/push/push-mass-thin-box.json`: red room A's walled room, and a box with half-extents 0.06, 0.2, 0.12 (mass 0.01152) at x = 0.7578125, pushed from tick 0.
   - On `main`, with F3's law, it leaves the first contact at 40.94123133916884 at tick 29, frame hash `8f201d064bb90bea`. The pull request shows this failing on `main`.
   - Here it leaves at 0.628, and its highest speed, 1.5509 at tick 134, comes from toppling, not from the push. The frame hash at tick 200 is `7534c79b4a74b103`.
4. **The guard tightens.** F3's native guard measures pushed bodies as the push leaves them. It drops from 8 times the pusher's speed to 1.5 times: the highest under this slice is 1.3155, in the red world's topple, and every other run is at or under 0.98. Through Rapier's own routine, red room A still trips it at 25.27. The every-body bound in `harness/push.test.js` stays near 2 times, because a box pushed until it tips falls at 1.55 times. Alternatively, it moves to pushed bodies only. The pull request says which, and why.
5. **What moves, named.**
   - **The goldens do not move:** the product golden `6e0d351693b18c93` and the arithmetic golden. The product scene never pushes a body.
   - **Recaptured through their own capture paths:** the fixture runs whose first push changes. These are `behavior-rotation` tumble (from quantum 14), `behavior-verbs` carry (85) and carry-capsule (88), and `behavior-minds` (60). A minds log intent whose cited frame moved is re-admitted against the new frame, with the intent itself unchanged.
   - **Recorded again:** the law runs (`node harness/law-runs.mjs --write`), and the sweep's record (`node harness/corpus.mjs --record-sweep`). Name every verdict that moved.
   - **Rewritten, because this slice changes them on purpose:** the three F3 native tests that pin the law's push to Rapier's routine wherever #1004 is idle. They pin the new claim instead: the law parts from Rapier's routine at every push of a dynamic body, and nowhere else.
6. **Costs on record.** The copy's time per quantum with the change on against off, on the red world and on the product scene.
7. **Public surfaces are the coordinator's.** The builder does not edit `README.md`, its translations, anything under `site/`, or `CHANGELOG.md`.
8. **F3's review, carried.** F3's external review left three low findings in its tests, all in what this slice changes next. They are answered here:
   - **Each push is bounded by its own pusher.** F3's native guard divides a pushed body's speed by the fastest driven character's horizontal speed that quantum. It divides instead by the horizontal speed of the character whose plan pushed that body. Today every law run has one driven character, so no multiple moves; with two, a push by the slower one would be measured against the faster one's speed. A character at rest that still pushes, since an oncoming body can make its plan, bounds the pushed body by that body's own speed before the push, never by a multiple of zero. A test plants each case: two characters at different speeds, and a character at rest met by a moving body.
   - **The two guards bound one population, or are named apart.** F3's JS bound in `harness/push.test.js` covers every body of every push fixture at every quantum, while the native guard covers only the bodies a push changed. If the JS bound moves to pushed bodies (pin 4), it takes the native guard's population and its 1.5 times. If it stays on every body, it gets a constant and a name of its own, and its comment says it is not the push guard.
   - **The control test's product-scene pin is asserted.** F3's control test checks a run's digest against the product binary's recorded digest only when no quantum of the run had two dynamic colliders near the character, and never asserts the count F3 pinned for the product scene: no collision there has a dynamic collider near the walker. It asserts that count directly for the product scene, so the digest check cannot pass by being skipped. A planted dynamic collider beside the walker's path fails it.

## Acceptance

- The red world launches on `main` (40.94 at tick 29) and leaves the push at 0.628 here.
- The control test passes with the change off. With it on, the copy differs only on pushes of dynamic bodies.
- The guard at 1.5 times passes here and fails on `main` in the red world and in red room A.
- The goldens are unchanged. Every moved fixture, law run, and sweep verdict is named with its reason.
- The header and the notice name the change and rapier#1020.
- F3's three review findings are answered as pin 8 says, each with its planted test.
- Typecheck clean, tests at or above the count on `main`, three engines and ARM64 print the goldens, lint clean, digest pinned from CI's Linux build, Atlas check green.

## Not in F5

- No version bump.
- No change to the character's settings, or to the linear part of the ratio.
- No upstream report, since #1020 is filed.
- No public-surface edits.
