<!-- study-swarm · si-rpg-engine consult 02 · 2026-09-24 -->
# Study-swarm dispatch: the three calls the consult adjudication made without evidence

> **Product being planned.** `si-rpg-engine`, phase 0. Two consult replies (Claude, Gemini) both said revise. The operator's adjudication kept four sentence changes. This dispatch grounds the three places where the adjudication, or one of the consult replies, made a call nobody had opened a page for: what a determinism harness must run on to prove anything, what the checker is for a model-authored verb and when it may be admitted, whether typed memory writes are measured better than free-text consolidation, and what kind of checker a stance gate on a spoken line should be.

## Step 1 — Load-bearing questions

- **QA Determinism proof.** Is "two processes, byte-identical hashes" sufficient evidence of cross-runtime determinism for a TypeScript or WASM harness?
- **QB Verb drafts.** If the model may propose a new verb, what checks it, and is admission load-time or play-time?
- **QC Memory consolidation.** Does the evidence support "free-form reflections wait," "typed writes only," or "free-form with a checker"?
- **QD Line gate.** For a reject-only stance check of a spoken line against a typed record, is the checker a different-family chat model, a fine-tuned pairwise classifier, or a slot extractor?

## Step 2 — Research dispatch

Four retrieval-only agents, one question each, in parallel. Word-capped. A remembered paper that did not open was a miss.

## Step 3 — Research grounding

### QA Determinism proof

