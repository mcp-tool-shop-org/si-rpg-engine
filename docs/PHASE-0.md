# Phase 0 — si-rpg-engine

2026-09-24. Planning only. Revised the same day after the two consults. The research dispatches and the citation receipts live beside this file.

## What this engine is

`si-rpg-engine` is the super-intelligence counterpart to `ai-rpg-engine`. It keeps the part that already makes a world debuggable: one action pipeline, a seeded hash, presentation kept outside that hash, content checked again before it can enter a running world. The intelligence is the point of this counterpart, so the model is allowed to propose into the tick. It does not commit. A checker admits the proposal, and the tick records only what was admitted.

The clock underneath a player action is a fixed timestep. Every quantum is committed and hashed. An action is declared on a quantum boundary and resolves across quanta. Replay is the seed plus the log of admitted inputs. The model is not called during replay.

The 3D world the tick can ask questions of is a private body record: a committed pose and a collision shape. The render mesh is an attachment only the host sees. Generated video, Gaussian splats, and radiance fields are skins. The papers that make them look like engines also say what they drop: a few seconds of memory, a weapon that vanishes when the camera turns, an enemy that appears because the player keeps shooting, a few minutes of one navigator, other agents still unsolved.

That lane stays in the plan as a host socket with one shape: committed frames in, intents out. Phase 0 does not pretend those sockets are buildable this year. Nothing in this folder is published. A reader who opens it finds this plan.

## Three owners

| Layer | Owner | What it may do |
|---|---|---|
| Law | The tick | Advance one fixed-timestep quantum. Hash the serializable state. An action spans many quanta. Admit a proposal or return the checker's reason. |
| Mind | The model, then the checker named for that proposal | Propose an intent, a spoken line, one typed belief, or a body draft. A verb draft waits for load time. Free-text consolidation is not a verb. |
| Picture | The host | Receive a committed frame: tick, hash, previous bodies, next bodies. Return intents only. Blend the two committed poses. Play audio and juice. Wear a Gaussian skin or a generated frame when a socket is filled later. |

The host does not read an unadmitted proposal, does not write geometry, and does not keep a second collider. One physics step lives with the law.

## What each proposal is checked by

| Proposal | Checker | When |
|---|---|---|
| Legal intent | Hand-authored predicate. Reachability is a query against the tick's own collider. | Play, before the action resolves |
| Typed belief write | Hand-authored predicate. One belief: subject, key, value, confidence, and a source that cites an admitted episode id. Supersession writes a tombstone citing the episode that withdrew the old value. The old value stays. | Play |
| Spoken line | A pairwise classifier over one record slot and one utterance. It may only refuse. A cross-family panel calibrates it and is not the gate. The line is never hashed. A stance change arrives as its own belief write, or the line is refused. | Play, once the labeled pair set exists |
| Body draft | The collider. A raycast or a baked navmesh. A render mesh with no collider is admitted as not traversable. | Play |
| Verb draft | Compile against fixed primitives, then execution against the hand-authored hazard invariants, with retirement. | Load, between sessions. Slice 3. Never mid-play. |

Free text, including a reflection that does not cite an episode, is presentation. It is not hashed and it is not a proposal.

## Borrow, bet, park

**Borrow now, from the shipped engine**

- The action pipeline: declare, validate, resolve, record, emit. One front door. Declare and admit happen at action boundaries. Resolve runs across quanta.
- Seeded RNG and a state hash.
- Presentation outside the hash, including audio, juice, spoken text, and the render mesh.
- Content validated again at load, whether a person or a model wrote the file.
- Beliefs as records the sim holds: subject, key, value, confidence, source. Campaign-memory relationship axes stay in the hash.
- A host that submits intents and renders events. The host does not decide.

**Bet, because a paper or a spec shows the split and not a product**

- The model writes proposals in the action language. Hand-authored predicates are the law. A model-written rule is a draft of that law (AgentSpec: generated rules recalled 70.96% of the embodied hazards the hand-written rules caught). Where a verb's postcondition can be stated as a predicate, a formal checker can refuse the bad cases (Sun, Sheng, Padon, and Barrett 2023, arXiv:2310.17807; abstract-supported on the consult-02 re-run).
- Rejection is the checker's message on a fresh proposal. Self-critique is the weak loop.
- Generated 3D arrives as an engine-loadable world. The body of WorldGen, which the abstract check did not certify, describes per-object meshes, poses, and a navmesh. The contract speaks the collision shape. glTF is an export for the picture. Core glTF has no collision, and its physics extensions are still a draft.
- A belief write cites an admitted episode. Supersession is a tombstone the checker can see, because a small verification budget followed a withdrawn constraint about three times in four when it did not inspect that path (Nakayashiki 2026, abstract-supported on both gates).
- The integrator in the first harness uses add, subtract, multiply, divide, and square root, or a bundled software libm. ECMA-262 marks cosine, hypot, atan2, and the other transcendentals implementation-approximated, and `Math.sqrt` returns the Number value of the square root. Both pages were opened 2026-09-24. Hashed state contains no NaN. The WebAssembly default profile leaves NaN sign and payload unspecified; that page was opened the same day.

