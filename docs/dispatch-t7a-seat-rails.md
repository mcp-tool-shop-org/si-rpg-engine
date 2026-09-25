# Dispatch T7a — the seat's rails

2026-09-25. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on nothing beyond `main`; runs beside T6 and F2, and touches neither the law nor the sweep. The plan row is T7 in `docs/PHASE-2.md`, which this dispatch splits into T7a, the rails, and T7b, the test instrument. The research is `docs/study-swarm/seat-instrument.dispatch.md`; numbers in parentheses are its findings.

**Revised after an external design review.** Four model families reviewed the first version on #72 and blocked it on the same points, each confirmed against the design. A model's proposal is slow, so an exact-frame freshness rule would have refused all of them. Trust labels lived only in the log, so a belief formed from player text would be read back as trusted. The Rule of Two rested on flags the author declared. No one enforced the budgets. Nothing bound a recorded output to the proposal in the log. And "own body" could not be checked with two characters. This version answers each of these in its pins. Round 2 found five more points, answered the same way: a scratch world defined strictly, trust labels derived from the manifest and never raised by passing content through a role, no class declared without rails behind it, a thaw counted as a widening, and records bound to the manifest they were made under.

## What it is

The proposer seat is a pinned local model that proposes into the engine, frozen since 2026-09-24. On 2026-09-25 the Director decided to thaw the seat for use as a test instrument only, and to put in place now the rails that will let the same seat take other roles later.

The rails are what every role shares, now and later:
- A role is a manifest, admitted like a verb. It says what the role may read, what it may propose, where its proposals act, and which model, prompt, and schema it uses.
- The checker enforces the manifest, never a prompt.
- Every admission records where it came from, and a belief keeps the trust of what formed it.
- Every model call is recorded, and the record, not a rerun of the model, is the truth for replay and for CI.
- Proposals arrive late and are checked against the world as it is when they arrive.

The first role, the test instrument, is declared thawed here and built in T7b. A second role, proposing for characters during play, is declared now and frozen, so its limits are enforced before anyone is tempted to widen it.

## Pins

1. **A role is a manifest.** `predicates/roles/<role>.json`, listed in `predicates/roles/index.json`. A manifest holds these fields:
   - `role`, and `purpose` in one sentence.
   - `status`, either `frozen` or `thawed`. A thawed role names the decision in `thawedBy` and `thawedOn` and pins a model by digest (28).
   - `world`, either `scratch` or `live`: where the role's proposals act. A scratch world is built only from the repository's own files (fixtures, test worlds, and the product scene), never from a live session, a player's save, or anything a player typed. The loader refuses a scratch role with a `player-text` or `other-minds` source.
   - `inputs`, each `{ name, source }`. The source comes from a closed list in code. Each source carries a trust and a privacy class that the manifest cannot set:
     - `dispatch`, `access` (the engine's map of which admitted verbs reach each changed function, for T7b), `catalog`, and `feedback` (the engine's own results): trusted and public.
     - `frame-in-sight`: trusted and public.
     - `diff` and `player-text`: untrusted and public.
     - `mind`: the role instance's own mind. Its beliefs carry their own trust (pin 5), so reading a mind counts as reading untrusted input.
     - `world` (the whole world, including what no character can see) and `other-minds`: trusted and private.
   - `outputs`, `{ classes, verbs, actors }`:
     - `classes` is drawn from `intent` and `belief`, the two classes these rails check. The engine's body and verb drafts stay on their own reviewed path, `load admit`, and a manifest that declares them is refused until a slice gives them rails. No class writes quest state, prices, items, or any other consequence; those are the engine's to compute (34, 37).
     - `verbs` is a list, or `catalog` for every admitted verb.
     - `actors` is `world` or `own-body`.
   - `model`, `{ name, digest, quantization, options }`. A frozen role may leave it null.
   - `prompt`, `{ template, sha256 }`: a template file and its hash.
   - `schema`: the name of the schema builder the seat uses. The concrete schema of each call is hashed in that call's record.
   - `budget`, `{ callsPerSession, outputTokens, secondsPerCall, freeSpanChars, maxProposalsPerWindow, windowQuanta, maxAgeQuanta }`, each enforced as pin 10 names.

   The loader derives the Rule of Two's three properties from the manifest; the manifest does not declare them (23):
   - A, untrusted input: any untrusted input, or `mind`.
   - B, private data: a private input in a `live` world. In a scratch world nothing is sensitive, as in Meta's test-environment case.
   - C, changing state: always true for a role that proposes.

   The loader refuses each of the following, and each refusal has a test:
   - an unknown field, or a source outside the list;
   - a class other than `intent` and `belief`;
   - a scratch role with a `player-text` or `other-minds` source;
   - a template whose hash does not match;
   - a thawed role without `thawedBy`, `thawedOn`, and a model digest;
   - a role that holds A, B, and C together.

   Changes fall into three kinds:
   - **A narrowing or a freeze** takes effect when merged.
   - **A widening** is a thaw, a new source, class, verb, or actor range, a `live` world, or a looser budget. It is reviewed like the law, and its pull request names the Director's approval and the adversarial run it rests on (17).
   - **A new model, prompt, or schema** changes behaviour within the same capability. It is reviewed like the law, and the role's evaluation runs again, without needing the Director.

   (15, 17, 23)

