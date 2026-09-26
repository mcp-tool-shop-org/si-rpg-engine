---
title: Architecture
description: The tick, the hash, the solver, replay, and the boundary with the host.
sidebar:
  order: 6
---

## The tick

The quantum is a fixed timestep of 1/64 s. `submit` admits a proposal against the newest committed frame and schedules it; `advance` runs one quantum; `settle` runs until nothing is scheduled. A player action spans many quanta, and the world keeps stepping while nothing is scheduled. One action per actor at a time: a second intent while quanta remain is refused with the count.

Every quantum ends in a committed, frozen frame: the tick number, the hash, and every body's record. The host receives those frames and returns intents. It never writes into the world.

## The hash

Every quantum is hashed with a two-lane FNV-1a over little-endian f64 words. The hash covers each body's position, linear velocity, orientation, angular velocity, and, when the world declares zones, the index of the zone that holds its centre; while a body is carried, the carry links; per mind, the goal count, each goal's met flag and tick, the belief count, and the newest belief id; and the solver's full snapshot. A NaN or an infinity anywhere aborts the step, and a body whose mode is not one of the four the law knows is refused. Signed zero is canonicalized before it is mixed, so `-0` and `+0` hash alike, and a quaternion and its negation hash alike because `w` is made non-negative first.

The load hash covers the seed, the content, and the snapshot after load. A belief write mixes at admission.

## The solver

The physics law is `solver/`, a Rust crate on `rapier3d-f64` with `enhanced-determinism`, compiled to `wasm32-unknown-unknown` with relaxed SIMD off and source paths remapped so the build does not embed host paths. It is delivered as an ES module holding the bytes with a synchronous instantiate, so V8, SpiderMonkey, JavaScriptCore, and node all run the same bytes unbuilt. The module's memory is fixed at 512 pages, 32 MiB, and cannot grow; the allocator works inside that fixed span, so a world denser than it holds stops the same way on every host. The build exports the stack pointer so a memory image is only ever taken between calls.

At load the crate builds a Rapier world from the record: static colliders as fixed bodies, a heightfield when there is one, dynamic bodies that rotate, and the character as a kinematic body with rotation locked. Load runs one pass of Rapier's collision pipeline so the broad phase holds every collider and every pair is registered before the first step; every non-fixed body is then woken so the physics pipeline admits it. The world is built once and kept; it is rebuilt only when the world or its geometry changes. When an action starts or ends, or a body is picked up or put down, that one body switches in place, from moving on its own to driven and back, or out of the world and into it, so a sleeping stack across the room stays asleep and keeps its contacts. A body picked up leaves the character's queries at once; a body put down joins them at the next step, whatever the order of the bodies' records. A step applies its drops before its pick-ups, so a body put down never takes the broad-phase slot that a body picked up in the same step has just freed. Each step drives the character with the engine's copy of Rapier's character controller (a 0.3 autostep, a 45° climb limit, a 50° slide angle, a 0.2 snap). The copy, `solver/src/kcc.rs`, makes two changes. Where the floor's normal is vertical but for its last bit, Rapier's routine files the whole step as vertical and the character loses its travel, and the copy keeps it. And where the move's first cast finds no floor although the character stood on one, because parry's cast loses its direction to rounding when it starts exactly on the contact skin (dimforge/parry#452), the copy casts once more with the skin 1e-9 larger. Without the two changes the copy moves the character exactly as Rapier's does, which a native test checks bit for bit. The character then pushes the dynamic bodies it touched through the engine's copy of Rapier's impulse routine, `solver/src/impulses.rs`. The copy carries Rapier's own later fix (dimforge/rapier#1004): at rapier3d-f64 0.35.3, when two dynamic bodies were near the character, one could be pushed at the other's contact points. Without the fix the copy pushes exactly as Rapier's 0.35.3 routine does, which a native test also checks bit for bit. The copy also sizes each contact point's impulse with the pushed body's effective mass at that point, its turning included, where Rapier's routine uses the two bodies' linear masses only (dimforge/rapier#1020, still open). Without it, a push off a body's centre overshoots, and a thin, light box launches at 41 times its pusher's speed. A guard fails any push that leaves a body faster than one and a half times the speed of the character that pushed it. The law steps the world, and writes every body's pose and velocity back with a canonical quaternion. Heightfields are built with Rapier's internal-edge fix, so a body sliding across a cell seam does not catch. Fast dynamic bodies are swept against fixed colliders with one substep, so a small box at speed does not pass through a thin wall.

