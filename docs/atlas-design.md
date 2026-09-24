# Proposed Atlas design — si-rpg-engine

**Status:** revised 2026-09-24 after the Atlas consult. Not a map. Atlas has not read this folder.

This file is the design of record for how the repository will operate. [PHASE-0.md](PHASE-0.md) is the design of record for the engine. A later `atlas map` writes `atlas/README.md` from the tree. This document is not that file. Hand-writing the page into `atlas/` is how a design and a map drift while the checks stay green.

`atlas check` compares the committed map with the tree. It does not read `docs/`. A named boundary that matches no files fails with `ATLAS_BOUNDARY_EMPTY`. A door is a workflow or a `package.json` bin. A library export is not a door. The page follows the door whose reach covers the most parts. Those are facts of Atlas 1.17.0, read in testing-os.

An empty summary is published as "unnamed: what this repository is." Every summary below is filled in.

## What the consults settled

Gemini and Claude both said revise. Kept from both: `frame` stays its own package, play is the door a newcomer follows after slice 2, and the first check passes on the harness alone.

Taken from Claude, because they match how Atlas reads a tree:

- `frame` holds the committed-frame type, the intent type, and the hash function. Tick and the harness import it. Hosts live outside this repository, so the page does not say they import it.
- CI installs pinned builds of V8, SpiderMonkey, and JavaScriptCore with jsvu 3.0.5 or later on `ubuntu-latest`, and compares each result to the golden hash. The versions are named in the workflow and change by pull request. jsvu's default is the latest build of each engine, which is a moving target, so the workflow passes `<engine>@<version>`. The JavaScriptCore bundle carries its own loader and libraries. The workflow installs nothing else for it. CI does not write the golden hash. `write-golden` is a bin no workflow runs. A person runs it when the integrator or the hash function changes. An engine bump that moves the hash is a defect in the harness, and `write-golden` is not the fix.
- Intent rules and hazard rules are disjoint globs, each added when its directory exists. Tick reads `predicates/intents/index.json` by a literal path. A directory read built at run time is counted and not named, so the page could not say which rules tick reads.
- `play` and `replay` are bins. `play` reads an intent log, runs tick, and writes frames, so its reach is wider than the harness on purpose. That is why the page leads with play. Leaving it to reach order would lead with CI.
- Slice 1's boundary file names only directories that exist. Its summary describes the harness. The slice 2 summary replaces it when tick, frame, and intent predicates exist.
- The golden hash is `data`, not a test. CI believes it.

Taken from Gemini, narrowed: the slice-1 boundary file is the first file of slice 1, written before harness code. It is the theorem. It is not committed at slice 0 with globs for packages that do not exist. An empty glob fails the check. The Atlas tool is not changed to allow missing globs.

Left in disagreements: a WASM build. The plan asks for one. The tree will be TypeScript. Nothing yet names a source that compiles to WASM. The harness section does not claim it.

Checked since the last revision. jsvu's Linux JavaScriptCore wrapper runs the bundled `ld-linux` with `LD_LIBRARY_PATH` pointed at the bundle's own `lib/`, so the runner's WebKit packages are not what the binary loads. That wrapper is `engines/javascriptcore/extract.js` on jsvu main, opened 2026-09-24. jsvu's own CI runs `npm run test-linux64` on `ubuntu-latest`, and that test executes the binary. Pin jsvu at 3.0.5 or later. Older releases hang while extracting the Linux zip on Node 24.16 and Node 26. The workflow installs nothing else for JavaScriptCore.

## Slice 1 boundary file

The repository exists on the org, with this design on `main`, before this file is committed. It is then the first file of the slice, before any harness source. Commit it when those directories exist, not before.

```yaml
summary: "Determinism harness for a 3D RPG tick: one body, fixed quanta, one golden hash checked under three engines."
boundaries:
  - name: harness
    globs: [harness/**]
    role: test
  - name: fixtures
    globs: [fixtures/**]
    role: data
  - name: docs
    globs: [docs/**]
    role: docs
  - name: workflows
    globs: [.github/**]
    role: config
  - name: root
    globs: ["*"]
    role: docs
```

