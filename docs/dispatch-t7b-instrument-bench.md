# Dispatch T7b — the instrument's bench

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T6 (the sweep, and the tick's save and restore) and T7a (the rails), both merged first. The plan row is T7 in `docs/PHASE-2.md`. The research is `docs/study-swarm/seat-instrument.dispatch.md`; numbers in parentheses are its findings.

**How this version was reached.** A read-only design consult (`docs/consult-reply-fable-t7b-01.md`) reviewed the first draft. Four model families then reviewed five versions on #81. Each round's findings were answered in the text, and this version is rewritten whole so that none of the earlier versions' wording survives in it. What the reviews changed:
- One process per tree, loading only that tree's modules and dependencies.
- Every candidate runs on every tree, and a witness is submitted by tick on each, never carried across as a save image.
- Every kind of anchor has a stated reach, a stated mutant rule, or a stated reason it is not aimed.
- Budgets are counted in quanta and restores, and nothing the bench decides depends on the time a run takes.
- One sweep, run once, is both the access map and the aimed proposer.
- The law's reach is read from a coverage build whose frames equal the product build's.
- Every promised behaviour has a planted test that goes red.

**T7 splits in three.** T7a built the rails. T7b, this dispatch, builds the bench the test instrument will run on: what a change is, which inputs reach it, and a ladder of verdicts that come only from the engine. It calls no model. T7c puts the model into the bench as one more generator, runs its adversarial run on the rails T7a built, and thaws `test-instrument` if the model earns its place against the bench's own proposers. The research is plain that a local model is not presumed to beat a cheap proposer (3, 4, 5), so the proposers, the aim, and the oracle are built and measured first, in the shapes the model will plug into.

## What it is

A pull request changes the engine. The bench takes the change and the build before it, and looks for inputs that do three things:
- reach the changed code;
- make the changed build's run differ from the parent's;
- make the changed build fail where the parent does not.

Every verdict comes from the engine: coverage, the step hash, the trace, and the findings the engine already checks. None comes from a model, and none is an expected outcome anyone wrote down (7, 8). A difference between the two builds is a fact, not a judgment. Whether the change meant it is sorted by the coordinator against the dispatch's stated intent (12, 13).

The bench's own tests are different: they check the bench against changes planted with a known, measured effect, as any measuring instrument is checked. They are where this dispatch names expected values.

**Words used below.**
- A **scratch world** is a file under `fixtures/` or `worlds/`, or the product scene's world with its three actors (lower, the walker, and the climber), as T6's sweep builds it. The product scene's scripted act, the `product` run kind, is not a scratch world; it is a control input (pin 5).
- A **witness** is the list of intents, by tick, that takes a scratch world from its load to a settled state.
- A **candidate** is a witness and one more intent.
- A candidate's **run** on a tree is the whole of it, from the load through the witness to the intent and on until the world settles.

## Pins

1. **Anchors.** `bench anchors` reads the diff between a base and a head, and names the anchors: the pieces of changed code or data a run can meet. Each anchor has an id, a kind, a file, a name, and its changed line ranges in the head's text, or in the base's for a deletion.
   - **JS anchors.** A function in `packages/tick/` or `packages/frame/` whose text holds a changed line.
   - **Top-level anchors.** A changed top-level line in those packages, with its identifiers:
     - those it declares;
     - the declaration it belongs to, when it sits inside a multi-line one;
     - the bindings an `import` or `export` line names.

     Its reach is the reach of every function in its file that names one of those identifiers, and, for an export, of every function that names it in the files that import it. This is a token scan, and it is approximate. An `import` or `export` line, and a top-level line with no identifier, also runs when its module loads, and is marked "runs at load".
   - **Deletions.** A deleted line is an anchor at the point it left in the head's text. Its reach is the head's innermost block containing that point, by V8's block coverage, and it is approximate. A deleted top-level line takes the identifiers it declared in the base's text. When the head no longer names them, it is marked "removed; reach not measurable".
   - **Rule anchors.** A changed file in `predicates/`:
     - a verb rule, reached when its verb is submitted, admitted or refused;
     - the intent catalog (`predicates/intents/index.json`), reached when any intent is submitted, since every submission reads it. A line that retires or restores a verb is reached when that verb is submitted.
     - a hazard, reached when the hazard suite runs it (pin 4).
   - **Law anchors.** A function in `solver/src/` whose text holds a changed line, and a changed top-level item there (a `const`, a `static`), by the top-level rule above.
   - **Not aimed.** Each of these kinds is reported with its reason, and no proposer aims at it:
     - belief keys, since both proposers here propose intents and T7c's roles propose beliefs;
     - role manifests, which are T7c's;
     - `packages/load/`, which runs at load or in the sweep, not in a candidate's quanta;
     - dependency files: `solver/Cargo.toml`, `solver/Cargo.lock`, `package.json`, and `package-lock.json`;
     - tests, docs, the map, and tools.

     Every candidate still runs on every tree, so a difference these changes cause is still found.
   - A changed world or fixture file is reported under pin 2.

   The bench works on directory trees, so a test can plant a change in a copy without a commit. A helper makes the trees from revisions as git worktrees. The report records each tree's commit, and a digest of its files, tracked and untracked but not ignored.

2. **Where the builds run.** The checker reads its rules relative to the working directory (`packages/tick/predicates.js`, `packages/tick/beliefs.js`). Node resolves a module by its importer's path and by the nearest `node_modules` above it. The solver is one instance per module, and it rebuilds its world, waking every body, whenever a run's world changes. So:
   - **One process per tree.** Each of these runs in a fresh process of its own:
     - the head;
     - the base;
     - the head's coverage build (pin 3);
     - the sweep (pin 5);
     - every mutant tree.

     Its working directory is its tree's root, and it imports that tree's packages by absolute paths into that tree. No process loads two trees' modules, and a working-directory change is never used to switch trees. The bench refuses a setup that would.
   - **Its own dependencies.** Each tree has its own `node_modules`, installed in its root with `npm ci`. The bench checks that each process resolves its tree's own packages, and refuses otherwise.
   - **One live world at a time.** Each process finishes or restores one run before it begins another. A run interleaved with another in one process is refused.
   - **Every tree takes the same inputs, in the same order.** On every tree, a candidate's witness is submitted from the load, each intent citing that tree's own newest frame (pin 4). The first time a tree reaches a witness's state, it stores the trace of that prefix and a save of that state. It may later start another candidate from the same witness by restoring that save and prepending the stored prefix trace, so the compared trace always runs from the load. Every save is tagged with the tree that took it, and the bench refuses to restore a save in any other tree's process, before any restore is attempted. This holds even when every tree runs one binary file and the image's own check would accept the image.
   - **The trace from the committed frame.** A tick's trace line is built from that tick's committed frame, never from the live bodies after a submission, since `submit` sets the actor's velocity at once.
   - **Worlds from the head.** Worlds, fixtures, and generators come from the head tree. A world or fixture file that differs in the base is reported as "world differs, not aimed at", and is never run from the base.
   - **Binaries.** When `solver/` has no diff, every tree runs the head's binary file, copied byte for byte, and the report says so. When `solver/` differs, each tree builds its own binary from its own source. Digest equality is never taken as "the same law", since a build's digest can carry its host and path.
   - **The environment block.** Paths, digests, the host, and times go in the report's environment block. Pin 8's same-seed promise covers everything outside it.

3. **Reaching the change.**
   - **JS.** A candidate's JS reach is V8's block coverage through `node:inspector`, taken as a delta around the candidate's intent and the quanta after it, once its witness's state is in place.
     - A JS anchor is reached when its function ran.
     - Its changed executable lines reached, those under a block that ran, are a finer column beside it.
     - A change with no executable line, such as a comment or a parameter's name, is "no executable change", and is reached when its function ran.
   - **Rules.** As pin 1 says for each kind.
   - **The law.** A law anchor's reach comes from a coverage build of the law. The recipe below is normative, and the knowledge base's answer [`requests/law-coverage.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/law-coverage.md) is its evidence.
     - **The build.** The pinned rustc, with `-C instrument-coverage -Z no-profiler-runtime` under `RUSTC_BOOTSTRAP=1`, `--cfg law_coverage`, and `-C link-arg=--no-gc-sections`, into a target directory of its own. A three-line shim in `solver/src/lib.rs`, compiled only under `--cfg law_coverage`, defines `__llvm_profile_runtime`, the one symbol the instrumented code references. The product binary's bytes, digest, pin, and lint are untouched, and a test holds the digest unchanged with the shim in the source.
     - **Its frames are the product build's.** Before the coverage build is used, it runs the product scene, and its final hash must equal the head's product build's final hash, both computed in this run. If the flags fail, or the hashes differ, the bench refuses with the reason and never guesses reach. `RUSTC_BOOTSTRAP` and `-Z no-profiler-runtime` are not supported by the Rust project, which is why this check is a refusal.
     - **The counters.** They live in the module's linear memory, and an image carries them. For each run on the coverage build the order is: restore, zero, run, read, with the counters always read before any further restore. The coverage build runs each candidate once, in that window. Rung 0's replays (pin 6) run on the product builds, never inside it.
     - **The mapping.** Counters map to lines through `llvm-profdata` and `llvm-cov export`, from the `llvm-tools` component of the pinned toolchain. A law anchor is reached when its function's region ran. Its changed executable lines are a finer column, and a changed line in no region, such as a comment or an attribute, is "no executable change".
     - **The canary.** After mapping, the execution count of the law's exported step function must stand in its measured relation to the quanta the run took. The builder measures that relation on the product scene first, and pins it with a test; equality is expected, since `llvm-cov show` rounds but `export` does not. Otherwise the bench refuses with the reason: a zero means the counters were read after a restore or at the wrong address, and a larger count means they were not zeroed.
     - **The cover.** The build covers everything linked: the engine's files, Rapier, parry, and their dependencies. So an anchor in a copied routine such as `kcc.rs` is measured like any other.
     - **Known shape differences.** The coverage build fails three of the product's tests, all about the binary's shape rather than its results: the image's non-zero page count, since the counters live in memory, and the one exported global, since the shim adds a static. The bench does not run the product's tests on it.
   - **Approximate reach is named.** A top-level or deletion anchor that no run is seen to reach is reported "not seen reached (approximate)", never plainly "not reached", in the report and in the access map.
   - **Observable or not.** The report marks each anchor "observable", "not observable", or "observability unknown".
     - An anchor whose function writes only state that neither the trace nor the hash reads is not observable: episode text, belief text, refusal reasons, hosts, the log's bookkeeping.
     - The mark is per function, so a function that writes any hashed state is observable, even if its changed line writes only what the trace cannot see.
     - A verdict of no difference is therefore always worded "no trace difference", never "no behaviour change". A reached anchor that is not observable is reported as reached and not observable, never as "no difference".
     - A function the rule cannot classify is marked unknown. The rule for the mark is stated in the code.

4. **Two builds, one input.** On each tree the bench submits each of a candidate's intents, the witness's and its own, citing that tree's newest frame. Every candidate that passes rung 0 runs on both trees, and the two traces, each from the load, are compared by T1's comparison (`packages/tick/difference.js`), which names the first differing tick, body, and field.
   - **A difference anywhere counts.** A difference that appears while the witness is still running is the candidate's first difference, like any other.
   - **Admission differs.** While the two trees' frames agree at an admission tick, an admission on one and a refusal on the other is the candidate's first difference, whether the intent is the witness's or the candidate's own. It names the intent and both reasons, and the comparison stops there. A refused intent is still submitted on the other tree, so a difference in either direction is seen.
   - **Reason text alone is not a difference,** for an intent or for the hazard suite.
   - **The hazard suite.** For each changed hazard, each tree's process runs the suite once, before any candidate, in its own world. The two verdict lists are compared as admissions are, and a difference is a rung-2 difference of that anchor.
   - **Floods.** When every candidate differs the same way, the report says so in one line. Examples: every candidate differs at tick 0 in the hash, or admissions differ throughout a changed rule.

5. **The proposers.** A proposer is a function from the bench's feedback to its next candidate, or to none. The two built here are deterministic under the run's seed. T7c's model is a third, with no change to the ladder.
   - **The sweep.** T6's sweep runs once over each scratch world, with its full action set, in the sweep's own process, on the head's product build, or on the head's coverage build when the head changes the law.
     - Each admitted action is a candidate: the witness of the cell it was taken from, and the action.
     - Its reach is taken per action, as a V8 delta for JS and a counter window for the law, and the reaches together are the access map:

       ```
       { "anchors": [ { "id", "kind", "file", "name", "lines", "observable", "approximate",
                        "reachedBy": [ { "verb", "world", "cell", "witness" } ] } ],
         "notReached": [ "<anchor id>" ], "notSeenApproximate": [ "<anchor id>" ],
         "runsAtLoad": [ "<anchor id>" ], "notAimed": [ { "id", "reason" } ] }
       ```

       This map is what T7c renders as the `access` input T7a's manifests name (9, 11).
     - **The aim is the order.** The sweep's candidates go through the ladder in two groups: first every candidate that reached an anchor, in archive order, then the rest, in archive order, within the budget. That is the baseline a directed fuzzer sets (14).
   - **The grammar.** Seeded sequences of intents from the states the sweep archived, drawn from the verb table, the world's bodies, zones, and points on a finer grid than the sweep's. Each step's candidate takes as its witness the path to the state it starts from: the archived cell's, then its own earlier steps.
     - A share of draws takes a verb that reached an anchor, and the rest a verb that did not, so an anchor the sweep missed can still be hit. When either set is empty, every draw comes from the other.
     - The share is a measured default. The builder runs the planted changes of pin 9 at shares of one half, three quarters, and all, and sets the default to the share that finds the planted differences at the lowest budget, with the measurement in the pull request.
   - **The stall.** A difference is new when its (anchor reached, body, field) has not been seen. The grammar stalls after n admitted candidates with no new changed line and no new difference. The bench runs on past the stall to the budget, and reports what came after it for each n of 8, 16, 32, 64, and 128. T7c calls the model at the n that number justifies (4).
   - **Control inputs.** The bench also accepts T5's three run kinds, `play`, `product`, and `log` bundles, as inputs it runs on every tree, and proposes nothing from them. A `log` bundle's intents are submitted by tick on every tree, each citing that tree's own frame, and its recorded hashes are compared as a trace. Control inputs climb the same ladder as candidates, and their records are marked as control inputs.

6. **The ladder.**
   - **Rung 0, sound: a gate.** On every product build it runs on, the candidate runs twice to the same hashes, and a save and restore at its midpoint (T6) traces identically. A failure on the head means the candidate is not counted as a test input; it is reported as a finding of the tick or the restore (1). A failure on the base is reported as a finding of the base, not as a difference. On a mutant tree, a candidate that passes on the head and fails on the mutant separates the two (pin 7).
   - Rungs 1 to 3 are then recorded for every candidate:
     - **Rung 1, reaches** (pin 3).
     - **Rung 2, differs** (pin 4).
     - **Rung 3, fails:** a throw, a body leaving the world, or a world that does not settle within 512 quanta after an action ends. These are T6's findings, and any the engine adds later, such as F3's guard on a pushed body's speed. Rung 3 is recorded on both trees, and a failure is a catch only when the base does not have it.
   - **What reproduces a finding.**
     - A rung-2 or rung-3 candidate is written as a T5 log bundle from the head: its witness, then its intent. Its `failure` block holds the first-difference block from the bench's own two traces, since the base cannot replay the head's hash chain past the first difference.
     - An "admission differs" candidate is written as the log of every intent both trees admitted before the differing one, with the differing intent, its tick, and both reasons in its `failure` block. `bench replay` submits that log by tick on a given tree, then the differing intent citing that tree's frame, and shows that tree's admission or refusal.
   - No rung takes an expected value from anywhere but the engine (7).

7. **Mutants measure the bench.** The bench plants mutants one at a time, each in a tree of its own.
   - **Operators, on the changed executable lines of JS and law anchors:**
     - a flipped comparison;
     - `+` and `-` swapped;
     - a condition negated;
     - an early `return` dropped;
     - a numeric constant, as four mutants: one unit in its last place up, one down, times 1.1, and times 0.9.
   - **Other kinds.** A changed top-level constant, or a rule's number, takes the same four constant mutants.
   - **No mutants:** deletion anchors, since nothing is left to mutate; "no executable change" anchors; and the kinds pin 1 does not aim at. Each is listed with its reason.
   - **Binaries.** A JS mutant tree takes the head's built binary. A law mutant is an incremental rebuild of the coverage build, about 3.2 s each on the knowledge base's host, since only the law crate recompiles. Each is compared with the head's coverage build, whose frames equal the head's.
   - **Order and cap.** Mutants are made in a fixed order, the same on every run: by anchor as the report lists them, then by line, then by operator in the order above. They are capped at a number the code states, and a run that reaches the cap reports the mutants left out and the cap's cost.
   - **Verdicts:**
     - **Caught:** a candidate that reached the range the mutant was made from separates the head and the mutant, by a trace difference, by a rung-3 failure on one and not the other, or by a rung-0 failure.
     - **Survived:** some candidate reached it, and none separated.
     - **Not reached:** no candidate reached it.
     - **Not scored:** it does not load, or it fails before any candidate acts.
     - **Marked:** its text equals the base's at that line, so a difference is not counted twice.
   - **Lists, not ratios.** Mutants are reported as lists with operator and line. The bench never judges a mutant equivalent (2), so a ratio would mean nothing. T7c compares proposers on the same list.

   Mutating the changed lines measures whether the candidates are sensitive at the change. It does not measure the aim, which is the access map's job, and the report says so.

8. **The record and the report.**
   - **The record.** Each candidate is written down as it finishes, with its witness and intent, its proposer, its anchors reached, its admission on each tree with reasons, its rungs, and its first-difference block. That record is the feedback T7c's model reads.
   - **The report.** One JSON file and a markdown summary per run, summarizing the records. It names the run's seed and budgets outside the environment block. Per proposer it gives:
     - candidates proposed, refused (with the checker's reasons tallied), and admitted;
     - the rungs reached;
     - anchors reached, each anchor's changed executable lines reached, and each anchor's observability;
     - differences, with their first-difference blocks, and floods as single lines;
     - catches;
     - mutants by verdict;
     - the late gain after each stall.
   - **Budgets.** They are counted in quanta and restores. Comparisons between proposers are made at equal budgets, and wall time is reported beside them (3). Two runs with one seed give the same report outside the environment block.
   - **What was not measured.** The report names, each with its reason:
     - anchors not aimed;
     - anchors not seen reached (approximate);
     - anchors that run at load;
     - "no executable change" anchors;
     - removed identifiers;
     - mutants not reached and not scored.

9. **Tests.** Each planted case below has a known, measured effect; each assertion checks what the bench reports about it.
   - **Anchors and reach.**
     - A verb's `maxDistance` is narrowed in a copy of the head. The bench names the rule anchor and the verb, and finds an intent the base admits and the head refuses while the frames agree. `bench replay` shows the refusal on the head and the admission on the base.
     - A comparison in a predicate is flipped from `<` to `<=` at a boundary the sweep can land on. The bench names the JS anchor and the verbs and cells that reach it in the access map, a rung-2 difference with its bundle, and the mutant lists over that anchor.
     - A one-operator change in `solver/src/rapier_law.rs`, on a line the product scene runs. The bench names the law anchor, reads its reach from the coverage build, shows the coverage build's final hash equal to the head's, and finds the difference.
     - A `const` in `solver/src/rapier_law.rs` is changed. It is anchored through the functions that name it, and its reach is read from the coverage build.
     - A comment in a law function is rewritten. It is marked "no executable change".
     - `STEP_HEIGHT` is moved. The top-level anchor exists, is reached through the climb's admission, and differs.
     - A top-level constant is changed that only an unreached function names. It is reported "not seen reached (approximate)", in the report and in the map.
     - A top-level expression with no identifier is added. It is reported as running at load.
     - A top-level constant is deleted with every use. It is reported as removed, with its reach not measurable.
     - A line is deleted from a predicate. The deletion anchor's block is reached, and the report lists it with no mutants.
     - A comment inside a JS function is rewritten. The anchor is reached, marked "no executable change", and shows no trace difference.
     - A function is renamed with every caller. The anchors are reached, and there is no trace difference.
     - A hazard's rule is changed. The suite's verdicts are compared between the trees, and a verdict whose reason text alone differs is not a difference.
     - A verb is retired in the intent catalog. The catalog anchor is reached when that verb is submitted.
     - A refusal's reason text alone is changed in a predicate. There is no difference.
     - The text of the `use` episode is changed. The bench reports it reached and not observable.
     - Each kind pin 1 does not aim at is changed: a belief key's `maxLength`, a role manifest, a line in `packages/load/`, a line in `solver/Cargo.toml`, and one in `package.json`. Each is reported not aimed with its reason, and the candidates still run on both trees.
   - **The process model.**
     - The rule plant, run as two trees in one process, is refused.
     - Two runs interleaved in one process are refused.
     - A tree whose `node_modules` is missing, so that Node would resolve a parent's, is refused.
     - With `solver/` unchanged, every tree runs the head's binary file, and the report says so.
     - A fixture edited in the base alone is reported as "world differs".
     - A runner planted to read the trace line from the live bodies after a submission gives a line that disagrees with the committed frame, and the bench's check on it goes red.
     - A planted restore of the head's save in the base's process is refused by the tree tag, with `solver/` unchanged so both trees run one binary.
     - Two candidates from one witness: the second starts from the tree's own stored save, and its compared trace, prefix prepended, equals a run from the load.
     - A change that a witness's path meets gives a first difference inside the witness, reported as a difference and never as a finding of the base.
     - A candidate whose intent the base refuses is followed by one that needs the solver to hold its world. The second candidate's admissions agree on both trees.
   - **The coverage build.**
     - A coverage build made to fail, by a flag the compiler refuses, stops the bench with the reason.
     - A coverage build planted to compute differently from the product build is refused by its final-hash check.
     - A planted read of the counters after a restore trips the step-count canary, and the bench refuses with the reason.
     - A run whose law mutants reach the cap reports those left out.
   - **The report.**
     - A change to the hasher makes every candidate differ at tick 0, and the report shows one flood line.
     - An anchor reached only after the grammar's stall shows a late gain above zero.
     - The share of the grammar's draws is set from its measurement, which the pull request states.
     - A planted copy's tree digest differs from its commit's, for an edited file and for a new untracked one.
     - Two runs with one seed from worktrees at different paths give equal reports outside the environment block, and the report names the seed.
   - **Mutants.** Each of these is planted and reported by its verdict:
     - one caught by a trace difference, one by a rung-3 failure, and one at rung 0;
     - one that survives;
     - one that no candidate reached;
     - one that does not load, and one that fails before any candidate acts;
     - one whose text equals the base's.
   - **Each rung goes red.**
     - A planted restore that drops one saved field, in the head, fails rung 0 on the head.
     - The same planted in the base fails rung 0 on the base, and is reported as a finding of the base, not as a difference.
     - A predicate that admits on every other call, by a counter kept outside the tick, fails rung 0's second run.
     - A candidate whose body leaves a test world through a gap in the floor fails rung 3 on the head; if the base has the gap too, it is not a catch.
   - **Swapped trees.** With its base and head swapped, the bench reports the same differences, with the sides named the other way.
   - **Determinism.** Two runs with one seed give equal reports outside the environment block.
   - **F2's law change, planted, by hand.** The base tree is `main` with F2's branch in `solver/src/kcc.rs` switched off (`Controller::<false>`), so its copy computes what Rapier's controller does bit for bit, as F2's control test proves; the head tree is `main`.
     - The bench runs it on the corpus's walker-stall bundle and on the product scene, which are control inputs (pin 5).
     - It prints both binaries' digests, which must differ.
     - It finds the bundle's first difference at quantum 98, body walker, and names the field.
     - The coverage build shows the branch's lines ran during the bundle's run.

     This tests the two-build oracle on a law change, where each tree builds its own binary and the difference is the point. It needs two law builds, so it runs by hand; the pull request links its report and states its time. It is not in `npm test`.

10. **Costs.** State these for each planted change:
    - the sweep's time, with and without the per-action reach;
    - the grammar's candidates per second;
    - the ladder's time per candidate on each tree;
    - the coverage build's cost per quantum and per build;
    - the mutants' time.

    If the per-action reach makes the sweep too slow to use, the builder says so with the measurement, and the dispatch is revised. The bench never chooses a method by the time a run takes.

11. **Where it runs.** The coordinator runs `bench` locally, on demand. There is no new workflow file and no change to the corpus job. The bench calls no model and imports nothing from `packages/propose`, and a source test holds it.

12. **Nothing the law is made of.** T7b changes no law and no byte of the product binary, and the goldens and the Linux digest do not move. Its one Rust change is pin 3's shim, compiled only under `--cfg law_coverage`. The coverage build is its own artifact with its own digest, in its own target directory, and the product binary's pin and lint never see it.

13. **Docs are the lead's.** The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`.

14. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` after the new files are staged; `packages/bench` gets its own boundary.

## Acceptance

- Every planted case in pin 9 is reported as it says.
- The process model refuses what pin 2 refuses.
- F2's law change, planted, is found by hand on its control inputs at quantum 98, walker, with the report linked.
- The access map is JSON in pin 5's shape, and names every anchor it did not reach.
- A law anchor's reach is measured by the coverage build, whose final hash equals the product build's. A coverage build that fails, or computes differently, stops the bench with its reason.
- The report is deterministic outside its environment block, names its seed, counts budgets in quanta and restores, and names what it did not measure.
- The typecheck is clean, tests are at or above the count on `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.

## Not in T7b

- No model call, and no thaw; those are T7c.
- No verdict from anything but the engine. The expected values in pin 9 check the bench, never a change under test.
- No new push-triggered workflow.
- No change to the law.
