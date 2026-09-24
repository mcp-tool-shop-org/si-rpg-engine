# Consult brief — the physics library

**How to use.** Paste everything below the rule to Claude and, separately, to Gemini. Same text to both. This is a cross-family consult, not a build and not a request for another literature survey. Agreement is not the goal. A reply that blesses the requirement and adds no scar is a failed consult.

**Date:** 2026-09-24

---

## Role

You are a skeptical engine architect reviewing the next build slice before any library is chosen and before any code is written. The slice is a physics solver that replaces the placeholder integrator and still produces one hash under V8, SpiderMonkey, and JavaScriptCore. Your job is to find where that slice will either drift across engines or prove the wrong file.

Where you make an empirical claim, give a URL you actually opened. Where you are speculating, say so in the same sentence. Do not invent papers, benchmarks, or numbers.

Do not write code. Do not unfreeze the proposer seat. Do not design a renderer. A vendor name is allowed only as the answer to a question below, and only with the determinism proof you would demand of it.

## What is being decided

`si-rpg-engine` has finished the three slices phase 0 named. The public repo is `mcp-tool-shop-org/si-rpg-engine`, default branch `main`, merge `71e4487` (pull request 7). The plan of record is `docs/PHASE-0.md`, section "Where the build stands."

The next build is a physics library. The requirement under attack is this:

Swap the 10,000-quanta math stub for a real solver, and keep byte-identical results across V8 15.6.61, SpiderMonkey 156.0.1, and JavaScriptCore 319571. Floating-point drift must not leak into the hash. The golden file is `fixtures/golden.txt`. Its current contents are the sixteen hex digits `0d38671370d12d1e`. CI installs those three engines with jsvu 3.0.5, runs `harness/sim.mjs` as a module under each, and fails if any digest differs from that file. `write-golden` is a command no workflow runs. An engine bump that moves the hash is a harness defect. A change to the integrator the harness actually executes, or to the hash function, is the only legitimate reason to rewrite the file.

## Ground truth you should treat as given

Measured on `main` at `71e4487`. Open the files if you doubt a line.

**Two integrators, one hash.** `harness/sim.mjs` is what CI runs. It is a point mass, `DT = 1/64`, `G = -8`, `MAX = 2`, initial `x = 0`, `y = 1`, `vx = 0.3`, `vy = 0`, for 10,000 steps. Each step is `vy += G * DT`, `x += vx * DT`, `y += vy * DT`, then a reflection: `y < 0` mirrors y and negates vy, `x > 4` mirrors about 4, `x < 0` mirrors x. Speed above `MAX` is scaled by `MAX / sqrt(speed2)`. Every step mixes `x, y, vx, vy` into the hash. A NaN prints `NAN` and is not a digest.

`packages/tick/world.js` is what play runs. It is a different function. Bodies are axis-aligned boxes with half-extents. The same `DT`, `G`, and `MAX_SPEED = 2`. Overlap against a static box resolves the smaller penetration axis and reflects that axis's velocity with no damping. One collider, one quantum, one axis. The harness does not call `world.step`. A change to `world.js` does not move `fixtures/golden.txt`, and CI stays green.

**The hash.** `packages/frame/hash.js`. Two FNV-1a lanes. Each double is split by a `DataView` into two little-endian uint32 words. The low word feeds lane 0, the high word feeds lane 1. `float` returns false and mixes nothing when `x !== x`. The digest is sixteen hex digits. The hash function itself uses integer arithmetic only (`Math.imul`, shifts, xor). The comment in that file says the doubles it reads are produced with add, subtract, multiply, divide, and square root, the five operations ECMAScript specifies exactly.

**The verb that drives the tick.** `move` sets the actor's `vx` to `+speed` or `-speed` from the sign of `target.x - actor.x`, runs the predicate's quantum count, then sets `vx` back to 0. It does not set `vy`. Admission of a path is a Liang-Barsky test of the straight segment between centres, not a sweep of the box and not the trajectory the integrator will walk. The hazard suite in `predicates/hazards` runs that rule on the real tick. `load admit` refuses a draft that fails it.

**What is not in the tree.** No WASM binary, no WASM toolchain, no physics dependency. Phase 0 still names a WASM golden path. The three JavaScript engines are the proof that exists. The proposer seat is frozen in `packages/propose/model.json`. It is an instrument, not this slice. Cloud-model runs were not held to the grammar and are not evidence. Do not cite them.

**The sibling.** `ai-rpg-engine` is a deterministic turn sim. Occupancy is a zone id. It has no physics library to borrow. This repo does not import it.

## Constraints

- The slice has to leave one digest that V8, SpiderMonkey, and JavaScriptCore all print. Two processes of one binary are not the proof.
- Presentation stays outside the hash. The host does not grow a collider in this slice.
- The seat stays frozen. This consult does not thaw it and does not add a scene.
- "Not buildable as a byte-identical hash" is an allowed answer. Naming a library and hoping the engines agree is not.
- Do not rewrite `docs/PHASE-0.md` in your reply. Name the sentence you would add, under the return shape.

## Questions — only what the tree has not settled

**Q1 — Which file is the proof?**
CI hashes the point-mass stub. Play steps the box solver. A library can replace one, the other, or both. Say which replacement keeps the golden file meaningful, and what you would do with `0d38671370d12d1e` on the day the integrator changes. If your answer is "rewrite the golden file," say what the new harness must simulate so that a later edit to play cannot pass CI while diverging.

**Q2 — Where is the arithmetic allowed to live?**
The current contract is five exact operations on doubles, NaN excluded, bits taken little-endian. A solver people mean by "physics library" wants iterations, contact manifolds, and usually `sqrt` plus transcendentals, `f32`, or SIMD. The WASM default profile leaves NaN sign and payload unspecified. Say which of these is the slice, and what you refuse: stay on the five operations and grow the box solver, fixed-point, a software libm compiled into all three engines, or a WASM build whose NaN behavior is pinned. If you name a library, name the build flags that make the three engines emit the same bits, or say you do not know them.

**Q3 — What contact state is inside the hash?**
The box step stores position and velocity only. A manifold, a warm start, an iteration count, or a sleeping flag is new state. Say which of those are hashed body, which are recomputed every quantum, and which are banned because two engines can iterate to different bits. Say what the first fixture's body record gains, field by field.

**Q4 — Does `move` stay?**
The shipped verb writes horizontal velocity only, and the hazard suite locks that behavior. The path check does not follow the integrator. Say whether this slice may change `move`, must keep it, or must split "the verb the hazards lock" from "the contact the solver resolves." Say what a draft that walks through a collider must still be refused for.

**Q5 — What falsifies the slice?**
Name the single assumption above that, if wrong, makes "a physics library that holds the golden hash" the wrong next thing to write. Say what you would write instead, in one paragraph. A redesign of the whole engine is not an answer.

## Return shape

Use this skeleton so two replies can be diffed. About 900 words. Specificity over a new architecture.

```
VERDICT: hold | revise | reject
SENTENCE: one sentence

Q1
ANSWER:
CHANGE IN THE SLICE: the requirement you would rewrite, or "none"
CONFIDENCE: high | medium | low
BASIS: opened URL, or "speculation"

Q2
(same four fields)

Q3
(same four fields, and the field list)

Q4
(same four fields)

Q5
(same four fields)

SCAR: the one place you will not agree, even if the verdict is hold
DID NOT CHECK: what you left unread
```
