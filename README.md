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

si-rpg-engine is a simulation core for 3D worlds that replays exactly. It steps physics at a fixed 64 steps per second, records a fingerprint of the world after every step, and can rebuild any run from its starting seed and the inputs it accepted, bit for bit. The physics is Rust compiled to one WebAssembly file. A language model may suggest what happens next; hand-written rules decide what gets in. It is the counterpart to [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), and it is measured by what it simulates.

## What it is, and what it aims to be

The JavaScript engines behind Chrome, Firefox, and Safari, which are V8, SpiderMonkey, and JavaScriptCore, print the same fingerprint for the same world on every commit, and the same physics build prints it on x64 and ARM64. Everything else rests on that promise: two machines agree about a world, byte for byte, given a seed and a list of accepted inputs. On top of it sit bodies that fall, slide, push, tip, and tumble in three dimensions; a character that steps, climbs slopes, carries things, and sets them down; world files that are rejected with a reason when they are wrong; and characters with minds that see, remember what they saw, and refuse a belief based on older evidence than the one it would replace.

What it aims to be is the simulation core inside a host: a browser, Godot, or Unreal draws the picture and sends inputs, while the physics, the fingerprint, and the record stay here. The current work is the test suite a shipping engine needs, and most of it is in: a trace that names the first step and value where two runs part, save and restore that are proven exact, a second CPU architecture, a lint on the compiled physics, and tests that check what the world did rather than only its fingerprint. After the suite come collision from meshes and a host binding. The design and the plans are in [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md), and [docs/PHASE-2.md](docs/PHASE-2.md).

## What is built

| Capability | Where | Proof |
|---|---|---|
| A fixed-timestep tick; every step's state hashed with a two-lane FNV-1a over every f64; NaN and infinities refused; signed zero canonicalized | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` has read `0d38671370d12d1e` since the first harness |
| The physics law in Rust on `rapier3d-f64` with `enhanced-determinism`, one WebAssembly binary with its Linux digest pinned; one running physics world, rebuilt only when the geometry changes, with a body switched in place when an action starts or ends | `solver/` | `fixtures/solver.sha256`, which CI rebuilds and compares; `harness/switch.test.js` |
| Bodies with position, velocity, a canonical quaternion, angular velocity, and half-extents; dynamic boxes rotate; a kinematic character with a 0.3 autostep, a 45° climb, and a 0.2 snap; sleep counted in steps | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| The character's push through the engine's copy of Rapier's impulse routine, with Rapier's own later fix backported, so a body is pushed only at its own contact points; a guard in the physics fails any push that leaves a body faster than a stated multiple of its pusher's speed | `solver/src/impulses.rs` | `harness/push.test.js`, `fixtures/push/red-room-a.json`, and a native test that the copy without the fix pushes as Rapier's routine does, bit for bit |
| World files: bodies, oriented static colliders, heightfields, zones as a partition, twelve load refusals, hazards at load, and an index the host trusts; actions stand on the same two-triangle terrain surface the physics collides with | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| A reachability sweep when a world is admitted: its reachable states explored with the admitted actions, through the checker, from the tick's own saves. A zone nothing reaches, a body carried out of the world, or a throw refuses the world, with a witness that `replay` reproduces | `packages/load/sweep.js` | `harness/sweep.test.js`, the closed test rooms in `fixtures/sweep/` |
| Actions admitted at load with the effects `drive`, `climb`, `carry`, `release`, and `episode`, each with hazard scenarios | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Minds: sight with line of sight, typed beliefs citing the episode they came from, supersession by tombstone, stale writes refused, and standing goals with a met flag | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| A trace of every step in exact bits, and a tool that names the first step, body, and field where two runs part | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; CI prints the first difference when an engine leaves the golden |
| Behaviour numbers beside the golden: every body's sleep step and final position, the walker's zone, and the snapshot's length and digest | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Save and restore three ways: by replaying the inputs to a step, by copying the physics module's memory, or by the tick's own save of its whole state, which restores without replay; each proven to continue exactly | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Bundles: a failing test writes its seed, world, accepted inputs, and hashes, which `replay` reproduces in one command; a weekly job replays every bundle, fixture, and log far longer than a pull request can | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| One binary on two CPU architectures, with memory fixed at 32 MiB and a lint that refuses host-chosen instructions, memory growth, and state kept outside memory | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI's ARM64 job; `solver/lint.test.js`, `harness/caps.test.js` |
| Tests of what the world did: a character course at the controller's measured limits, a full stride on every step of a long flat walk, a thin fast body against a thin wall, terrain seams, and the whole scene moved a million units | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` refuses to write while any of them fails |
| Roles for model seats: a manifest per role, the Rule of Two derived from what the role reads, a role gate in the checker, provenance on every admission, trust labels that stay with a belief, and every model call recorded and checked without a GPU; both declared roles frozen | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` over the sessions in `fixtures/sessions/` |
| Replay from a seed and a log, and a debug view of the tick on localhost | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` is a person's play through the host boundary |

