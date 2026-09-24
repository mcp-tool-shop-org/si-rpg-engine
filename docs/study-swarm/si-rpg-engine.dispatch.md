<!-- study-swarm · si-rpg-engine phase 0 · 2026-09-24 -->
# Study-swarm dispatch: what si-rpg-engine is

> **Product being planned.** `si-rpg-engine` (si for super-intelligence) is a counterpart to `ai-rpg-engine`, not a from-scratch rewrite. The shipped engine is a deterministic tick: one action pipeline, a seeded hash as truth, presentation allowed to lie outside that hash, content re-validated before it can enter a running world, and NPC beliefs stored as records. Its own philosophy says the model does not mutate simulation truth.
>
> **What this counterpart is for.** State-of-the-art 3D, and approaches that may not be buildable yet, with the intelligence as the point of the engine. Phase 0 is a plan. Nothing here is a package, a tag, or a publish.
>
> **Five parallel research agents** (Step 2) retrieved primary pages. Findings below are the synthesizer's floor: one source per item, claims kept to pages that were opened. **Step 5 is not load-bearing until Step 4 returns.**

## Step 1 — Load-bearing questions

Each has two real designs that hinge on the answer:

- **Q1 Authority.** May a generative model write canonical state, or does a checker that is not the model admit every write?
- **Q2 Spatial law.** Is the 3D world a named scene with colliders, or a field / splat / frame generator?
- **Q3 Clock.** One discrete intent tick, a frame-based world model, or two clocks with a named owner each?
- **Q4 Memory.** Replace the belief record with a generative stream, or keep the record and admit model writes?
- **Q5 Readiness.** What is demonstrated, what is a product, and what is still a horizon?

## Step 2 — Research dispatch

Five retrieval-only agents, one question each, in parallel. Word-capped. A remembered paper that did not open was a miss. Packets were synthesized here; misses are listed under Step 3.

## Step 3 — Research grounding

