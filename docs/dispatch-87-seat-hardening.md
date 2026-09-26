# Dispatch 87 — the seat's model-calling path, hardened for T7c

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. Depends on T7a (the seat's rails), merged. The findings are issue #87, from the second external review of #77. The path they harden runs today only by hand, for the test-only `probe` role, because both declared roles are frozen. T7c thaws `test-instrument` and calls a model in earnest, so these land first, and T7c's records are made in the shape this slice settles.

## What it is

Six gaps in `packages/propose/`, each checked by the coordinator against `main`:
1. **An abandoned call's rejection is unhandled.** `askWithin` in `seat.js` aborts the in-flight ask when the deadline wins, and attaches no handler to that promise, so the aborted fetch's rejection goes unhandled.
2. **A failed call leaves no record.** `runSession` does not catch a throw from `askWithin`: a read that fails before the call, or an ask that rejects before the deadline. The session then ends with no record of the call and without its write, against the rail that every call is recorded.
3. **The reads before a call have no timeout.** `observeOllama` reads `/api/tags`, `/api/version`, and `/api/ps` with no signal, so a wedged local server stalls a session before the seat's deadline exists. `gpuSeen` already has a 10 s timeout.
4. **One field, two meanings.** The committed probe records were made at f06470d, when `askOllama` read the server's loaded model after `/api/chat` returned. Today `observeOllama` reads it before the call. So `server.loaded` means "after the call" in the committed records and "before the call" in any new one, and a model swapped while a call is out is never seen.
5. **The client's environment, recorded as the server's settings.** `settingsSeen` reads the client process's environment and records it as `server.settings`. A server started from another shell or host is misdescribed, and the record's key carries the misdescription.
6. **A session's call lines are not checked.** `verifySession` checks each call line only for its record's presence. A line's `builtAt`, `read`, `reason`, `admitted`, and `at` are never checked against its record or the log, so a tampered line still verifies.

## Pins

1. **The tests first.** Each test below fails on `main` and passes here, and the pull request shows both.
2. **An abandoned call is handled.** When the deadline wins, the abandoned ask's rejection is handled, and nothing is left unhandled.
   - A test runs the seat with a client whose ask rejects after its signal is aborted, in a child process started with `--unhandled-rejections=strict`, which exits clean.
3. **Every call is recorded, however it ends.** A call whose reads or ask throw is recorded, with what was read before the throw, no output, and the throw's message as the record's `failure`. Its call line reads `call-failed`, with that message as its reason. The session stops after it, and its write happens.
   - A test for each: a read before the call that throws, and an ask that rejects before the deadline. Each session's directory holds the record and the call line, and it verifies.
4. **Every read has a timeout.** Each read of the server before or after a call carries a timeout, 10 s by default as `gpuSeen`'s is, which a test may shorten. A read before the call that times out throws with the path it read, and pin 3 records the call. A read after the call is pin 5's.
   - A test serves each path from a local server that accepts and never answers, and the session is recorded as `call-failed` within the shortened timeout.
5. **The record's version 2.** New records are `record: 2`. Committed version-1 records verify unchanged, under the rules they were made under, and their keys do not move.
   - **The loaded model, read twice.** The server's loaded model is read before the call, as `server.loadedBefore`, and after the call ends, however it ends, as `server.loaded`, which is what the committed records' one reading was. A reading after the call that fails or times out is recorded as the string `unread`, since null means the model was not loaded, and the call keeps its own ending. A call reads `model-changed` when either reading names a digest other than the pin. A model not loaded before the call is no change, since the call loads it.
   - **The client's environment, named as such.** The settings `settingsSeen` reads move to `client.environment`, and the record says nowhere that they are the server's. Where the server's own settings can be read from the server, they may be recorded as the server's, with the endpoint named.
   - **The failure.** `failure` is null for a call that ended, or the message pin 3 records.
   - The key is still the SHA-256 of the canonical JSON of everything but the output, its hash, and the timing, so it covers every new field.
   - A test for each: a model swapped while the call is out, planted in a fake client, reads `model-changed`, and a model first loaded by the call does not; a version-2 record with an edited `loadedBefore`, `client.environment`, or `failure` fails its key.
6. **Call lines are checked.** `verifySession` checks each call line against its record and the log:
   - `builtAt` is a frame of the session, at its tick with its hash;
   - `read` and `reason` are what the record gives when read again under its manifest, by the rules `runSession` applies;
   - `admitted` and `at` agree with the log: an admitted line's proposal is the log's entry at `at`, with this record in its provenance, and a line not admitted has no such entry.

   A test tampers each of these fields in turn, in a copy of a committed session, and each fails verification with the field named. A field the record and the log cannot settle is named in the pull request, with its reason.
7. **Nothing the law is made of.**
   - The goldens `6e0d351693b18c93` and `0d38671370d12d1e`, the Linux digest, and the behaviour numbers do not move, and no Rust source or binary byte changes.
   - No test calls a model or needs a GPU: every client in a test is a fake, or a local server the test starts.
   - The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`, and does not re-record the committed sessions.
   - The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- Each new test fails on `main` and passes here.
- No call ends without a record, and no rejection is left unhandled.
- Every read of the server has a timeout.
- New records are version 2, with both readings of the loaded model, the client's environment named as such, and a failure field; committed version-1 records verify unchanged.
- A tampered call line fails verification, with the field named.
- The typecheck is clean, tests are at or above the count on `main`, the goldens and the Linux digest are unchanged, and the Atlas check is green.
