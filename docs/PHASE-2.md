# Phase 2 — The suite

2026-09-25. Coordinator: Claude. The research behind this phase is `docs/study-swarm/testing-3d.dispatch.md`, 25 findings from three retrieval-only lanes, nine of nine arXiv citations supported by the external gate, signed receipt beside it. Each slice below names the findings it rests on by number.

## What Phase 1 left

Five engine slices on `main` at 0.1.0: bodies in three dimensions, the solver in Rust, world files validated at load, verbs with effects, minds. Seventy-three tests, seven behaviour fixtures that replay frame for frame, two golden hashes under three JavaScript engines, a binary pinned by its Linux digest. What the suite cannot yet do: say which quantum and which field first differed when two runs disagree; say which behaviour moved when a golden legitimately moves; restore the solver from a snapshot and prove the snapshot is whole; run on a second CPU architecture; assert an outcome instead of a hash; or find a defect the fixtures were not written for.

## The rule of this phase

**Every slice ships the harness that measures it, and a test that the harness goes red.** A harness that cannot fail is theater. No slice merges with its measurement deferred to a later slice, and no later slice may assume a harness it did not find on `main`. The Director's instruction on 2026-09-25: build the test harnesses comprehensively as we go, not all at once later.

## Slices, in order

Each slice is one pull request from a written dispatch, built by one seat, reviewed by a different model family on a scratch clone, CI green before review, merged with the reviewed commit named. No slice starts before its dependency merges.

| Slice | Depends on | What it is | Done when | Findings |
|---|---|---|---|---|
| **T1. The first difference** | nothing | A trace harness that prints, per quantum, the hash and every body's fields as exact bit patterns plus the snapshot's length and digest, under all four runtimes; a tool that takes two traces and names the first differing quantum, body, and field with both values; CI prints that difference when a golden mismatch happens instead of four hashes. Behaviour numbers beside every golden: the sleep quantum of every dynamic body, resting heights, the snapshot's byte length, recorded for the product scene and every fixture, and checked with the hash. `write-golden` writes both files, and a rewrite that moves a behaviour number must say which. | Two traces of one run are identical; a trace with one flipped bit is located to its field; a moved behaviour number fails the check; CI's failure output names a quantum and a field. | 1, 2, 9, 10, 11, 12, 17 |
| **T2. Restore** | T1 | The binary gains `solver_restore`: it takes the bytes of a snapshot the same binary produced and rebuilds its world from them. A test loads a mid-run snapshot, reruns from there, and requires the same trace to the end; a second test corrupts one byte and requires a refusal. Any state that the restore-then-rerun test exposes as missing from the snapshot goes into the snapshot, and the golden moves once with that reason. | The restored run traces identically to the uninterrupted one, on every fixture and the product scene. | 6, 12 |
| **T3. Platforms and the binary** | T1 | An ARM64 lane in CI running the three engines and the trace diff; a lint that refuses a binary containing any relaxed-SIMD opcode or a memory that can grow; the snapshot golden recorded as byte length plus digest; collision-event order hashed apart from body state; a test that insertion order changes the hash; a load-time refusal of authored values that are not finite literals. | The ARM lane prints both goldens; the lint goes red on a binary built with relaxed SIMD on; the event-order hash moves when two contacts swap. | 1, 3, 4, 5, 12 |
| **T4. Outcome tests, issue-named** | T1 | Permanent tests that assert what happened, not a hash: a thin fast body against a thin slab; a heightfield seam; the whole scene translated by 1e6 replays with the same relative motion and the same sleep quanta; and a character course at this engine's own limits, each checked just below and just above: a step of 0.29 and 0.31, a slope of 44° and 46°, a snap at 0.19 and 0.21, a character starting inside geometry, a character against a character. Any bump of the pinned solver reruns the course before a golden may move. | Every test names its outcome and its number; the course is in `harness/course.test.js` and CI runs it before the golden compare. | 13, 14, 15, 16 |
| **T5. The replay corpus** | T1, T2 | A nightly job replays every log and fixture on `main` against the current build, using the trace diff, and a failing run writes a bundle of seed, world, log, and hash chain that `replay` reproduces in one command. | The job runs on a schedule with a timeout and a concurrency group, opens an issue on failure with the bundle attached, and never pushes. | 17, 18, 24 |
| **T6. The reachability sweep** | T2, T4 | Using restore, a sweep explores from every settled cell of a world and compares the zones a body can reach with the zones the file authored; a load-time hazard for small worlds, a scheduled job for large ones. | A world with an authored zone no body can reach is refused with the zone named. | 19, 20 |
| **T7. The seat as a test instrument** | T4, T5 | The frozen proposer seat thaws only as a source of test intents aimed at changed code, run through the checker, with the verdict from the hash and the outcome tests, never from the model. | A model-proposed intent that finds an outcome-test failure is recorded as a bundle like any other. | 21, 22, 25 |

