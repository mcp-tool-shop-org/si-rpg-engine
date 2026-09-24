# Consult brief — the host

**How to use.** Paste everything below the rule to Claude and, separately, to Gemini. Same text to both. This is a cross-family consult, not a build and not a request for another literature survey. Agreement is not the goal. A reply that blesses the boundary and adds no scar is a failed consult.

**Date:** 2026-09-24

---

## Role

You are a skeptical engine architect reviewing the host slice before any window is opened. The slice is a program that receives committed frames and interpolates poses so a person can see the world. Your job is to find where that program becomes a second simulator, or where it still leaves nothing a person can look at.

Where you make an empirical claim, give a URL you actually opened. Where you are speculating, say so in the same sentence. Do not invent papers, benchmarks, or numbers.

Do not write code. Do not unfreeze the proposer seat. Do not choose the physics library. That is a separate consult. A renderer or a client engine is allowed only as the answer to a question below, and only with the line that keeps its collider out of the hash.

## What is being decided

`si-rpg-engine` has finished the three slices phase 0 named. The public repo is `mcp-tool-shop-org/si-rpg-engine`, default branch `main`, merge `71e4487` (pull request 7). The plan of record is `docs/PHASE-0.md`, section "Where the build stands."

The host slice, as the plan states it: the host receives committed frames and returns intents. It may blend two committed poses. It may not invent the next contact, write geometry, or keep a second collider. The studio's measure for this slice is a scene a person has looked at. Nothing in the repo can be looked at today. `play` prints frames as text.

The requirement under attack is this:

Define the boundary where a host receives committed frames and interpolates poses for rendering, without ever running a second collider or mutating the hash.

## Ground truth you should treat as given

Measured on `main` at `71e4487`.

**The only host type.** `packages/frame/types.d.ts` defines `Host` as `draw(frame: Frame): void`. `Frame` is `tick`, `hash`, and `bodies`. Each body is `id, x, y, vx, vy, hw, hh`. The frame is frozen. The test `the host boundary` in `packages/tick/tick.test.js` asserts the keys are exactly `bodies`, `hash`, `tick`, that the frame and the body array are frozen, that writing `bodies[0].x` throws, and that the tick object exposes only `attach`, `frame`, `log`, and `submit`. There is no `previous` field. There is no mesh, camera, window, or pixel.

**When draw runs.** `packages/tick/tick.js` `quantum` steps the world, increments the tick, hashes, commits one frame, then calls `draw` on every attached host before returning. An admitted `move` calls `quantum` once per quantum of the action, synchronously. `DT` is `1/64`. A host that does not return holds the law.

**What a person can submit.** `submit` is on the tick, not on the host. The host interface has no method for an intent. The proposer seat is the only caller that asks a model, and it is frozen until the world has more than one verb, more than one body, and something worth wanting. A person has no door.

**What the picture is allowed to be.** Phase 0 says the host blends two committed poses and does not invent the next contact. The opened page behind that sentence is Fiedler 2014 on snapshot interpolation: blend delayed poses, because extrapolating rigid bodies invents contacts the samples never contained. That page has no arXiv id. Treat it as our reading. The tick already commits every quantum, so the two poses are neighboring quanta, not a turn and a turn.

**What is not in the tree.** No renderer, no canvas, no Godot project, no presentation clock, no audio. The sibling engine's visual client is a separate repo and draws a different sim. This repo does not import it. Generated frames and Gaussian skins stay sockets. They are not this slice.

**The physics consult is not yours.** The integrator play runs is the box step in `packages/tick/world.js`. The golden hash is a different, older stub. Do not propose a physics library here. Assume the frames you receive are already committed and hashed.

## Constraints

- One collider, and it lives in the tick. A ray the host casts to decide a contact is a second world.
- Interpolation samples, dropped frames, audio, and juice are presentation. They are not hashed.
- The seat stays frozen. A person looking at the world is not a model run.
- "A text log is enough to look at" is not an allowed answer. The slice exists because nothing can be seen.
- Do not rewrite `docs/PHASE-0.md` in your reply. Name the sentence you would add, under the return shape.

## Questions — only what the tree has not settled

**Q1 — Where do the two poses live?**
`draw` is handed one frame. A blend needs two. The host can remember the previous frame it was shown, or `Frame` can grow a previous pose. Remembered state dies when the process dies and is invisible to replay. A previous pose on the frame is one field away from being mixed into the hash. Say which one is the slice, and the exact fields the blend may read. Say what happens on the first frame, when there is no pair.

**Q2 — May `draw` block the quantum?**
Today `draw` runs inside `quantum`, on the same thread, and the next step waits for it. A window that waits on a GPU submit becomes part of the law's timing. Say whether the host slice keeps that call synchronous, copies the frame out and returns immediately, or is a second process that only ever sees frames. Say what is lost if a frame is dropped, and why that loss must not change the next hash.

**Q3 — What is the first picture?**
The hashed world is 2D boxes. There is no mesh. Say whether the first host draws those boxes in a window this repo owns, or speaks frames to a client in another repo. If you name a client engine, say the one rule that stops it simulating. A screenshot of the kernel fixture's walker, floor, and two walls is the minimum a person can look at. Say whether that minimum is the slice, or whether you refuse to call it a scene.

**Q4 — Where does a person's intent enter?**
The host type cannot submit. The tick can. A playable picture needs a hand, a key, or a click to become an `Intent` with the frame hash the person was shown. Say where that adapter lives so a stale picture cannot admit against a newer hash, and so the adapter cannot write `x` or `vx`. The frozen seat is not the adapter.

**Q5 — What falsifies the slice?**
Name the single assumption above that, if wrong, makes "a host that blends committed frames" the wrong next thing to write. Say what you would write instead, in one paragraph. A redesign of the whole engine is not an answer.

## Return shape

Use this skeleton so two replies can be diffed. About 900 words. Specificity over a new architecture.

```
VERDICT: hold | revise | reject
SENTENCE: one sentence

Q1
ANSWER:
CHANGE IN THE SLICE: the requirement you would rewrite, or "none"
CONFIDENCE: high | medium | low
BASIS: opened URL, or "speculation"

Q2
(same four fields)

Q3
(same four fields)

Q4
(same four fields)

Q5
(same four fields)

SCAR: the one place you will not agree, even if the verdict is hold
DID NOT CHECK: what you left unread
```
