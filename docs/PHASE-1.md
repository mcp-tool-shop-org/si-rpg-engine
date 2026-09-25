# Phase 1 — the engine, in three dimensions

2026-09-24, rewritten the same evening. Coordinator: Claude. Phase 0 closed at `eeed37f`.

**This file replaces the earlier Phase 1.** That version set "a scene a person has played" as the goal, which pulled a day-old kernel toward a toy room, a crate, and a picture of it. The Director corrected it twice. This engine is measured by what it can simulate. Nothing in this phase is a game, a scene from a game, art, or a model run.

## What is built, stated without inflation

A deterministic tick with a hash three JavaScript engines agree on. Replay from the seed and the admitted-input log. A checker that admits or refuses by class. Typed belief writes with tombstone supersession. Verb drafts admitted at load through a hazard suite. A pump that runs one quantum per call. A debug window that draws the tick's state. The world inside all of that is two-dimensional axis-aligned boxes under gravity, one static-collider solver on five exact operations, contact between two bodies, and two verbs: a sideways move and a push.

Phase 0 promised a 3D world of named bodies, poses, and collision shapes. That is the gap, and this phase closes it.

## Slices, in order

Each slice is one pull request, built by the builder seat, reviewed by a different family on a scratch clone, CI green before review. No slice starts before its dependency merges.

| Slice | Depends on | What it is | Done when |
|---|---|---|---|
| **E1. The body record in three dimensions** | nothing | `Body` becomes position, velocity, and half-extents on three axes; a static collider is a 3D box; `world.step` integrates all three axes on the five operations with gravity on y; the static and body-body resolution pick the smallest penetration axis of three; the swept admission test is Liang-Barsky in three dimensions; the frame hash covers every axis. The move verb targets a point on the ground plane. The product scene goes 3D and fires every branch, and the product golden is rewritten once with the reason. The 2D fixtures cannot replay under a 3D law; they are replaced by 3D captures the same day, with the old files kept and their tests turned into the boundary tests the legacy log already has. | Three engines print the new golden. A body falls, lands, slides, pushes, and is pushed on all three axes, with tests. Replay and the debug view work in 3D, the view as a projection. |
| **E2. The solver, decided and built** | E1 | Verdict B, in `docs/dispatch-e2-solver.md`. The step moves to Rust, one WASM binary, `rapier3d-f64` with `enhanced-determinism`, no relaxed SIMD, f64, NaN and signed zero refused, sleep by quanta, the solver snapshot hashed in canonical order. The character is a kinematic box with a step sweep. Stacking is allowed because that snapshot is hashed. The JavaScript kernel is the reference the first commit matches, including `735363523983fbb6`, and the product path then leaves it. The host stays JavaScript. | The binary matches the reference, then the solver's own golden prints under three engines. The E1 behavior fixture still replays on the reference. A new fixture replays on the binary. |
| **E3. Content validated at load** | E1 | A world file: bodies, colliders, and zones, where a zone is a gameplay partition above the bodies as Phase 0 says, so the tick can answer which zone a body is in. A loader refuses unknown fields, overlapping bodies, bodies inside colliders, and zones that cover nothing. Load-time hazards for content, the way verb drafts have them. The scene file from the earlier phase becomes one such world file, or is deleted. Static colliders may carry an orientation, and the reference law refuses a rotated one. | A malformed world is refused with a reason, each case tested. A body's zone is a query the tick answers and the hash covers. |
| **E4. Verbs beyond sideways** | E2, E3 | A verb table for 3D traversal and interaction: move to a point on the ground, climb or step where the inventory allows it, use, pick up and drop, push. Each is a hand-authored predicate with hazard scenarios, admitted through `load admit` like any draft. The debug view exposes each for a person to try, and nothing more. The five effects are drive, climb, carry, release, and episode, and a body carries at most one. | Every verb has a predicate, hazards, and a test that exercises it on the real tick. |
| **E5. NPC records in the world** | E3 | A body that carries the belief records and standing goals Phase 0 designed. Beliefs about zones and bodies, cited to episodes, with supersession. This is what creates the slot vocabulary the spoken-line gate needs; the gate itself stays parked until the labeled pair set has an owner. Sight writes the mind from the key table, and a stale write is refused. | An NPC's record survives replay and is covered by the hash. A stale belief is refused the way Phase 0 says. |

## The world is three-dimensional

This engine's law is fully 3D and stays that way. No presentation style, product line, or market frame names this law, its bodies, its colliders, or its verbs, and none appears in a slice contract, a brief, or a research prompt for this engine. E2 locked rotation for one slice so the frame contract and the fixtures kept their shape while the solver landed. E2b takes that lock off dynamic bodies. The character stays a box: it climbs a step of the maximum height and holds a ledge and a narrow gap at standing height, while a capsule of the same height and width misses that step and drops at the ledge, and only the capsule climbs a slope lying exactly on the 45 degree limit.

## What stays, renamed

The window is a **debug view of the tick**. It says so on the page. It draws whatever the tick holds, in 3D as a projection after E1, with boxes and no art. It is never presented as the product's picture and no slice is closed by looking at it. The Director's play log from the crate room is `fixtures/first-scene-played.json`, kept as the proof that a person's input reaches the law through the host boundary, and nothing more is claimed for it.

## What this phase does not do

No game, no scene from a game, no art, no renderer beyond the debug projection, no model run, no spoken line, no labeled pairs, no cloud. The proposer seat stays frozen for the whole phase; its thaw condition is now "an NPC record exists and a verb table beyond traversal exists", which is after E5.

## Standards compliance

- **PIN_PER_STEP: 2.** Engines and model pinned; every golden is a golden of a build; E2 adds the WASM binary's hash to the pins.
- **ANDON_AUTHORITY: 2.** CI blocks merge; goldens block solver drift; the fixtures block refactors; the seat's freeze blocks runs.
- **NAMED_COMPENSATORS: 2.** A merge to `main` is undone by `git revert -m 1 <merge>` (coordinator). A golden rewrite is undone by reverting its commit. A fixture replacement in E1 keeps the old files and their boundary tests, so nothing is deleted. No publishes.
- **DECOMPOSE_BY_SECRETS: 2.** `frame` holds the contract and the hash; `tick` the law; `load` the load gate; `host` the debug view; `propose` the frozen instrument. E2 may add a `solver` package or crate that only `tick` imports.
- **UNCERTAINTY_GATED_HUMANS: 2.** The Director is asked once, at E2, on the solver inventory's verdict, framed contrastively. Nothing else in this phase is a taste decision.
- **EXTERNAL_VERIFIER: 2.** Built by one family, reviewed by another on a scratch clone, CI as the mechanical check; E2's brief is gated by the citation verifier.