1. **Autoregressive LLMs cannot by themselves plan or self-verify, and the useful coupling is an external model-based verifier in the loop.** Kambhampati et al. 2024 (arXiv:2402.01817). Implication: the model proposes actions, content, and candidate laws; a different checker admits them before the tick records anything.
2. **Hand-specified runtime rules eliminated every hazardous embodied action in their tests and enforced the listed vehicle laws, while rules written by o1 recalled 70.96% of embodied hazards and kept vehicles lawful in 5 of 8 scenarios.** Wang, Poskitt, and Sun 2025 (arXiv:2503.18666). Implication: the action language and its predicates are authored law; a model-written guard is a draft of that law, admitted the same way as any other proposal.
3. **A transformer can emit a whole Isabelle proof, repair it when given the failed attempt and the assistant's error, and Baldur together with Thor proves 65.7% of 6,336 theorems.** First, Rabe, Ringer, and Brun 2023 (arXiv:2303.04910). Implication: a rejection comes back as the checker's reason on a fresh proposal.
4. **On travel planning, Chain-of-Thought, ReAct, and Reflexion scored 0%, 0.6%, and 0% with GPT-3.5-Turbo, while an external-critic loop moved that model from 0% to 5% and multiplied the GPT-4-Turbo baseline by 4.6.** Gundawar et al. 2024 (arXiv:2405.20625). Implication: the gain is the external critic, and most plans still fail, so the tick must be able to refuse.
5. **GameNGen runs DOOM at 20 frames per second on one TPU by predicting the next frame from past frames and actions, with next-frame PSNR 29.4, and human raters do no better than chance on short clips.** Valevski, Leviathan, Arar, and Fruchter 2024 (arXiv:2408.14837). Implication: a neural frame stream is a playable picture of one existing game; the save and the rules stay in the tick.
6. **DIAMOND scores 1.46 mean human-normalized on Atari 100k for agents trained inside the diffusion world model, and a model trained on static CS:GO footage can be played as an interactive neural game engine.** Alonso et al. 2024 (arXiv:2405.12399). Implication: the demonstrated object is a visual engine trained on one game's footage; inventory and contact rules stay in the tick.
7. **Genie 3 navigates text-prompted worlds at 24 frames per second and 720p for a few minutes, with about a minute of visual memory, and lists multi-agent interaction and hour-long play as unsolved.** Parker-Holder and Fruchter 2025 (https://deepmind.google/blog/genie-3-a-new-frontier-for-world-models/). Implication: a flagship world model is a few minutes of one navigator; other agents and the save stay in the symbolic world.
8. **Clients that share inputs stay agreed only when one fixed step from the same state and inputs is identical, and audio and video are outside that state; the sim must be able to take that step without drawing it.** GGPO Developer Guide, page opened 2026-09-24 (https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md). Implication: the hashed quantum is inputs plus serializable sim; the picture is not state, and a later shared world reuses this quantum rather than the generator.
9. **Snapshot interpolation shows a delayed visual between received poses, and extrapolating rigid bodies invents contacts the samples never had, including cubes falling through the floor.** Fiedler 2014 (https://gafferongames.com/post/snapshot_interpolation/). Implication: the presentation clock may blend two committed poses; it may not invent the next collision.
10. **WorldGen turns a text prompt into a large traversable textured 3D world that can be explored or edited inside a standard game engine.** Wang et al. 2025 (arXiv:2511.16825). Implication: generated 3D enters as something an existing engine can load.
11. **Image-fit NeRFs and Gaussian splats recover the visible exterior, and this paper estimates the hidden interior from a collision video rather than from the field alone.** Kaneko 2025 (arXiv:2505.21335). Implication: a radiance field is not a collider; contact geometry is a shape the tick can query.
12. **Production physics engines do not read 3D Gaussian splats; this method translates splats, meshes, and fluids into particles, steps a solver, and maps the motion back onto the render asset.** Liu, Wu, and Han 2026 (arXiv:2606.21753). Implication: even a physics-aware splat pipeline keeps the solver on a proxy and the splat as the picture.
13. **PhysTalk animates a Gaussian scene in real time by having a language model emit code that drives physics proxies, and it describes that path as avoiding a mesh extraction.** Collorone et al. 2025 (arXiv:2512.24986). Implication: a live Gaussian demo still has a physics proxy beside the appearance; the proxy is the candidate for the tick, the splat is not the hash.
14. **A hierarchy of 3D Gaussians renders kilometer-scale static captures in real time by chunking and level-of-detail selection.** Kerbl et al. 2024 (arXiv:2406.12080). Implication: streaming detail is a render cut over a capture, not the set of entities the sim queries.
15. **An identity code on each Gaussian, trained from 2D masks, supports appearance edits such as removal, recolor, and recomposition.** Ye, Danelljan, Yu, and Ke 2023 (arXiv:2312.00732). Implication: a Gaussian group is an appearance handle bound to an entity id the scene graph already has.
16. **On real monocular footage, dynamic Gaussian methods lose a stable rank order, and their speed comes with brittle optimization.** Liang et al. 2024 (arXiv:2412.04457). Implication: an optimizer that rebuilds the scene is not the spatial law.
17. **Separating a learned global typed state from per-camera rendering let a world model advance 1,024 Snake players for 10,000 steps, where video models entangle the world with one view.** Cai et al. 2026 (arXiv:2608.06257). Implication: cameras agree by reading one authoritative state; the Snake transition in that demo is learned, so it does not replace a hand-authored action pipeline.
18. **Query features that carry identity also carry motion, and a training-free injection can hold a character across generated shots only inside that tradeoff.** Atzmon et al. 2024 (arXiv:2412.07750). Implication: cross-shot identity is a short generated demo, not a character record that survives a save.
19. **Generative agents store experience as natural language, reflect, and plan; in a town of 25, one seeded party intention became coordinated behavior over two days, and ablating observation, planning, or reflection hurt believability.** Park et al. 2023 (arXiv:2304.03442). Implication: a language memory can carry a short social arc; the sandbox's believability study is not an audit of canonical state.
20. **Long-context assistants drop about 30% accuracy when the fact has to survive a sustained interaction.** Wu et al. 2024 (arXiv:2410.10813). Implication: the transcript is not the belief record.
21. **Consolidated memories written by an LLM rise, then fall, and can land below a no-memory baseline; GPT-5.4 failed 54% of ARC-AGI items it had already solved when the consolidator rewrote ground-truth solutions, while keeping the raw episodes stayed level with the best automatic policy.** Zhang et al. 2026 (arXiv:2605.12978). Implication: raw episodes stay the evidence; consolidation is a separate action the checker can refuse.
22. **When a consolidated line still states a constraint its source has withdrawn, a two-record budget inspected that provenance about one episode in five and followed the stale line in 77.3%, 74.7%, and 74.7% of episodes.** Nakayashiki 2026 (arXiv:2608.25553). Implication: a memory write that supersedes another is checked on purpose; a general budget will not wander onto it.
23. **CoALA treats memory as modules the agent acts on, with a structured action space and a decision cycle that chooses the action.** Sumers, Yao, Narasimhan, and Griffiths 2023 (arXiv:2309.02427). Implication: a belief update is a verb in the action pipeline, not a side effect of the next line of dialogue.
24. **Assigned personas lose fidelity across dialogues longer than 100 rounds, especially when the talk is goal-directed, and answers drift toward the no-persona baseline.** Luz de Araujo et al. 2025 (arXiv:2512.12775). Implication: the NPC's standing goals live in the record; the persona prompt is a voice, not the memory.
25. **In multi-turn dialogue, models conform under sustained pressure, alignment tuning amplifies that conformity, and a third-person prompt cut it by up to 63.8% in their debate setting.** Hong et al. 2025 (arXiv:2505.23840). Implication: player disagreement is not an instruction to rewrite the NPC's stance.
26. **Minecraft societies of 10 to 1,000+ agents developed specialized roles and passed along culture inside a world and an item grammar they did not author.** Ahn et al. 2024 (arXiv:2411.00114). Implication: a many-agent society demo sits on someone else's simulator; it is a horizon study, not a world kernel.

### Retrieval misses (not used above)

- The Muse / WHAM Nature article and the Oasis project page were not opened by the synthesizer.
- The logically constrained decoding Anthology PDF was not opened.
- Narrative-to-Scene Generation was opened at the abstract; the constraint-satisfaction rate was not stated there, so it is not a finding.
- The OpenUSD physics schema table of contents lists collision shapes; that body text was not used.
- The ALE sticky-actions abstract does not state a frame-skip claim, so it is not a finding.

### Passages opened for items whose limits are outside the abstract

- GameNGen section 7 (arXiv HTML): not an exact simulation; a little over three seconds of history; repeated fire can spawn an enemy; cannot author a new game.
- DIAMOND CS:GO paragraph (arXiv HTML): drift in rare areas; forgets weapon or room when occluded; extra mid-air jumps; quantitative CS:GO scoring left to future work. The Atari 1.46 human-normalized score is the abstract result and is a different claim (agents inside the model).
- WorldGen: per-object meshes, poses, navmesh, and the "explicit geometry" collision sentence are in the paper body and figure caption; the abstract says engine-loadable traversable worlds.
- The world-model blog, the snapshot-interpolation essay, and the rollback guide are canonical pages without an arXiv or DOI record.

## Step 4 — External verification

Runner: `roleos verify-citations` → `prism verify --type citations` (provider ollama). Synthesizer is this Grok session. Verifier is prism. Receipt: `docs/study-swarm/si-rpg-engine.citation-receipt.json`.

**Pass 1** rewrote four claims that used paper-body limits (findings 3, 5, 6, 10) down to the abstract. Two checks timed out (finding 1's groundedness lens, finding 14's arXiv fetch). Zero fabricated.

**Pass 2, this file:** 23/23 arXiv findings **supported**. Prism verdict `accept`, receipt `prism-01m3a5jhfmzyfk4g3q7401982z`. roleos verdict `escalate`, advisory, `blocking: false`, because findings 7, 8, and 9 are canonical pages with no arXiv or DOI (Genie 3 blog, GGPO guide, Fiedler 2014). Those three were opened in this session. Unparsed is not fabrication.

**Body passages, opened, not in the abstract lens.** You might have expected the enemy-spawn sentence, the forgotten weapon, and the navmesh sentence to be what the abstract check certified. They are not. They were read in the HTML and are cited below only beside the abstract finding, never as the only warrant:

- GameNGen section 7: not an exact simulation; about three seconds of history; repeated fire can spawn an enemy; cannot author a new game.
- DIAMOND CS:GO paragraph: occlusion can drop the weapon or the room; extra mid-air jumps; quantitative scoring left open. The 1.46 Atari score is the abstract result.
- WorldGen body and figure caption: per-object textured meshes, rigid poses, a navmesh, and the sentence that explicit geometry is what collision and navigation use. The abstract says an engine-loadable traversable world.

## Step 5 — Architecture

Each choice traces to findings by number. URL findings 7, 8, and 9 are page-opened. Body limits are named as body.

- **C1 — The model proposes. A checker that is not the model admits, and only then does the tick record.** Autoregressive models do not verify themselves (1). Hand-written runtime rules stopped the hazardous actions in the embodied tests; rules written by a model still missed (2, recall 70.96%). A failed proof comes back as the assistant's error on a fresh proposal (3). External critics move pass rates where Chain-of-Thought, ReAct, and Reflexion stay near zero, and most plans still fail (4). A memory write is an action in a decision cycle (23).
- **C2 — The spatial law is geometry an engine can load and a solver can query. Appearance is a skin.** Text becomes a traversable world inside a game engine (10). Image-fit fields recover the visible exterior; the hidden interior is estimated from a collision, not from the field (11). A physics step runs on a particle or proxy stand-in, then the motion is mapped back onto the splats (12, 13). A Gaussian identity code is an appearance edit (15). An optimizer that rebuilds a dynamic cloud is not the law (16). Kilometer splats are a level-of-detail cut of a static capture (14). Body, beside 10: the WorldGen pages describe per-object meshes, poses, and a navmesh.
- **C3 — Two clocks. The hash is one quantum of state plus inputs. The picture may blend committed poses.** The sim must be able to take that step without drawing, and audio and video are outside the state (8, page-opened). Interpolation is between received poses; extrapolating a rigid body invents contacts, including a cube through the floor (9, page-opened). A diffusion model can be a real-time picture of DOOM or of CS:GO footage (5, 6). A flagship world model holds a few minutes for one navigator; other agents and hour-long play are still open (7, page-opened). Cameras agree by reading one typed state; the demo that shows this is learned Snake at 1,024 players, so it leaves the hand-authored action pipeline in place (17). Body, beside 5 and 6: short context, invented enemies, forgotten weapons, leaked jumps.
- **C4 — Goals, beliefs, and episodes are records. Consolidation is a verb.** A natural-language memory can carry a two-day party in a 25-agent believability study (19). A sustained transcript drops about 30% accuracy (20). Consolidation rises and then can fall below having no memory; raw episodes stay the evidence (21, 54% regression on items already solved). A withdrawn constraint is followed about three times in four when the budget does not inspect that path (22). The write is a pipeline verb (23). Standing goals live in the record; a persona prompt fades across dialogues longer than 100 rounds (24). Sustained player pressure pulls the model off its stance, and alignment can amplify that (25).
- **C5 — Horizon sockets, specified and unbuilt.** Frame generators (5, 6, 7). Gaussian skin bound to a body id (12, 13, 14, 15). Identity across a handful of generated shots (18). Agent societies inside a simulator they did not author (19, 26). Learned shared state is evidence that cameras need one state (17), and it is a Snake demo.
- **C6 — Borrow the tick. Extend the law where the findings require it.** Keep one action pipeline, a seeded hash, presentation outside the hash, and content re-validated before it can enter. Add bodies and collision shapes beside zone identity (10, 11, 12). Let the model propose into the tick, with the checker as the commit (1, 2, 4, 23). Run a presentation clock that only blends commits (8, 9). Treat memory writes as verbs (21, 23). Park hour-scale shared 3D, session-stable generated characters, live neural colliders, and multi-agent frame generators (7, 12, 18, 26).
