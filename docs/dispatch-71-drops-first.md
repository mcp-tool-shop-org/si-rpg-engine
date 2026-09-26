# Dispatch 71 — a dropped body is seen from the next step, whatever the order

2026-09-26. Coordinator: Claude. Builder: a seat named at dispatch time. Reviewer: a different family, before merge. The edge is issue #71, found while building F1. It is grounded in the Rust knowledge base's answer [`requests/slot-alias.md`](https://github.com/mcp-tool-shop-org/readouts/blob/main/rust-knowledge/waves/wave-03-si-rpg-engine/requests/slot-alias.md) (wave 3, si-rpg-engine), measured on F2's law.

## What it is

`switch_in_place` in `solver/src/rapier_law.rs` plans every body's transition for a quantum, then applies them in record-index order. A pick-up removes the body from the Rapier world at once, and a drop inserts one. Neither touches the broad phase, which sees both at the next step, after the characters' queries have run.

Rapier's collider arena reuses the most recently freed slot for the next insertion. The broad phase keys its leaves by slot, and its queries turn a leaf into a collider by slot alone. So when a lower-index body is picked up and a higher-index body dropped in the same quantum, the dropped body takes the freed slot. Until the next step, it is found by any query whose region overlaps the picked-up body's old footprint. The knowledge base measured what that can and cannot do:
- **No wrong hit.** Every query tests the collider's current shape and pose, so nothing is ever hit where the removed body used to be.
- **One quantum early.** A character's cast that crosses the old footprint and the dropped body's real shape finds the dropped body in its drop quantum. With the indices the other way round, the same cast passes through it, as it passes through any freshly dropped body until the step.
- **Deterministic either way.** The outcome depends only on the record indices.

So a dropped body's first quantum depends on which other body happens to have a lower index. No fixture has two actors doing this today; T7's instrument may propose it.

## Pins

1. **The test first.** A native test builds the law's world with a floor and two bodies, then switches them in one quantum: the lower-index body picked up, the higher-index body dropped away from it. Before the next step, a query over the picked-up body's old footprint must not return the dropped body. The same test runs with the indices swapped, and both orders must give the same answer. It fails on `main`, and the pull request shows it.
2. **The fix.** In `switch_in_place`, drops are applied before pick-ups: a stable sort of the plan by whether a transition is a pick-up, before the apply loop. Every other order within the plan is kept. A comment says why, and cites #71 and the knowledge base's answer.
3. **What moves.** Nothing but the binary's digest.
   - The knowledge base measured it on F2: the product golden `6e0d351693b18c93` held, and every test passed. The goldens `6e0d351693b18c93` and `0d38671370d12d1e`, the behaviour numbers, every fixture, the law runs, and the sweep's verdicts stay as they are.
   - The Linux digest in `fixtures/solver.sha256` is pinned again from a Linux build, as F2's was. A Windows build reports its own digest and does not write the pin.
4. **Nothing else in the law.** No other Rust change. The builder does not edit `README.md`, its translations, `site/`, or `CHANGELOG.md`. The Atlas map is regenerated on Linux with the published `@dogfood-lab/atlas@1.17.0` if a file is added.

## Acceptance

- The new test fails on `main` in the lower-index order and passes here in both orders.
- The goldens, the behaviour numbers, every fixture, the law runs, and the sweep's verdicts are unchanged.
- The Linux digest is pinned from a Linux build and printed by CI.
- The typecheck is clean, tests are at or above the count on `main`, `cargo test --release --locked` passes, lint is clean, and the Atlas check is green.
- The pull request closes #71, stating that the slot's reuse is confirmed, that it never caused a wrong hit, and that a dropped body is now found from the next step whatever the indices.
