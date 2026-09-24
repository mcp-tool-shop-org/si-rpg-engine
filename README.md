# si-rpg-engine

A deterministic 3D RPG tick, the counterpart to [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Slice 1 is a determinism harness: one body, 10000 fixed quanta, a golden hash. It is not a published package.

```bash
node harness/check.js
```

`write-golden` rewrites `fixtures/golden.txt` after a change to the integrator or the hash. CI does not run it. CI installs pinned builds of V8 15.6.61, SpiderMonkey 156.0.1, and JavaScriptCore 319571 with jsvu 3.0.5 and compares each to that file.

The plan is [docs/PHASE-0.md](docs/PHASE-0.md). The proposed operating map is [docs/atlas-design.md](docs/atlas-design.md). The research behind the plan is [docs/study-swarm/si-rpg-engine.dispatch.md](docs/study-swarm/si-rpg-engine.dispatch.md).

## The shape, in one breath

A seeded tick remains the law. The quantum is a fixed timestep, every quantum is hashed, and a player action spans many quanta. Replay is the seed plus the log of what was admitted. The model proposes intents, lines, typed beliefs, and body drafts; the checker for that class admits them. Verb drafts wait until load time. The host receives committed frames and returns intents. Generated frames and Gaussian skins are consumers of two committed poses, with no path back into the hash.