The harness may import `frame` once that package exists. Until slice 2, the harness contains the disposable integrator and the hash, and slice 2 moves the hash function into `frame` without changing the bytes the golden hash covers. Two hash functions is a disagreement.

## Slice 2 boundary file

Replaces the slice-1 file when these directories exist. Summary changes with the tree.

```yaml
summary: "Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames."
boundaries:
  - name: tick
    globs: [packages/tick/**]
    role: code
  - name: frame
    globs: [packages/frame/**]
    role: code
  - name: harness
    globs: [harness/**]
    role: test
  - name: intents
    globs: [predicates/intents/**]
    role: data
  - name: fixtures
    globs: [fixtures/**]
    role: data
  - name: docs
    globs: [docs/**]
    role: docs
  - name: workflows
    globs: [.github/**]
    role: config
  - name: root
    globs: ["*"]
    role: docs
```

Slice 3 adds one boundary, and no earlier glob contains it:

```yaml
  - name: hazards
    globs: [predicates/hazards/**]
    role: data
```

Bins the root manifest declares at slice 2: `play`, `replay`, `write-golden`. `play` reads an intent log, runs tick with `predicates/intents/index.json`, and writes frames. `replay` reads a seed and an input log and does not call the model. `write-golden` writes `fixtures/` and no workflow runs it.

## Target page

What Atlas must be able to produce from the slice-2 tree. A sentence the tree does not support is a disagreement, recorded below, not a quiet edit.

# si-rpg-engine: how it works

## What this is

A deterministic 3D RPG tick. The model proposes an intent, a line, a typed belief, or a body. A checker admits it. Play is a command: an intent log in, committed frames out. Replay is a command: a seed and the input log in, the same hashes out, the model not called.

## What comes in

1. **An intent log, through `play`.** The command runs tick. Each intent is checked against the hash of the frame the log names.
2. **A proposal, through the same command.** During a run: an intent, a spoken line, one typed belief, or a body draft. A verb draft does not enter here.
3. **A content pack or a verb draft, at load, between sessions.** A verb draft compiles against fixed primitives and runs against `predicates/hazards`. That directory is slice 3.
4. **A pull request or a push.** CI installs pinned builds of V8, SpiderMonkey, and JavaScriptCore with jsvu 3.0.5 or later on `ubuntu-latest`. The versions are named in the workflow and change by pull request. It runs the harness under each build and compares each result to the golden hash in `fixtures/`. The JavaScriptCore bundle carries its own loader and libraries. The workflow installs nothing else for it. CI does not write the golden hash.
5. **`write-golden`, by hand.** A person runs it locally. The pull request that carries the new hash is checked by the CI door above. No workflow runs this command.

## What happens to an intent

`play` is the widest door, because it reaches tick, frame, intents, and fixtures. The page follows it for that reason.

1. The tick refuses the intent when the frame's hash is not the current hash.
2. A hand-authored predicate in `predicates/intents`, named by `predicates/intents/index.json`, admits or refuses it. Reachability is a query against the tick's collider.
3. The action resolves across fixed-timestep quanta. Each quantum is hashed by the function in `frame`. The hash stores the serializable state. It stores no NaN.
4. Proposals admitted along the way are appended to the input log.
5. The command writes the next committed frames.

## Replay

`replay` reads the seed and the input log. The model is not called. The quanta run again. The hashes must match the log.

## The harness

One body, one static collider, 10,000 quanta, a disposable integrator. The integrator uses add, subtract, multiply, divide, and square root, or a bundled math library. Each double enters the hash as two little-endian 32-bit words, read with a DataView, so the byte order is part of the definition and not the host's. Those five operations are the ones ECMAScript specifies exactly, so a pinned engine bump must not move the hash. If a bump does move it, that is a defect in the harness's operation set. CI fails. `write-golden` is not the answer. `write-golden` is the only writer of the file, and it is for a change to the integrator or the hash function.

