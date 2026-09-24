# Consult brief E2 — the solver

Paste from "Role" through "Return shape" to both families. Same text to both. Grounding: `docs/study-swarm/e2-solver.dispatch.md`, 25 findings from four Opus research agents, gate receipt beside it (advisory: documentation sources without arXiv ids; one arXiv item; nothing fabricated). Finding numbers below refer to that file.

## Role

You are a skeptical engine architect reviewing the solver decision for a deterministic 3D RPG law, before a library, a language, or a line of code is chosen. Your job is to find where the plan below either imports a solver the world does not need, or grows a law that cannot carry what the world needs. If the premise is wrong, say that first. Specificity over a new architecture.

Where you make an empirical claim, give a URL you actually opened. Where you speculate, say so in the sentence. Do not invent papers, benchmarks, or numbers. Do not write code. Do not design a renderer, a scene, or a game. Do not thaw the proposer seat.

## What is being decided

`si-rpg-engine` E2, on `main` at `23fe5fe`. The law is a fixed-timestep step hashed every quantum, three-dimensional since E1: bodies are axis-aligned boxes with position, velocity, and half-extents on three axes, `x` and `z` the ground plane, gravity on `y`. Static colliders are 3D boxes. The step is add, subtract, multiply, divide, and square root, no other operation. Contact between bodies resolves the smallest overlap axis; a driven body (one with a scheduled action) pushes an undriven one, which yields fully and takes the driver's velocity on that axis; an undriven body's horizontal velocity is multiplied by zero every quantum. Admission of a move is a swept segment test against colliders expanded by the actor's half-extents, where touching a face is not a crossing. The product golden `735363523983fbb6` is printed by V8, SpiderMonkey, and JavaScriptCore from `harness/sim.mjs`; the arithmetic contract `0d38671370d12d1e` is separate and unchanged since day one. Replay is the seed plus the admitted-input log. A 3D behavior fixture replays frame for frame.

The requirement: a step that can carry a 3D RPG world (characters on ground, slopes, stairs, ledges, props, doors, terrain) while every quantum still hashes to one digest across three engines and two CPU families, and every fixture still replays.

## Research grounding, in the shape that matters

- **Characters are not dynamic bodies anywhere.** PhysX, Unity, Unreal, Godot, Jolt, and Rapier all model the character as a kinematic collide-and-slide controller with a step height, a slope limit, ground snapping, and a skin width, and none of them pushes props automatically (8–12). PhysX documents a box character without auto-stepping getting stuck on slight bumps, which is what our walker is (8).
- **Floats stay, pinned.** The five operations are the standard's own reproducibility boundary (14). Shipped lockstep titles stayed on floats with a pinned mode and found their desyncs in uninitialised memory, sort order, and third-party physics, not arithmetic (16–18). Fixed point buys cross-platform safety for arbitrary user code at a precision cost and does not remove the transcendental problem (19–20).
- **No library's CI proves what we need.** Jolt hashes a WASM build under V8 only, at about 8% (1–2). Rapier's deterministic package claims cross-browser agreement with no test behind it and has had a closed local-determinism bug (3–4). Box2D shows the proof shape, a hash and a step count, with FMA off and a custom atan2 (5). Any WASM build may use fixed-width SIMD and must refuse relaxed SIMD, NaN, and signed zero in the hash (3, 7).
- **Solver state is state.** Warm-start impulses, sleep timers, and contact caches survive a step and are hashed in canonical order or forbidden; islands and broadphase order are recomputed; sleep by seconds is not a law, sleep by quanta is (22–25). Terrain is a static heightfield; props are static meshes with edge flags or convex hulls; dynamic bodies are convex; mesh against mesh is refused (24).

## The contact inventory, to be attacked