**Revised 2026-09-25 after `docs/rust-kb-answers.md`.** T2 restores by replay and by a copy of the module's linear memory, not by writing into Rapier, because rapier3d-f64 0.35.3 has no sound write path and even a sound write does not reproduce the next step. The first T2 build, PR #43, is closed unmerged. Soundness work the answers found is S1 (`docs/dispatch-s1-soundness.md`); the heightfield surface is S2.

**Found by the suite, 2026-09-25.** T4's translated-scene test and the Rust knowledge base's rebuild counter showed that `main` rebuilds the Rapier world at every verb boundary, which wakes sleeping bodies anywhere in the world and re-solves them cold; F1 (`docs/dispatch-f1-switch-in-place.md`) switches bodies in place instead, after S1 and T5. The walker's lost travel on flat ground, about one quantum in 30, is a bug in Rapier's character controller at a floor normal one unit in the last place short of vertical; F2 (`docs/dispatch-f2-walker-stride.md`) fixes it with an engine-owned copy of the movement routine, after F1. Known and recorded, not fixed: on a few quanta the character's first diagonal cast misses the floor and it sinks about 2e-3 into its skin while keeping its travel (the knowledge base saw it at quanta 2182, 7058, and 8233 at the origin). Measured again at F2, on the product walker's flat walk of 10,000 quanta (harness/outcome.test.js, outcome 4b, prints the quanta): the move finds no hit at all, so the walker takes the whole gravity step, 1.953125e-3, and climbs back at the 1e-4 nudge over the next 20 quanta. On `main` at 48da598 it comes at 2182, 7058, and 8233 at the origin and at 873, 1315, 5847, and 6696 at 1e6. With F2's copy of the controller the walk moves differently and it comes at 2242, 4385, 4890, 5276, 5820, 6709, 6887, and 7197 at the origin and at 1532, 2252, 4653, 5272, 5350, 6392, and 7445 at 1e6. At each of those, Rapier's own routine given the same pose takes the same step: with no hit the branch F2 adds never runs.

**Found by the sweep, 2026-09-26.** T6's reachability sweep found a small box that the product law launched at 162.7 units a second. The Rust knowledge base traced it to the character's push, not to a squeeze. Rapier 0.35.3's `solve_character_collision_impulses` gathers the manifolds of every dynamic collider near the character into one shared `Vec`, which parry overwrites for a convex pair, so one body is pushed at another's contact points. Rapier fixed it upstream in dimforge/rapier#1004, released in 0.36.0. F3 (`docs/dispatch-f3-character-push.md`) backports that fix as an engine-owned copy beside F2's, with a guard on how fast a push may leave a body. Moving to 0.36.0 is a slice of its own, measured by T7b's two-build bench.