356 tests, seven behaviour fixtures that replay step for step, and two golden hashes printed by three engines on x64 and by node on ARM64, on every commit.

## Install

Requirements: Node 20 or newer, and the Rust toolchain with the `wasm32-unknown-unknown` target for the physics build. CI pins Rust 1.98.1; `rustup target add wasm32-unknown-unknown` is the one extra step after installing rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` builds the physics and lints the binary first. On Linux the build is compared to the pinned digest; on another host it reports its own digest, because the Linux build is the pinned artifact.

## Use

Every command runs from any directory, answers `--help`, exits 0 on success, 1 with a reason on a refusal, and 2 on a usage error or an unexpected failure. `--debug` lets a stack trace through.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick and print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx replay fixtures/corpus/product-rebuild-261.bundle.json   # rerun a bundle to its save tick, compare every hash, and restore its memory image
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, sweep its reachable states, and write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile an action draft, run the hazards for its effect, and add it to the catalog
npx load retire climb                               # take an action out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # run the course and outcome tests, then rewrite the goldens and name what moved
```

When two runs disagree, the trace says where:

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

A world restores three ways, and none writes into the physics engine's internal state, which is why each is exact. You can replay its accepted inputs to a step. You can copy the physics module's whole memory with `imageSolver()` and put it back with `restoreImage()`. Or you can save the whole tick with `save()` and put it back with `restore(saved)`, which needs no replay and is how the sweep returns to a state thousands of times. An image from another binary, of the wrong length, or with a changed byte is refused, and a save that does not check out whole changes nothing.

The debug view is a debug view. It draws committed frames as projected boxes along the axis chosen with `x`, `y`, or `z`; a click is a ground-plane target; `M`, `C`, `G`, `D`, and `U` choose move, climb, pick up, drop, and use; the walker's zone and each mind's beliefs sit beside the tick and the hash. It never draws anything the tick does not hold.

A world file is JSON: `name`, `seed`, `bodies`, `colliders`, `zones`, and optionally `heightfield` and `goal`. A body is `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` with an optional quaternion and angular velocity; a static collider is a box by its bounds with an optional quaternion about its centre; a zone is a named box. Unknown fields, duplicate ids, overlapping bodies, a body inside a collider, a non-unit quaternion, a degenerate or unreachable zone, and a goal naming nothing are each refused with a reason.

## The law, in one breath

A seeded tick is the law. One step, a quantum, is 1/64 s; every step is hashed, and a character's action spans many steps. Replay is the seed plus the log of what was admitted. The model proposes intents, typed beliefs, and body drafts; the checker for that class admits or refuses them. Action drafts and world files wait until load time and pass a hazard suite. The host receives committed frames and returns intents. Presentation has no path back into the hash.

## Trust model

The engine runs locally and touches only files inside its own checkout: worlds, action drafts, fixtures, and any log you ask a command to write. `host` binds `127.0.0.1` only. No command opens any other socket but `propose`, which talks to a local Ollama server and nowhere else, and only for a role whose manifest is thawed to act in a scratch world; both roles the engine declares are frozen, so it refuses before any model client loads. A model's proposal enters the world only through the role gate, which holds it to its role's manifest. No credentials are read, stored, or sent. No telemetry is collected. Authored content is untrusted and is validated at load; a refused file changes nothing. The WebAssembly binary is built from source in CI and pinned by its SHA-256, never committed as bytes. Its memory is fixed at 32 MiB and cannot grow, so a world too dense for it stops the same way on every host instead of diverging. See [SECURITY.md](SECURITY.md).

## Support status

Pre-1.0, released as `0.x` from `main`. There is no compatibility promise between releases; every change to the hashed law is recorded in [CHANGELOG.md](CHANGELOG.md) with the golden hash it produced. Tested on Node 22 and Rust 1.98.1 on Ubuntu x64 and ARM64 in CI, and built daily on Windows 11.

## License

MIT, except `solver/src/kcc.rs` and `solver/src/impulses.rs`, modified copies of parts of Rapier's character controller, which are under the Apache License 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
