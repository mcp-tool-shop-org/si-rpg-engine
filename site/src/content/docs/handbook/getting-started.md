---
title: Getting started
description: Install the toolchain, build the solver, and run the suite.
sidebar:
  order: 1
---

## Requirements

- Node 20 or newer. CI runs Node 22.
- The Rust toolchain with the WebAssembly target. CI pins Rust 1.98.1.

Install rustup from [rustup.rs](https://rustup.rs/), then add the target:

```bash
rustup target add wasm32-unknown-unknown
```

## Clone and verify

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify
```

`npm run verify` runs three things in order:

1. `npm run typecheck` checks the JavaScript against the contract in `packages/frame/types.d.ts`. Nothing is emitted.
2. `npm test` first builds the solver (`node solver/build.mjs --check`), then runs the suite: the tick, world files, verbs, minds, verb admission, the proposer instrument, the host, and the solver fixtures.
3. `npm run check` runs both harnesses under node and compares them to `fixtures/golden.txt` and `fixtures/golden-arith.txt`.

## The solver build

`solver/build.mjs` runs `cargo build --release --target wasm32-unknown-unknown` with relaxed SIMD disabled and source paths remapped, then writes `solver/dist/solver.mjs`, an ES module holding the binary as a byte array with a synchronous instantiate. That file is generated and never committed.

The Linux build is the pinned artifact. On Linux, `--check` fails when the digest differs from `fixtures/solver.sha256`. On Windows or macOS the build reports its own digest and continues, because those hosts write different bytes into the binary and the golden hash, not the digest, is the cross-host invariant.

## What green looks like

```
harness/sim.mjs matches fd2f6c03fb982d77
harness/arith.mjs matches 0d38671370d12d1e
```

The first line is the product golden, which moves when the law changes and is rewritten once per change with the reason in the commit. The second is the arithmetic contract and has not moved since the first harness.

## Under the other engines

CI installs V8, SpiderMonkey, and JavaScriptCore at pinned versions through [jsvu](https://github.com/GoogleChromeLabs/jsvu) and runs both harnesses under each. To do the same locally:

```bash
npm install -g jsvu@3.0.5
jsvu --os=linux64 v8@15.6.61
jsvu --os=linux64 spidermonkey@156.0.1
~/.jsvu/bin/v8-15.6.61 --module harness/sim.mjs
~/.jsvu/bin/spidermonkey-156.0.1 -m harness/sim.mjs
```

Each prints the golden on one line. JavaScriptCore builds are Linux-only in jsvu, so that engine runs in CI.