Sleep is counted in quanta, never seconds. The snapshot is the canonical serialization of every body's state, sleep counters, and the contact manifolds with their warm-start impulses, sorted by pair, so a change in solver-internal state moves the hash. The snapshot is not the whole of Rapier's state: Rapier also keeps contact geometry, solver ordering, and island state that no public call can read or write. So the engine never writes into Rapier's state; a world is restored by replaying its inputs or by copying the module's memory, which holds all of it. The Rapier world persists from step to step and is rebuilt from the records when its signature changes: body and collider counts, the heightfield shape, the driven and carried sets, which change when a character starts or finishes an action, the geometry, and the character shape.

The Linux build is the pinned artifact. `fixtures/solver.sha256` holds its digest; CI rebuilds on Linux and compares. Another host reports its own digest and does not write the pin. CI also runs the pinned x64 binary on an ARM64 runner and requires the same fingerprints and an identical trace, and `solver/lint.mjs` refuses any binary that could let the host choose a result, grow its memory, or keep state outside it.

## Replay

A log is the seed, the world, and every admission with the tick and hash it was admitted against. `replay` rebuilds the world, advances to each entry's tick, submits the proposal, and compares each hash; it fails on the first that differs. Derived state, such as the episodes a mind writes when it sees something, is not logged: replay rebuilds it, and a test proves the rebuilt record matches. A bundle adds the hashes to a save tick and, optionally, the physics module's memory at that tick, so a failure found anywhere reproduces in one command.

## Content at load

World files and verb drafts are validated at load and run against hazard suites before they can enter a running world. The host trusts only worlds in the index whose file still hashes to its entry. See [World files](../world-files/).

## The proposer and the checker

Every proposal has a hand-authored predicate that admits or refuses it: an intent must name an admitted verb, cite the newest frame's hash, and pass the swept segment test with the actor's half-extents against every collider; a belief must cite an admitted episode and may supersede only with the withdrawing episode named; a body draft must not overlap anything. Nothing proposed commits itself.

A language model proposes only through a role: a manifest in `predicates/roles/` that says what the role reads, what it may propose (intents and beliefs, never body drafts), where its proposals act, and which model, prompt, and schema it uses, each pinned by hash. The loader derives from the role's inputs whether it reads untrusted input, reads private data in a live world, and changes state, and refuses a role that would do all three. The tick's role gate stands beside the verb predicates. It holds each proposal to its role's manifest and to the body its instance speaks for. It admits a late proposal only within the role's window, and only if every predicate passes on the world as it is when the proposal arrives. A belief a role forms takes the lower of the role's own trust and the least trusted belief in the minds it read, so trust cannot be raised by passing text through a role. The log records each role admission's provenance, and a log carries the manifests it cites, so replay gates it against the manifest it was recorded under and never calls a model. Both declared roles, `test-instrument` and `npc-mind`, are frozen.

## The host boundary

The host receives frozen committed frames and returns intents stamped with the newest committed hash. `host` serves a debug view that draws the tick's state as projected boxes and nothing more. Presentation has no path back into the hash.

## The bench

The bench measures a change against its parent. It runs the base and the head each in a Node process of its own, whose working directory is its tree's root and which loads only its own tree's modules, so no run can read the other tree's code or restore the other's save. Each candidate runs on both trees from the load, each tree citing its own frames, and T1's comparison names the first step, body, and field where they part. When `solver/` changes, each tree builds its own binary. A coverage build of the head then says which lines of the law each run reached, after its run of the product scene has matched the product build's frame for frame. Its one line in the law's source, a symbol the coverage build needs, compiles only in that build, so the product binary does not move.

## The repository

| Path | Owns |
|---|---|
| `packages/frame` | the contract types, the hash, the frozen frame |
| `packages/tick` | the world, the tick, predicates, memory, minds, replay, scene loading, the `play` and `replay` commands |
| `packages/load` | verb compilation, the hazard suite, the `load` command |
| `packages/host` | the session, the server, the debug view, the `host` command |
| `packages/propose` | the seat: the only code that calls a model, its records, and the `propose` command |
| `packages/tool` | the command guard every bin shares |
| `packages/bench` | the instrument's bench: a change's anchors, its trees and their processes, reach, the ladder, the mutants, the report, and the `bench` command |
| `solver/` | the Rust crate, its build scripts, the allocator, and the binary lint |
| `predicates/` | admitted verbs, hazard scenarios, belief keys |
| `worlds/` | world files and the index |
| `fixtures/` | goldens, captures, drafts |
| `harness/` | the two golden harnesses, the trace and first-difference tools, restore by replay, the behaviour check, and the solver, outcome, and course tests |
| `docs/` | the design of record, the plan, every slice dispatch, and the study-swarm research with signed receipts |
