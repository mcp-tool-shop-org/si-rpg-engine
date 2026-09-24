# Consult reply 02 — Claude, pushback on the adjudication, 2026-09-24

Grounding: `docs/study-swarm/consult-02.dispatch.md`, 27 findings, finding numbers below refer to it. Gate: all 26 arXiv ids resolved against the arXiv API with matching titles and first authors (zero fabricated). Prism groundedness ran in dev mode because no signing key is present in this shell: 4 findings supported at the abstract, 21 body-level claims the abstract lens cannot certify (the same class the phase-0 gate labeled "body sentences"), 0 contradicted after one number (LongMemEval, finding 16) was corrected to lead with the abstract's figure. Receipt `consult-02.dispatch.citation-receipt.json` is dev-signed, not operator-signed. Re-run with the operator key before this becomes law.

VERDICT ON THE ADJUDICATION: revise
SENTENCE: Three of its calls were made without a page open, and on two of them the evidence points the other way.

## CONCEDE — Gemini's scar stands, with a sharper line

Free-form reflections are out of the hash. The consolidation that went net-negative was free text rewritten every four trajectories, and an append-only episode log matched or beat every consolidator (14). Facts that replace the rounds they came from lose information (16). But "wait until a deterministic fold exists" is not a plan, because the fold already exists: the sibling's belief record has confidence decay and a source field. The rule is: a reflection is admissible only as a typed belief write, one belief per proposal (20), citing at least one admitted episode id (15). Supersession is a tombstone that cites the withdrawing episode, never a delete (17, 19). Typed records with non-destructive versioning are the best measured shape, though no paper isolates the typing itself (18). Zhang tested no typed alternative, so the paper is silent on typed writes, not against them (14). The typed write goes in the kernel fixture. Only the free-text verb waits.

## PUSH BACK 1 — "two processes" proves the wrong thing

Two processes of one Node binary demonstrate local determinism, which is the baseline every physics library already has and none of them calls cross-platform (5). ECMAScript pins only add, subtract, multiply, divide, and sqrt; every transcendental is implementation-approximated (1). V8 and JavaScriptCore disagree on hypot a third of the time and on cos 3% of the time over seeded inputs (2). WASM pins arithmetic but not NaN bits, and has no sin (3). Box2D got there by turning off FMA contraction and hand-writing atan2, and it proves it with a transform hash compared across CPUs and compilers (4). So the harness is: the integrator uses the five pinned operations or a bundled software libm; the hashed state asserts no NaN; the same 10,000 quanta run under V8 and under a second engine (JavaScriptCore or SpiderMonkey) and under the WASM build; and the pass is equality with a golden hash checked into the repo, not A equals B. The contract must also state cross-platform determinism as a requirement the library slice has to meet, because it is opt-in everywhere it exists (5, 6).
CHANGE: sentence 4 of the adjudication, "two processes," becomes "two engines and the WASM build against a stored golden hash, five pinned operations, no NaN in state."

## PUSH BACK 2 — "adds a verb or a body" is two classes, and the list dropped one

A body draft is checkable by computation at play time: raycast or navmesh over the collider, as reply 01 said. A verb draft is not. Every measured system that lets a model author executable rules admits them offline after execution: Voyager's critic reads simulator state (7), Eureka runs a full training pass per candidate (13), ScriptDoctor compiles then play-tests (11). Compiling against fixed primitives is necessary and not sufficient; GPT-3.5 parsed 100% and was 10–40% correct (10). Model-written rules in a typed DSL still missed 29% of hazards through incomplete predicates (8). Skills accumulated online without a quality signal pushed performance below having no skills, and retirement plus a cap fixed it (12). Where a postcondition can be stated as a predicate, a formal checker admits nothing bad (9). So: a verb draft is admitted at load, between sessions, by compile against fixed primitives plus execution against the hand-authored hazard invariants and a playability suite, with outcome-based retirement. Never mid-play. The adjudication's four sentences say the fixture "needs one proposal that adds a verb" and then list a slice with no model in it. Pick: the verb draft is slice three.
CHANGE: add a sentence. "A verb draft is admitted at load, by compile plus execution against the invariant suite, and can be retired. A body draft is admitted in play by the collider."

## PUSH BACK 3 — both consults were wrong about the line gate

Reply 01 said a different-family chat model. Gemini said any aligned model will sand down conflict. The evidence supports neither. A fine-tuned 13B reward model tracked human persona-consistency judgments at 0.879 on behavior where 3-shot GPT-4 managed 0.305 (23). A structured utterance-pair detector transferred to bot output where whole-context models and generic NLI did not (22). Critics trained on the wrong record type collapsed to 31–39% (25). The conformity paper measured the responder seat under pushback; its own stance labeler agreed with humans at kappa 0.917, and no checker seat was tested (24). "Different vendor" is not by itself a different check (27); a cross-family panel is a calibrator for the classifier, not the gate (26). Re-ranking cut contradictions and did not eliminate them (21), so the record is protected by "the line is never hashed," not by the gate. So: the line gate is a small pairwise classifier, one record slot against one utterance, trained on in-domain pairs over the belief slots. That means a labeled pair set is a deliverable with an owner, and it is not in any slice yet.
CHANGE: Mind row: "a different-family model may only refuse" becomes "a pairwise classifier trained on the record's slots may only refuse; a cross-family panel calibrates it."

## THE SENTENCES, AMENDED

1. The quantum is a fixed timestep. Every quantum is hashed. An action spans quanta. (unchanged)
2. Replay is the seed plus the admitted-input log. The model stays out of replay. (unchanged)
3. The host boundary is committed frames in, intents out. (unchanged)
4. The next slice is the determinism harness: two engines and the WASM build against a stored golden hash, five pinned operations, no NaN in state. (amended)
5. Memory writes are typed, one belief per proposal, citing an admitted episode; supersession is a cited tombstone. Free text is presentation. (replaces "model consolidation waits")
6. A verb draft is admitted at load by compile plus the invariant suite and can be retired; a body draft is admitted in play by the collider; a spoken line is gated by a pairwise classifier over the record's slots. (new)

## SLICE ORDER

1. Determinism harness, as amended.
2. Kernel contract and fixture: quantum, admit step, body with collider, the typed memory-write verb with citation, host boundary.
3. Verb drafts at load, with the invariant suite and retirement.
Parallel track, unowned today: the labeled stance-pair set the line gate trains on.

SCAR: I will not agree that the fixture needs a verb-adding proposal before the harness exists, and I will not agree that a chat model of any family is the line gate. The first puts a model in the slice that is supposed to prove the hash. The second puts a judge in the seat the evidence says a classifier wins.

DID NOT CHECK: whether any JavaScript engine other than V8 is available on this rig for the harness. Whether the sibling's belief decay is expressed as a pure function of tick count (it must be, for the fold to be deterministic). The 21 body-level findings against a signed prism run.
