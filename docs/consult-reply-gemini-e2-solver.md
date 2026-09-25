# Consult reply E2 — Gemini, 2026-09-24

Pasted by the operator. Two sentences and one basis line carrying market framing were removed at the Director's instruction, 2026-09-24; nothing else is edited.

VERDICT: A
SENTENCE: A 3D RPG requires a robust kinematic character controller to navigate slopes and stairs, not a generalized rigid-body impulse solver that risks cross-engine determinism for stacking physics the game does not need.

Q1
ANSWER: The character is not a dynamic body. Bouncing on the floor and integrating gravity via acceleration are physical behaviors that ruin tight RPG controls. The law's driven set becomes a kinematic controller class. It possesses velocity (derived from input intent, not integrated forces) and collides against static boxes, heightfields, and dynamic pushable props, but it does not respond to physical forces. To the hash, its record adds a `grounded` boolean, a `step_active` timer, and the current `surface_normal`. The swept admission test changes from a simple segment to a swept box with a vertical step-offset, essentially ignoring horizontal collisions that fall below the step height threshold.
CHANGE IN THE SLICE: The driven body becomes a kinematic character controller with a step height and a slope limit, resolved via collide-and-slide.
CONFIDENCE: high
BASIS: speculation based on PhysX and Jolt documentation principles.

Q2
ANSWER: Slopes, stairs, moving platforms, and terrain are all controller and collision geometry problems, not solver problems. Stacked props are the only row that strictly demands a solver (warm-start impulses, resting contact manifolds, island sleeping). If the studio's game design demands dynamic piles of crates that the player can topple and resolve deterministically, Answer A fails and B is forced. Stacking should be refused at load until a world needs it. Answer A covers everything the inventory needs.
CHANGE IN THE SLICE: Stacked props are refused at load; true dynamic stacking is not this slice.
CONFIDENCE: high
BASIS: speculation.

Q3
ANSWER: If B, the WASM build must rigidly pin the environment: no relaxed SIMD (which allows hardware-dependent fused multiply-add rounding), strict IEEE-754 mode (no fast-math, contraction off), subnormals preserved or explicitly flushed to zero, and all NaN payloads/signed zeros canonically masked before hashing. It should use f64 (scalar) to exactly match JavaScript's native Number precision and the existing arithmetic contract. No library's CI currently tests V8 vs. SpiderMonkey vs. JavaScriptCore hash exactness; our CI would be the first. The migration gate is the E1 behavior fixture replaying frame for frame under the WASM binary, producing the exact same hash sequence.
CHANGE IN THE SLICE: none
CONFIDENCE: medium
BASIS: speculation based on findings 1-7.

Q4
ANSWER: Under A, the controller's hashed record adds `grounded`, `step_height`, and the `surface_normal` vector. The terrain adds a static 2D array of `y` elevations (the heightfield). Because A uses no warm-start impulses or contact caching, they do not exist and are not hashed. Sleep is evaluated strictly by quanta since last movement and hashed as a counter. Under B, the hash must encompass the entire canonical solver snapshot: body poses, velocities, sleep quanta counters, and the internal warm-start impulse cache required to keep stacks stable. Any broadphase island data is recomputed, not hashed.
CHANGE IN THE SLICE: The hash includes the kinematic controller's grounded state and the heightfield data, while warm-start states remain forbidden.
CONFIDENCE: high
BASIS: speculation.

Q5
ANSWER: The assumption that a custom JavaScript kinematic controller built strictly on five operations can cleanly navigate 3D heightfield terrain without snagging. Swept box collision against arbitrary slopes and V-notches often requires trigonometric functions or complex manifold generation to calculate exact push-out vectors. If the 5-operation limit makes the controller snag on seams, Answer A is a dead end. I would build B (a heavily pinned scalar f64 WASM build of Rapier or Jolt), treating it as a black-box step function, hashing only the explicitly extracted body states rather than the opaque memory block, and disabling stacking entirely.
CHANGE IN THE SLICE: If terrain snagging breaks the 5-operation limit, E2 migrates to a pinned WASM solver.
CONFIDENCE: high
BASIS: speculation.

INVENTORY
Slopes: controller
Stairs and steps: controller
Ledges and drops: controller
Pushable props: controller (driven pushing undriven)
Doors: not this slice (handled as toggled static colliders)
Stacked props: solver (not this slice)
Moving platforms: controller
Terrain: controller
Static mesh props: not this slice (use primitive composites)
Jump and fall: controller

SCAR: Even under Answer A, I will not agree to implement a swept capsule collider. A true swept capsule against 3D slopes and heightfields requires trigonometric math or iterative closest-point algorithms that violate your five-operation (add, subtract, multiply, divide, sqrt) constraint. The character must remain a swept box, relying on step-height logic to bypass the snagging issues PhysX documents.

DID NOT CHECK: Whether JavaScriptCore and SpiderMonkey canonicalize NaN payloads identically to V8 within WASM scalar operations, or if the Rapier local-determinism bug actually manifests in a strictly scalar f64 build without SIMD.