1. **ECMAScript leaves sin, cos, exp, pow, hypot, atan2 and the other transcendentals implementation-approximated; only add, subtract, multiply, divide, and sqrt are pinned.** TC39 ECMA-262 §21.3.2, page opened 2026-09-24 (https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-function-properties-of-the-math-object). Implication: a harness integrator may use only the pinned five operations, or ship its own software libm.
2. **Measured across 20,000 seeded inputs, V8 and JavaScriptCore disagree on hypot 35.7% of the time, pow 9.8%, exp 9.5%, cos 3.3%, sqrt 0%.** Clockwork 2 PR #1, hiddentao 2026, page opened 2026-09-24 (https://github.com/vbz-gg/clockwork2/pull/1). Implication: two processes of one Node binary prove nothing about the browser host that will draw the world.
3. **WebAssembly pins float arithmetic to round-to-nearest-even across platforms, but NaN sign and payload are non-deterministic, and the core instruction set has no transcendental operations.** WebAssembly Core Specification, Numerics, page opened 2026-09-24 (https://webassembly.github.io/spec/core/exec/numerics.html). Implication: the hashed state must assert that no NaN ever enters it; a NaN is a divergence point, not a value.
4. **Box2D v3 reached cross-platform determinism only after disabling fast-math and FMA contraction and hand-writing atan2f, and it verifies by hashing body transforms across CPUs, compilers, and thread counts.** Catto 2024, page opened 2026-09-24 (https://box2d.org/posts/2024/08/determinism/). Implication: the harness pass criterion is a stored golden hash compared across targets, not process A against process B.
5. **Rapier is deterministic only on the same machine, version, and compiler by default; its cross-platform mode requires SIMD off and software transcendentals. Jolt's cross-platform mode costs about 8% and is verified against 14 target and compiler combinations including wasm32 under Node.** Rapier determinism guide and Jolt deterministic-simulation docs, pages opened 2026-09-24 (https://rapier.rs/docs/user_guides/rust/determinism/ ; https://jrouwe.github.io/JoltPhysics/#deterministic-simulation). Implication: cross-platform determinism is an opt-in in every library that offers it, so the contract must state it as a requirement the later library slice has to meet.
6. **Floating-point semantics change with factors beyond the source code, including choices made by compilers.** Monniaux 2008 (arXiv:cs/0701192, ACM TOPLAS 30(3)). Implication: the harness proves a build, not a source file; the build flags are part of what the hash definition pins.

### QB Verb drafts

7. **Voyager admits a skill to its library only after a separate critic reads the simulator state and says the task succeeded; removing that verification cut discovered items by 73%, and the critic is still a model judging observed state.** Wang et al. 2023 (arXiv:2305.16291). Implication: execution grounding is the load-bearing part; the model critic is a pre-filter, not the admission.
8. **Model-written AgentSpec rules in a typed trigger/check/enforce DSL reached 95.56% precision but 70.96% recall on embodied hazards, and the misses were incomplete predicates.** Wang, Poskitt, and Sun 2025 (arXiv:2503.18666). Implication: a verb draft that compiles is still a draft; the checker must run it against the hand-authored hazard invariants.
9. **A formal checker plus consistency checks accepted up to 87% of correct programs with zero false positives and caught six incorrect programs in a human-authored set.** Sun, Sheng, Padon, and Barrett 2023 (arXiv:2310.17807). Implication: where a verb's postcondition can be stated as a predicate, the checker is conservative and admits no bad verb.
10. **Generated VGDL game rules passed the parser 100% of the time for GPT-3.5 and were only 10–40% correct; structural and semantic completeness checks caught most failures.** Hu, Zhao, and Liu 2024 (arXiv:2404.08706). Implication: compiling against fixed primitives is necessary and not sufficient.
11. **ScriptDoctor regenerates on compiler errors and then play-tests solvability with a breadth-first agent.** Earle et al. 2025 (arXiv:2506.06524). Implication: the second gate for a verb draft is execution in the tick against a playability suite.
12. **Skills accumulated online without a quality signal drove pass@1 below the no-skill baseline; outcome-driven retirement and a cap of 50 active skills recovered it.** Zhang et al. 2026 (arXiv:2605.19576). Implication: verb admission is load-time, outcome-gated, with a retirement path; never mid-play.
13. **Eureka's admission is a full execution run per candidate: compile, train a policy, score on a ground-truth metric, 16 candidates over 5 iterations, offline.** Ma et al. 2023 (arXiv:2310.12931). Implication: the cost of admitting a verb is an evaluation run, which is a between-sessions cost.

### QC Memory consolidation

14. **The consolidation that went net-negative was free-form text rewritten every four trajectories; an episodic-only control that appended raw rollouts matched or beat every consolidator, and no typed or schema-constrained alternative was tested.** Zhang et al. 2026 (arXiv:2605.12978). Implication: raw episodes stay the evidence, free-text streaming consolidation stays out, and the paper is silent on typed writes rather than against them.
15. **Generative Agents' reflections are stored with citations to the evidence memories they were drawn from, and ablating reflection dropped believability from 29.89 to 26.88 TrueSkill.** Park et al. 2023 (arXiv:2304.03442). Implication: a reflection that cites admitted episode ids is the sibling's belief record with a source field; a reflection without citations is presentation.
16. **Long-context assistants drop about 30% accuracy across a sustained interaction; in the body, replacing dialogue rounds with extracted facts hurt QA through information loss, while keeping raw rounds and adding facts as index keys gained 9.4% recall and 5.4% accuracy.** Wu et al. 2024 (arXiv:2410.10813). Implication: typed writes index the episode log; they never replace it.
17. **Giving the model one inspection slot on the provenance path of a withdrawn constraint gained 62 points on average across 10 models from 9 organizations; models found that path on their own about one time in five.** Nakayashiki 2026 (arXiv:2608.25553). Implication: supersession is a structural field the checker reads, with the withdrawing episode cited, not something a verification budget discovers.
18. **A typed 13-category memory with non-destructive temporal versioning scored 89.8% on LongMemEval against 60.2% for Mem0, with no ablation isolating the typing.** Abtahi et al. 2026 (arXiv:2604.22085). Implication: typed with versioning is the best measured shape; the typing itself is suggestive, not proven.
19. **Mem0's graph variant marks obsolete relations rather than deleting them.** Chhikara et al. 2025 (arXiv:2504.19413). Implication: a superseded belief is a tombstone with a cited cause, never a delete.
20. **Constrained decoding raised structural validity to 100% on small schemas, and structured-output mode fell to 0% validity on a 369-field schema.** Chavan 2026 (arXiv:2609.23742); Ferguson et al. 2026 (arXiv:2602.12247). Implication: the memory-write verb keeps a small schema, one belief per proposal.

### QD Line gate

21. **NLI re-ranking of a persona chatbot cut human-judged contradictions from 0.25 to 0.16 and did not eliminate them.** Welleck et al. 2019 (arXiv:1811.00671). Implication: the gate reduces contradictions; the rule that a line is never hashed is what protects the record.
22. **A structured utterance-pair contradiction detector transferred to human-bot dialogue at 84.69% against 70.03% for a whole-context model, and a generic NLI model reached only 77.4% on the same test.** Nie et al. 2021 (arXiv:2012.13391). Implication: the checker compares one record slot against one utterance, and generic NLI does not transfer without in-domain pairs.
23. **A fine-tuned 13B reward model correlated with human persona-consistency judgments at 0.631 overall and 0.879 on persona-behavior, against 0.385 and 0.305 for 3-shot GPT-4.** Tu et al. 2024 (arXiv:2401.01275). Implication: a tuned classifier beats a frontier chat judge on exactly this task.
24. **SYCON measures conformity in the responder seat over five turns of pushback; its only judge role, GPT-4o labeling stance, agreed with humans at kappa 0.917 in the debate setting, and no checker seat was tested.** Hong et al. 2025 (arXiv:2505.23840). Implication: the conformity finding does not bear on a reject-only classifier; the objection that any aligned model will sand down conflict is unsupported by its own citation.
25. **A RoBERTa critic checking an utterance against a knowledge record reached 86.5% in-domain, and critics trained on Dialogue NLI or DECODE collapsed to 30.9% and 38.5% on it.** Dziri et al. 2022 (arXiv:2204.10757). Implication: the classifier's training pairs must match the record type, so a labeled pair set over the belief slots is a deliverable.
26. **A panel of three disjoint-family judges agreed with humans at kappa 0.763 against 0.627 for a single GPT-4, and GPT-4 ranked its own variant second where humans ranked it fourth.** Verga et al. 2024 (arXiv:2404.18796). Implication: a cross-family panel is a calibrator for the classifier, not the gate.
27. **GPT-4 recognizes its own text 73.5% of the time and self-recognition correlates with self-preference; weaker evaluators cannot distinguish stronger generators' text.** Panickssery, Bowman, and Feng 2024 (arXiv:2404.13076). Implication: "different vendor" is not by itself a different check.

### Retrieval misses (not used above)

- Code as Policies (arXiv:2209.07753) was opened; it reports no verifier beyond execution and no failure analysis, so it carries no implication.
- InCharacter (arXiv:2310.17976) and PersonaGym (arXiv:2407.18416) were opened; they measure trait-level fidelity and rubric scoring, not per-line contradictions, so they are not findings here.
- A-MEM (arXiv:2502.12110) was opened; its evolution step rewrites neighbors with a model, which is the pattern finding 14 warns about, and it was not used as support.
- Bruce Dawson 2013 and Fiedler 2010 on floating-point determinism were opened and agree with finding 6; they are engineering posts and are not listed separately.

## Step 4 — External verification

Run `roleos verify-citations` on this file. Web-page findings (1–5) are expected to escalate as advisory, as in the phase-0 receipt.

## Step 5 — Connections

Recorded in `docs/consult-reply-claude-02.md`, by finding number, after the gate returns.