| Need | Boxes on five operations, today | What the evidence says it takes |
|---|---|---|
| Character on flat ground | can | — |
| Slopes | cannot; a box world has no slopes and push-out treats any incline as a wall | a controller with a walkable angle; a heightfield or ramp collider (8–12, 24) |
| Stairs and steps | cannot; documented stuck-on-bumps configuration | step height and a minimum step-top width (8, 9, 12) |
| Ledges and drops | can in part; a box gives the flat-base floor test for free | (10) |
| Pushable props | can, by the driven-set rule | pushing is scripted in every engine too (8, 9, 12) |
| Doors | can, as a static collider a verb toggles; the toggle is hashed | — |
| Stacked props | cannot; needs cross-step impulse state | hashed warm-start state or a refusal to stack (22, 25) |
| Moving platforms | cannot | a kinematic mover that carries the controller (12) |
| Terrain | cannot | a static heightfield collider (24) |
| Static mesh props | cannot | static meshes with edge flags, merged per island, or convex hulls (11, 24) |
| Jump and fall | can | — |

## Two candidate answers

**A. Grow the law in JavaScript on the five operations.** Add a kinematic character controller class beside dynamic bodies: capsule or auto-stepping box, step height, slope limit, ground snap, skin width, flat-base ledge check, colliding against static colliders that gain a heightfield. Dynamic props stay boxes under the existing contact rule. Sleep is by quanta. No warm-start solver; stacking is refused at load until a scene needs it. Every addition is our code, hashed field by field, proven by the existing three-engine golden.

**B. One WebAssembly binary from Rust.** Jolt or Rapier's deterministic build, with the pin list from the findings written into the build: no relaxed SIMD, no fast-math, contraction off, precise mode, subnormals pinned, NaN and signed zero refused by the hash, sleep converted to quanta, the full solver snapshot hashed in canonical order. Proven by our golden under three engines on two CPU families and by the E1 fixtures replaying frame for frame under it.

## Constraints

- One digest under three engines stays the law. A library that cannot meet it is not a candidate.
- The seat stays frozen. No scene, no art, no model run enters this consult.
- "Not this slice" is an allowed answer for any inventory row. Pretending a box is a slope is not.
- Do not rewrite `docs/PHASE-1.md`. Name the sentence you would add, under the return shape.

## Questions — only what the tree has not settled

**Q1 — Is the character a body?** The law makes the walker a dynamic box under gravity that bounces on the floor. Every engine opened makes the character kinematic. Say whether the law's driven set becomes a kinematic controller class, what it collides with, whether it has velocity at all, and what its record adds to the hash. Say what the swept admission test becomes when the actor is a controller with a step height.

**Q2 — Which rows need a solver?** Attack the inventory. Mark each "cannot" as controller work, which answer A covers, or solver work, which only B covers. Name the row, if any, that forces B for the worlds this studio builds. If no row forces it, say what would.

**Q3 — If B, the pins.** From findings 1–7, 15, 21, 22, and 23: list what a single WASM binary must pin in its build and in its hash, and what no library's CI proves that ours would still have to. Say f32 or f64 and why. Say what the migration gate is.

**Q4 — What is hashed?** Under A: the controller's record, field by field, and the heightfield's. Under B: the snapshot, and what in it is recomputed rather than stored. Say which of sleep, warm start, and contact cache exist under each answer.

**Q5 — What falsifies the slice?** Name the single assumption above that, if wrong, makes A the wrong next thing to build, or makes B premature. Say what you would build instead, in one paragraph. A redesign of the engine is not an answer.

## Return shape

About 900 words. Specificity over a new architecture.

```
VERDICT: A | B | neither
SENTENCE: one sentence

Q1 through Q5
ANSWER:
CHANGE IN THE SLICE: the sentence you would add to PHASE-1 E2, or "none"
CONFIDENCE: high | medium | low
BASIS: opened URL, or "speculation"

INVENTORY: each "cannot" row marked controller | solver | not this slice
SCAR: the one place you will not agree, even if the verdict is A
DID NOT CHECK: what you left unread
```
