# Consult brief — the instrument's bench (T7b)

**How to use.** This is a consult, not a build and not a literature survey. Agreement is not the goal. A reply that blesses the draft and adds no scar is a failed consult.

**Date:** 2026-09-26

---

## Role

You are a skeptical test architect reviewing a dispatch before any builder touches it. The dispatch builds a bench that aims test inputs at a code change and grades each input on a ladder of verdicts taken only from the engine. A later slice puts a language model into that bench and measures it against the bench's own cheap proposer. Your job is to find where the bench will lie: where it reports a difference that is not the change, calls a change unreached that was reached, or passes vacuously. Your job is also to find where its shape will force the later slice into a bad corner.

Where you make a claim about the code, cite the file and line you read. Where you are speculating, say so in the same sentence. Do not invent papers, benchmarks, or numbers.

**Read only.** Use the Read, Grep, and Glob tools. Do not run commands, builds, or tests. Every fact you need is in the files named below.

## What is being decided

`si-rpg-engine` (github.com/mcp-tool-shop-org/si-rpg-engine) is a deterministic, hashed, replayable 3D simulation engine. It runs a JS tick over a Rust physics law compiled to one WebAssembly binary, and hashes every quantum. A proposer seat, a pinned local model, is frozen. The Director has decided to thaw it as a test instrument only. T7a built the rails every model role shares. T7b, under review here, builds the bench the instrument runs on, with no model. T7c will put the model into the bench, run its adversarial run, and thaw it if it earns its place against the bench's own proposer.

The draft: the first version of `docs/dispatch-t7b-instrument-bench.md`.

## Ground truth you should treat as given

The repository is at `main` 93a2d1e. Read these as they are there:
- **The plan of record:** `docs/PHASE-2.md`. The T7 row, and the paragraph beginning "Decided 2026-09-25".
- **The research the dispatch cites by number:** `docs/study-swarm/seat-instrument.dispatch.md`. Its 40 findings were checked on full text by two other model families, and its Step 5 sketches T7b.
- **The dispatches T7b builds on:**
  - `docs/dispatch-t5-replay-corpus.md`: bundles and the replay corpus;
  - `docs/dispatch-t6-reachability-sweep.md`: the sweep and the tick's save and restore;
  - `docs/dispatch-t7a-seat-rails.md`: the rails;
  - `docs/dispatch-t1-the-first-difference.md`: traces and the first difference.
- **The code the bench will call:**
  - `packages/tick/tick.js`: `createTick`, `submit`, `advance`, `frame`, `log`;
  - `packages/tick/runs.js`: `replayTo`, log runs;
  - `packages/tick/difference.js`: trace comparison;
  - `packages/tick/bundle.js`: bundles;
  - `packages/tick/predicates.js`: the checker;
  - `predicates/intents/*.json`: the verb rules;
  - `packages/tick/world.js`: the world and the solver seam;
  - `solver/src/rapier_law.rs` and `solver/src/kcc.rs`: the law.
- **T6's sweep and save/restore are not on main yet.** PR #75 is being brought onto main now. Its code, at 88379d5, is in the pull request's branch (`wt-75/` in the reply): `packages/load/sweep.js`, `packages/load/world.js`, `createRestorableTick` in `packages/tick/tick.js`, and `harness/restore.test.js`.
- **The law cannot be line-covered today.** The binary is pinned by digest and linted (no memory growth, no SIMD, fixed memory). Whether an instrumented build is possible on the pinned toolchain (rustc 1.98.1, wasm32-unknown-unknown) is an open question to a Rust knowledge base; the draft marks the law's first rung as waiting on it.
- **One fact the draft rests on:** a sweep's intents are admitted by a checker whose rules can themselves be the change under test.

## Questions

Answer each with the reply format below.

1. **The split.** T7b is a bench with no model; T7c adds the model and the thaw. Does building the bench first risk building the wrong bench for the model? Name any choice in the draft that T7c would have to undo.
2. **The ladder's order and its stops.** The rungs are: sound (replays twice, restores), then reaches (coverage), then differs (base and head builds), then fails (T6's findings). A candidate stops at the first rung it cannot reach. Is that right when coverage can miss? Consider a change in data (a rule file), a change coverage attributes to another function, or a law change with no coverage at all. Should every admitted candidate run on both builds?
3. **"Admission differs."** Counting a checker refusal on one build and not the other as a difference: is that a sound verdict, or noise when the change is in the checker itself?
4. **The access map.** It runs each verb once from each world's settled load state. Does it bias the aim toward code reachable from load states, and miss anchors reached only deeper, such as while carrying or after a climb? Is there a cheaper, truer aim?
5. **Mutants.** Are the operator set and the definition of "caught" sound for measuring the bench? Is mutating only the changed lines enough? What makes a mutant score here meaningless?
6. **Budgets and the stall rule.** Is equal wall-clock the right unit when there is no GPU in T7b? Is "n admitted candidates in a row with no new changed line and no new difference" the right trigger for T7c to call the model?
7. **What makes the bench lie.** Name the concrete ways it would report a false difference, a false "not reached", or a vacuous pass, across two builds loaded in one process or two. Consider module caching, instance reuse, the WASM memory, and the hasher. Say which test in the draft's pin 8 would catch each, or that none would.
8. **The planted F2 test.** The base is `main` with F2's branch switched off (the copy then computes Rapier's controller bit for bit); the head is `main`. Is that a sound historical test? What would make it pass for the wrong reason?

## Reply format

Start with:

VERDICT: approve | revise | reject
SENTENCE: one sentence.

Then, for each question:

## Q<n> — <short title>
ANSWER: …
CHANGE IN THE DISPATCH: the sentence or pin you would change, and to what; or "none", with why.
CONFIDENCE: high | medium | low
BASIS: the files and lines you read.

End with **Scars**: the three most likely ways this bench fails in use, most likely first.
