# Dispatch T7b — the instrument's bench

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T6 (the sweep, and the tick's save and restore) and T7a (the rails), both merged first. The plan row is T7 in `docs/PHASE-2.md`. The research is `docs/study-swarm/seat-instrument.dispatch.md`; numbers in parentheses are its findings.

**Revised after a design consult.** A read-only consult (`docs/consult-reply-fable-t7b-01.md`) found three ways the first draft would lie:
- Two trees in one process would share one checker, because the rules load from the working directory.
- A coverage gate would keep exactly the least-covered changes from ever running on the base build.
- "No difference" could mean "not visible to the trace".

It also found that a wall-clock budget broke the promise of a deterministic report, and that the draft fixed a candidate shape the model's slice would have to undo. This version answers each.

**T7 now splits in three.** T7a built the rails. T7b, this dispatch, builds the bench the test instrument will run on: what a change is, which inputs reach it, and a ladder of verdicts that come only from the engine. It calls no model. T7c puts the model into the bench as one more generator, runs its adversarial run on the rails T7a built, and thaws `test-instrument` if the model earns its place against the bench's own proposer. The split is deliberate. The research is plain that a local model is not presumed to beat a cheap proposer (3, 4, 5), so the cheap proposer, the aim, and the oracle are built and measured first, in the shapes the model will plug into.

## What it is

A pull request changes the engine. The bench takes the change and the build before it, and looks for inputs that do three things:
- reach the changed code;
- make the changed build's run differ from the parent's;
- make the changed build fail where the parent does not.

Every verdict comes from the engine: coverage, the step hash, the trace, and the findings the engine already checks. None comes from a model, and none is an expected outcome anyone wrote down (7, 8). A difference between the two builds is a fact, not a judgment. Whether the change meant it is sorted by the coordinator against the dispatch's stated intent (12, 13).

A candidate is one intent proposed from a settled state, in the repository's own scratch worlds (`fixtures/`, `worlds/`, and the product scene). It goes through the checker exactly as the sweep's actions do, so a refusal is counted and costs nothing more. A finding is a T5 bundle that `replay` reproduces.

## Pins

1. **Anchors.** `bench anchors` reads the diff between a base and a head and names the anchors: the pieces of changed code or data a run can meet.
   - **JS anchors.** A function in `packages/tick/` or `packages/frame/` whose body holds a changed line, named by file, function, and the changed ranges in the head's text.
   - **Top-level anchors.** A changed top-level line in those packages (a constant such as `STEP_HEIGHT`) is an anchor too. Its reach is the reach of every function in its file that names the identifier it declares. This is a token scan, and the report says it is approximate.
   - **Deletions.** A deleted line is an anchor at the line it left behind. Its reach is its enclosing function's.
   - **Rule anchors.** A changed file in `predicates/` (a verb rule, a hazard, a role manifest), with the verbs or classes it governs.
   - **Law anchors.** A function in `solver/src/` whose body holds a changed line.
   - Changes to tests, docs, the map, and tools are not anchors, and the report lists them as not aimed at. A changed world or fixture file is reported under pin 2.

   The bench works on two directory trees, a base and a head, so a test can plant a change in a copy without a commit. A helper makes the two trees from two revisions as git worktrees. The report records each tree's commit and a digest of its tracked files, so a planted copy is never mistaken for the commit it came from.

2. **Where the builds run.** The checker reads its rules relative to the working directory (`packages/tick/predicates.js`, `packages/tick/beliefs.js`). The solver is one instance per module, and it rebuilds its world, waking every body, whenever a run's world changes. So:
   - Each tree runs in its own process, with its working directory at the tree's root and the runner imported by absolute path. The bench refuses to run two trees in one process.
   - Each process holds one live world at a time, and finishes or restores a run before it begins another. A run interleaved with another in one process is refused.
   - Worlds, fixtures, and generators come from the head tree. A world or fixture file that differs in the base is reported as "world differs, not aimed at", and is never run from the base.
   - Each tree builds its own law binary from its own source. When `solver/` has no diff, the base takes the head's binary instead of rebuilding.
   - When the head changes the law, the head also gets the coverage build of pin 3, and each candidate's reach on the law is read from a run on it. The frames of that run must equal the head's, or the bench stops.
   - Before any candidate, a control run of the product scene on both trees must trace identically when `solver/` has no diff. The report prints both binaries' digests. Digest equality is never taken as "the same law", because a build's digest can carry its host and path.

3. **Reaching the change.**
   - **JS.** A candidate's coverage is V8's block coverage through `node:inspector`, taken as a delta around the candidate alone. A JS anchor is reached when a block overlapping one of its changed ranges ran. A top-level or deleted anchor is reached as pin 1 says.
   - **Rules.** A rule anchor is reached when its verb is submitted, admitted or refused.
   - **The law.** A law anchor's reach comes from a coverage build of the law. The recipe is the knowledge base's answer [`requests/law-coverage.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/law-coverage.md). It is measured to compute exactly the product build's frames: the product golden on both, and a mutant's own golden on both.
     - The build uses the pinned rustc, with `-C instrument-coverage -Z no-profiler-runtime` under `RUSTC_BOOTSTRAP=1`, `--cfg law_coverage`, and `-C link-arg=--no-gc-sections`, into a target directory of its own. A three-line shim in `solver/src/lib.rs`, compiled only under `--cfg law_coverage`, defines the one symbol the instrumented code references. The product binary's bytes, digest, pin, and lint are untouched, and a test holds the digest unchanged with the shim in the source.
     - The counters live in the module's linear memory. The bench zeroes them around each candidate, and again after every image restore, since an image carries them. It never compares images across builds.
     - Counters map to lines through `llvm-profdata` and `llvm-cov export`, from the `llvm-tools` component of the pinned toolchain. Changed Rust lines are counted as JS lines are.
     - The coverage build covers everything linked: the engine's files, Rapier, parry, and their dependencies. So an anchor in a copied routine such as `kcc.rs` is measured like any other.
     - `RUSTC_BOOTSTRAP` and `-Z no-profiler-runtime` are not supported by the Rust project. Before it is used, the bench builds the coverage binary and requires the product scene's golden from it. If the flags stop working, or the golden differs, it refuses with a reason and never falls back to guessing reach.
   - **Observable or not.** The report marks each anchor observable or not. An anchor whose function writes only state that neither the trace nor the hash reads is "not observable": episode text, belief text, refusal reasons, hosts, the log's bookkeeping. A candidate that reaches it and shows no difference is reported as reached and not observable, never as "no difference". The rule for the mark is stated in the code.
   - **The access map.** The bench runs T6's sweep once on the head, with coverage taken as a delta per admitted action. For each anchor it records the verbs that reached it and the first cell each was reached from, witness included. An anchor no action reached in the whole sweep is named, with the load's own coverage checked separately. The map is JSON, and its shape is the content of T7a's `access` source, which T7c's model will read (9, 11).

4. **Two builds, one input.** A candidate names its intents by tick, not by hash. On each build the bench submits each intent citing that build's newest frame. Every candidate that passes rung 0 runs on both builds, and the two traces are compared by T1's comparison (`packages/tick/difference.js`), which names the first differing tick, body, and field.
   - **Admission differs.** While the two builds' frames agree at an admission tick, an admission on one build and a refusal on the other is the candidate's first difference. It names the intent and both reasons, and the comparison stops there. A refused candidate is still submitted on the other build, so a difference in either direction is seen.
   - A refusal whose reason text alone differs is not a difference.
   - **Floods.** When every candidate differs in the same way, the report says so in one line. Examples: every candidate differs at tick 0 in the hash, or admissions differ throughout a changed rule. It does not list them one by one.

5. **Candidates and generators.** A candidate is a settled state the sweep archived (its witness) and one intent proposed from it. A generator is a function from the bench's feedback to the next candidate, or to none. The two built here are deterministic under a seed, and T7c's model is a third, with no change to the ladder.
   - **The aimed sweep.** T6's sweep, restricted to the verbs the access map found reaching an anchor, explores from the cells the map names as well as from the load. When no verb reached an anchor, the sweep runs unrestricted from the map's nearest cells, and the anchor is reported as not aimed. This is the baseline a directed fuzzer sets (14). It stops when its frontier empties or its budget is spent.
   - **The grammar.** Seeded intents drawn from the verb table, the world's bodies, zones, and grid points. Verbs that reach an anchor are drawn first, and the others at a stated share, so an anchor the access map missed can still be hit. Its longer sequences are successive candidates from the states it reaches.
   - **Control inputs.** The bench also accepts T5's three run kinds, `play`, `product`, and `log` bundles, as inputs it runs on both builds. It proposes nothing from them.
   - **The stall.** A difference is new when its (anchor reached, body, field) has not been seen. The grammar stalls after n admitted candidates with no new changed line and no new difference. The bench runs on past the stall to the budget, and reports what came after it for each n. T7c calls the model at the n that number justifies (4).

6. **The ladder.**
   - **Rung 0, sound: a gate.** The candidate replays twice to the same hashes on the head, and a save and restore at its midpoint (T6) traces identically. A candidate that fails here is a finding of the tick or the restore, in its own right, and is not counted as a test input (1).
   - Rungs 1 to 3 are then recorded for every candidate:
     - **Rung 1, reaches** (pin 3).
     - **Rung 2, differs** (pin 4).
     - **Rung 3, fails:** a throw, a body leaving the world, or a world that does not settle within 512 quanta after an action ends. These are T6's findings, and any the engine adds later, such as the squeeze slice's bound on a body's speed. Rung 3 is recorded on both builds, and a failure is a catch only when the base does not have it.
   - A rung-2 or rung-3 candidate is written as a T5 log bundle from the head, with the witness and the intent. Its `failure` block holds the first-difference block from the bench's own two traces, since the base cannot replay the head's hash chain past the first difference. No rung takes an expected value from anywhere but the engine (7).

7. **Mutants measure the bench.** For each anchor, the bench plants mutants in its changed lines, one at a time, in a third tree:
   - a flipped comparison;
   - `+` and `-` swapped;
   - a constant moved by one unit in its last place and by 10%;
   - a condition negated;
   - an early `return` dropped.

   A rule anchor's mutants move the rule's numbers the same way. A JS mutant tree takes the head's built binary.
   - **Caught.** A mutant is caught when a candidate that reached the head range it was made from separates the head and the mutant: by a trace difference, by a rung-3 failure on one and not the other, or by a rung-0 failure.
   - **Not scored.** A mutant that does not load, or that fails before any candidate acts, is listed and not scored. A mutant whose text equals the base's at that line is marked, so a difference is not counted twice.
   - **Lists, not ratios.** Mutants are reported as lists with operator and line. The bench never judges a mutant equivalent (2), so a ratio would mean nothing. T7c compares generators on the same list.

   Law mutants are built as incremental rebuilds of the coverage build: about 3.2 s each on the knowledge base's host, since only the law crate recompiles. They are capped at a number the code states, with the cap's cost reported. Mutating the changed lines measures whether the candidates are sensitive at the change. It does not measure the aim, which is the access map's job, and the report says so.

8. **The record and the report.**
   - **The record.** Each candidate is written down as it finishes. The record holds its witness and intent, its generator, its anchors reached, its admission on each build with reasons, its rungs, and its first-difference block. That record is the feedback T7c's model reads.
   - **The report.** One JSON file and a markdown summary per run, summarizing the records. Per generator it gives:
     - candidates proposed, refused (with the checker's reasons tallied), and admitted;
     - the rungs reached;
     - changed lines reached out of those anchored, with each anchor's observability;
     - differences, with their first-difference blocks;
     - catches;
     - mutants caught and survived;
     - the late gain after each stall.
   - **Budgets.** They are counted in quanta and restores. Comparisons between generators are made at equal budgets, and wall time is reported beside them (3). Two runs with one seed give the same report but for times.
   - **What was not measured.** The report states it, including the law's reach where pin 3 leaves it unmeasured.

9. **Tests.**
   - **A planted rule change.** A verb's `maxDistance` is narrowed in a copy of the head. The bench names the rule anchor and the verb, and finds an intent the base admits and the head refuses ("admission differs") while the frames agree. It writes a bundle that replays on the head.
   - **The same plant, run two trees in one process.** The bench refuses.
   - **A planted JS change.** A comparison in a predicate is flipped from `<` to `<=` at a boundary the sweep can land on. The bench names the JS anchor, the verbs and cells that reach it, and a rung-2 difference with its bundle, with the mutant lists over that anchor.
   - **A planted law change with coverage.** A one-operator change in `solver/src/rapier_law.rs` on a line the product scene runs. The bench names the law anchor, measures its reach from the coverage build, finds the difference, and shows the coverage build's frames equal to the head's.
   - **A planted top-level change.** `STEP_HEIGHT` is moved. The anchor exists, is reached through the climb's admission, and differs.
   - **A change with no behaviour.** A function renamed with every caller, and a comment rewritten. The bench reaches the anchors and reports no difference.
   - **A change the trace cannot see.** The text of the `use` episode. The bench reports it reached and not observable.
   - **A fixture edited in the base alone** is reported as "world differs".
   - **Two runs interleaved in one process** are refused.
   - **Each rung goes red.**
     - A planted restore that drops one saved field fails rung 0.
     - A predicate that admits on every other call, by a counter kept outside the tick, fails rung 0's second replay.
     - A candidate whose body leaves a test world through a gap in the floor fails rung 3 on the head. If the base has the gap too, it is not a catch.
   - **Swapped trees.** With its base and head swapped, the bench reports the same differences, with the sides named the other way.
   - **Determinism.** Two runs with one seed give equal reports but for times.
   - **F2's law change, planted, by hand.** The base tree is `main` with F2's branch in `solver/src/kcc.rs` switched off (`Controller::<false>`), so its copy computes what Rapier's controller does bit for bit, as F2's control test proves; the head tree is `main`.
     - The bench runs it on the corpus's walker-stall bundle and on the product scene, which are control inputs (pin 5).
     - It prints both binaries' digests, which must differ.
     - It finds the bundle's first difference at quantum 98, body walker, field x.

     This tests the two-build oracle on a law change. The branch's reach is measured by the coverage build, which must show the branch's lines run on the quanta that differ. It needs two law builds, so it runs by hand. The pull request links its report and states its time. It is not in `npm test`.

10. **Costs.** State these for each planted change:
    - the access map's time;
    - each generator's candidates per second;
    - the ladder's time per candidate on each build;
    - the mutants' time.

11. **Where it runs.** The coordinator runs `bench` locally, on demand. There is no new workflow file and no change to the corpus job. The bench calls no model and imports nothing from `packages/propose`, and a source test holds it.

12. **Nothing the law is made of.** T7b changes no law and no byte of the product binary, and the goldens and the Linux digest do not move. Its one Rust change is pin 3's shim, compiled only under `--cfg law_coverage`. The coverage build is its own artifact with its own digest, in its own target directory, and the product binary's pin and lint never see it.

13. **Docs are the lead's.** The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`.

14. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` after the new files are staged; `packages/bench` gets its own boundary.

## Acceptance

- The planted changes behave as pin 9 says: rule, JS, top-level, no behaviour, not observable, a base-only fixture, interleaved runs, and each rung's red.
- Two trees in one process are refused.
- F2's law change, planted, is found by hand on its control inputs at quantum 98, walker, x, with the report linked.
- The access map is JSON in the shape T7a's `access` source reads, and every anchor it did not reach is named.
- A law anchor's reach is measured by the coverage build, whose frames equal the product build's, and whose absence stops the bench with a reason.
- The report is deterministic but for times, counts budgets in quanta and restores, and says what it did not measure.
- The typecheck is clean, tests are at or above the count on `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.

## Not in T7b

- No model call, and no thaw; those are T7c.
- No verdict from anything but the engine.
- No expected outcome written by anyone.
- No new push-triggered workflow.
- No change to the law.
