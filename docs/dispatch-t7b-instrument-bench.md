# Dispatch T7b — the instrument's bench

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T6 (the sweep, and the tick's save and restore) and T7a (the rails), both merged first. The plan row is T7 in `docs/PHASE-2.md`. The research is `docs/study-swarm/seat-instrument.dispatch.md`; numbers in parentheses are its findings.

**Revised twice.** A read-only design consult (`docs/consult-reply-fable-t7b-01.md`) found three ways the first draft would lie:
- two trees in one process would share one checker;
- a coverage gate would keep the least-covered changes from ever running on the base build;
- "no difference" could mean "not visible to the trace".

Four model families then reviewed the second draft on #81. Three blocked it on one point, that the dispatch could not be built as written:
- leftovers from the first draft contradicted the new pins;
- some anchors had no way to be reached, and some no way to be mutated;
- the process model left module loading and world order open;
- several promised behaviours had no test that goes red.

This version answers each.

**T7 now splits in three.** T7a built the rails. T7b, this dispatch, builds the bench the test instrument will run on: what a change is, which inputs reach it, and a ladder of verdicts that come only from the engine. It calls no model. T7c puts the model into the bench as one more generator, runs its adversarial run on the rails T7a built, and thaws `test-instrument` if the model earns its place against the bench's own proposer. The split is deliberate. The research is plain that a local model is not presumed to beat a cheap proposer (3, 4, 5), so the cheap proposer, the aim, and the oracle are built and measured first, in the shapes the model will plug into.

## What it is

A pull request changes the engine. The bench takes the change and the build before it, and looks for inputs that do three things:
- reach the changed code;
- make the changed build's run differ from the parent's;
- make the changed build fail where the parent does not.

Every verdict comes from the engine: coverage, the step hash, the trace, and the findings the engine already checks. None comes from a model, and none is an expected outcome anyone wrote down (7, 8). A difference between the two builds is a fact, not a judgment. Whether the change meant it is sorted by the coordinator against the dispatch's stated intent (12, 13).

The bench's own tests are different: they check the bench against changes planted with a known, measured effect, as any measuring instrument is checked. That is where this dispatch names expected values.

A candidate is one intent proposed from a settled state in a scratch world. The scratch worlds are the files under `fixtures/` and `worlds/`, and the product scene's world with its three actors (lower, the walker, and the climber), as T6's sweep builds it. The product scene's scripted act, the `product` run kind, is not a scratch world; it is a control input (pin 5). A candidate goes through the checker exactly as the sweep's actions do, so a refusal is counted and costs nothing more. A finding is a bundle that `replay` reproduces.

## Pins

1. **Anchors.** `bench anchors` reads the diff between a base and a head and names the anchors: the pieces of changed code or data a run can meet. Each anchor has an id, a kind, a file, a name, and its changed line ranges in the head's text, or in the base's for a deletion.
   - **JS anchors.** A function in `packages/tick/` or `packages/frame/` whose text holds a changed line.
   - **Top-level anchors.** A changed top-level line in those packages. Its identifiers are those it declares, or the declaration it belongs to when it sits inside a multi-line one, or the bindings an `import` or `export` line names. Its reach is the reach of every function in its file that names one of those identifiers, and, for an export, of every function that names it in the files that import it. This is a token scan, and the report says it is approximate. A top-level line with no identifier runs when its module loads, and is reported "runs at load".
   - **Deletions.** A deleted line is an anchor at the point it left in the head's text. Its reach is the head's innermost block containing that point, by V8's block coverage, stated as approximate. A deleted top-level line takes the identifiers it declared in the base's text. When the head no longer names them, it is reported "removed; reach not measurable".
   - **Rule anchors.** A changed file in `predicates/`:
     - a verb rule, reached when its verb is submitted, admitted or refused;
     - a belief key, reached when a belief with that key is submitted;
     - a hazard, reached when the hazard suite runs it, which the bench does on each tree for each changed hazard, comparing the suite's verdicts between the trees as it compares admissions;
     - a role manifest, reported "not aimed: roles are T7c's".
   - **Law anchors.** A function in `solver/src/` whose text holds a changed line.
   - Changes to tests, docs, the map, and tools are not anchors, and the report lists them as not aimed at. A changed world or fixture file is reported under pin 2.

   The bench works on directory trees, so a test can plant a change in a copy without a commit. A helper makes the trees from revisions as git worktrees. The report records each tree's commit and a digest of its tracked files, so a planted copy is never mistaken for the commit it came from.

2. **Where the builds run.** The checker reads its rules relative to the working directory (`packages/tick/predicates.js`, `packages/tick/beliefs.js`). Node resolves a module by its importer's path, not by the working directory. And the solver is one instance per module, which rebuilds its world, waking every body, whenever a run's world changes. So:
   - **One process per tree.** Every tree runs in a fresh process of its own: the head, the base, the head's coverage build, and every mutant tree. Its working directory is that tree's root, and it imports that tree's packages by absolute paths into that tree. No process loads two trees' modules, and a working-directory change is never used to switch trees. The bench refuses a setup that would.
   - **One live world at a time.** Each process holds one live world, and finishes or restores a run before it begins another. A run interleaved with another in one process is refused.
   - **The same order everywhere.** The bench sends every tree's process the same candidates in the same order, so each builds and drops worlds in the same sequence. A refusal that depends on which world the solver holds last (pick-up's "the solver does not hold this world") therefore cannot differ between trees by order.
   - **The trace before the intent.** Within a quantum, the trace line is taken before any intent is submitted at that tick, since `submit` sets the actor's velocity at once and the trace reads the bodies live.
   - **Worlds from the head.** Worlds, fixtures, and generators come from the head tree. A world or fixture file that differs in the base is reported as "world differs, not aimed at", and is never run from the base.
   - **Binaries.** Each tree builds its own law binary from its own source. When `solver/` has no diff, the base and every mutant tree take the head's binary instead of rebuilding.
   - **The control run.** Before any candidate, a control run of the product scene on each tree must trace identically to the head when `solver/` has no diff, or the bench stops with the first difference. The report prints each binary's digest. Digest equality is never taken as "the same law", since a build's digest can carry its host and path.

