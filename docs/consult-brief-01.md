# Consult brief 01 — attack the si-rpg-engine phase 0 lock

**How to use.** Paste everything below the rule to Claude and, separately, to Gemini. Same text to both. This is a cross-family consult, not a build and not a request for another literature survey. The plan was written by a different model family after a study-swarm whose arXiv claims were checked by an external citation gate. Agreement is not the goal. A reply that blesses the plan and adds no scar is a failed consult.

**Date:** 2026-09-24

---

## Role

You are a skeptical engine architect reviewing a phase-0 plan before any types are written. Your job is to find where the first fixture will fail, or where the plan has shrunk a super-intelligence engine back into the deterministic engine it is borrowing from. If the premise is wrong, say that first. Politeness is not useful. Specificity is.

Where you make an empirical claim, give a URL you actually opened. Where you are speculating, say so in the same sentence. Do not invent papers, benchmarks, or numbers. A fabrication costs more than an "I don't know."

Do not write code. Do not design a second engine. Do not pick a physics library, a renderer, a cloud vendor, or a multiplayer protocol.

## What is being planned

`si-rpg-engine` (si for super-intelligence) is a counterpart to an already-shipped engine, `ai-rpg-engine`. It is supposed to borrow what still holds and aim at state-of-the-art 3D, including approaches that may not be buildable yet. Phase 0 is a plan. There is no package, no repository remote, and no runtime.

The locked shape:

1. A seeded tick is the law. One action pipeline: declare, validate, resolve, record, emit. The hash is objective truth. Replay restores that state.
2. The model may propose an intent, a line, a memory write, a content draft, or a mesh draft. A checker that is not the model admits the proposal. Only an admission is recorded. Rejection returns the checker's reason on a fresh proposal.
3. The 3D world the tick can query is geometry a game engine can load: named bodies, poses, collision shapes. Zones remain a gameplay partition above those bodies. One physics step lives in the tick. The host does not keep a second collider.
4. Two clocks. The hash advances one quantum from serializable state plus inputs, and that step can run without drawing. The host may blend two committed poses. It may not invent the next contact.
5. Beliefs, goals, and raw episodes are records. Consolidation of memory is itself a proposal. A persona prompt is a voice. Standing goals live in the record.
6. World-model frames, Gaussian skins, and generated character identity are named sockets. They are unbuilt. They are not the world.

Proposed next slice, not started: a TypeScript kernel contract and one fixture (the quantum, the admit step, one body with a collider, one memory-write verb the checker can refuse, a host boundary that draws without deciding). A physics library comes after the contract says what the quantum hashes.

## Ground truth you should treat as given

**The sibling engine, as it actually ships.** Deterministic turn-based RPG simulation. Seeded RNG. Occupancy is a zone id. There is no cell, path, or pixel in world state. Presentation (narration, a dimetric visual client, audio) may lie and is outside the hash. The model scaffolds and critiques; it does not mutate simulation truth. Anything it authors is validated again at load before it can enter a running world. NPCs have belief records (subject, key, value, confidence, source), memories with decay, and cross-session relationship axes. Replay restores a save. It does not re-simulate the history. Multiplayer is out of scope. The visual client must not run its own physics, because that becomes a second world.

**What the study-swarm's citation gate supported** (23 arXiv findings, external gate, zero fabricated). These are the warrants for the lock. Do not re-litigate them unless you opened the page and the claim below is wrong.

- Autoregressive models do not plan or self-verify. The useful coupling is an external verifier (Kambhampati et al. 2024, arXiv:2402.01817).
- Hand-specified runtime rules eliminated the hazardous embodied actions in the tests. Rules written by a model recalled 70.96% of those embodied hazards and kept vehicles lawful in 5 of 8 scenarios (Wang, Poskitt, and Sun 2025, arXiv:2503.18666).
- A repair loop that sees the checker's error works, and most plans still fail even with an external critic. On one travel-planning benchmark, Chain-of-Thought, ReAct, and Reflexion scored 0%, 0.6%, and 0% with GPT-3.5-Turbo; an external-critic loop moved that model from 0% to 5% and multiplied a GPT-4-Turbo baseline by 4.6 (Gundawar et al. 2024, arXiv:2405.20625; First et al. 2023, arXiv:2303.04910, 65.7% of 6,336 Isabelle theorems with a checker in the loop).
- A diffusion model can be a real-time picture of an existing game (GameNGen, DOOM, 20 fps, next-frame PSNR 29.4, arXiv:2408.14837; DIAMOND, Atari human-normalized 1.46 inside the model, plus a playable CS:GO footage model, arXiv:2405.12399).
- Text can become a traversable world a standard game engine can load (WorldGen, arXiv:2511.16825). Image-fit NeRFs and Gaussian splats recover the visible exterior, not the hidden volume (Kaneko 2025, arXiv:2505.21335). Production physics does not read splats; the methods that move them translate them into particles or proxies first (Liu, Wu, and Han 2026, arXiv:2606.21753; Collorone et al. 2025, arXiv:2512.24986).
- Cameras agree when a typed state is authoritative and the view is derived. The demonstration is learned Snake, 1,024 players, 10,000 steps (Cai et al. 2026, arXiv:2608.06257). That transition is learned. It is not a reason to delete a hand-authored action pipeline.
- A natural-language memory can carry a two-day social arc among 25 agents in a believability study (Park et al. 2023, arXiv:2304.03442). Long-context assistants drop about 30% accuracy across a sustained interaction (Wu et al. 2024, arXiv:2410.10813). LLM consolidation rises, then can fall below a no-memory baseline; one model failed 54% of items it had already solved when consolidation rewrote ground-truth solutions (Zhang et al. 2026, arXiv:2605.12978). When a consolidated line still states a withdrawn constraint, a small verification budget followed the stale line in about three quarters of episodes (Nakayashiki 2026, arXiv:2608.25553).
- Persona fidelity degrades across dialogues longer than 100 rounds (Luz de Araujo et al. 2025, arXiv:2512.12775). Multi-turn pressure produces conformity, and alignment tuning can amplify it (Hong et al. 2025, arXiv:2505.23840).
- Cross-shot character identity in generated video trades off against motion and is not a session-long record (Atzmon et al. 2024, arXiv:2412.07750). Many-agent "civilization" demos run inside a simulator the agents did not author (Ahn et al. 2024, arXiv:2411.00114).