2. **Two roles, declared now.**
   - **`test-instrument` is thawed.** It is marked `thawedBy: "the Director"` and `thawedOn: "2026-09-25"`.
     - Its world is `scratch`.
     - Its inputs are `dispatch`, `diff`, `access`, `catalog`, `world`, and `feedback`.
     - It proposes intents only, with verbs from the catalog and actors from the world.
     - Its derived properties are A and C, not B, so it loads.
     - It pins `qwen2.5:7b`, Q4_K_M, digest `845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`, as Ollama 0.34.0 on this machine reports it, until T7b measures another model.
   - **`npc-mind` is frozen.**
     - Its world is `live`.
     - Its inputs are `mind`, `frame-in-sight`, and `player-text`.
     - It proposes intents for its own body and beliefs for its own mind.
     - Its derived properties are A and C, not B, so it loads. A test shows that adding `world` or `other-minds` makes it A, B, and C, and the loader refuses it.
     - Its limits are enforced by code, not only written in its template:
       - A belief it forms from player text is labelled hearsay by the gate (pin 5).
       - No class it can propose writes a consequence (pin 1).
       - Its prompt is built from the instance's typed state alone, never from a transcript. A test shows the same state gives the same prompt bytes (40).
     - Thawing it needs the Director, an adversarial run on its declared inputs, and an evaluation with players (35, 36).

3. **The checker enforces the manifest.** `submit(proposal, provenance)` takes an optional provenance. When one is present, the tick refuses, with a reason, in each of these cases:
   - a role the catalog does not hold, a frozen role, or a manifest hash that does not match the catalog's;
   - a class, verb, or actor outside the role's outputs;
   - for an `own-body` role, an actor that is not the body the instance speaks for;
   - a proposal outside its freshness window (pin 8);
   - an instance over its admission budget (pin 10).

   A proposal without provenance is the host's, and it is admitted exactly as today. The role gate is a hand-written predicate beside the verb predicates. No model drafts it, and no prompt enforces a freeze (18, 21, 22). The seat is the only code that calls a model, and it always attaches provenance; a test shows it does. (15, 18, 20, 21, 22)

4. **Provenance in the log.** `LogEntry` gains an optional `provenance`, `{ role, instance, manifest, model, prompt, schema, record, output, builtAt, inputs }`:
   - `instance` names the body the role instance speaks for, or the session for a role acting across a world.
   - `manifest`, `prompt`, `schema`, and `output` are SHA-256 hashes, and `model` is the model digest.
   - `record` is the key of the call that produced the proposal (pin 6).
   - `builtAt` is the tick and hash of the frame the proposal was built from.
   - `inputs` lists each input's source and trust, so trust travels with what it produced (19, 20).

   A log file with any such entry carries, at its top level, the manifests its entries cite, keyed by hash. Replay re-applies the gate against the manifest as it was when the log was recorded, never against today's catalog, and never calls a model. A test records a log under the thawed role, freezes the role in the catalog, and replays the log to the same hashes. Logs without provenance keep their current form byte for byte, and no frame hash changes. (16, 19, 20)

5. **A belief keeps the trust of what formed it.** An admitted belief records a trust label. From most trusted to least:
   - `authored`, for the world file;
   - `observed`, for the tick's own sight;
   - `role`, from a role whose sources are all trusted;
   - `untrusted`, from a role with any untrusted source;
   - `hearsay`, from a role that reads player text, naming the source.

   The gate derives the label from the role's manifest, never from what the caller says it read. A role that reads `mind` or `other-minds` produces beliefs no more trusted than the least trusted belief in those minds at `builtAt`. That is the join of labels finding 19 rests on, so trust cannot be raised by passing content through a role. The model cannot set a label: the belief schema has no such field, and a proposal carrying one is refused as an unknown field. The label is fixed at admission and travels with the belief in the mind. It enters the log, and replay rebuilds it.

   Tests use test-only roles:
   - a belief formed from player text is read back as hearsay by a later call;
   - a role with only trusted sources that reads a mind holding hearsay produces a hearsay belief;
   - the mind's accessor returns every belief with its label.

   No predicate acts on a belief's content today. The first slice that adds one makes it read the label, and tests that a hearsay belief alone cannot satisfy a goal or cause an effect. Belief contents are not in the frame hash today, and neither is the label, so no golden moves. (16, 19, 33, 34)

6. **Every model call is recorded, and the record is the truth.** `packages/propose/record.js` defines one record per call. A record holds:
   - the rendered messages;
   - every sampling option: seed, temperature, top_k, top_p, num_ctx, num_predict, stop, and the format schema;
   - the schema's SHA-256;
   - the model digest and quantization read from the server at call time;
   - the Ollama version and the server settings the client can read, including the parallel setting;
   - the GPU's name and count;
   - the raw output bytes, the output's SHA-256, and the timing.

   Its key is the SHA-256 of the canonical JSON of everything except the output, its hash, and the timing, so a changed model can never match an old record (29, 30). The key identifies the request and everything the client can observe of the model and the server. It does not promise that the same key gives the same output: batching on the server is invisible to the client and changes outputs (24, 26). So CI never regenerates an output; it replays records. Each record also carries the hash of the manifest it was made under, and the session stores those manifests beside its records, as a log carries the manifests it cites. The seat pins the model by digest, fixes the seed, sets temperature 0, and asks for one parallel slot. These settings are recorded, not relied on (24 to 28). A session's records are stored in a directory the session names.

