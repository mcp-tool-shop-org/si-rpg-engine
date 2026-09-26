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

Round 2 found the rest. Some anchors were still unruled or unplanted. The control run would have stopped the bench on a legitimate change. Report determinism was broken by paths. And the committed consult brief carried instructions addressed to a model, which every later reviewer of this repository would read in the diff. This version answers each, and the brief is kept as a record in the third person. Round 3 found that a cost-driven fallback in the access map depended on wall-clock time, which broke the same-seed promise. It also found the aimed sweep described two ways, and a save image asked to cross trees. This version removes the fallback, orders the sweep's two phases, and replays each witness on its own tree. It also takes in the knowledge base's two refinements to the coverage build: counters read before any restore, and a canary on the step count. Round 4 found that a witness written as hash-checked replay would turn a real difference on the way to the candidate into a false finding of the base. It also found that a cross-tree restore, when every tree runs one binary, could only be refused by the bench's own bookkeeping. This version submits every witness by tick and tags every save with its tree.

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
   - **Top-level anchors.** A changed top-level line in those packages. Its identifiers are those it declares, or the declaration it belongs to when it sits inside a multi-line one, or the bindings an `import` or `export` line names. Its reach is the reach of every function in its file that names one of those identifiers, and, for an export, of every function that names it in the files that import it. This is a token scan, and the report says it is approximate. A top-level line with no identifier runs when its module loads, and is reported "runs at load". An `import` or `export` line is reported "runs at load" as well, since its binding is made at load, beside the reach of the functions that name it.
   - **Deletions.** A deleted line is an anchor at the point it left in the head's text. Its reach is the head's innermost block containing that point, by V8's block coverage, stated as approximate. A deleted top-level line takes the identifiers it declared in the base's text. When the head no longer names them, it is reported "removed; reach not measurable".
   - **Rule anchors.** A changed file in `predicates/`:
     - a verb rule, reached when its verb is submitted, admitted or refused;
     - the intent catalog (`predicates/intents/index.json`), reached when any intent is submitted, since every submission reads it; a line that retires or restores a verb is reached when that verb is submitted;
     - a belief key, reported "not aimed: no generator in T7b proposes beliefs", since both generators propose intents (T7c's roles propose beliefs);
     - a hazard, reached when the hazard suite runs it, which the bench does on each tree for each changed hazard, comparing the suite's verdicts between the trees as it compares admissions;
     - a role manifest, reported "not aimed: roles are T7c's".
   - **Law anchors.** A function in `solver/src/` whose text holds a changed line. A changed top-level item there (a `const`, a `static`) follows the top-level rule above, by the functions that name it.
   - **Not aimed, and said so.** Each of these is reported with its reason:
     - changes to tests, docs, the map, and tools;
     - changes to `packages/load/`, which run at load or in the sweep, not in a candidate's quanta;
     - a change to `solver/Cargo.toml` or `solver/Cargo.lock`, or to `package.json` or `package-lock.json`: a dependency change. No anchor is derived from it in T7b, and every candidate still runs on both builds, so its differences are still found.
   - A changed world or fixture file is reported under pin 2.

   The bench works on directory trees, so a test can plant a change in a copy without a commit. A helper makes the trees from revisions as git worktrees. The report records each tree's commit and a digest of its files, tracked and untracked but not ignored, so a planted copy is never mistaken for the commit it came from.

2. **Where the builds run.** The checker reads its rules relative to the working directory (`packages/tick/predicates.js`, `packages/tick/beliefs.js`). Node resolves a module by its importer's path, not by the working directory. And the solver is one instance per module, which rebuilds its world, waking every body, whenever a run's world changes. So:
   - **One process per tree.** Every tree runs in a fresh process of its own: the head, the base, the head's coverage build, and every mutant tree. Its working directory is that tree's root, and it imports that tree's packages by absolute paths into that tree. No process loads two trees' modules, and a working-directory change is never used to switch trees. The bench refuses a setup that would.
   - **Its own dependencies.** Each tree has its own `node_modules`, installed in its root with `npm ci`, so Node never resolves a module from a parent directory shared by two trees. The bench checks that each process resolves its tree's own packages, and refuses otherwise.
   - **The sweep's own process.** The access map's sweep and the generators run in a process of their own on the head tree, before and between candidates. They never run inside a candidate's run.
   - **One live world at a time.** Each process holds one live world, and finishes or restores a run before it begins another. A run interleaved with another in one process is refused.
   - **The same world everywhere.** The bench sends every tree's process the same candidates in the same order, and each candidate starts from its witness on every tree.
     - A witness is a list of intents by tick, as a candidate's intent is. On every tree it is submitted from the load, each intent citing that tree's own newest frame (pin 4), and never replayed against the head's hashes.
     - After a tree has run a witness once, it may restore its own save of the state the witness reached. Every save is tagged with the tree that took it, and the bench refuses to restore a save in any other tree's process, before any restore is attempted. This is the bench's own check, and it holds even when every tree runs one binary file and the image's own binary check would accept the image.
     - That puts the candidate's world back in the solver on every tree. So a refusal that depends on which world the solver holds (pick-up's "the solver does not hold this world") cannot differ between trees because of an earlier candidate. That includes one whose intent one tree refused.
   - **The trace from the committed frame.** A tick's trace line is built from that tick's committed frame, never from the live bodies after a submission. `submit` sets the actor's velocity at once, and a line read live would disagree with the frame.
   - **Worlds from the head.** Worlds, fixtures, and generators come from the head tree. A world or fixture file that differs in the base is reported as "world differs, not aimed at", and is never run from the base.
   - **Binaries.** When `solver/` has no diff, every tree runs the head's binary file, copied byte for byte, and the report says so. When `solver/` differs, each tree builds its own binary from its own source. Digest equality is never taken as "the same law", since a build's digest can carry its host and path.
   - **The environment block.** Paths, digests, the host, and times go in the report's environment block. Pin 8's promise, that two runs with one seed give the same report, covers everything outside it.

