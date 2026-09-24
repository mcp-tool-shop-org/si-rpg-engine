# si-rpg-engine

A deterministic 3D RPG tick, the counterpart to [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). It is not a published package.

Slice 1 is a determinism harness: one body, 10000 fixed quanta, a golden hash. Slice 2 is the kernel fixture: the quantum, the admit step, a body with a collider, a memory-write verb the checker can refuse, and a host boundary that draws without deciding.

```bash
npm ci
npm run typecheck   # the kernel contract, packages/frame/types.d.ts, against the JavaScript
npm test            # the slice 2 fixture, packages/tick/tick.test.js
npm run check       # the slice 1 harness against fixtures/golden.txt under node
```

`play` runs an intent log through the tick and prints every committed frame; `replay` reruns a log `play` wrote and fails on the first hash that differs. The model is not called by either. `write-golden` rewrites `fixtures/golden.txt` after a change to the integrator or the hash function in `packages/frame/hash.js`. CI does not run it. CI installs pinned builds of V8 15.6.61, SpiderMonkey 156.0.1, and JavaScriptCore 319571 with jsvu 3.0.5, runs `harness/sim.mjs` as a module under each, and compares each to that file.

The runtime is plain ES modules so the three shells and node run the same bytes unbuilt. The contract is TypeScript declarations, checked with `tsc --noEmit`; nothing is emitted.

The plan is [docs/PHASE-0.md](docs/PHASE-0.md). The proposed operating map is [docs/atlas-design.md](docs/atlas-design.md). The research behind the plan is [docs/study-swarm/si-rpg-engine.dispatch.md](docs/study-swarm/si-rpg-engine.dispatch.md).

## The shape, in one breath

A seeded tick remains the law. The quantum is a fixed timestep, every quantum is hashed, and a player action spans many quanta. Replay is the seed plus the log of what was admitted. The model proposes intents, lines, typed beliefs, and body drafts; the checker for that class admits them. Verb drafts wait until load time. The host receives committed frames and returns intents. Generated frames and Gaussian skins are consumers of two committed poses, with no path back into the hash.
