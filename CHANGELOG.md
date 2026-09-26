# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **A trace and the first difference.** `harness/trace.mjs` prints one line per step with every body's numbers as exact bit patterns, under node and the three engine shells. `harness/first-difference.js` names the first step, body, and field where two traces part. CI prints that block when an engine leaves the golden.
- **Behaviour numbers beside the golden.** `fixtures/golden-behaviour.json` records each dynamic body's sleep step, every final position, the walker's zone, and the snapshot's length and digest. `npm run check` verifies them, and `write-golden` names each one that moves.
- **Save and restore.** A world restores by replaying its inputs to a step (`harness/replay-to.mjs`) or by copying the physics module's memory (`imageSolver`, `restoreImage`). Both are proven to continue exactly from several steps chosen at contacts, sleeps, and wakes. An image from another binary, of the wrong length, with a changed byte, or taken during a call is refused.
- **An ARM64 job in CI.** It runs the pinned x64 binary under node on an ARM64 runner and requires both goldens and an identical trace.
- **A lint on the compiled physics.** `solver/lint.mjs` runs after every build and refuses relaxed-SIMD instructions, memory or table growth, a growable memory, a start section, passive segments, and bulk-memory initialisation.
- **Bundles and a replay corpus.** A failing check writes a bundle of its seed, world, accepted inputs, and hashes, with the physics module's memory stored as only the pages in use; `replay <bundle>` reproduces it in one command. A weekly job replays every bundle in `fixtures/corpus/`, every fixture, every log, and the product scene to 100,000 steps, and opens an issue with the first difference on a failure.
- **Soundness checks.** A source test refuses any cast from a shared reference to a writable one, including the forms the compiler's lint misses; a dropped refusal fails the build; native Rust tests run in CI.
- **Roles for model seats.** A model proposes only through a role, a manifest in `predicates/roles/` that the loader admits. The loader derives the Rule of Two from what the role reads and refuses a role that would read untrusted input, read private data in a live world, and change state. A role gate in the tick holds every proposal to its role's manifest, its body, its freshness window, and its budget. The log records each role admission's provenance and carries the manifests it cites. A belief keeps the least trust of what formed it. Every model call is recorded, and CI checks the committed records without a GPU. `test-instrument` and `npc-mind` are declared, both frozen.
- **A reachability sweep at load.** `load world` explores a world's reachable states with the admitted actions, through the checker, and refuses a zone nothing reaches, a body carried out of the world, or a throw, each with a witness or a bundle that `replay` reproduces. The weekly corpus job sweeps every indexed world, fixture world, and the product scene, and fails when a verdict differs from its record.
- **The tick saves and restores itself.** `createRestorableTick` gives a tick `save()` and `restore(saved)`, which carry the solver's memory as the pages in use and the tick's own state, and restore without replay. A restore checks the whole save before it writes anything.
- **Tests of outcomes.** A character course at the controller's measured limits, a thin fast body against a thin wall, terrain seams, and the terrain surface checked against where a dropped box comes to rest. `write-golden` refuses to write while any of them fails.

### Changed

- **The load hash covers the whole world file.** It used to miss a collider nothing touched at load, and most of a body's and a mind's fields, so an edited file could pass the index. It now covers every field but the name, and `worlds/crate-and-door.json` is admitted again under `e3c445a78b7428c8`.
- **An actor at rest can act.** A body at rest sits a contact margin into what it rests on, and the checker's clear-path tests used to start inside the floor. They now start one controller skin, 0.01, above it.
- **crate-and-door is walled on every side,** and so is the minds fixture's room: the sweep found bodies carried out of both.
- **`propose --unfreeze` is gone.** A role's manifest says whether it is frozen. `propose` lists the roles, and `propose --role` refuses a frozen role, or one that acts in a live world, with exit 2 before any model client loads. The frozen instrument's self-measurement is removed; `fixtures/proposer-qwen2.5-7b.json` stays as its record.
- **The product golden is `6e0d351693b18c93`.** The product scene's climber now stands on a floor, where before it fell for the whole run; an action's start or end no longer rebuilds the physics world; and the walker no longer loses a step's travel on flat ground.
- **Actions switch bodies in place.** Starting or finishing an action, or picking a body up or putting it down, used to rebuild the whole physics world, which woke every sleeping body and discarded every contact's warm start. Now only that body switches, so untouched sleeping bodies stay asleep and keep their contacts. A body put down joins the character's queries at the next step. `solverRebuilds()` counts the worlds the physics module has built.
- **Fixed memory.** The solver's memory is fixed at 512 pages, 32 MiB, with an allocator over that span, and `heapHighWater()` reports its peak. The build exports the stack pointer so a memory image is only taken between calls.
- **Terrain and fast bodies.** Heightfields are built with Rapier's internal-edge fix, and `max_ccd_substeps` is set to 1 explicitly.
- **The Linux solver digest is `1b66023d91a8f031daa36afdb9baed8cfef96430bccd0a2a23b74fc5c3861143`.**
- **Stricter inputs to the physics.** Infinities are refused alongside NaN; a body mode outside the four the law knows is refused; quaternions with extreme components normalize correctly or are refused.
- **The world's signature compares geometry directly.** It used to compare a 64-bit fold that two different worlds could share.
- **The snapshot digests in the trace and the behaviour file carry 64 bits.** Their two halves were identical before.
- **Build hygiene.** The solver builds with `--locked` and passes its flags through `CARGO_ENCODED_RUSTFLAGS`; its exports and static references use the Rust 2024 forms under the 2021 edition; `solver/FLAGS.md` records that the toolchain version is part of the law.

