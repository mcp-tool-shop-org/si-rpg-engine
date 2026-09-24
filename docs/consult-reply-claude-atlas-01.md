# Atlas design consult 01 — Claude, 2026-09-24

Opened for this reply: the Atlas README at `E:/AI/testing-os/packages/atlas/README.md` (v1.17.0), the page spec `E:/AI/testing-os/docs/atlas-page.spec.md`, the core error codes, and https://github.com/GoogleChromeLabs/jsvu. Three facts from those pages drive every answer: a door is a workflow or a manifest `bin`, and a library export is not one; the page leads with the door whose reach covers the most parts; and a named boundary that matches nothing fails `check` (`ATLAS_BOUNDARY_EMPTY`).

VERDICT: revise
SENTENCE: The target page follows play, and play is not a door in the tree this design describes, so the map Atlas writes at slice 2 will lead with CI and the harness unless the design gives play a door.

## Q1 — Is `frame` a package?
ANSWER: Keep it, for a reason the design does not state. The harness at slice 1 hashes something, and tick at slice 2 hashes something, and those must be one definition or the golden hash proves the wrong thing. That definition needs a home both import that is not tick, because the harness must not pull in the collider. `frame` is that home: the committed-frame type, the intent type, and the hash function. Then the tree supports "tick and the harness import frame," and a frame change breaks tick, the harness, and the golden hash. The current sentence, "Tick and every host import it," is not tree-supported; hosts are outside the repository.
CHANGE: "`frame` is the committed-frame and intent types" becomes "`frame` is the committed-frame type, the intent type, and the hash of a frame. Tick and the harness import it. A host outside this tree is expected to."

## Q2 — Is one CI job allowed to mention the second engine?
ANSWER: Yes, and it should run them. jsvu installs JavaScriptCore and SpiderMonkey on linux64, so one ubuntu job can run the same harness under V8, SpiderMonkey, and JavaScriptCore and compare all three to the stored hash. That is a stronger check than one Node run, and it is not a lie as long as no workflow writes. The lie the design fears comes from the writer, not the engine count, and Atlas credits a write to the door that runs the file. So the writer must be a separate file no workflow runs: a `bin` command (`write-golden`) that a person runs locally, whose write Atlas then attributes to people through a command door. The check is CI under three engines on the pull request that carries the new hash. The WASM build is a fourth run only once the tree contains a source that compiles to WASM; until it does, the page must not claim it.
CHANGE: "CI runs the harness once, under Node, and compares the result to the committed golden hash" becomes "CI runs the harness under V8, SpiderMonkey, and JavaScriptCore, via jsvu, and compares each to the committed golden hash. It does not write. `write-golden` is a command a person runs; the pull request that carries its output is checked under all three." Item 5 of "What comes in" changes to match.

## Q3 — Do verb-hazard predicates live with intent predicates?
ANSWER: Separate boundaries, disjoint globs, declared only when their directory exists. One `predicates/**` glob at slice 2 and a second `predicates/hazards/**` at slice 3 would overlap and fail. A `hazards` boundary declared at slice 2 matches nothing and fails. So: `predicates/intents/**` is the slice-2 boundary, `predicates/hazards/**` is added at slice 3, and neither glob contains the other. One more thing the page cannot say otherwise: tick must read predicates through a literal path to an index file that names the rule files, because a directory read built at run time is counted and not named. Then the index is the reader of the rules and tick is the reader of the index, and "predicates are data the tick reads" is in the tree.
CHANGE: glob `predicates/**` becomes `predicates/intents/**`; add "tick reads `predicates/intents/index.json`, which names the rule files."

## Q4 — What is the busiest door after slice 2?
ANSWER: CI, unless play gets a door. The page follows the door with the greatest reach, and after slice 2 the tree has a CI workflow that runs the harness and any `bin` commands the manifest declares. The host's submit call is a library export. It is not a door. So the design must decide whether play is a door: a `play` command that reads an intent log, runs tick with predicates, and writes frames would reach tick, frame, predicates, and fixtures, which is more than the harness can reach by design. With it, the page leads with play and the target page is honest. Without it, the page leads with CI and the harness, and that is also honest, and the newcomer's first door is the harness. Pick; do not leave it to reach order.
CHANGE: "This is the main flow" is not a sentence the design can assert. Add to "Where to start," slice 2: "`bin`: `play` (intent log in, frames out) and `replay`. Play is the main flow because its door reaches the most parts."

