<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# si-rpg-engine

A deterministic 3D RPG tick, the counterpart to [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). It is not a published package.

Slice 1 is a determinism harness: one body, 10000 fixed quanta, a golden hash. Slice 2 is the kernel fixture. Slice 3 admits a verb draft at load: compile against the fixed fields, run `predicates/hazards`, then write it under `predicates/intents`. Play refuses a verb draft.

```bash
npm ci
npm run typecheck   # the kernel contract, packages/frame/types.d.ts, against the JavaScript
npm test            # the kernel fixture and the load-time verb drafts
npm run check       # the slice 1 harness against fixtures/golden.txt under node
```

`play` runs an intent log through the tick and prints every committed frame; `replay` reruns a log `play` wrote, advancing to each admission's tick before submitting it, and fails on the first hash that differs. The model is not called by either. The tick is pumped: `submit` admits and schedules, `advance` runs one quantum, and the world keeps stepping while nothing is scheduled. `host` pumps that clock once every 16 ms and serves the fixture room at `http://127.0.0.1:4173`. The page keeps the last two frames and draws the boxes. A click or an arrow becomes a `move`, and the process stamps the newest committed hash, not the frame on screen. A slow page misses frames. The tick does not wait. `fixtures/legacy-play-log.json` is a log captured before the pump that replays after it frame for frame. `load admit <draft.json>` writes a verb that passes the hazard suite; `load retire <verb>` takes it back out. `write-golden` rewrites `fixtures/golden.txt` after a change to the integrator or the hash function in `packages/frame/hash.js`. CI does not run it. CI installs pinned builds of V8 15.6.61, SpiderMonkey 156.0.1, and JavaScriptCore 319571 with jsvu 3.0.5, runs `harness/sim.mjs` as a module under each, and compares each to that file.

`propose` is an instrument, not a slice, and it is frozen. It asks a pinned local model to propose into a fresh tick, ten runs of eight, in two conditions that differ only in whether the checker's reason is shown. Decoding is held to a grammar built from the catalog and the frame, so an unknown verb, a missing coordinate, or a belief citing an episode that does not exist cannot be sampled. It refuses to run unless an oracle search on the real tick solves its scene within the budget, and refuses to report unless the reason condition showed at least one reason. The one recorded run, in `fixtures/proposer-qwen2.5-7b.json`, is on an earlier scene whose goal no sequence of moves could enter, so it measured nothing about the model and is kept only as the record of that mistake. The seat stays frozen until the world has more than one verb, more than one body, and something worth wanting; until then it measures its own prompt. Cloud models are not held to the grammar and are not run through it.

The runtime is plain ES modules so the three shells and node run the same bytes unbuilt. The contract is TypeScript declarations, checked with `tsc --noEmit`; nothing is emitted.

The plan is [docs/PHASE-0.md](docs/PHASE-0.md). The proposed operating map is [docs/atlas-design.md](docs/atlas-design.md). The research behind the plan is [docs/study-swarm/si-rpg-engine.dispatch.md](docs/study-swarm/si-rpg-engine.dispatch.md).

## The shape, in one breath

A seeded tick remains the law. The quantum is a fixed timestep, every quantum is hashed, and a player action spans many quanta. Replay is the seed plus the log of what was admitted. The model proposes intents, lines, typed beliefs, and body drafts; the checker for that class admits them. Verb drafts wait until load time. The host receives committed frames and returns intents. Generated frames and Gaussian skins are consumers of two committed poses, with no path back into the hash.
