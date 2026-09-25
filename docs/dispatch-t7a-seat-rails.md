# Dispatch T7a — the seat's rails

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on nothing beyond `main`; runs beside T6 and F2, and touches neither the law nor the sweep. The plan row is T7 in `docs/PHASE-2.md`, which this dispatch splits into T7a, the rails, and T7b, the test instrument. The research is `docs/study-swarm/seat-instrument.dispatch.md`; numbers in parentheses are its findings.

## What it is

The proposer seat is a pinned local model that proposes into the engine, frozen since 2026-09-24. On 2026-09-25 the Director decided to thaw the seat for use as a test instrument only, and to put in place now the rails that will let the same seat take other roles later.

The rails are what every role shares, now and later. A role is a manifest, admitted like a verb, that says what the role may read, what it may propose, and which model, prompt, and schema it uses. The checker enforces the manifest, never a prompt. Every admission records where it came from. Every model call is recorded, and the record, not a rerun of the model, is the truth for replay and for CI. Proposals are asynchronous and typed. The first role, the test instrument, is declared thawed here and built in T7b. A second role, proposing for characters during play, is declared now and frozen, so its limits are written down before anyone is tempted to widen it.

## Pins

1. **A role is a manifest.** `predicates/roles/<role>.json`, listed in `predicates/roles/index.json`. A manifest holds these fields:
   - `role` and `purpose`, one sentence.
   - `status`, either `frozen` or `thawed`. A thawed role names the decision in `thawedBy` and `thawedOn`.
   - `inputs`, each `{ name, trust, source }`. `trust` is `trusted` or `untrusted`. `source` comes from a closed list: `dispatch`, `diff`, `world`, `frame`, `catalog`, `feedback`, `mind`, and `player-text`.
   - `outputs`, `{ classes, verbs, actors }`. `classes` is drawn from `intent`, `belief`, `body`, and `verb`. `verbs` is a list, or `catalog` for every admitted verb. `actors` is `world` or `own-body`.
   - `model`, `{ name, digest, quantization, options }`. The digest is the SHA-256 the server reports for the model's contents. A frozen role may leave it null. A thawed role may not (28).
   - `prompt`, `{ template, sha256 }`, a template file and its hash.
   - `schema`, the name of the schema builder the seat uses for this role. The concrete schema of each call is hashed in that call's record, because the seat builds it from the frame.
   - `budget`, `{ callsPerSession, outputTokens, secondsPerCall, freeSpanChars }`.
   - `ruleOfTwo`, `{ untrustedInput, hiddenState, outwardAction }`.

   The loader refuses each of the following, and each refusal has a test:
   - an unknown field;
   - a source outside the list;
   - a template whose hash does not match;
   - a thawed role without `thawedBy`, `thawedOn`, and a model digest;
   - a role whose `ruleOfTwo` holds all three (23).

   A narrowing or a freeze is an edit that takes effect when merged. A widening is a new input source, class, verb, or actor range, or a looser budget. It is reviewed like the law, and the pull request names the Director's approval and the adversarial run it rests on (17). (15, 17, 23)

2. **Two roles, declared now.**
   - **`test-instrument` is thawed.** It is marked `thawedBy: "the Director"` and `thawedOn: "2026-09-25"`.
     - Its inputs are the dispatch, the world, the catalog, and the engine's feedback, all trusted, and the diff, which is untrusted because a builder wrote it.
     - It proposes intents only, with verbs from the catalog and actors from the world.
     - Its `ruleOfTwo` is `{ untrustedInput: true, hiddenState: false, outwardAction: false }`: it acts only in a scratch world, and nothing it does leaves the run.
     - It pins today's seat model, `qwen2.5:7b`, by digest, until T7b measures another.
   - **`npc-mind` is frozen.**
     - Its inputs are the character's mind (goals and typed beliefs) and the frame within the character's sight, both trusted, and player text, which is untrusted.
     - It proposes intents for its own body and beliefs for its own mind.
     - Its `ruleOfTwo` is `{ untrustedInput: true, hiddenState: false, outwardAction: true }`. A test shows that giving it hidden state is refused.
     - Its template states the limits the research found. Text a player types is hearsay from a named source, never a fact (33, 34). Anything with consequences, such as quest state, prices, and items, is decided by predicates over engine state and only named by the model (34, 37). Each prompt is built fresh from the character's typed state, never from a growing transcript (40).
     - Thawing it needs the Director, an adversarial run on its declared inputs, and an evaluation with players (35, 36).