**Opened pages the arXiv gate cannot certify** (no DOI; treat as our reading, attack them if you open the page and we misread):

- Genie 3 blog (DeepMind, 2025): 24 fps, 720p, a few minutes, about one minute of visual memory. Multi-agent interaction and hour-long play are listed as unsolved.
- GGPO developer guide: clients that share inputs stay agreed only if one step from the same state and inputs is identical; audio and video are not state; the sim must be able to step a frame without drawing it.
- Fiedler 2014, snapshot interpolation: blend delayed poses; extrapolating rigid bodies invents contacts the samples never contained.

**Body sentences the abstract lens did not certify.** Do not promote these to proof. They were read in the HTML and they are not the sole warrant for any lock above.

- GameNGen section 7: not an exact simulation; about three seconds of history; repeated fire can spawn an enemy.
- DIAMOND's CS:GO paragraph: occlusion can drop the weapon or the room; extra mid-air jumps.
- WorldGen body: per-object meshes, rigid poses, a navmesh, and a sentence that explicit geometry is what collision uses.

## Constraints

- Phase 0 is the artifact under attack. Revise a sentence in it, or reject it. Do not replace it with a new product.
- The sibling engine is borrowed from, not modified by this consult.
- "Not buildable this year" is an allowed answer. Pretending a world model is a save file is not.
- Same-family judgment is a known failure mode. If you recommend a model as the checker, say how it is a different check than the proposer, not a second copy of the proposer.
- No multiplayer design. The hash is what would make a shared world possible later. That is not this consult.

## Questions — only what this plan has not settled

**Q1 — Did the sockets shrink the product?**
The plan parks real-time world models, live neural colliders, generated identity, and agent societies, and calls them sockets. That may be discipline. It may also be the deterministic engine with a 3D noun and a futuristic label. Is the socket design a real interface, or a way to say no? If it is real, name the one interface that must be written into the first fixture so a frame generator can attach later without ever becoming state. If it is a refusal, say which parked capability has to be in the first fixture or the counterpart is not worth starting.

**Q2 — What is the checker, per kind of proposal?**
The plan says the checker is not the model. It does not say what the checker is. For each of these four, pick one and defend it: a hand-authored predicate, a second model from a different family, or "do not admit this class yet."

- a legal intent (the verb exists, the body can reach the target, the rules allow it)
- a memory write that supersedes an older belief
- a spoken line, which must not quietly rewrite the NPC's stance
- a mesh draft that claims to be traversable

Say which of the four, if checked by another model, is same-family theater even across vendors.

**Q3 — What does the quantum actually hash?**
Physics lives in the tick. The host only blends committed poses. The sibling engine's meaningful step is a turn, not a frame. A body with a collider wants smaller steps, or the blend becomes a lie the player can walk through. At the end of one player action, what is inside the hash: only the settled pose and the discrete outcome, or every physics substep? What breaks in the first fixture if we hash only the settle? What breaks if we hash the substeps?

**Q4 — Which social records are law?**
The sibling already stores beliefs and relationship axes inside the sim, and keeps audio outside the hash. This plan adds raw episodes as evidence and makes consolidation a verb. Which of these four are inside the hash, and which are presentation or a log the hash does not cover: belief records, relationship axes, the raw episode log, consolidated reflections? If the episode log is inside the hash, do we now have a second sim that cannot be replayed from the seed?

**Q5 — What interchange is canonical on day one?**
The first fixture will otherwise invent a private body record, and glTF or OpenUSD will arrive later as a translator. Is that translator a lie-shaped boundary (two geometries, one of them unhashed)? Name the one format the contract should speak, or defend a private record. Say which field is canonical when the render mesh and the collider disagree: the render mesh, the collision shape, or the pose.

**Q6 — What falsifies the next slice?**
Name the single assumption above that, if wrong, makes "TypeScript kernel contract and one fixture" the wrong next thing to write. Say what you would write instead, in one paragraph. A redesign of the whole engine is not an answer.

## Return shape

Use this skeleton so two replies can be diffed. About 900 words. Specificity over a new architecture.

```
VERDICT: hold | revise | reject
SENTENCE: one sentence

Q1
ANSWER:
CHANGE IN PHASE 0: the sentence you would rewrite, or "none"
CONFIDENCE: high | medium | low
BASIS: opened URL, or "speculation"

Q2
(same four fields, and a line per proposal class)

Q3
(same four fields)

Q4
(same four fields, and a line: in the hash / out of the hash, for each of the four records)

Q5
(same four fields)

Q6
(same four fields)

SCAR: the one place you will not agree, even if the verdict is hold
DID NOT CHECK: what you left unread
```