3. **Reaching the change.**
   - **JS.** A candidate's coverage is V8's block coverage through `node:inspector`, taken as a delta around the candidate's own intent and the quanta after it, from the moment its witness's state is in place. The witness's own reach was recorded when the witness was itself a candidate, and it is not counted again.
     - A JS anchor is reached when its function ran.
     - Its changed executable lines reached, those under a block that ran, are a finer column beside it.
     - A change with no executable line, a comment or a parameter's name, is "no executable change". It is reached when its function ran.
     - Top-level and deletion anchors are reached as pin 1 says.
   - **Rules.** As pin 1 says for each kind.
   - **The law.** A law anchor's reach comes from a coverage build of the law. The recipe below is normative. The knowledge base's answer [`requests/law-coverage.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/law-coverage.md) is its evidence: the product golden on both builds, and a mutant's own golden on both.
     - **The build.** The pinned rustc, with `-C instrument-coverage -Z no-profiler-runtime` under `RUSTC_BOOTSTRAP=1`, `--cfg law_coverage`, and `-C link-arg=--no-gc-sections`, into a target directory of its own. A three-line shim in `solver/src/lib.rs`, compiled only under `--cfg law_coverage`, defines `__llvm_profile_runtime`, the one symbol the instrumented code references. The product binary's bytes, digest, pin, and lint are untouched, and a test holds the digest unchanged with the shim in the source.
     - **The counters.** They live in the module's linear memory, and an image carries them. So for each candidate the order is: restore, zero, run, then read, with the counters always read before any further restore. A restore between the run and the read would replace the candidate's counts with the image's. The bench never compares images across builds.
     - **The canary.** After mapping, the execution count of the law's exported step function must stand in its measured relation to the number of quanta the candidate ran. The builder measures that relation on the product scene first, and pins it with a test. Equality is expected, but it has not been measured, since `llvm-cov show` rounds. Otherwise the bench refuses with the reason: a zero means the counters were read after a restore or at the wrong address, and a larger count means they were not zeroed.
     - **The mapping.** Counters map to lines through `llvm-profdata` and `llvm-cov export`, from the `llvm-tools` component of the pinned toolchain. A law anchor is reached when its function's region ran. Its changed executable lines are a finer column, and a changed line in no region (a comment, an attribute) is "no executable change".
     - **The cover.** The build covers everything linked: the engine's files, Rapier, parry, and their dependencies. So an anchor in a copied routine such as `kcc.rs` is measured like any other.
     - **Known shape differences.** The coverage build fails three of the product's tests, all of the binary's shape, not its results: the image's non-zero page count, since the counters live in memory, and the one exported global, since the shim adds a static. The bench does not run the product's tests on it.
     - **The refusal.** `RUSTC_BOOTSTRAP` and `-Z no-profiler-runtime` are not supported by the Rust project. Before it is used, the bench builds the coverage binary and requires the product scene's golden from it. If the flags stop working, or the golden differs, it refuses with the reason and never falls back to guessing reach.
   - **Observable or not.** The report marks each anchor observable or not. An anchor whose function writes only state that neither the trace nor the hash reads is "not observable": episode text, belief text, refusal reasons, hosts, the log's bookkeeping. A candidate that reaches it and shows no difference is reported as reached and not observable, never as "no difference". The mark is per function, and a function that writes hashed state is observable even if its changed line writes only what the trace cannot see. So the verdict is always worded "no trace difference", never "no behaviour change". The rule for the mark is stated in the code. A function the rule cannot classify is marked "observability unknown", never "not observable".
   - **Approximate reach is named.** A top-level or deletion anchor's reach is approximate, and it is reported "not seen reached (approximate)", never plainly "not reached".
   - **The access map.** The bench runs T6's sweep once on the head, with coverage taken as a delta per admitted action. The map is JSON of this shape:

     ```
     { "anchors": [ { "id", "kind", "file", "name", "lines", "observable",
                      "reachedBy": [ { "verb", "world", "cell", "witness" } ] } ],
       "notReached": [ "<anchor id>" ], "runsAtLoad": [ "<anchor id>" ] }
     ```

     Each anchor lists the verbs that reached it, and the first cell and witness each was reached from. An anchor no action reached in the whole sweep is in `notReached`, with the load's own coverage checked separately.

     The delta per admitted action is the unmeasured cost the consult named. The builder measures it and states it (pin 10). If it proves too slow, the dispatch is revised; the bench never chooses its method by the time a run takes, since that would break pin 8's same-seed promise.

     The sweep's archive, every settled cell in archive order, is kept with the map for pin 5's second phase.

     This map is what T7c renders as the `access` input T7a's manifests name (9, 11).

4. **Two builds, one input.** A candidate names its intents by tick, not by hash. On each build the bench submits each intent citing that build's newest frame. Every candidate that passes rung 0 runs on both builds, and the two traces are compared by T1's comparison (`packages/tick/difference.js`), which names the first differing tick, body, and field.
   - **One trace from the load.** A candidate's trace on each tree runs from the load through its witness to its intent and beyond, and rung 2 compares the two whole. A difference that appears while the witness is still running is the candidate's first difference, like any other, and is never reported as a finding of the base.
   - **Admission differs.** While the two builds' frames agree at an admission tick, an admission on one build and a refusal on the other is the candidate's first difference, whether the intent is the witness's or the candidate's own. It names the intent and both reasons, and the comparison stops there. A refused candidate is still submitted on the other build, so a difference in either direction is seen.
   - A refusal whose reason text alone differs is not a difference. The same holds for the hazard suite's verdicts.
   - **The hazard suite.** For each changed hazard, each tree's process runs the suite once, before any candidate and in its own world. The two verdict lists are compared as admissions are, and a difference is a rung-2 difference of that anchor.
   - **Floods.** When every candidate differs the same way, the report says so in one line. Examples: every candidate differs at tick 0 in the hash, or admissions differ throughout a changed rule.

5. **Candidates and generators.** A candidate is a settled state the sweep archived (its witness) and one intent proposed from it. A generator is a function from the bench's feedback to the next candidate, or to none. The two built here are deterministic under a seed, and T7c's model is a third, with no change to the ladder.
   - **The aimed sweep, in two phases.**
     1. T6's sweep, restricted to the union of the verbs the access map found reaching any anchor, explores from the cells the map names as well as from the load.
     2. Then, only if some aimable anchor was reached by no verb, the sweep runs again with every verb, from every cell in the map's archive in archive order, within what the budget has left. Each such anchor is reported as not aimed. An anchor of a kind pin 1 reports as not aimed never triggers this phase. Those kinds are belief keys, role manifests, `packages/load/`, dependency files, and tests and docs. This is the baseline a directed fuzzer sets (14). It stops when its frontier empties or its budget is spent.
   - **The grammar.** Seeded intents drawn from the verb table, the world's bodies, zones, and grid points. Three draws in four take a verb that reached an anchor, and one in four a verb that did not, so an anchor the access map missed can still be hit. The share is fixed, the same on every run. When either set of verbs is empty, every draw comes from the other. Its longer sequences are successive candidates from the states it reaches.
   - **Control inputs.** The bench also accepts T5's three run kinds, `play`, `product`, and `log` bundles, as inputs it runs on every tree. It proposes nothing from them. They climb the same ladder as candidates, rung 0 included, and their records are marked as control inputs. A `log` bundle's intents are submitted by tick on every tree, each citing that tree's own frame, and never replayed against the recording's hashes. Its recorded hashes are compared as a trace, like any candidate's.
   - **The stall.** A difference is new when its (anchor reached, body, field) has not been seen. The grammar stalls after n admitted candidates with no new changed line and no new difference. The bench runs on past the stall to the budget, and reports what came after it for each n of 8, 16, 32, 64, and 128. T7c calls the model at the n that number justifies (4).

6. **The ladder.**
   - **Rung 0, sound: a gate.** The candidate replays twice to the same hashes on the head, and a save and restore at its midpoint (T6) traces identically. A candidate that fails here is a finding of the tick or the restore, in its own right, and is not counted as a test input (1). The same check runs on every tree the candidate runs on. On the base, a failure is reported as a finding of the base, not as a difference. On a mutant tree, a candidate that passes it on the head and fails it on the mutant separates the two (pin 7).
   - Rungs 1 to 3 are then recorded for every candidate:
     - **Rung 1, reaches** (pin 3).
     - **Rung 2, differs** (pin 4).
     - **Rung 3, fails:** a throw, a body leaving the world, or a world that does not settle within 512 quanta after an action ends. These are T6's findings, and any the engine adds later, such as F3's guard on a pushed body's speed. Rung 3 is recorded on both builds, and a failure is a catch only when the base does not have it.
   - **What reproduces it.**
     - A rung-2 or rung-3 candidate is written as a T5 log bundle from the head: its witness, then its intent. Its `failure` block holds the first-difference block from the bench's own two traces, since the base cannot replay the head's hash chain past the first difference.
     - An "admission differs" candidate cannot be a log of admitted entries, since one build refuses an intent. It is written as the log of every intent both builds admitted before the differing one, with the differing intent, its tick, and both builds' reasons in the `failure` block. `bench replay` submits that log by tick on a given tree, then the differing intent citing that tree's frame, and shows that tree's admission or refusal.
   - No rung takes an expected value from anywhere but the engine (7).

7. **Mutants measure the bench.** The bench plants mutants one at a time, each in a tree of its own:
   - **Operators, on JS and law anchors' changed executable lines:** a flipped comparison; `+` and `-` swapped; a constant moved by one unit in its last place and by 10%; a condition negated; an early `return` dropped.
   - **Top-level anchors:** a changed constant is moved the same way.
   - **Rule anchors:** the rule's numbers are moved the same way.
   - **No mutants:** deletion anchors (nothing is left to mutate), "no executable change" anchors, and role manifests. Each is listed with its reason.
   - **Binaries:** a JS mutant tree takes the head's built binary. Law mutants are incremental rebuilds of the coverage build, about 3.2 s each on the knowledge base's host, since only the law crate recompiles, and each is compared with the head's coverage build, whose frames equal the head's. They are capped at a number the code states, and are made in a fixed order under the cap: by anchor as the report lists them, then by line, then by operator in the order above. A run that hits the cap reports the mutants left out and the cap's cost.
   - **Caught.** A candidate that reached the range the mutant was made from separates the head and the mutant: by a trace difference, by a rung-3 failure on one and not the other, or by a rung-0 failure.
   - **Survived.** A mutant that some candidate reached, and no candidate separated.
   - **Not reached.** A mutant that no candidate reached, listed apart from those that survived.
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
   - **The seed.** The report names its seed and its budgets outside the environment block, so two reports can show they came from one seed.
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
     - A hazard's rule is changed. The suite's verdicts are compared between the trees, and a verdict whose reason text alone differs is not a difference.
     - A belief key's `maxLength` is narrowed. It is reported as not aimed, since no generator in T7b proposes beliefs.
     - A top-level constant is changed that only an unreached function names. It is reported "not seen reached (approximate)", never plainly "not reached".
     - A `const` in `solver/src/rapier_law.rs` is changed. It is anchored through the functions that name it, and its reach is read from the coverage build.
     - A comment in a law function is rewritten. It is marked "no executable change".
     - A verb is retired in the intent catalog. The catalog anchor is reached when that verb is submitted.
     - A top-level expression with no identifier is added. It is reported as running at load.
     - A top-level constant is deleted with every use. It is reported as removed, with its reach not measurable.
     - A role manifest is changed. It is reported as not aimed, since roles are T7c's.
     - A line in `packages/load/` and a line in `solver/Cargo.toml` are changed. Each is reported not aimed, with its reason, and the candidates still run on both builds.
     - A refusal's reason text alone is changed in a predicate. There is no difference.
     - The text of the `use` episode is changed. The bench reports it reached and not observable.
   - **The process model.**
     - The rule plant, run two trees in one process, is refused.
     - Two runs interleaved in one process are refused.
     - With `solver/` unchanged, every tree runs the head's binary file, and the report says so.
     - A candidate whose intent the base refuses is followed by one that needs the solver to hold its world. The second candidate's admissions agree on both trees.
     - A fixture edited in the base alone is reported as "world differs".
     - A runner planted to read the trace line from the live bodies after a submission gives a line that disagrees with the committed frame, and the bench's check on it goes red.
     - A tree whose `node_modules` is missing, so that Node would resolve a parent's, is refused.
     - A change the witness itself meets, a rule the witness's path crosses, gives a first difference inside the witness, reported as a difference and never as a finding of the base.
     - A planted restore of the head's save in the base's process is refused by the bench's tree tag, with `solver/` unchanged so that both trees run one binary.
   - **The coverage build.** A coverage build made to fail, by a flag the compiler refuses, stops the bench with the reason. A coverage build planted to compute differently from the product build is refused by its golden check. A run whose law mutants pass the cap reports those left out. A planted read of the counters after a restore trips the step-count canary, and the bench refuses with the reason.
   - **The report.**
     - A change to the hasher makes every candidate differ at tick 0, and the report shows one flood line.
     - An anchor reached only after the stall shows a late gain above zero.
     - An anchor no verb reaches is named not aimed.
     - A planted copy's tree digest differs from its commit's, for an edited file and for a new untracked one.
     - Two runs with one seed from worktrees at different paths give equal reports outside the environment block.
   - **Mutants.** Each of these is planted and reported as named:
     - a mutant caught by a trace difference, one caught by a rung-3 failure, and one caught at rung 0;
     - a mutant that survives;
     - one that does not load, and one that fails before any candidate acts;
     - one whose text equals the base's;
     - one that no candidate reached.
   - **Each rung goes red.**
     - A planted restore that drops one saved field fails rung 0.
     - A predicate that admits on every other call, by a counter kept outside the tick, fails rung 0's second replay.
     - A candidate whose body leaves a test world through a gap in the floor fails rung 3 on the head; if the base has the gap too, it is not a catch.
   - **Swapped trees.** With its base and head swapped, the bench reports the same differences, with the sides named the other way.
   - **Determinism.** Two runs with one seed give equal reports but for times.
   - **F2's law change, planted, by hand.** The base tree is `main` with F2's branch in `solver/src/kcc.rs` switched off (`Controller::<false>`), so its copy computes what Rapier's controller does bit for bit, as F2's control test proves; the head tree is `main`.
     - The bench runs it on the corpus's walker-stall bundle and on the product scene, which are control inputs (pin 5).
     - It prints both binaries' digests, which must differ.
     - It finds the bundle's first difference at quantum 98, body walker, and the report names the field. The consult's reading is x, but that is unmeasured, so the acceptance asks for the tick and the body.
     - The coverage build shows the branch's lines ran during the bundle's run.

     This tests the two-build oracle on a law change, where each tree builds its own binary and the difference is the point. It needs two law builds, so it runs by hand; the pull request links its report and states its time. It is not in `npm test`.

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
- F2's law change, planted, is found by hand on its control inputs at quantum 98, walker, with the report linked.
- The access map is JSON in pin 3's shape, and names every anchor it did not reach.
- A law anchor's reach is measured by the coverage build, whose golden equals the product build's. A coverage build that fails, or computes differently, stops the bench with its reason.
- The report is deterministic outside its environment block, counts budgets in quanta and restores, and names what it did not measure.
- The typecheck is clean, tests are at or above the count on `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.

## Not in T7b

- No model call, and no thaw; those are T7c.
- No verdict from anything but the engine. The expected values in pin 9 check the bench, never a change under test.
- No new push-triggered workflow.
- No change to the law.