3. **Reaching the change.**
   - **JS.** A candidate's coverage is V8's block coverage through `node:inspector`, taken as a delta around the candidate alone.
     - A JS anchor is reached when its function ran.
     - Its changed executable lines reached, those under a block that ran, are a finer column beside it.
     - A change with no executable line, a comment or a parameter's name, is "no executable change". It is reached when its function ran.
     - Top-level and deletion anchors are reached as pin 1 says.
   - **Rules.** As pin 1 says for each kind.
   - **The law.** A law anchor's reach comes from a coverage build of the law. The recipe below is normative. The knowledge base's answer [`requests/law-coverage.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/law-coverage.md) is its evidence: the product golden on both builds, and a mutant's own golden on both.
     - **The build.** The pinned rustc, with `-C instrument-coverage -Z no-profiler-runtime` under `RUSTC_BOOTSTRAP=1`, `--cfg law_coverage`, and `-C link-arg=--no-gc-sections`, into a target directory of its own. A three-line shim in `solver/src/lib.rs`, compiled only under `--cfg law_coverage`, defines `__llvm_profile_runtime`, the one symbol the instrumented code references. The product binary's bytes, digest, pin, and lint are untouched, and a test holds the digest unchanged with the shim in the source.
     - **The counters.** They live in the module's linear memory. The bench zeroes them around each candidate, and again after every image restore, since an image carries them. It never compares images across builds.
     - **The mapping.** Counters map to lines through `llvm-profdata` and `llvm-cov export`, from the `llvm-tools` component of the pinned toolchain. A law anchor is reached when its function's region ran. Its changed executable lines are a finer column, and a changed line in no region (a comment, an attribute) is "no executable change".
     - **The cover.** The build covers everything linked: the engine's files, Rapier, parry, and their dependencies. So an anchor in a copied routine such as `kcc.rs` is measured like any other.
     - **The refusal.** `RUSTC_BOOTSTRAP` and `-Z no-profiler-runtime` are not supported by the Rust project. Before it is used, the bench builds the coverage binary and requires the product scene's golden from it. If the flags stop working, or the golden differs, it refuses with the reason and never falls back to guessing reach.
   - **Observable or not.** The report marks each anchor observable or not. An anchor whose function writes only state that neither the trace nor the hash reads is "not observable": episode text, belief text, refusal reasons, hosts, the log's bookkeeping. A candidate that reaches it and shows no difference is reported as reached and not observable, never as "no difference". The rule for the mark is stated in the code.
   - **The access map.** The bench runs T6's sweep once on the head, with coverage taken as a delta per admitted action. The map is JSON of this shape:

     ```
     { "anchors": [ { "id", "kind", "file", "name", "lines", "observable",
                      "reachedBy": [ { "verb", "world", "cell", "witness" } ] } ],
       "notReached": [ "<anchor id>" ], "runsAtLoad": [ "<anchor id>" ] }
     ```

     Each anchor lists the verbs that reached it, and the first cell and witness each was reached from. An anchor no action reached in the whole sweep is in `notReached`, with the load's own coverage checked separately. This map is what T7c renders as the `access` input T7a's manifests name (9, 11).

4. **Two builds, one input.** A candidate names its intents by tick, not by hash. On each build the bench submits each intent citing that build's newest frame. Every candidate that passes rung 0 runs on both builds, and the two traces are compared by T1's comparison (`packages/tick/difference.js`), which names the first differing tick, body, and field.
   - **Admission differs.** While the two builds' frames agree at an admission tick, an admission on one build and a refusal on the other is the candidate's first difference. It names the intent and both reasons, and the comparison stops there. A refused candidate is still submitted on the other build, so a difference in either direction is seen.
   - A refusal whose reason text alone differs is not a difference.
   - **Floods.** When every candidate differs the same way, the report says so in one line. Examples: every candidate differs at tick 0 in the hash, or admissions differ throughout a changed rule.

5. **Candidates and generators.** A candidate is a settled state the sweep archived (its witness) and one intent proposed from it. A generator is a function from the bench's feedback to the next candidate, or to none. The two built here are deterministic under a seed, and T7c's model is a third, with no change to the ladder.
   - **The aimed sweep.** T6's sweep, restricted to the verbs the access map found reaching an anchor, explores from the cells the map names as well as from the load. When no verb reached an anchor, it runs unrestricted from the map's nearest cells, and the anchor is reported as not aimed. This is the baseline a directed fuzzer sets (14). It stops when its frontier empties or its budget is spent.
   - **The grammar.** Seeded intents drawn from the verb table, the world's bodies, zones, and grid points. Verbs that reach an anchor are drawn first, and the others at a stated share, so an anchor the access map missed can still be hit. Its longer sequences are successive candidates from the states it reaches.
   - **Control inputs.** The bench also accepts T5's three run kinds, `play`, `product`, and `log` bundles, as inputs it runs on every tree. It proposes nothing from them.
   - **The stall.** A difference is new when its (anchor reached, body, field) has not been seen. The grammar stalls after n admitted candidates with no new changed line and no new difference. The bench runs on past the stall to the budget, and reports what came after it for each n. T7c calls the model at the n that number justifies (4).

6. **The ladder.**
   - **Rung 0, sound: a gate.** The candidate replays twice to the same hashes on the head, and a save and restore at its midpoint (T6) traces identically. A candidate that fails here is a finding of the tick or the restore, in its own right, and is not counted as a test input (1).
   - Rungs 1 to 3 are then recorded for every candidate:
     - **Rung 1, reaches** (pin 3).
     - **Rung 2, differs** (pin 4).
     - **Rung 3, fails:** a throw, a body leaving the world, or a world that does not settle within 512 quanta after an action ends. These are T6's findings, and any the engine adds later, such as F3's guard on a pushed body's speed. Rung 3 is recorded on both builds, and a failure is a catch only when the base does not have it.
   - **What reproduces it.**
     - A rung-2 or rung-3 candidate is written as a T5 log bundle from the head: its witness, then its intent. Its `failure` block holds the first-difference block from the bench's own two traces, since the base cannot replay the head's hash chain past the first difference.
     - An "admission differs" candidate cannot be a log of admitted entries, since one build refuses its intent. It is written as its witness's bundle, which both builds admit, with the intent, its tick, and both builds' reasons in the `failure` block. `bench replay` runs the witness on a given tree, then submits the intent citing that tree's frame, and shows that tree's admission or refusal.
   - No rung takes an expected value from anywhere but the engine (7).

7. **Mutants measure the bench.** The bench plants mutants one at a time, each in a tree of its own:
   - **Operators, on JS and law anchors' changed executable lines:** a flipped comparison; `+` and `-` swapped; a constant moved by one unit in its last place and by 10%; a condition negated; an early `return` dropped.
   - **Top-level anchors:** a changed constant is moved the same way.
   - **Rule anchors:** the rule's numbers are moved the same way.
   - **No mutants:** deletion anchors (nothing is left to mutate), "no executable change" anchors, and role manifests. Each is listed with its reason.
   - **Binaries:** a JS mutant tree takes the head's built binary. Law mutants are incremental rebuilds of the coverage build, about 3.2 s each on the knowledge base's host, since only the law crate recompiles. They are capped at a number the code states, with the cap's cost reported.
   - **Caught.** A candidate that reached the range the mutant was made from separates the head and the mutant: by a trace difference, by a rung-3 failure on one and not the other, or by a rung-0 failure.
   - **Not scored.** A mutant that does not load, or that fails before any candidate acts. It is listed with its reason.
   - **Marked.** A mutant whose text equals the base's at that line, so a difference is not counted twice.
   - **Lists, not ratios.** Mutants are reported as lists with operator and line. The bench never judges a mutant equivalent (2), so a ratio would mean nothing. T7c compares generators on the same list.

   Mutating the changed lines measures whether the candidates are sensitive at the change. It does not measure the aim, which is the access map's job, and the report says so.

8. **The record and the report.**
   - **The record.** Each candidate is written down as it finishes, with its witness and intent, its generator, its anchors reached, its admission on each build with reasons, its rungs, and its first-difference block. That record is the feedback T7c's model reads.
   - **The report.** One JSON file and a markdown summary per run, summarizing the records. Per generator it gives:
     - candidates proposed, refused (with the checker's reasons tallied), and admitted;
     - the rungs reached;
     - anchors reached, with changed executable lines reached out of those anchored, and each anchor's observability;
     - differences, with their first-difference blocks, and floods as single lines;
     - catches;
     - mutants caught, survived, marked, and not scored;
     - the late gain after each stall.
   - **Budgets.** They are counted in quanta and restores. Comparisons between generators are made at equal budgets, and wall time is reported beside them (3). Two runs with one seed give the same report but for times.
   - **What was not measured.** The report names everything left unmeasured, each with its reason:
     - anchors not aimed;
     - anchors that run at load;
     - "no executable change" anchors;
     - removed identifiers;
     - mutants not scored.

9. **Tests.** Each planted case below has a known, measured effect; each assertion checks what the bench reports about it.
   - **Anchors and reach.**
     - A verb's `maxDistance` is narrowed in a copy of the head. The bench names the rule anchor and the verb, and finds an intent the base admits and the head refuses while the frames agree. `bench replay` shows the refusal on the head and the admission on the base.
     - A comparison in a predicate is flipped from `<` to `<=` at a boundary the sweep can land on. The bench names the JS anchor, the verbs and cells that reach it, and a rung-2 difference with its bundle, with the mutant lists over that anchor.
     - A one-operator change in `solver/src/rapier_law.rs`, on a line the product scene runs. The bench names the law anchor, measures its reach from the coverage build, finds the difference, and shows the coverage build's frames equal to the head's.
     - `STEP_HEIGHT` is moved. The top-level anchor exists, is reached through the climb's admission, and differs.
     - A line is deleted from a predicate. The deletion anchor's block is reached, and the report lists it with no mutants.
     - A comment inside a function is rewritten. The anchor is reached, marked "no executable change", and shows no difference.
     - A function is renamed with every caller. The anchors are reached, and there is no difference.
     - A hazard's rule is changed. The suite's verdicts are compared between the trees.
     - The text of the `use` episode is changed. The bench reports it reached and not observable.
   - **The process model.**
     - The rule plant, run two trees in one process, is refused.
     - Two runs interleaved in one process are refused.
     - A base tree whose binary differs while `solver/` has no diff fails the control run, and the bench stops.
     - A fixture edited in the base alone is reported as "world differs".
     - A runner that takes the trace after submitting fails rung 0.
   - **The coverage build.** A coverage build made to fail, by a flag the compiler refuses, stops the bench with the reason. A coverage build planted to compute differently from the product build is refused by its golden check.
   - **The report.**
     - A change to the hasher makes every candidate differ at tick 0, and the report shows one flood line.
     - An anchor reached only after the stall shows a late gain above zero.
     - An anchor no verb reaches is named not aimed.
     - A planted copy's tree digest differs from its commit's.
   - **Mutants.** Each of these is planted and reported as named:
     - a mutant caught by a trace difference, one caught by a rung-3 failure, and one caught at rung 0;
     - a mutant that survives;
     - one that does not load, and one that fails before any candidate acts;
     - one whose text equals the base's.
   - **Each rung goes red.**
     - A planted restore that drops one saved field fails rung 0.
     - A predicate that admits on every other call, by a counter kept outside the tick, fails rung 0's second replay.
     - A candidate whose body leaves a test world through a gap in the floor fails rung 3 on the head; if the base has the gap too, it is not a catch.
   - **Swapped trees.** With its base and head swapped, the bench reports the same differences, with the sides named the other way.
   - **Determinism.** Two runs with one seed give equal reports but for times.
   - **F2's law change, planted, by hand.** The base tree is `main` with F2's branch in `solver/src/kcc.rs` switched off (`Controller::<false>`), so its copy computes what Rapier's controller does bit for bit, as F2's control test proves; the head tree is `main`.
     - The bench runs it on the corpus's walker-stall bundle and on the product scene, which are control inputs (pin 5).
     - It prints both binaries' digests, which must differ.
     - It finds the bundle's first difference at quantum 98, body walker, field x.
     - The coverage build shows the branch's lines ran during the bundle's run.

     This tests the two-build oracle on a law change. It needs two law builds, so it runs by hand; the pull request links its report and states its time. It is not in `npm test`.

10. **Costs.** State these for each planted change:
    - the access map's time;
    - each generator's candidates per second;
    - the ladder's time per candidate on each build;
    - the coverage build's cost per quantum and per build;
    - the mutants' time.

11. **Where it runs.** The coordinator runs `bench` locally, on demand. There is no new workflow file and no change to the corpus job. The bench calls no model and imports nothing from `packages/propose`, and a source test holds it.

12. **Nothing the law is made of.** T7b changes no law and no byte of the product binary, and the goldens and the Linux digest do not move. Its one Rust change is pin 3's shim, compiled only under `--cfg law_coverage`. The coverage build is its own artifact with its own digest, in its own target directory, and the product binary's pin and lint never see it.

13. **Docs are the lead's.** The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`.

14. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` after the new files are staged; `packages/bench` gets its own boundary.

## Acceptance

- Every planted case in pin 9 is reported as it says.
- The process model refuses what pin 2 refuses.
- F2's law change, planted, is found by hand on its control inputs at quantum 98, walker, x, with the report linked.
- The access map is JSON in pin 3's shape, and names every anchor it did not reach.
- A law anchor's reach is measured by the coverage build, whose golden equals the product build's. A coverage build that fails, or computes differently, stops the bench with its reason.
- The report is deterministic but for times, counts budgets in quanta and restores, and names what it did not measure.
- The typecheck is clean, tests are at or above the count on `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.

## Not in T7b

- No model call, and no thaw; those are T7c.
- No verdict from anything but the engine. The expected values in pin 9 check the bench, never a change under test.
- No new push-triggered workflow.
- No change to the law.
