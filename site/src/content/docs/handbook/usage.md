---
title: Usage
description: Play, replay, admit a world, admit a verb, and watch the debug view.
sidebar:
  order: 2
---

Every command runs from any directory, answers `--help`, and follows one exit-code contract: `0` on success, `1` with a one-line reason on a refusal, and `2` on a usage error or an unexpected failure. `--debug` lets a stack trace through.

## Play a list of proposals

A proposals file is a JSON array. Each entry is a proposal the tick either admits or refuses: an intent, a typed belief, or a body draft.

```json
[
  { "kind": "intent", "verb": "move", "actor": "walker", "target": { "x": 2, "z": 0 } },
  { "kind": "intent", "verb": "push", "actor": "walker", "target": { "body": "crate" } }
]
```

```bash
npx play proposals.json --seed 7 --log out.json
```

`play` submits each proposal against the newest committed frame, settles the tick between them, prints every committed frame as a tick and a hash, and writes a log: the seed, the world, and every admission with the tick and hash it was admitted against. A refused proposal is printed with its reason and does not enter the log.

## Replay a log

```bash
npx replay out.json
# replay ok: 640 hashes
```

`replay` rebuilds the world from the log, advances to each admission's tick, submits it, and compares every hash. The first difference fails with the entry number and the reason. A log that carries a world is replayed in that world; a log written by `host` carries the world it served. The model is never called.

## Admit a world

```bash
npx load world worlds/crate-and-door.json
```

The loader validates the file (see [World files](../world-files/)), then runs its hazards on the product law: every body must come to rest within 512 quanta with no NaN and nothing below the lowest collider, and loading twice must give one load hash. Then it sweeps the world's reachable states with the admitted actions, and refuses a zone nothing reaches, a body carried out of the world, or a throw, each with a witness or a bundle. The sweep's report goes to stderr, and stdout is the load hash alone. On admission the name and load hash are written to `worlds/index.json` and printed. On refusal the reason is printed and the exit code is 1.

## Admit a verb

A verb draft is a small JSON rule. Its `effect` names what the tick does when the intent is admitted.

```json
{ "verb": "climb", "effect": "climb", "speed": 1, "maxDistance": 0.6, "maxRise": 1.2, "requiresClearPath": true, "maxQuanta": 256 }
```

```bash
npx load admit fixtures/climb-draft.json
# admitted climb
npx load retire climb
# retired climb
```

`load admit` compiles the draft against the fixed fields for its effect, runs every hazard scenario scoped to that effect from `predicates/hazards/`, and on success writes the rule under `predicates/intents/` and names it in the index. A draft that fails any scenario is refused with the scenario's id. `load retire` moves a verb to the retired list; an intent naming a retired verb is refused.

## Watch the debug view

```bash
npx host --world worlds/crate-and-door.json
```

Open `http://127.0.0.1:4173`. The page is a debug view of the tick and says so. It draws committed frames as projected boxes along the axis chosen with `x`, `y`, or `z`. A click is a ground-plane target for the current verb; `M`, `C`, `G`, `D`, and `U` choose move, climb, pick up, drop, and use; left and right move on the ground; up and down are refused because `move` has no vertical. The zone of the walker and each mind's beliefs and goals sit beside the tick and the newest committed hash. `--log out.json` writes the play as a log `replay` accepts.

The host serves only a world whose file hashes to what `worlds/index.json` holds. An unlisted or drifted world is refused before the first frame.

## Find where two runs part

```bash
node harness/trace.mjs > a.trace
node harness/first-difference.js a.trace b.trace
```

`harness/trace.mjs` runs the product scene and prints one line per step: the fingerprint, then every body's position, velocity, orientation, and angular velocity as exact bit patterns, its zone, what it carries, the solver snapshot's length and digest, and each mind's goals and newest belief. It runs under node and under the V8, SpiderMonkey, and JavaScriptCore shells. `harness/first-difference.js` reads two traces a chunk at a time and prints `identical`, or the first step and the first body and field that differ, with both values in hex and in decimal. It exits 0 when the traces are identical, 1 when they differ, and 2 when one is malformed or cut short.

