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

The loader validates the file (see [World files](../world-files/)), then runs its hazards on the product law: every body must come to rest within 512 quanta with no NaN and nothing below the lowest collider, and loading twice must give one load hash. On admission the name and load hash are written to `worlds/index.json` and printed. On refusal the reason is printed and the exit code is 1.

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

A world restores two ways, and neither writes into the physics engine's internal state, which is why both are exact.

- **By replay.** `replayTo(spec, tick)` in `harness/replay-to.mjs` rebuilds a world from its seed and replays its accepted inputs up to a step, ready to continue.
- **By image.** The generated solver module's `imageSolver()` copies the WebAssembly module's whole linear memory, 32 MiB, and `restoreImage(image)` puts it back. An image carries the binary's SHA-256 and a digest of its own bytes; a restore refuses an image from another binary, one of the wrong length, one with a changed byte, or one taken while a call was still running. `world.save()` and `world.restore(saved)` pair the image with the world's records.

## Rewrite the golden

```bash
npx write-golden
```

Runs the character course and the outcome tests first, and refuses to write while any of them fails. Then it runs `harness/sim.mjs`, writes `fixtures/golden.txt` and `fixtures/golden-behaviour.json`, and prints every behaviour number that moved, so the commit can say what changed and why. This is the one command that moves the product golden, and it is used once per change to the law. It never touches the arithmetic golden.