### Fixed

- **The walker keeps its stride.** On flat ground the character lost most of a step's travel on about one step in 30. Rapier's character controller files the whole step as vertical when the floor's normal is vertical but for its last bit (dimforge/rapier#1019). The character now moves through the engine's own copy of that routine, `solver/src/kcc.rs`, with one branch for that case, and a native test shows the copy matches Rapier's controller bit for bit without it. The copy is under the Apache License 2.0.
- **Undefined behaviour in the solver.** `solver_clear_warmstart` wrote warm-start impulses through a pointer cast from a shared reference. It is removed, and the engine no longer writes into Rapier's state from any path.
- **Memory growth.** The 0.1.0 binary declared no memory maximum, and its allocator could grow memory, which a host may allow or refuse. Memory is now fixed.
- **Sleep state per world.** Asking whether a body is asleep in a world the physics module does not currently hold used to answer for whichever world stepped last; it now refuses with a reason.
- **The terrain surface.** The actions' support query read a smoothly blended heightfield, while the physics collides with two flat triangles per cell. It now reads the physics' own surface.

## [0.1.0] - 2026-09-25

The first release. Version numbers before 0.1.0 were internal slice counters and were never tagged or published.

### Added

- **The tick.** A fixed timestep of 1/64 s, every quantum hashed with a two-lane FNV-1a over little-endian f64 words, NaN refused, signed zero canonicalized. Replay is the seed plus the admitted-input log; `play` writes one, `replay` reruns it and fails on the first hash that differs.
- **The law in Rust.** The physics step is `solver/`, a Rust crate on `rapier3d-f64` with `enhanced-determinism`, compiled to one WebAssembly binary with relaxed SIMD off and source paths remapped, delivered as an ES module the three shells instantiate synchronously. The Linux build is the pinned artifact: `fixtures/solver.sha256` holds its digest and CI checks it. Load runs one pass of Rapier's collision pipeline so the broad phase and the pair set agree from the first quantum.
- **Bodies in three dimensions.** Position, linear velocity, a canonical unit quaternion, angular velocity, and half-extents on three axes. Dynamic boxes rotate under contact. The character is a kinematic box driven by Rapier's character controller: a 0.3 step, a 45° climb limit, a 0.2 snap. Sleep is counted in quanta and the full solver snapshot, warm-start cache included, is hashed each quantum.
- **World files validated at load.** `worlds/<name>.json` holds bodies, static colliders that may carry an orientation, a heightfield, zones as a half-open partition, and a host-only goal. Twelve refusal reasons, each tested. `load world` runs the hazards, settles the world, and writes the load hash to `worlds/index.json`; the host serves only a world whose file hashes to the index. The swept admission test runs in a rotated collider's local frame.
- **Verbs admitted at load.** A rule names its effect: `drive`, `climb`, `carry`, `release`, or `episode`. `move`, `push`, `climb`, `pick-up`, `drop`, and `use` are in the index, each admitted from a draft by `load admit` against hazard scenarios scoped by effect. A carried body leaves the solver and rides the actor's record; a climb rises past the step height on a counted kinematic path; `use` records an episode.
- **Minds.** A body may carry a mind: a sight radius with a line of sight past static colliders, beliefs typed by `predicates/beliefs/keys.json`, each citing the episode it came from, supersession as a tombstone, a stale write refused with both episodes named, and standing goals with a met flag. Nothing pursues a goal and no model runs.
- **Golden hashes under three engines.** CI builds the solver, runs the suite, installs pinned V8 15.6.61, SpiderMonkey 156.0.1, and JavaScriptCore 319571 through jsvu, and requires each to print the product golden and the arithmetic golden. The arithmetic golden, `0d38671370d12d1e`, has not moved since the first harness.
- **Behaviour fixtures.** Captures that replay frame for frame on the product law: three-dimensional motion, the solver, rotation, a rotated ramp, the verbs, and the minds, plus the traversal frames that settled the character's shape as a box. The four captures from before the law was three-dimensional are kept as refused records.
- **A debug view.** `host` serves a labelled debug view of the tick on `127.0.0.1:4173`, drawing committed frames as projected boxes along a chosen axis, with a verb mode, the zone of the walker, and each mind's sight and beliefs beside the tick and the hash.
- **A frozen proposer seat.** `propose` is an instrument that asks a pinned local model to propose into a fresh tick under a grammar built from the catalog and the frame. It is frozen for this phase and refuses to run without `--unfreeze`.
- **Commands.** `play`, `replay`, `load`, `host`, `propose`, and `write-golden`, each answering `--help`, printing one line and exiting 2 on an unexpected failure unless `--debug`, and exiting 1 with a reason on a refusal.
- **Records of how it was decided.** `docs/PHASE-0.md`, `docs/PHASE-1.md`, the slice dispatches, the consult briefs and replies, and the study-swarm dispatches with their signed citation receipts.

### Golden hashes at this release

| Harness | Hash |
|---|---|
| `harness/sim.mjs` (product) | `fd2f6c03fb982d77` |
| `harness/arith.mjs` (arithmetic contract) | `0d38671370d12d1e` |
| `fixtures/solver.sha256` (Linux binary) | `ede99ea1e51ec3ca12afa407764a66acf98eda3d7c36ac70397a6105c76fb5f0` |

[Unreleased]: https://github.com/mcp-tool-shop-org/si-rpg-engine/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mcp-tool-shop-org/si-rpg-engine/releases/tag/v0.1.0
