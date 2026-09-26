---
title: Welcome
description: What si-rpg-engine is, what it promises, and where to start.
sidebar:
  order: 0
---

si-rpg-engine is a deterministic, hashed, replayable 3D simulation engine. It runs a fixed-timestep tick, hashes every quantum of state, and keeps its physics law in Rust compiled to one WebAssembly binary. Replay is the seed plus the log of what was admitted. A language model may propose into the world; a hand-authored checker decides what enters it.

## The promise

Three JavaScript engines, V8, SpiderMonkey, and JavaScriptCore, print the same hash for the same world on every commit. Everything else is built on that: two machines can agree about a world byte for byte, from a seed and a list of admitted inputs, and any frame of any run can be rebuilt from those two things.

## What you can do with it today

- Load a world file of bodies, static colliders, a heightfield, and zones, and have it refused with a reason when it is wrong.
- Drive a character that steps, climbs a slope, climbs a ledge, carries a body, sets it down, and uses what is near it.
- Watch dynamic boxes fall, slide, tip, and tumble under a solver whose whole state is hashed each quantum.
- Give a body a mind that sees, writes beliefs citing what it saw, and refuses a belief that rests on older evidence.
- Record a play, replay it anywhere, and fail on the first hash that differs.
- Find the first step, body, and value where two runs part, from a trace of every step in exact bits.
- Save a world and restore it, by replaying its inputs, by copying the physics module's memory, or by the tick's own save, and prove the rerun exact.
- Sweep a world's reachable states before it is admitted, and refuse a zone nothing reaches or a body pushed out of the world.
- Measure a change against the build before it: which inputs reach the change, where the two runs first part, and what fails only on the change.
- Watch the committed frames in a debug view on your own machine.

## Where to start

1. [Getting started](getting-started/) installs the toolchain and runs the suite.
2. [Usage](usage/) walks through the seven commands.
3. [World files](world-files/) describes the content format and every reason a file is refused.
4. [Reference](reference/) lists every command, flag, exit code, and file format.
5. [Testing](testing/) explains how the engine is checked on every commit, and what is not yet proven.
6. [Architecture](architecture/) explains the tick, the hash, the solver, and replay.
7. [Security](security/) states what the engine touches and what it never does.

The design of record is `docs/PHASE-0.md` in the repository, the plan that built the current engine is `docs/PHASE-1.md`, and the test suite being built now is `docs/PHASE-2.md`.