## Who reads the results

- **`play`** writes frames and reads the intent predicates through the index.
- **`replay`** reads the seed and the input log.
- **CI** reads the golden hash and does not write it.
- **`write-golden`** writes the golden hash.
- **People** read `docs/PHASE-0.md` for the engine contract and this file for the operating contract.

## What breaks what

- **tick** owns the quantum, the pipeline, the body record, the belief records, and the input log. It imports frame for the hash.
- **frame** owns the committed-frame type, the intent type, and the hash function. Tick and the harness import it. A hash change breaks the harness, replay, and play.
- **intents** are data. Tick reads the index, and the index names the rule files. A predicate change changes what play admits.
- **hazards**, from slice 3, are data the load door reads. Tick does not import them.
- **fixtures** hold the golden hash. One writer: `write-golden`.
- **workflows** are the CI door. They run three engines and write nothing in `fixtures/`.

## Generated, never hand-edited

The golden hash. The Atlas page, once a map exists.

## Hand-authored

`docs/PHASE-0.md`, this design, `atlas/boundaries.yaml`, `predicates/intents`, `predicates/hazards` when slice 3 adds them, content packs, and the stance-pair set when someone owns it.

## Where to start

Slice 1: CI is the busiest door. It reaches the harness and the fixtures, and it only checks those files, so the page has no ordered path of code to read. `write-golden` is the other door. It runs `harness/write-golden.js` and is the only writer of `fixtures/golden.txt`. The three engine binaries are invoked through `$HOME`, so the map records them as commands it cannot follow.

Slice 2: `packages/frame` (the hash) → `predicates/intents/index.json` → `packages/tick` → the `play` bin → `replay`. The fixture that proves the slice is `packages/tick/tick.test.js`: the quantum, the admit step, a body with a collider, the memory-write verb the checker can refuse, the host boundary, and replay from the seed and the log.

## Where the docs and the code disagree

1. The committed map is slice 2 (branch `slice-2-kernel`, 2026-09-24). The check compares the map to the tree and does not read this file.
2. A WASM build is in the engine plan and not in the tree. Nothing names a source that compiles to WASM. The harness section does not claim one.
3. The spoken-line classifier and its labeled pairs are not a door and not a package. The line is unhashed. A stance change is a belief write. The tick refuses a `line` proposal with that reason.
4. Hosts are outside this repository. The page does not claim they import frame. They are expected to.
5. The three engine runs go through `$HOME/.jsvu/bin/...`. The map says CI checks `harness/sim.mjs` and that the engine commands are built at run time. The version pins are literal in the install step.
6. Tick reads `predicates/intents/index.json` by a literal relative path, and the index names the rule files. Atlas 1.17.0 counts a working-directory read as outside the repository, so the page lists `predicates/intents/` as hand-authored with no reader it can see. The read is real; the map cannot land it. The `play` and `replay` bins `chdir` to the repository root so the literal path holds.
7. Phase 0 says the kernel contract is TypeScript. The runtime is plain ES modules, so the three shells and node run the same bytes unbuilt, and the contract is `packages/frame/types.d.ts`, checked by `tsc --noEmit` against the JavaScript. Nothing is emitted, so the map describes the files that run. This is a reading of the plan, not a change to it.
8. The map's busiest door is CI, which reaches four parts; the page's start path follows `play` because CI only runs tests. The target page above says play is the widest door. Atlas ranks doors by reach, and CI's reach includes what it checks.
9. `play` accepts `"frameHash": "@drawn"` in a scripted proposal and substitutes the hash of the current committed frame, standing in for the frame a host would have drawn. The tick still refuses any other stale hash. A host outside this tree sends the real hash.

## What this design does not ask of Atlas

The tool already fails a boundary that matches nothing. Slice 1 omits those globs. The tool is not changed to treat a missing package as an optional section.