3. **The checker enforces the manifest.** `submit(proposal, provenance)` takes an optional provenance. When one is present, the tick refuses, with a reason, in four cases:
   - a role the catalog does not hold;
   - a frozen role;
   - a class, verb, or actor outside the role's outputs;
   - a manifest hash that does not match the catalog's.

   A proposal without provenance is the host's, as today. The role gate is a hand-written predicate beside the verb predicates. No model drafts it, and no prompt enforces a freeze (18, 21, 22). The seat is the only code that calls a model, and it always attaches provenance; a test shows it does. (15, 18, 21, 22)

4. **Provenance in the log.** `LogEntry` gains an optional `provenance`: `{ role, manifest, model, prompt, schema, record, inputs }`.
   - `manifest`, `prompt`, and `schema` are SHA-256 hashes, and `model` is the model digest.
   - `record` is the key of the call that produced the proposal (pin 5).
   - `inputs` lists each input's name and trust label, so a trust label travels with what it produced (19).

   A log file with any such entry carries, at its top level, the manifests its entries cite, keyed by hash. Replay re-applies the gate against the manifest as it was when the log was recorded, never against today's catalog, and never calls a model. A test records a log under the thawed role, freezes the role in the catalog, and replays the log to the same hashes. Logs without provenance keep their current form byte for byte, and no frame hash changes. (16, 19, 20)

5. **Every model call is recorded, and the record is the truth.** `packages/propose/record.js` defines one record per call. A record holds:
   - the rendered messages and every sampling option: seed, temperature, top_k, top_p, num_ctx, num_predict, stop, and the format schema;
   - the schema's SHA-256;
   - the model digest and quantization, read from the server at call time;
   - the Ollama version and the server settings the client can read;
   - the GPU's name;
   - the raw output bytes and the timing.

   Its key is the SHA-256 of the canonical JSON of everything except the output and the timing, so a changed model can never match an old record (29, 30). The seat pins the model by digest, fixes the seed, sets temperature 0, and asks for one parallel slot. These settings are recorded, not relied on, because none of them makes output repeat (24, 25, 26, 27, 28). A session's records are stored in a directory the session names. (24 to 30)

6. **CI checks the records without a GPU.** A test over the committed recorded sessions does five things:
   - recomputes every key;
   - checks each record's digest against its role's pin;
   - validates every output with the seat's own parser, whatever the decoder promised (31);
   - replays the session's admitted log to the same step hashes;
   - fails on a missing record instead of calling a model.

   A record with one byte of output changed, or with a different digest, fails the test. The committed sessions are small, a few calls of the test-instrument role in the fixture world, made by the builder on this machine's GPU with the pinned model. A script reissues a session's calls and reports how far the new outputs drift from the recorded ones. It runs only by hand on a GPU and never blocks. (24 to 31)

7. **Asynchronous and stale-safe.** A proposal cites the frame it was built from. The tick admits it against the newest frame or refuses it as stale, and it never waits for a model.
   - One test builds a proposal at one frame, advances the tick, and shows the refusal.
   - Another shows that the tick keeps advancing while a slow call is outstanding.

   (32, 39)

8. **Typed output, with a bounded free span.** A role's output is one JSON object: an optional `notes` string, bounded by `budget.freeSpanChars`, and the proposal. Only the proposal is parsed and submitted. The notes are recorded and never parsed for an action. Tests show that notes over the bound are refused, and that a proposal written inside the notes is not acted on. (16, 31, 38)

9. **The freeze in two places.** `propose --role <name>` refuses a frozen role with exit 2 before any model call. The tick's gate refuses a frozen role's proposal. The manifests replace the old `--unfreeze` flag and the freeze string in `model.json`. `propose` without `--role` lists the roles and their status. (22)

10. **Every rail goes red.** Each of these has a test that fails without the rail it checks: every loader refusal, every gate refusal, replay after a freeze, a tampered record, a missing record, a stale proposal, and the bound on notes.

11. **No model in CI.** Neither CI nor `npm test` calls a model. Nothing in T7a changes the physics, the product golden, or the hash of an existing log.

12. **Public surfaces are the coordinator's.** The builder does not edit `README.md`, its translations, anything under `site/`, or `CHANGELOG.md`.

13. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` after the new files are staged.

## Acceptance

- Both manifests load. `npc-mind` is frozen, and every loader refusal has a test.
- The gate refuses a proposal outside its role's manifest and a frozen role's proposal. A host's proposal is admitted exactly as before.
- The committed recorded sessions verify in CI with no GPU. A tampered record and a missing record each fail.
- A log recorded under the thawed role replays to the same hashes after the role is frozen.
- The typecheck is clean, and tests are at or above the count on `main`. The goldens and the Linux digest are unchanged, and the Atlas check is green.

## Not in T7a

- No test instrument; that is T7b, after T6 and this slice.
- No model call in CI.
- No thaw of `npc-mind`.
- No new verb.
- No path for player text: the role declares that input and nothing wires it.
