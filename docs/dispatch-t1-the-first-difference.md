# Dispatch T1 — the first difference

2026-09-25. Coordinator: Claude. Builder: an Opus seat in this session. Reviewer: a different family, on a scratch clone, before merge. Depends on nothing; `main` at `2c2631f`, 0.1.0. The plan row is T1 in `docs/PHASE-2.md`. Findings 1, 2, 9, 10, 11, 12, and 17 of `docs/study-swarm/testing-3d.dispatch.md`.

## What it is

When two runs disagree today, CI prints four hashes. Box2D, Jolt, Rapier, and Riot all answer the same question differently: which step, which body, which field. This slice makes the engine answer it, and puts a number beside every golden that the hash cannot hide behind, so a rewrite has to say what moved.

## Pins

1. **The trace.** `harness/trace.mjs` runs the product scene exactly as `harness/sim.mjs` does, under the four runtimes with the same `print` fallback, and prints one line per quantum: the tick, the quantum hash, then for each body its id and its thirteen floats as sixteen-hex-digit IEEE bit patterns, the zone index or `-`, the carry links or `-`, then the snapshot's byte length and its FNV digest, then per mind the goal met flags and the newest belief id. Line 0 is the load. The format is fixed in a comment at the top of the file and in `docs/PHASE-2.md`; `harness/sim.mjs` does not change and the golden does not move.
2. **The fixtures trace too.** `harness/solver-scene.mjs`'s `play` gains a `trace` option that returns the same lines for a fixture case, so a fixture is diffable the same way. The fixture files do not change shape.
3. **The diff.** `harness/first-difference.js` takes two trace files and prints `identical` or one block: the first differing tick, then the first differing body and field with both values as hex and as decimal, or `snapshot` with both lengths and digests when the bodies agree and the snapshot does not, or `hash` when the fields agree and the hash does not. Exit 0 when identical, 1 when different, 2 on a malformed trace. It streams; it does not load both files into memory.
4. **CI names the quantum.** The compare step keeps its four-hash output and adds: when an engine's golden differs, run `harness/trace.mjs` under node and under that engine, write both traces to the job's temp directory, run `first-difference.js`, and print its block. The traces are uploaded as artifacts only on failure. The step's happy path is unchanged and still prints `three engines match`.
5. **Behaviour numbers.** `fixtures/golden-behaviour.json` holds, for the product scene: per dynamic body, the first quantum on which the solver marks it asleep or `null` if it never sleeps; per body, its final position to full precision; the walker's final zone; the snapshot's byte length at load and at the last quantum. `harness/check.js` computes the same and fails on any difference, naming the body and the number. `write-golden` writes both `fixtures/golden.txt` and this file; its output states each behaviour number that changed, so the commit can say which. CI runs `npm run check` under node after the suite.
6. **Fixtures carry their numbers.** Each case in `fixtures/behavior-*.json` gains `behaviour`: the sleep quantum per dynamic body and the final position per body. The replay tests assert them beside the frames. The existing frames and hashes do not change, so this is an addition with no rewrite.
7. **Sleep is read, not inferred.** The sleep quantum comes from `world.sleeping(id)`, the solver's own flag from the snapshot, not from a velocity threshold.
8. **Tests that go red.** `harness/trace.test.js`: two traces of one run are byte-identical; a trace with one hex digit changed in one field is located to that tick, body, and field; a trace whose snapshot digest is changed is reported as `snapshot`; a truncated trace exits 2. `harness/check.test.js`: a behaviour file with one number moved fails with that body named. Both run in `npm test`.
9. **Nothing else moves.** `fixtures/golden.txt` stays `fd2f6c03fb982d77`, `golden-arith.txt` stays `0d38671370d12d1e`, `fixtures/solver.sha256` is untouched, the binary does not change, the seat stays frozen.
10. **The map.** The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if the new harness files change it.

## Acceptance

- `harness/trace.mjs` prints identical traces under node, V8, and SpiderMonkey locally, and under JavaScriptCore in CI, for the product scene.
- `first-difference.js` locates a planted one-digit change to its tick, body, and field, in a test.
- `fixtures/golden-behaviour.json` exists, `npm run check` verifies it, and a moved number fails with the body named, in a test.
- Every behaviour fixture carries and asserts its numbers; frames and hashes unchanged.
- CI's compare step prints the first-difference block on a planted mismatch, shown once in the pull request by a deliberately wrong golden on a throwaway commit that is then reverted, with the run linked.
- Typecheck clean, 73 or more tests, Atlas check green, both goldens unchanged.

## Not in T1

No restore, no ARM lane, no lint of the binary, no outcome tests, no scheduled job, no change to the law or the hash.