## Save and restore

A world restores three ways, and none writes into the physics engine's internal state, which is why each is exact.

- **By replay.** `replayTo(spec, tick)` in `harness/replay-to.mjs` rebuilds a world from its seed and replays its accepted inputs up to a step, ready to continue.
- **By image.** The generated solver module's `imageSolver()` copies the WebAssembly module's whole linear memory, 32 MiB, and `restoreImage(image)` puts it back. An image carries the binary's SHA-256 and a digest of its own bytes; a restore refuses an image from another binary, one of the wrong length, one with a changed byte, or one taken while a call was still running. `world.save()` and `world.restore(saved)` pair the image with the world's records.
- **By the tick's own save.** A tick made with `createRestorableTick` has `save()` and `restore(saved)`. The save holds:
  - the solver's memory, as only the pages in use;
  - the hasher's lanes, the frame, the scheduled actions, and the quanta owed;
  - the minds' memory and the input log;
  - a role gate's window of frames and its admission ticks.

  A restore checks the whole save before it writes anything, and needs no replay.

## Replay a bundle

```bash
npx replay fixtures/corpus/product-rebuild-261.bundle.json
# bundle ok
```

A bundle is one file holding a run's seed, its world, the inputs it accepted, the hashes up to a save tick, and optionally the physics module's memory at that tick, stored as only the pages in use. Every failing restore, outcome, course, trace, or golden check that has a world and a log writes one, and CI keeps it as an artifact of the failed run. `replay` reproduces it in one command. The bundles in `fixtures/corpus/` are replayed every week by a scheduled job, alongside every behaviour fixture, every log, and the product scene run to 100,000 steps with memory restores at ten points; a failure opens an issue with the first difference.

## Measure a change

```bash
npx bench trees . main HEAD ../trees
npx bench anchors --base ../trees/base --head ../trees/head
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene
```

The bench takes a change and the build before it. `bench trees` makes the two as git worktrees and builds the head's physics in its own tree. `bench anchors` names what the change touches: each changed function, top-level declaration, verb rule, hazard, and function of the physics, and the kinds of change it does not aim at, each with its reason.

`bench run` runs each tree in a Node process of its own, which loads only that tree's modules. T6's sweep proposes the actions it explores, and a seeded grammar proposes short sequences from the states the sweep saved. Every candidate runs on both trees, from the load, and climbs a ladder:
- **Rung 0.** The candidate runs twice to the same hashes, and a save and restore at its midpoint changes nothing.
- **Rung 1.** It reached the change.
- **Rung 2.** The two trees' runs differ, at a named step, body, and field.
- **Rung 3.** It fails on the change and not on the parent: a throw, a body leaving the world, or a world still moving 512 steps after the action.

Every verdict comes from the engine, and none from a model. A candidate that differs or fails is written as a bundle that `replay` reproduces. `--control` adds a recorded play or the product scene as an input that proposes nothing.

The run writes `report.json`, `report.md`, one record per candidate in `records.jsonl`, and `access.json`, which names what reached each anchor and every anchor nothing reached. Mutants planted at the change, one per process, measure how sensitive the candidates are there. When `solver/` changes, each tree builds its own physics, and a coverage build of the head says which lines of the law each run reached; it must run the product scene exactly as the product build does, or the bench stops with the reason.

## Rewrite the golden

```bash
npx write-golden
```

Runs the character course and the outcome tests first, and refuses to write while any of them fails. Then it runs `harness/sim.mjs`, writes `fixtures/golden.txt` and `fixtures/golden-behaviour.json`, and prints every behaviour number that moved, so the commit can say what changed and why. This is the one command that moves the product golden, and it is used once per change to the law. It never touches the arithmetic golden.