**Park, named so a later model can plug in**

- Real-time world models as the world. They attach, when they attach, as a consumer of two committed poses. They have no write path.
- Live neural colliders. Production physics does not read splats.
- A character whose identity is the generated pixels. Cross-shot identity exists inside a tradeoff with motion, for a handful of shots. A latent embedding does not go in the hash.
- A society kernel. Twenty-five agents can coordinate a party over two simulated days in a believability study. Larger Minecraft societies specialize inside a game they did not author.
- Learned multiplayer. One 2026 model keeps 1,024 Snake players agreed for 10,000 steps by separating a typed state from the cameras. The transition there is learned. Ours stays the action pipeline.
- Free-text memory consolidation. The consolidation that went net-negative was free text rewritten over trajectories. Raw episodes stay the evidence. Zhang 2026 does not test a typed belief write, so it is silent on that shape.
- The labeled stance-pair set the line classifier trains on. Nobody owns it yet. Until it exists, a spoken line is still unhashed, and a stance change is still a belief write.

## What changes relative to ai-rpg-engine

Zone identity stays, as a gameplay partition. Bodies, poses, and collision shapes join it. The client still must not grow its own physics world.

The player-facing action is still a boundary: declare, admit, then resolve. The hash quantum under that action is one fixed timestep, and every quantum is a save. The sibling's turn remains the action. It is no longer the thing the hash steps.

Replay is the seed plus the admitted-input log. Restoring a save still works. Re-simulating from the seed alone does not, because the seed did not generate the model's proposals.

Authored content still re-validates at load. During play the model may propose an intent, a line, a typed belief, or a body. The checker named for that class is the apply step. A persona prompt is a voice. Standing goals live in the record. Assigned personas drift toward a blank model across dialogues longer than 100 rounds, and sustained disagreement pulls a responder off its stance. That finding is about the seat that speaks. It is not a measurement of a checker. The line gate, when the pair set exists, is a classifier over one slot and one utterance.

The host blends two committed poses. It does not invent the next contact.

## What the consults changed

Gemini and Claude both returned **revise**. The sentences they share are in the sections above.

Taken from both, and kept: the quantum is a fixed timestep; replay includes the admitted inputs; the collision shape is the hashed geometry; the render mesh is the host's.

Taken from Claude's second pass, after the consult-02 gate was re-run with the operator key: the harness is a golden hash across two JavaScript engines and a WASM build; memory writes are typed and cited; a verb draft is slice 3; the line gate is a pairwise classifier, with a cross-family panel as its calibrator.

Left out on purpose: a latent identity inside the hash; a waypoint path standing in for committed poses; regenerating the episode log by calling the model; refusing mesh drafts on the grounds that volume inference is unbuildable; a chat model of any family as the line gate.

The consult-02 re-run (`prism-01m3a77yebgzs88tgj0z8p22t8`) supported 4 of 25 arXiv findings at the abstract and marked 21 as body-level. Nothing was fabricated. roleos marks the dispatch `escalate` and non-blocking because of those body claims and because the ECMA, WASM, Box2D, Rapier, and Jolt pages have no arXiv id. The 0.879 persona-consistency correlation, the V8-versus-JavaScriptCore percentages, and the "no checker seat was tested" sentence are in that body class. They are not the only reason for the choices above. The choices that rest on them are the classifier-as-gate and the exact engine pair in the harness. The choices that rest on the abstract and on pages opened this session are the typed belief write, the tombstone, the fixed quantum, the replay log, the host boundary, and "no NaN, pinned arithmetic, golden hash of a build."

## What phase 0 does not do

No package, no tag, no repository remote, no renderer, no physics library choice, no content pack. The sibling engine stays where it is. This folder does not import it yet.

The first citation gate supported all 23 arXiv findings in the original dispatch. Prism receipt `prism-01m3a5jhfmzyfk4g3q7401982z` (prism verdict accept). The Genie 3 blog, the GGPO guide, and Fiedler's snapshot-interpolation essay have no arXiv or DOI. Those three pages were opened. The vivid failure sentences (spawned enemy, forgotten weapon, navmesh) come from the paper bodies. They sit beside the abstract findings. They are not the only reason for any choice above.

## Slice order, when you want a build

1. **Determinism harness.** One body, one static collider, 10,000 quanta. The integrator is disposable. It uses the five pinned operations or a bundled libm, and the hashed state contains no NaN. The same inputs run under two JavaScript engines and a WASM build. The pass is equality with a golden hash stored beside the fixture. Two processes of one binary are not the proof. Monniaux 2008 (arXiv:cs/0701192, abstract-supported on the re-run): floating-point results move with the compiler, so the harness proves a build, flags included.
2. **Kernel fixture.** The quantum, the admit step, a body with a collider, the typed memory-write verb, and the host boundary. Types come out of what the harness had to serialize.
3. **Verb drafts.** Admitted at load by compile plus the invariant suite, and retired when play says they fail. A body draft is already in slice 2, because the collider can check it during play.

A physics library is a later slice. Cross-platform determinism is a requirement that slice has to meet. The labeled stance-pair set is a parallel track with no owner.

None of these slices has been started.