## Q5 — What may slice 1's map say?
ANSWER: The first contract. `check` compares the committed map with the working tree. It has no notion of a target page and never reads `docs/`. A check that fails until play is true does not exist in the tool and would have to be hand-written, which is the drift the design forbids. So the slice-1 map is the harness, fixtures, workflows, docs, and root, and nothing else, and the target page stays a docs file compared by a person at slice 2 with disagreements recorded in its own last section. Two consequences. The slice-1 boundary file omits tick, frame, and predicates, as the design already says. And the summary line, which Atlas publishes verbatim, describes slice 2; at slice 1 it should describe what the tree is.
CHANGE: summary at slice 1: "Determinism harness for a 3D RPG tick: one body, fixed quanta, one golden hash checked under three engines." The proposed summary lands with slice 2.

BOUNDARY DIFF:
- slice 1 file: `harness`, `fixtures`, `docs`, `workflows`, `root` only; `tick`, `frame`, `predicates` removed until slice 2
- `predicates/**` → `predicates/intents/**` (slice 2); `hazards: predicates/hazards/**` added at slice 3
- `fixtures` role `test` → `data`; the golden hash is a thing CI believes, not a test

SCAR: the WASM build. The plan says three engines and a WASM build, and the tree has TypeScript. A WASM build needs a source that compiles to WASM, which is a second integrator or a TypeScript subset compiler, and neither is named. Until one is, "a WASM build" is a sentence the tree does not support, and it belongs in "Where the docs and the code disagree," not in the harness section.

DID NOT CHECK: whether jsvu's JavaScriptCore binary runs on ubuntu-latest without extra libraries. Whether Atlas's `data` role changes how a boundary is read. Whether `atlas init` proposes `config` or `docs` for `root`.

## Addendum, 2026-09-24 — the unchecked item, checked

**Claim.** jsvu's JavaScriptCore runs on GitHub's Ubuntu image with no extra libraries.

**Evidence, opened today.**
- jsvu's own CI (`.github/workflows/main.yml`) runs `npm run test-linux64` on `ubuntu-latest`, which installs every linux64 engine including `javascriptcore`. Main-branch run 30518602421 (2026-07-30, jsvu 3.0.5, image `ubuntu-24.04`) passed both jobs. https://github.com/GoogleChromeLabs/jsvu/actions/runs/30518602421
- In that log the linux job installs the JSC bundle from `https://webkitgtk.org/jsc-built-products/x86_64/release/318130@main.zip`, and the bundle carries its own loader and C library: `lib/ld-linux-x86-64.so.2`, `libc.so.6`, `libicu*`, `libglib-2.0`, `libgcc_s`, `libatomic`, `libffi`. The wrapper script (`engines/javascriptcore/extract.js`, linux64 case) execs that bundled loader with `LD_LIBRARY_PATH` set to the bundled `lib/`, so nothing on the runner is consulted.
- jsvu's install flow (`shared/engine.js`) runs `test()` after extraction, and the JSC test (`engines/javascriptcore/test.js`) executes the binary on `print('Hi!')` and asserts the output. The linux job log shows `Testing completed` followed by `JavaScriptCore v318130 has been installed!`.
- The failure that made this worth checking is real and closed: open issue 172 (linux64 JSC "does not extract") was the Node 24.16 / 26 zip-extraction hang (nodejs/node#63487, closed 2026-06-25), fixed in jsvu by #175 "Fix extraction step hanging on Node.js 26" and released as 3.0.5 on 2026-07-30. Pin jsvu at 3.0.5 or later.

**Sentence for the design.** Disagreement 3 can leave the list. "CI installs V8, SpiderMonkey, and JavaScriptCore with `jsvu@3.0.5` on `ubuntu-latest`. The JavaScriptCore bundle carries its own loader and libraries; the workflow installs nothing else for it."

**Did not check.** Whether the same holds for a runner image newer than `ubuntu-24.04`; the bundled loader makes that unlikely to matter.
