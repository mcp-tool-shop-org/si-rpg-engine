---
title: Security
description: What the engine touches, what it never does, and how to report a problem.
sidebar:
  order: 7
---

## Scope

The engine runs locally. It is a set of Node commands over plain ES modules and one WebAssembly binary built from the `solver/` crate.

- **Files.** Every command changes to the repository root before it reads or writes. It touches world files under `worlds/`, verb drafts and hazard scenarios under `predicates/`, fixtures and goldens under `fixtures/`, and any log you ask a command to write with `--log` or `--out`. Nothing outside the checkout is read or written, except by `bench`, which makes its trees with `git worktree add` and writes its report where you point it, and runs each tree in a child process whose working directory is that tree.
- **Network.** `host` binds `127.0.0.1` only, on port 4173 unless `--port` says otherwise. No other command opens a socket but `propose --role`, which talks to a local Ollama server at `127.0.0.1:11434` and nowhere else, and only for a role whose manifest is thawed to act in a scratch world; it refuses every other role with exit 2 before any model client loads. Both declared roles are frozen. `bench` opens no socket. To build a tree's physics it runs `cargo build --locked`, as the solver's own build does, and cargo fetches a pinned crate from crates.io only when its cache lacks it.
- **Model output.** A model proposes only through a role, and the tick's role gate holds each proposal to the role's manifest. A belief keeps the least trust of what formed it, free text is never parsed for an action, and every call is recorded and checked in CI without a model.
- **Secrets.** None are read, stored, or transmitted.
- **Telemetry.** None is collected or sent.

## Untrusted content

World files, verb drafts, and play logs are untrusted. Each is validated at load and refused with a reason when it fails; a refused file changes nothing. Content that passes is still bounded: the solver holds at most 64 bodies and 64 static colliders, a NaN or an infinity aborts the step, a body mode outside the four the law knows is refused, and a signed zero is canonicalized before the hash.

## The binary

The WebAssembly binary is built from source in CI on Linux and pinned by its SHA-256 in `fixtures/solver.sha256`. It is never committed as bytes. A build on another host reports its own digest and does not write the pin. Its memory is fixed at 32 MiB and cannot grow, and a lint refuses any binary that could grow its memory, let the host choose an instruction's result, or keep state outside its memory. The bench's coverage build of the physics is its own artifact, in its own target directory, never pinned and never shipped; it sets `RUSTC_BOOTSTRAP=1` in cargo's environment alone. A memory image is refused if it came from another binary, has the wrong length, carries a changed byte, or was taken while a call was running.

## Dependencies

The runtime has no dependencies. The two development dependencies are TypeScript and the Node type declarations, both pinned exactly. CI runs `npm audit --audit-level=high` on every push and pull request.

## Reporting

Email `64996768+mcp-tool-shop@users.noreply.github.com` with a description, steps to reproduce, ideally as a seed and a log that `replay` reproduces, the commit affected, and the impact. Acknowledgement within 48 hours, an assessment within 7 days, a fix within 30 days. The full policy is `SECURITY.md` in the repository.