7. **CI checks the records without a GPU.** A test over the committed recorded sessions checks seven things:
   - It recomputes every key.
   - It checks each record's digest against the pin in the manifest the record cites, so a later re-pin does not break an old session.
   - It checks each record's output against the output hash in the record and in the log entry that cites it.
   - It parses each output again with the seat's own parser, which does not trust the decoder's constraint, and requires the result to equal the proposal the log admitted. That binds the output to the log (31).
   - It checks each record against its role's budgets (pin 10).
   - It replays the session's admitted log to the same step hashes.
   - It fails on a missing record instead of calling a model.

   Each of these goes red in a test with a planted record: one byte of output changed; an output changed with its hash updated, so the parse no longer matches the log; a different digest; a budget exceeded; a record removed. The committed sessions are small, a few calls of the test-instrument role in the fixture world, made by the builder on this machine's GPU with the pinned model. A script reissues a session's calls and reports how far the new outputs drift from the recorded ones. It runs only by hand on a GPU and never blocks.

8. **Proposals arrive late and are checked against the world as it is.** A role's proposal cites `builtAt`, a committed frame. The tick keeps the hashes of its last frames. The gate admits the proposal at the current tick only when both hold:
   - `builtAt` is a frame the tick committed within the role's `maxAgeQuanta`;
   - every predicate passes on the current state, re-checked there, not on the state the proposal was built from.

   Otherwise it refuses the proposal as stale or as no longer valid. The host's rule, an intent citing the newest frame, is unchanged for proposals without provenance. The admission tick and `builtAt` are in the log, so replay re-checks the same frames and stays exact. The tick never waits for a model. Tests show four things:
   - admission several quanta after `builtAt`, while the proposal is still valid;
   - refusal past `maxAgeQuanta`;
   - refusal when the world has changed so the proposal no longer passes;
   - the tick advancing while a slow call is outstanding.

   (32, 39)

9. **Typed output, with a bounded free span.** A role's output is one JSON object: an optional `notes` string and the proposal. Only the proposal is parsed and submitted; the notes are recorded and never parsed for an action (38). The gate never sees the notes. So the bound `freeSpanChars` is enforced where the notes exist, by the seat's parser, and checked independently by CI's record test. Tests show that notes over the bound are refused at parse and flagged by the record test, and that a proposal written inside the notes is not acted on. (16, 31, 38)

10. **Budgets, each with its enforcer.**
    - **The seat enforces the call budgets**: `callsPerSession`, `outputTokens` as the call's `num_predict`, and `secondsPerCall` as its timeout. It records them, and CI's record test checks every recorded call against them (pin 7).
    - **The gate enforces the admission budgets**: `maxProposalsPerWindow` in `windowQuanta` per instance, and `maxAgeQuanta` (pin 8).

    Each has a test that goes red when exceeded. (17, 18)

11. **The freeze in two places.** `propose --role <name>` refuses a frozen role with exit 2 before any model call, and the tick's gate refuses a frozen role's proposal. Each has its own test. The manifests replace the old `--unfreeze` flag and the freeze string in `model.json`. `propose` without `--role` lists the roles, their status, and their derived properties. (22)

12. **Every rail goes red.** Each loader refusal, each gate refusal, each budget, the freshness window, the trust label, replay after a freeze, and each planted-record failure has a test that fails without the rail it checks.

13. **No model in CI.** Neither CI nor `npm test` calls a model. Nothing in T7a changes the physics, the product golden, or the hash of an existing log.

14. **Public surfaces are the coordinator's.** The builder does not edit `README.md`, its translations, anything under `site/`, or `CHANGELOG.md`.

15. **The map** is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` after the new files are staged.

## Acceptance

- Both manifests load with their derived properties, and `npc-mind` is frozen. Every loader refusal has a test, including a role that holds A, B, and C.
- The gate refuses:
  - a proposal outside its role's manifest;
  - a frozen role;
  - a body that is not the instance's;
  - a proposal past its window, or no longer valid;
  - an instance over budget.

  A host's proposal is admitted exactly as before.
- A belief formed from untrusted or player text keeps its label when read back, and no role raises a label by reading a mind.
- The committed recorded sessions verify in CI with no GPU, and every planted-record failure goes red.
- A log recorded under the thawed role replays to the same hashes after the role is frozen.
- The typecheck is clean, and tests are at or above the count on `main`. The goldens and the Linux digest are unchanged, and the Atlas check is green.

## Not in T7a

- No test instrument; that is T7b, after T6 and this slice.
- No model call in CI.
- No thaw of `npc-mind`, and no path for player text: the role declares that input and nothing wires it.
- No new verb, and no class that writes a consequence.
