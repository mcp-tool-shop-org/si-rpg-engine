<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/si-rpg-engine/"><img src="https://img.shields.io/badge/Landing-Page-blue" alt="Landing Page"></a>
</p>

A deterministic, hashed, replayable 3D simulation engine. The tick runs on a fixed timestep, every quantum of state is hashed, and the physics law is Rust compiled to one WebAssembly binary. Replay is the seed plus the log of what was admitted. A language model may propose into the world; a hand-authored checker decides what enters it. It is the counterpart to [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), and it is measured by what it simulates.

## What it is, and what it aspires to be

Three JavaScript engines, V8, SpiderMonkey, and JavaScriptCore, print the same hash for the same world on every commit. That is the promise the rest of the engine is built on: a world that two machines can agree about, byte for byte, from a seed and a list of admitted inputs. On top of it sit bodies that fall, slide, push, tip, and tumble in three dimensions; a character that steps, climbs slopes, carries, and sets down; world files that are refused with a reason when they are wrong; and minds that see, remember what they saw, and refuse a belief that rests on older evidence than the one it would replace.

What it aspires to be is the simulation core inside a host: a browser, Godot, or Unreal draws the picture and sends intents, while the law, the hash, and the record stay here. The next phase is the test suite of a shipping engine, decided by a study of how studios test today; after that come collision from meshes, a host binding, and the thaw of the model seat as a test instrument. The plans are [docs/PHASE-0.md](docs/PHASE-0.md) and [docs/PHASE-1.md](docs/PHASE-1.md), and every slice was built from a written dispatch in `docs/`.

## What is built

| Capability | Where | Proof |
|---|---|---|
| Fixed-timestep tick, two-lane FNV-1a hash over every f64, NaN refused, signed zero canonicalized | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` has read `0d38671370d12d1e` since the first harness |
| Physics law in Rust on `rapier3d-f64` with `enhanced-determinism`, one WebAssembly binary, Linux digest pinned | `solver/` | `fixtures/solver.sha256`; CI rebuilds and compares |
| Bodies with position, velocity, a canonical quaternion, angular velocity, and half-extents; dynamic boxes rotate; a kinematic character with a 0.3 step, 45° climb, 0.2 snap; sleep counted in quanta; the solver snapshot hashed | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| World files: bodies, oriented static colliders, heightfields, zones as a partition, twelve load refusals, hazards at load, an index the host trusts | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js` |
| Verbs admitted at load with effects `drive`, `climb`, `carry`, `release`, `episode`, each with hazard scenarios | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Minds: sight with line of sight, typed beliefs citing episodes, tombstone supersession, stale writes refused, standing goals with a met flag | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Replay from seed and log; a debug view of the tick on localhost | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` is a person's play through the host boundary |

Seventy-three tests, seven behaviour fixtures that replay frame for frame, and two golden hashes under three engines, on every commit.

## Install

Requirements: Node 20 or newer, and the Rust toolchain with the `wasm32-unknown-unknown` target for the solver build. CI pins Rust 1.98.1; `rustup target add wasm32-unknown-unknown` is the one extra step after installing rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, and both goldens under node
```

`npm test` builds the solver first. On Linux the build is compared to the pinned digest; on another host it reports its own digest, because the Linux build is the pinned artifact.

## Use

Every command runs from any directory, answers `--help`, exits 0 on success, 1 with a reason on a refusal, and 2 on a usage error or an unexpected failure. `--debug` lets a stack trace through.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick, print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile a verb draft, run the hazards for its effect, add it to the catalog
npx load retire climb                               # take a verb out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # rewrite fixtures/golden.txt from harness/sim.mjs, with a reason in the commit
```

The debug view is a debug view. It draws committed frames as projected boxes along the axis chosen with `x`, `y`, or `z`; a click is a ground-plane target; `M`, `C`, `G`, `D`, and `U` choose move, climb, pick up, drop, and use; the zone of the walker and each mind's beliefs sit beside the tick and the hash. It never draws anything the tick does not hold.

A world file is JSON: `name`, `seed`, `bodies`, `colliders`, `zones`, and optionally `heightfield` and `goal`. A body is `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` with an optional quaternion and angular velocity; a static collider is a box by its bounds with an optional quaternion about its centre; a zone is a named box. Unknown fields, duplicate ids, overlapping bodies, a body inside a collider, a non-unit quaternion, a degenerate or unreachable zone, and a goal naming nothing are each refused with a reason.

## The law, in one breath

A seeded tick is the law. The quantum is 1/64 s, every quantum is hashed, and a player action spans many quanta. Replay is the seed plus the log of what was admitted. The model proposes intents, typed beliefs, and body drafts; the checker for that class admits or refuses. Verb drafts and world files wait until load time and pass a hazard suite. The host receives committed frames and returns intents. Presentation has no path back into the hash.

## Trust model

The engine runs locally and touches only files inside its own checkout: worlds, verb drafts, fixtures, and any log you ask a command to write. `host` binds `127.0.0.1` only. No command opens any other socket; the frozen `propose` instrument, once a person unfreezes it, talks to a local Ollama server and nowhere else. No credentials are read, stored, or sent. No telemetry is collected. Authored content is untrusted and is validated at load; a refused file changes nothing. The WebAssembly binary is built from source in CI and pinned by its SHA-256, never committed as bytes. See [SECURITY.md](SECURITY.md).

## Support status

Pre-1.0, released as `0.x` from `main`. There is no compatibility promise between releases; every change to the hashed law is recorded in [CHANGELOG.md](CHANGELOG.md) with the golden hash it produced. Tested on Node 22 and Rust 1.98.1 on Ubuntu in CI, and built daily on Windows 11.

## License

MIT. Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
