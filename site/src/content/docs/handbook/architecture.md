---
title: Architecture
description: The tick, the hash, the solver, replay, and the boundary with the host.
sidebar:
  order: 5
---

## The tick

The quantum is a fixed timestep of 1/64 s. `submit` admits a proposal against the newest committed frame and schedules it; `advance` runs one quantum; `settle` runs until nothing is scheduled. A player action spans many quanta, and the world keeps stepping while nothing is scheduled. One action per actor at a time: a second intent while quanta remain is refused with the count.

Every quantum ends in a committed, frozen frame: the tick number, the hash, and every body's record. The host receives those frames and returns intents. It never writes into the world.

## The hash

Every quantum is hashed with a two-lane FNV-1a over little-endian f64 words. The hash covers each body's position, linear velocity, orientation, angular velocity, and, when the world declares zones, the index of the zone that holds its centre; while a body is carried, the carry links; per mind, the goal count, each goal's met flag and tick, the belief count, and the newest belief id; and the solver's full snapshot. A NaN anywhere aborts the step. Signed zero is canonicalized before it is mixed, so `-0` and `+0` hash alike, and a quaternion and its negation hash alike because `w` is made non-negative first.

The load hash covers the seed, the content, and the snapshot after load. A belief write mixes at admission.

## The solver

The physics law is `solver/`, a Rust crate on `rapier3d-f64` with `enhanced-determinism`, compiled to `wasm32-unknown-unknown` with relaxed SIMD off and source paths remapped so the build does not embed host paths. It is delivered as an ES module holding the bytes with a synchronous instantiate, so V8, SpiderMonkey, JavaScriptCore, and node all run the same bytes unbuilt.

At load the crate builds a Rapier world from the record: static colliders as fixed bodies, a heightfield when there is one, dynamic bodies that rotate, and the character as a kinematic body with rotation locked. Load runs one pass of Rapier's collision pipeline so the broad phase holds every collider and every pair is registered before the first step; every non-fixed body is then woken so the physics pipeline admits it. Each step drives the character with Rapier's character controller (a 0.3 autostep, a 45° climb limit, a 50° slide angle, a 0.2 snap), steps the world, and writes every body's pose and velocity back with a canonical quaternion.

Sleep is counted in quanta, never seconds. The snapshot is the canonical serialization of every body's state, sleep counters, and the contact manifolds with their warm-start impulses, sorted by pair, so a change in solver-internal state moves the hash. The world is rebuilt when its signature changes: body and collider counts, the heightfield shape, the driven and carried masks, the geometry, and the character shape.

The Linux build is the pinned artifact. `fixtures/solver.sha256` holds its digest; CI rebuilds on Linux and compares. Another host reports its own digest and does not write the pin.

## Replay

A log is the seed, the world, and every admission with the tick and hash it was admitted against. `replay` rebuilds the world, advances to each entry's tick, submits the proposal, and compares each hash; it fails on the first that differs. Derived state, such as the episodes a mind writes when it sees something, is not logged: replay rebuilds it, and a test proves the rebuilt record matches.

## Content at load

World files and verb drafts are validated at load and run against hazard suites before they can enter a running world. The host trusts only worlds in the index whose file still hashes to its entry. See [World files](../world-files/).

## The proposer and the checker

A language model may propose intents, typed beliefs, and body drafts. Each class has a hand-authored predicate that admits or refuses: an intent must name an admitted verb, cite the newest frame's hash, and pass the swept segment test with the actor's half-extents against every collider; a belief must cite an admitted episode and may supersede only with the withdrawing episode named; a body draft must not overlap anything. The model never commits. The instrument that runs a model, `propose`, is frozen for this phase.

## The host boundary

The host receives frozen committed frames and returns intents stamped with the newest committed hash. `host` serves a debug view that draws the tick's state as projected boxes and nothing more. Presentation has no path back into the hash.

## The repository

| Path | Owns |
|---|---|
| `packages/frame` | the contract types, the hash, the frozen frame |
| `packages/tick` | the world, the tick, predicates, memory, minds, replay, scene loading, the `play` and `replay` commands |
| `packages/load` | verb compilation, the hazard suite, the `load` command |
| `packages/host` | the session, the server, the debug view, the `host` command |
| `packages/propose` | the frozen proposer instrument |
| `packages/tool` | the command guard every bin shares |
| `solver/` | the Rust crate and its build script |
| `predicates/` | admitted verbs, hazard scenarios, belief keys |
| `worlds/` | world files and the index |
| `fixtures/` | goldens, captures, drafts |
| `harness/` | the two golden harnesses, the check, and the solver tests |
| `docs/` | the design of record, the plan, every slice dispatch, and the study-swarm research with signed receipts |
