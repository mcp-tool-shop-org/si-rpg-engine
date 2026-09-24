# Consult reply E2 — Grok, 2026-09-24

Pasted by the operator. Not edited.

VERDICT: A
SENTENCE: The walker stops being a bouncing dynamic box and becomes a kinematic box that steps, snaps, and pushes; stacking is refused at load, and nothing in the inventory forces a WASM solver.

Q1
ANSWER: The character is not a dynamic body. On this law a body that has reached the floor still carries a reflected vertical velocity, and a later move shares the speed clamp with it, so a commanded slide does not arrive. PhysX names that failure: restitution, friction, and penetration recovery on a dynamic body fight the control you wanted, and the user is the one who puts gravity into the displacement (https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/CharacterControllers.html). The driven set becomes a kinematic controller class. It collides with static boxes, a static heightfield, and undriven boxes. It does not collide with another controller except by the existing pair rule when one of them is being pushed. Horizontal velocity is the admitted intent. Vertical velocity still integrates gravity, with add and multiply, and is set to zero when the body snaps to a walkable surface. It is not reflected. The hashed record adds a grounded flag, the id of the support (a collider, a heightfield cell, or a body), and an integer counting the quanta of a step still in progress. step_height is world data, mixed once with the world, not a per-body field. The swept admission test stays a swept box. A step is a second sweep: up by at most the step height, forward, then down, and it is admitted only when the body was grounded before the obstacle and the floor on top of the rise is at least a stored minimum width. Rapier states both of those conditions (https://rapier.rs/docs/user_guides/rust/character_controller).
CHANGE IN THE SLICE: The driven body becomes a kinematic box: intent sets horizontal velocity, gravity integrates on y and snaps instead of reflecting, and a step is a second sweep that requires a floor of minimum width on top of the rise.
CONFIDENCE: high
BASIS: opened https://nvidia-omniverse.github.io/PhysX/physx/5.4.1/docs/CharacterControllers.html and https://rapier.rs/docs/user_guides/rust/character_controller ; the bounce is measured on this law.

Q2
ANSWER: Slopes, stairs, ledges, pushable props, moving platforms, terrain, and jump-and-fall are controller work, which A covers. A slope is walkable when its rise over run is at most a number stored on the collider. PhysX stores that limit as the cosine of the angle and applies cosf when the limit is authored, not on each contact. A stair is the step sweep above. A ledge is the flat bottom of the box, which already fails a floor test when the base leaves the support. A pushable prop is the driven-set rule that already exists; PhysX does not push automatically either. A moving platform is a kinematic mover the controller snaps to, the same ride flag PhysX documents, not an impulse island. Terrain is a static heightfield of y values. Jump and fall stay on the controller's vertical channel. Doors stay a static collider a verb toggles. Static meshes are not this slice: internal edges between adjacent colliders catch a body, and the fix opened in the dispatch is one collider per island, which is a load rule, not a solver. The only solver row is stacked props. Finding 25 says there is no stacking without cross-step impulse state. This kernel has no scene that must topple a pile and have it rest. That row is refused at load. Nothing forces B. B becomes forced when a world must keep a stack at rest across quanta.
CHANGE IN THE SLICE: Stacked props are refused at load. True dynamic stacking is not this slice.
CONFIDENCE: high
BASIS: opened the PhysX and Rapier pages above; the stacking claim is finding 25 in the dispatch, which I did not re-open.

Q3
ANSWER: Under B the binary is scalar f64, because the arithmetic contract and the E1 fixtures are JavaScript Number, and an f32 step would fail the migration gate before it proved anything. The build pins no relaxed SIMD, no fast-math, contraction off, round-to-nearest, subnormals either preserved or flushed on every engine, and the same source and defines. NaN and signed zero are refused by the hash, as Rapier's own contact impulses diverged on signed zero (finding 3). Sleep is a quantum count, never seconds. No library's CI hashes one step under V8, SpiderMonkey, and JavaScriptCore; Jolt's WASM jobs run under Node (finding 1). That golden stays ours. The migration gate is the E1 behavior fixture replaying frame for frame under the binary, and the product golden printing one digest on three engines.
CHANGE IN THE SLICE: none
CONFIDENCE: medium
BASIS: speculation on the pin list, drawn from findings 1–7, 15, and 21–23, which I did not re-open today.

Q4
ANSWER: Under A the hash gains, per controller, grounded, the support id, and the step-quanta counter, mixed in that order after the body's existing six floats. The heightfield is static and is mixed once when the world is loaded, cell by cell, row-major. Warm-start impulses and a contact cache do not exist. Sleep for an undriven box is a quantum counter since its pose last changed, hashed with the body. Under B, if the library's next step reads a warm-start cache, that cache is part of the hash in canonical pair order, or the build is compiled with warm start off. Islands and broadphase order are recomputed and are not hashed. An opaque heap is not a snapshot.
CHANGE IN THE SLICE: The hash adds the controller's grounded flag, support id, and step-quanta counter; warm-start state is not created.
CONFIDENCE: high
BASIS: speculation, constrained by findings 22–25.

Q5
ANSWER: The assumption that falsifies A is that a box sweep, a step probe with a minimum top width, and a rise-over-run test can cross a heightfield seam without a transcendental and without a contact carried from the previous quantum. If a seam still catches the box, A is the wrong next build. What I would build then is B as the collision query only, stacking still refused, f64 pinned as in Q3, and the E1 fixture as the gate. I would not keep growing JavaScript past the seam.
CHANGE IN THE SLICE: If a heightfield seam still stops the box, E2 stops and the step becomes the pinned WASM query.
CONFIDENCE: medium
BASIS: speculation. I did not run a heightfield.

INVENTORY
Slopes: controller
Stairs and steps: controller
Stacked props: solver, not this slice
Moving platforms: controller
Terrain: controller
Static mesh props: not this slice

SCAR: I will not agree to ignore horizontal collisions shorter than the step height. That filter walks through any obstacle that happens to be short. A step is a second sweep, taken only from the ground, and only when the top of the rise has a floor at least as wide as the stored minimum. PhysX also recommends a capsule, and the same page says a capsule with a step offset can climb higher than the offset because the round bottom adds an upward motion that is hard to predict. The shape stays a box.

DID NOT CHECK: Jolt's WASM CI job, whether SpiderMonkey and JavaScriptCore canonicalize NaN inside scalar WASM the way V8 does, and whether a real heightfield seam stops the box sweep. I did not re-open Godot, Unity, Jolt, Box2D, or the arithmetic papers.