**Decided 2026-09-25: the seat thaws as a test instrument.** The Director thawed the proposer seat as a test instrument and asked for rails so that it can take other roles later. The research is `docs/study-swarm/seat-instrument.dispatch.md`: 40 findings from five lanes, checked by the citation gate and, where an abstract could not ground a claim, on the full text by two other model families. T7 splits in three. T7a is the rails every role shares (`docs/dispatch-t7a-seat-rails.md`): a manifest per role, a role gate in the checker, provenance in the log, and a record of every model call that CI checks without a GPU. T7b is the instrument's bench (`docs/dispatch-t7b-instrument-bench.md`), with no model: the change as anchors, the reach of each input, two builds compared by the engine's own trace, mutants, and a cheap proposer the model must beat. T7c puts the model into that bench as one more generator, and thaws the test instrument, the first role to be thawed, after its adversarial run. T7b and T7c follow T6 and T7a. A role proposing for characters during play is declared in T7a and stays frozen.

Collision from meshes is the slice after this phase; it needs T2's restore and T4's outcome pattern to be provable. The survey of the studio's glb files and of the facet and armature repositories is in the coordinator's memory and becomes that dispatch.

## The trace format

Fixed by T1. `harness/trace.mjs` prints it for the product scene under node and the three shells; `play(spec, { trace: true })` in `harness/solver-scene.mjs` returns it for a fixture case; `harness/first-difference.js` reads it. One line per quantum, tokens separated by one space, line 0 the load:

```
<tick> <hash> body <id> <x> <y> <z> <vx> <vy> <vz> <qx> <qy> <qz> <qw> <wx> <wy> <wz> <zone> <links> ... snap <len> <digest> mind <body> <met> <belief> ...
end <lines>
```

- `hash` is the running frame hash as sixteen hex digits, `NAN` when a float would not mix; a line of only `<tick> NAN` means the step threw.
- Each of the thirteen floats is its IEEE bit pattern as sixteen hex digits, high word first.
- `zone` is the zone index in file order or `-`; `links` is `-`, or `>id` for the body it carries and `<id` for the body carrying it.
- `snap` is the snapshot's byte length and the FNV digest of its length and bytes, or `snap - -` with no snapshot.
- Each mind: its body, one `0` or `1` per goal for met or `-` with no goals, and its newest belief id or `-`.
- The last line counts the quantum lines before it. A trace without it is truncated, and `first-difference` exits 2.

## What this phase does not do

No error thresholds in place of bit-exact agreement (finding 7). No vision model judging the debug view (finding 23 is a benchmark, not a licence). No test whose oracle is a model. No genre, presentation, or market framing anywhere in the engine's law, contracts, or briefs. The seat stays frozen until T7, and T7 thaws it as an instrument only.

## Standards compliance

- **PIN_PER_STEP: 2.** Node, Rust, the three engines, jsvu, Atlas, and the binary digest are pinned; T3 adds the ARM lane under the same pins. Remediation: T5's scheduled job pins its runner image by digest, owner coordinator, target T5.
- **ANDON_AUTHORITY: 3.** CI blocks merge; the goldens block drift; the behaviour numbers block a silent rewrite; T1's rule that every harness must go red is tested per slice.
- **NAMED_COMPENSATORS: 2.** A merge is undone by `git revert -m 1 <merge>` (coordinator). A golden or behaviour rewrite is undone by reverting its commit. T5's job opens issues and never pushes, so it has nothing to undo beyond closing an issue (owner: coordinator). No publishes in this phase; a release is a separate act under the treatment's table.
- **DECOMPOSE_BY_SECRETS: 2.** `harness/` holds measurement, `solver/` the law, `packages/` the tick; T1 adds the trace and diff to `harness/` only, T2 touches `solver/` only for restore.
- **UNCERTAINTY_GATED_HUMANS: 2.** The Director ordered the suite before meshes on 2026-09-25 after a contrastive recommendation; T7's thaw is the one further human decision and is framed the same way.
- **EXTERNAL_VERIFIER: 3.** Built by one family, reviewed by another on a scratch clone, CI as the mechanical check, the research gated by the citation verifier with a signed receipt.
