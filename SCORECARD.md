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
