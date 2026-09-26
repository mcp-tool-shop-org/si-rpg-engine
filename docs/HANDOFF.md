# Handoff

2026-09-26, at v0.2.0. This is for the next coordinator session, and for anyone who picks the work up. It says where the engine stands, what comes next and in what order, and how the work runs, with the scripts that run it. `docs/PHASE-2.md` holds the plan and its reasons; this file holds the working state.

## Where the engine stands

v0.2.0 is Phase 2 so far: the suite that measures the engine, and the fixes to the law that the suite found. Every slice below merged from a written dispatch in `docs/`, was verified on a fresh checkout, and was reviewed by other model families before it merged.

**The suite.**
- **T1, the first difference** (#41). Per-quantum traces in exact bits, and a tool that names the first quantum, body, and field where two runs part.
- **T2, restore** (#53). A world restores by replaying its inputs, or by a copy of the physics module's memory, never by writing into Rapier.
- **T3, platforms and the binary** (#54). An ARM64 lane, and a lint that refuses host-chosen instructions and growable memory.
- **T4, outcome tests** (#56, #57). Tests of what happened: a character course at the controller's limits, a thin fast body, terrain seams, and the scene moved a million units.
- **T5, the replay corpus** (#64, #68). Every failure writes a bundle that `replay` reproduces in one command, and a weekly job replays everything far longer than a pull request can.
- **T6, the reachability sweep** (#75, hardened in #93). `load world` explores a world's reachable states through the checker, and refuses a zone nothing reaches or a body carried out of the world.

**Soundness.**
- **S1** (#59, with pins #48, #51, #52, and #55) and **S2** (#49): the law's contract, its toolchain as part of the law, and one terrain surface for physics and actions alike.

**The law, fixed where the suite found it wrong.** Each fix is in an engine-owned copy of a Rapier routine, switchable, with a control test that proves the copy without its change is Rapier's own, bit for bit.
- **F1** (#70). A body switches in place when an action starts or ends, instead of the world rebuilding.
- **F2** (#74). The walker keeps its full stride: `solver/src/kcc.rs`, for dimforge/rapier#1019.
- **F3** (#82). A push acts only at the pushed body's own contact points: `solver/src/impulses.rs`, backporting dimforge/rapier#1004.
- **F5** (#104). A push sizes each contact's impulse by the body's effective mass, turning included, for dimforge/rapier#1020. The push guard is one and a half times the pushing character's speed.
- **F4** (#107). The character's first cast of a move no longer misses the floor it stands on, for dimforge/parry#452. The product golden moved with it.
- **#71** (#95). Drops apply before pick-ups, so a body put down is seen from the next step whatever the record order.

**The seat and content.**
- **T7a** (#77). The seat's rails: role manifests, the role gate, trust labels, and every model call recorded and checked in CI without a model. Both declared roles are frozen.
- **#87** (#96). Model-call records at version 2, and every call recorded however it ends.
- **#76** (#85). The load hash covers everything a world file holds but its name.
- **T7b** (#106). The instrument's bench.
  - A change and its parent run side by side, each tree in a process of its own. Each run's reach comes from V8's coverage for JavaScript, and for the law from a coverage build checked frame for frame against the product build.
  - A ladder of verdicts comes only from the engine: reached, differs, and fails only on the change.
  - Mutants measure the bench at the change.
  - The coordinator runs it by hand, `npx bench`, and no workflow runs it.

**The numbers at v0.2.0**, from CI at the release commit:
- the product golden, `69a671f962665563`;
- the arithmetic golden, `0d38671370d12d1e`;
- the Linux digest, `fd4b46bb45f299894d31e8745a3649f986c08b95ad3acba7ec20d70bfef2fde2`;
- 474 node tests and 36 native tests.

**Open issues.**
- **#97:** two leftovers from #83.
- **#109:** tightening F4's tests.
- **#100:** three corners of the model-calling path, to close before T7c records real calls.
- **#101:** a doc comment in `warm_broadphase`, for the next slice that re-pins the digest.
- **#114:** the bench's room finds a crate leaving the world after a drop at the step's edge. It crosses a wall 3 high, and `load world fixtures/bench/room.json` reproduces it.
- **#115:** T7b's round-2 review findings. The grammar's saves are keyed without the world, which matters once the bench runs over more than one world. Three small items go with it.
- **#113:** CI's engines job went from about 7 minutes to 14 with T7b, whose law tests build five trees from scratch. The issue also holds the shim's compiler warning, for a later change to the law's build.

The handbook's testing page lists what is known and not yet proven.

## What comes next, in order

1. **T7c, the model in the bench.** T7c puts a model into T7b's bench as one more generator. It runs the adversarial run on T7a's rails, and thaws `test-instrument` only if the model earns its place against the bench's own proposers. Its dispatch takes #100 in first, and #115's first item before the bench runs over more than one world. The research is `docs/study-swarm/seat-instrument.dispatch.md`.
2. **The room's crate (#114),** a triage that can run beside T7c. The sweep already refuses such a world at load, so no admitted world is affected.
   - First decide whether the checker admits a drop that overlaps a static collider, or the physics ejects the crate fast enough to cross a wall.
   - Then decide whether the fix is a checker rule or a law change. A law change carries its own control test, as F2 to F5 did.
3. **#113, CI's time,** before T7c adds its own tests to the job.
4. **#97 and #109,** small hardening slices that can share a builder.
5. **The Rapier 0.36.0 bump,** as its own slice, measured by T7b's bench. `solver/FLAGS.md` says a bump reruns the copies' control tests first.
   - 0.36.0 carries #1004, so `impulses.rs`'s first change becomes Rapier's own.
   - #1020 is still open, so the effective mass stays.
   - F2's branch (#1019) and F4's retry (parry#452) still apply: the bump's parry has the same `gjk.rs`.
   - Fold #101 into the same re-pin.
6. **Mesh collision.** Collision against textured glb meshes, validated at load. It is a later slice with no dispatch yet.

## How the work runs

### The loop, one slice at a time

1. **A dispatch.** It is written in `docs/dispatch-<slice>.md` and merged to `main` before a builder starts, because the review runner reads the contract from the base branch.
   - A dispatch pins what the slice does, its red on `main`, what may move, and its acceptance.
   - A change to the law states the conservative course and why the slice takes the other ("The choice, stated contrastively").
   - Numbers come from measurements: the knowledge base's, or an earlier slice's.
2. **A builder.** A subagent works in its own git worktree from `main`, with a brief that names the dispatch, the grounding, the verification, and the rules below.
   - It opens the pull request and never merges.
   - When another slice lands first, it rebases and reruns everything.
3. **The coordinator's verification.** Run `tools/coordinator/verify-pr.sh` on a fresh checkout of the head, and show the new tests red on `main` (see `tools/coordinator/README.md`). The summary becomes the review's evidence.
4. **The external review.** `tools/review.mjs` takes a checklist and the evidence. The checklist has one item per pin, plus every place the builder departed from the dispatch, each stated as a question.
   - A lone BLOCK is checked against the code, and refuted or fixed.
   - A BLOCK two families share goes back to the builder.
   - Low findings become issues.
5. **The disposition.** The review's summary and each finding's disposition are posted on the pull request, and then it merges with a merge commit.
6. **The docs, the same hour.** The README and its seven translations, the handbook, and the CHANGELOG follow each merge. The builder never edits them.

### Rules that hold on every slice

- **Before every push,** run the studio's identity scan, `python ~/.grok/bin/identity-scan.py .`, and push only on `RESULT CLEAN`.
- **Writing:**
  - A pull request body is in the third person and addresses no reader.
  - A commit message is a sentence saying what is now true.
  - No document quotes the Director; it records the decision.
- **Builders** never edit `README.md`, its translations, `site/`, or `CHANGELOG.md`.
- **Recorded values:**
  - The Linux digest in `fixtures/solver.sha256` comes from CI's Linux build, since WSL has no Rust toolchain.
  - The README's test count comes from CI's `# tests` line on `main` after the merge, never from arithmetic.
  - The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0`, after new files are staged.
- **Translations** run locally with the cache cleared, and `check-translations.mjs` holds them to the English before they are committed. They land before any tag, since a release tag is immutable.
- **Law slices in flight together** each re-pin the digest and re-record the law runs on rebase. A rebase never continues with a conflict marker in the tree.
- **The knowledge base's answers** are cited by their public paths, in the readouts repository under `rust-knowledge/waves/wave-03-si-rpg-engine/requests/`.

### The review panel

`tools/panel.js` seats six families by default, all through Ollama Cloud: Moonshot, Z.ai, DeepSeek, NVIDIA, MiniMax, and Mistral. OpenAI and Google sit on standby and are named with `--seats`.
- **Concurrency.** The account's Ollama Max plan serves ten requests at once, so the Ollama seats review together. A review takes as long as its slowest seat: six minutes on #95, eleven on F5's larger diff, and ten on each of T7b's two passes.
- **A large pull request** is reviewed in passes over disjoint files, one `--files <regex>` each (#112).
  - T7b's diff was about 480,000 characters, beside a frame of about 115,000, and the prompt cap is 400,000.
  - Each pass carried the whole dispatch, description, checklist, and evidence.
  - A dry run shows whether a pass fits.
- **The receipt's hashes** are of the runner's files as they sit on disk. On Windows, under `autocrlf`, they hash the CRLF form.
- **OpenRouter is retired.** It was retired on 2026-09-26, on cost, and cross-family panels run on Ollama Cloud only. The shipped panel has no OpenRouter seat.
  - Mistral is `mistral-large-3:675b-cloud`. It accepts 262,144 output tokens, and the daemon serves it as `mistral-large-3:675b`.
  - The OpenAI standby is `gpt-oss:120b-cloud`. An output budget over 131,072 is refused, and a budget of 32 returns an empty answer, so the seat keeps 131,072.
  - The Google standby is `gemma4:31b-cloud`. The bare name is the local weight. It accepts 262,144 output tokens, and the daemon serves it as `gemma4:31b`.
  - Seat a model only after it answers through the local daemon. `ollama list` still shows retired tags that return HTTP 410. The live catalog is the check.
- **`--seats`** names families for one run.
- **Measured behaviour:**
  - DeepSeek sometimes spends its whole 65,536-token budget thinking, and is then reported as not counted.
  - MiniMax's first trial invented two findings, so a lone BLOCK from it is checked like any other.
  - Only NVIDIA reasons longer with `think: 'high'`.
- **The coordinator's own breaks.** Before the review, the coordinator breaks a few of a slice's promises by hand and reruns the test that should hold each one. The results go into the evidence, and each break that turns nothing red is a gap. On T7b this found the two gaps the panel then corroborated.
- **When a review stops converging.** T7b's dispatch took nine rounds before the Director chose to merge without a tenth. Now, when a design review keeps blocking on gaps in the text rather than faults in the design, the Director gets that choice after the round named in advance. The builder's promise table and the review of its code are the next check.

### The knowledge base

A separate session keeps the Rust knowledge base.
- **What it does.** It measures questions about Rapier and parry on scratch clones, and publishes each answer under the readouts path above. F3, F4, F5, and #71 each rest on one.
- **How to ask.** Write a measurable question tied to the slice, and say what the dispatch needs.
- **What it will not do alone.** It files upstream reports only with the Director's approval, and it asks before mirroring an answer publicly.

## Where things are

- `docs/PHASE-0.md`, `PHASE-1.md`, and `PHASE-2.md` hold the plan, its revisions, and the "found by" notes.
- `docs/dispatch-*.md` holds every slice's contract.
- `docs/study-swarm/` holds the research, with its citation receipts.
- `docs/consult-*.md` holds the design consults.
- `docs/rust-kb-*.md` holds the first requests to the knowledge base.
- `site/src/content/docs/handbook/` is the handbook; `README.md` and its seven translations are the front page.
- `tools/` holds the review runner; `tools/coordinator/` holds the coordinator's scripts (#111).
- `atlas/` is the repository's map, checked in CI.
