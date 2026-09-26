# Security Policy

## Supported Versions

si-rpg-engine is pre-1.0. The newest tagged release is the only supported version; there is no compatibility promise between 0.x releases, and every change to the hashed law is recorded in `CHANGELOG.md` with the golden hash it produced.

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |
| earlier | No        |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce, ideally as a seed and an admitted-input log that `replay` reproduces
- Version or commit affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

The engine runs **locally**. It is a set of Node commands over plain ES modules and one WebAssembly binary built from the `solver/` crate.

- **Data touched:** files inside the repository checkout only: world files under `worlds/`, verb drafts and hazard scenarios under `predicates/`, fixtures and golden hashes under `fixtures/`, and logs written where a command is told to write them with `--log` or `--out`. Every command changes its working directory to the repository root before it reads or writes.
- **Data not touched:** nothing outside the checkout. No home-directory configuration, no credentials, no browser storage.
- **Network:** `host` binds `127.0.0.1` only, on port 4173 unless `--port` says otherwise, and serves the debug view to that machine. No other command opens a socket but `propose --role`, which talks to a local Ollama server at `127.0.0.1:11434` and nowhere else, and only for a role whose manifest in `predicates/roles/` is thawed and acts in a scratch world. It refuses every other role with exit 2 before any model client loads. Both declared roles, `test-instrument` and `npc-mind`, are frozen.
- **No secrets handling.** The engine does not read, store, or transmit credentials or tokens.
- **No telemetry.** Nothing is collected or sent. CI runs on GitHub Actions against the repository's own fixtures.
- **Model output is untrusted.** A model proposes only through a role, a manifest the loader admits. The loader derives from the role's inputs whether it reads untrusted input, reads private data in a live world, and changes state, and refuses a role that would do all three. The tick's role gate holds every proposal to its role's manifest: its classes, verbs, and actors, its body, its freshness window, and its admission budget. A belief keeps the least trust of what formed it. Free text in a model's output is recorded and never parsed for an action. Every model call is recorded, and CI checks the records without calling a model.
- **Authored content is untrusted.** A world file, a verb draft, or a play log is validated at load and refused with a reason when it fails; a refused file changes nothing. Content that passes is still bounded: the solver holds at most 64 bodies and 64 static colliders, a NaN aborts the step, and a signed zero is canonicalized before the hash.
- **The WebAssembly binary** is built from source in CI on Linux, pinned by its SHA-256 in `fixtures/solver.sha256`, and never committed as bytes. A build on another host reports its own digest and does not write the pin.
