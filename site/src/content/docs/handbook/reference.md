---
title: Reference
description: Every command, flag, exit code, and file the engine reads or writes.
sidebar:
  order: 4
---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Refused, with a one-line reason on stderr |
| `2` | Usage error, a frozen instrument, or an unexpected failure (one line on stderr; `--debug` prints the stack) |

## Commands

### `play <proposals.json> [--seed N] [--log out.json]`

Runs a JSON array of proposals through a fresh tick. Prints each committed frame as `tick hash`. `--seed` defaults to the fixture seed. `--log` writes `{ seed, world, log }`, where `log` holds every admission with the tick and hash it was admitted against.

### `replay <log.json>`

Reruns a log written by `play` or `host`. Advances to each entry's tick, submits it, and compares every hash. Prints `replay ok: N hashes` or fails at the first difference with the entry number and reason. A file without a `log` array is refused as not a play log.

### `load admit <draft.json>`

Compiles a verb draft, runs the hazard scenarios for its effect, writes `predicates/intents/<verb>.json`, and adds it to `predicates/intents/index.json`. Refuses a draft whose verb is already recorded or retired, an unknown effect, a field the effect does not use, or any failed scenario.

### `load retire <verb>`

Moves a verb from the rules list to the retired list in the index.

### `load world <world.json>`

Validates the world, runs its hazards on the product law, and writes its load hash to `worlds/index.json`. Prints the hash on success.

### `host [--world <world.json>] [--port N] [--log out.json]`

Serves the debug view on `127.0.0.1`, port 4173 by default. Without `--world` it serves the fixture room. Refuses a world that is not in the index or whose file no longer hashes to its entry. `--log` writes the play as a log.

### `propose [--unfreeze] [--out <file>]`

The proposer instrument. Frozen: exits 2 without `--unfreeze`. When unfrozen it asks a pinned local model, through Ollama at `127.0.0.1:11434`, to propose into a fresh tick under a grammar built from the catalog and the frame, and refuses to report unless its own preconditions hold.

### `write-golden`

Runs `harness/sim.mjs` and writes its output to `fixtures/golden.txt`.

Every command accepts `--help` and `--debug`.

## Verb rules

A rule under `predicates/intents/` is `{ verb, effect, speed, maxDistance, requiresClearPath, maxQuanta, targetKind?, ... }`. Effects and the fields they add:

| Effect | Target | Extra fields | What the tick does |
|---|---|---|---|
| `drive` | point or body | none | drives the actor at `speed` toward the target for the quanta the distance takes |
| `climb` | point | `maxRise` | rises past the 0.3 step height on a counted kinematic path, then crosses; refuses a rise the step covers |
| `carry` | body | `maxHalfExtent` | takes one sleeping body out of the solver and pins it to the actor |
| `release` | point | none | sets the carried body down awake on the support under the point |
| `episode` | body or zone | none | records `use <actor> <target>` as an episode; the world does not change |

A rule without `effect` compiles as `drive`.

## Hazard scenarios

`predicates/hazards/index.json` lists `{ file, effect }` pairs. A scenario is a small world, an actor, a target, and `expect: admit` or `expect: refuse`. A draft must satisfy every scenario for its effect.

## Belief keys

`predicates/beliefs/keys.json` names each belief key with the subject kind it applies to and its value type: `at` (body, value a zone), `seen` (body, value a tick), `holds` (body, value a body), `contains` (zone, value a body), `visited` (zone, value a tick).

## Fixtures and goldens

| File | What it is |
|---|---|
| `fixtures/golden.txt` | the product golden from `harness/sim.mjs` |
| `fixtures/golden-arith.txt` | the arithmetic contract from `harness/arith.mjs`, `0d38671370d12d1e` |
| `fixtures/solver.sha256` | the SHA-256 of the Linux build of the solver binary |
| `fixtures/behavior-*.json` | captures that replay frame for frame on the product law |
| `fixtures/shape-traversal.json` | the traversal frames that settled the character's shape as a box |
| `fixtures/*-draft.json` | the verb drafts admitted into the catalog |
| `fixtures/first-scene-played.json` and three other captures | records from before the law was three-dimensional; the loader refuses each, and a test holds that |

## Scripts

| Script | Runs |
|---|---|
| `npm run verify` | typecheck, the suite, both goldens under node |
| `npm test` | builds the solver, then the suite |
| `npm run typecheck` | `tsc -p tsconfig.json`, nothing emitted |
| `npm run check` | both harnesses against their golden files |
| `npm run solver` | builds the solver and writes the digest on Linux |
| `npm run audit:deps` | `npm audit --audit-level=high` |
