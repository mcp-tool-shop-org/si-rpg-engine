# Scorecard

**Repo:** si-rpg-engine
**Date:** 2026-09-25
**Type tags:** [all] [cli]

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 6/10 | Local-only, no secrets, no telemetry, but no SECURITY.md and no trust-model paragraph in the README. |
| B. Error Handling | 5/10 | One-line refusals with reasons and exit 1/2 already; no `--help`, and an unexpected failure printed a stack. |
| C. Operator Docs | 5/10 | README was a slice log, not a front door; no CHANGELOG; commands undocumented as a set. |
| D. Shipping Hygiene | 6/10 | Pinned toolchain, pinned engines, pinned binary digest, lockfile; no verify script, no dependency audit in CI, manifest version an internal counter. |
| E. Identity (soft) | 3/10 | Logo present; no translations, landing page, or repository metadata. |
| **Overall** | **25/50** | |

## Key Gaps

1. No public front door: the README described slices, not the product.
2. No SECURITY.md, no CHANGELOG, no verify script, no dependency audit in CI.
3. Commands answered no `--help` and let an unexpected failure print a stack trace.
4. No landing page, handbook, translations, or repository metadata.

## Remediation Priority

1. The README, SECURITY.md, CHANGELOG, and the command guard (A, B, C).
2. verify script, `npm audit` in CI, version 0.1.0 matching the tag (D).
3. Landing page, handbook, translations, metadata (E).

## At v0.2.0

`npx @mcptoolshop/shipcheck audit` on 2026-09-26: 22 items checked, 17 skipped with a reason each, none unchecked, a pass rate of 100%. The executed gates:

| Gate | Result |
|---|---|
| `security-docs` | Passes: SECURITY.md with a reporting contact, and the README's trust model |
| `deps` | Passes: two dependency trees audited, nothing at or above high |
| `manifest` | Passes: the lockfile is committed, and the manifest's version matches the newest tag |
| `secrets`, `pack` | Skipped: the package is private and publishes nothing |

Identity scan of the tracked tree: clean.

**Coverage.** Measured on the code this release tags, with Node's built-in `node --test --experimental-test-coverage` over the whole suite: 89.32% of lines, 84.28% of branches, and 92.35% of functions. It is measured by hand and not uploaded. A coverage service would add a third-party action and a token to a repository whose only development dependencies are TypeScript and Node's type declarations, and the engine's proof is what its tests check, not which lines they run: two goldens, a trace in exact bits, restores proven exact, and tests of outcomes. For a change, `bench` measures which inputs reach it.
