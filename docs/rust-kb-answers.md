# Rust KB answers — si-rpg-engine Phase 2 (questions 1–8)

From the readouts `rust-knowledge` knowledge base (wave 3, si-rpg-engine tier), 2026-09-25. Two dedicated research seats answered, one for questions 1–4 and one for 5–8. Each worked against the pinned sources: rapier3d-f64 0.35.3 with enhanced-determinism, parry3d-f64 0.30.2, dlmalloc 0.2.13, and rustc 1.98.1. Every reachability and behaviour claim that code can show was run through the knowledge base's compile oracle, a non-model verifier: plain `rustc +1.98.1` linking the engine's exact Rapier build.

**Advisor verification before release.** I re-read the load-bearing citations in the pinned registry sources, and every one matches:

- `physics_hooks.rs` :43 and :52: `manifold: &'a ContactManifold` and `solver_contacts: &'a mut SolverContacts`.
- `contact_pair.rs`:
  - :620: `SolverContactGeneric` has no warm-start field; its comment reads "warm-starts on the manifold points".
  - :237, :243 and :255: `solver_color`, `solver_color_bodies` and `recycle_state` are `pub(crate)`.
- `contact_with_coulomb_friction.rs` :166–171: warm start is read straight off the manifold points.
- `rigid_body_components.rs` :1325: `pub(crate) sleep_prev_pose`.
- `ccd_solver.rs` :17–25: fast dynamic bodies sweep fixed colliders automatically; `max_ccd_substeps = 0` disables CCD.
- `character_controller.rs`: :673 `is_wall` uses `>=`, :674 non-slip uses `<=`, :742–743 the step limits add `+ offset`, and :836 landing uses `>`.
- parry `bvh_insert.rs` :161–168 and :367/:377: tight leaves are fattened only when a collider moves out.
- dlmalloc-0.2.13 `wasm.rs` :50–56: `alloc_via_grow` calls `memory_grow`.

The experiments' numbers are the seats' measurements, made on Windows x86_64, and are stated as such. The same findings, as verified KB entries, are in lanes `restore-internals` and `binary-and-limits`. The independent retrieval verifier's pass on those lanes is still pending.

---
Answers 1–4 — rapier3d-f64 0.35.3 (enhanced-determinism), rustc 1.98.1, checked 2026-09-25.

Engine state read: `main` (`solver/src/rapier_law.rs`, `solver/src/lib.rs`, `solver/FLAGS.md`) and the T2 branch `solver/src/rapier_law.rs` at `ee2e50a` (PR #43). Rapier and parry line numbers are from the pinned registry sources `rapier3d-f64-0.35.3/…` and `parry3d-f64-0.30.2/…`, which is the source docs.rs serves (`https://docs.rs/crate/rapier3d-f64/0.35.3/source/…`). Two kinds of evidence:

- **Oracle checks.** These ran under the compile oracle (`scripts/compile_oracle.py`, rustc 1.98.1, rapier3d-f64 0.35.3 + enhanced-determinism, debug profile). Their labels match the lane file `lanes/restore-internals.json`, whose oracle run reads "19 checks over 10 recipes — 19 pass, 0 fail".
- **Experiments.** These ran in scratch cargo projects under `…/scratchpad/q1-q4/` with the solver's release profile (`opt-level 3, lto false, codegen-units 1, panic abort, overflow-checks false`), `cargo +1.98.1 build --release`. The wasm builds used `RUSTFLAGS="-C target-feature=-relaxed-simd"` and ran in node 22.22.3 (V8).

The experiment scene follows `build_world`: dt 1/64, gravity −8, clustering off, warm start 1.0, sleep after 32 quanta, friction 0.8, restitution 0, and fixed colliders on fixed bodies inserted first. It contains a floor, a tilted slab, a 6×6 heightfield, six dynamic boxes (a 3-stack, one on the slab, one on the heightfield, one falling) and one kinematic box walking +x. Routes (a) and (c) in §1 are being **measured separately** by another seat. The numbers I give for them are a second, independent measurement.

## 1. T2 restore — warm-start impulses

**Answer.** No, for two reasons.

**(1) No sound write path.** rapier3d-f64 0.35.3 has no sound public path that writes any field of a `ContactPair` or `ContactManifold`:

- Every contact accessor on `NarrowPhase` and `PhysicsWorld` takes `&self` and returns shared references.
- `InteractionGraph`'s `*_mut` methods need a `&mut InteractionGraph`, which `NarrowPhase` never hands out.
- A `MODIFY_SOLVER_CONTACTS` hook receives the manifold by `&`, and `SolverContact` has no warm-start fields.

The engine's `solver_clear_warmstart` on `main` gets its pointers from `core::ptr::from_ref(pair) as *mut ContactPair` and writes through them. So do the T2 branch's `pairs_mut`, `carry_warmstart` and `solver_restore`. That is undefined behaviour. rustc's deny-by-default `invalid_reference_casting` rejects the same cast written as one expression; parking the pointers in a `Vec` only hides it from the lint.

**(2) A sound write would still not be enough.** Suppose the write were sound, for example through serde. The next step still would not warm-start as the uninterrupted run did, because the solver reads more per-contact state than the four warm-start fields:

- `solver_dp1`/`solver_dp2`, the frozen lever arms, on each point.
- The point geometry, which parry keeps across steps through `try_update_contacts`.
- The solver-contact anchors.
- The pair's crate-private `recycle_state` and `solver_color`.
- The narrow phase's private per-body colour masks, which set the Gauss–Seidel order.

I measured this. A world rebuilt as pin 1 prescribes has every body bit-equal and every warm-start field written from the saved values, yet it parts from the uninterrupted world on the first quantum. At 0.35.3 the only complete and sound restore of Rapier state is `serde-serialize`. Route (d), replay, avoids restoring Rapier state at all.

Fields the solver reads for warm start, per point, in the 3D default friction model (`FrictionModel::Simplified` → `ContactWithTwistFriction`):

- `warmstart_impulse`.
- `warmstart_tangent_world`. In 3D the solver reads this world vector, projected onto the current tangent basis. It does not read `warmstart_tangent_impulse`, which is only written back.
- `warmstart_twist_impulse`.
- `impulse`, as `is_new = impulse == 0.0`. At restitution 0 that only feeds `is_bouncy`, which returns 0 either way.
- `solver_dp1`, `solver_dp2`.
- Per manifold: `solver_contacts` (anchors, `contact_id`, `tangent_velocity`), `normal`, `friction`, `restitution`, `relative_dominance`, and the crate-private `solver_body_ids`.

The solver writes the four warm-start fields and `impulse` back to the manifold points after solving.

**What I checked.**

- **Public surface.**
  - `rapier3d-f64-0.35.3/src/geometry/narrow_phase/queries.rs:21-182`: every `pub fn` takes `&self`, and none returns `&mut`. https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/geometry/narrow_phase/queries.rs; API page https://docs.rs/rapier3d-f64/0.35.3/rapier3d_f64/geometry/struct.NarrowPhase.html.
  - `PhysicsWorld`'s mirrors take `&self` (`src/pipeline/physics_world.rs:629-650`).
  - `InteractionGraph::interaction_pair_mut` and `interactions_with_mut` take `&mut self` (`src/geometry/interaction_graph.rs:148-195`). The graph sits in the private field `NarrowPhase::contact_graph` (`src/geometry/narrow_phase/mod.rs:332`).
  - A sweep of the crate for any `pub fn` that returns or yields `&mut ContactPair`, `&mut ContactManifold` or `&mut InteractionGraph` finds none. `EventHandler` gets `Option<&ContactPair>` and `&ContactPair`.
  - 0.36.0, published 2026-09-25, is the same: https://docs.rs/rapier3d-f64/0.36.0/rapier3d_f64/geometry/struct.NarrowPhase.html lists only `&self` accessors. Its changelog moves `ContactPair::manifolds`/`solver_clusters` to `ContactPair::contacts` (https://raw.githubusercontent.com/dimforge/rapier/master/CHANGELOG.md). A bump opens no route.
  - Oracle, compile_fail:
    - `NarrowPhase has no contact_pairs_mut` → E0599.
    - `contact_graph() is shared: interaction_pair_mut needs &mut` → E0596.
    - `NarrowPhase::contact_graph field is private` → E0616.
- **The hook route (confirms the claim).**
  - `ContactModificationContext` has `manifold: &'a ContactManifold` and `solver_contacts: &'a mut SolverContacts` (`src/pipeline/physics_hooks.rs:29-65`).
  - `SolverContactGeneric` has `anchor1`, `anchor2`, `dist`, `tangent_velocity`, `contact_id` and `padding`. Its own comment says "warm-starts on the manifold points" (`src/geometry/contact_pair.rs:617-653`).
  - The hook runs in the narrow phase (`src/geometry/narrow_phase/pair_update.rs:500-531`).
  - The constraint builder reads the warm start "straight off the manifold points (not duplicated on the solver contacts)":
    - `src/dynamics/solver/contact_constraint/contact_with_twist_friction.rs:192-235`.
    - `contact_with_coulomb_friction.rs:166-171`.
    - Writeback: `contact_with_twist_friction.rs:783-825`.
  - Pairs with hooks are never recycled (`pair_update.rs:116-121`), so a hook would also change the simulation.
  - Oracle, compile_fail:
    - `A hook cannot write warm start: SolverContact has no warmstart_impulse` → E0609 ("no field `warmstart_impulse` on type `&mut SolverContactGeneric<f64, 1>`").
    - `A hook cannot write the manifold: ctx.manifold is behind &` → E0596 ("cannot borrow `ctx.manifold.points` as mutable, as it is behind a `&` reference").
- **The cast is UB.**
  - std `ptr::from_ref`: the memory the pointer points to must be "never written to (except inside an UnsafeCell) using this pointer or any pointer derived from it" (https://doc.rust-lang.org/stable/std/ptr/fn.from_ref.html).
  - The Reference lists "Mutating immutable bytes… the bytes pointed to by a shared reference… are immutable" as UB (https://doc.rust-lang.org/stable/reference/behavior-considered-undefined.html).
  - The lint listing: https://doc.rust-lang.org/rustc/lints/listing/deny-by-default.html (`invalid_reference_casting`).
  - Oracle:
    - `One-expression &T to &mut T cast is rejected by invalid_reference_casting` → compile_fail with the lint ("casting `&T` to `&mut T` is undefined behavior, even if the reference is unused, consider instead using an `UnsafeCell`").
    - `The engine's shape (pointers parked in a Vec) compiles with no diagnostic` → compiles.
- **Per-contact state beyond the warm start.**
  - Frozen arms and body-local anchors are written at the last full update (`pair_update.rs:533-577`).
  - Recycling skips the update while drift ≤ 0.05 (`pair_update.rs:108-171`). It is on by default (`src/dynamics/integration_parameters.rs:279-289, 399`), and the engine does not turn it off.
  - `recycle_state`, `solver_color` and `solver_color_bodies` are `pub(crate)` (`contact_pair.rs:233-255`). docs.rs source: https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/geometry/contact_pair.rs.
  - Colours are assigned greedily at begin-touch and released at end-touch (`narrow_phase/mod.rs:87-172`; `narrow_phase/contacts.rs:300-385`). "Deterministic: results depend only on the coloring" (`src/dynamics/solver/staged_island_solver/mod.rs:1-4, 45-51`).
  - parry's cuboid–cuboid manifold returns early through `try_update_contacts`, which keeps the old points (`parry3d-f64-0.30.2/src/query/contact_manifolds/contact_manifolds_cuboid_cuboid.rs:28-30`; `contact_manifold.rs:712-748`).
  - Oracle, runs: `A world rebuilt at bit-equal poses reads different contact geometry` → "points 12 vs 11; of the pairs compared, points whose anchors, lever arms or dist differ: 11".
- **Experiment E2 (pin 1 emulated without UB).** Rebuild from the saved records, run the load pass, copy the whole `RigidBodyActivation` after the pass (better than pin 1 can do), write the seven warm-start floats per point in sorted pair order through a `serde_json::Value` patch, step both worlds (`lab2`, `pin1.exe`):
  - At 5, 12 and 20 quanta, pin 1's count check refuses the snapshot: 5 against 2 pairs, 40 against 71 points, 71 against 55 points.
  - At 1, 33, 50, 75 and 90 quanta it is accepted and diverges on quantum 0.
  - At 33 quanta, before the step, every body is bit-equal (pose, velocity, whole activation) and every warm-start field equal. All 71 of 71 points differ in `local_p1/local_p2/solver_dp1/solver_dp2/dist`. One quantum later the touching bodies differ by up to 3.43e-5 m and 2.25e-3 m/s. The free-falling body is identical.
  - With `contact_recycling = false` in both worlds: refused at 5 and 12, diverging on quantum 0.
- **Colours are result-bearing.** Swapping the colours of the two stack pairs (0↔1), with masks kept consistent and the control given the same `Value` round trip and graph rebuild, parts on quantum 0. The top box ends at 2.498742471332 against 2.498740164194 (`lab2`, `colors.exe`). In a history where the upper pair touched first, the running world has (box0, box1) at colour 1, and the load pass gives it 0 (`colorcmp.exe`).
- **Not result-bearing, measured.** Reversing the awake-island body order (with `active_set_id` rewritten) and forcing a solver-graph rebuild each gave no difference over 300 quanta (`order.exe`, `rebuild.exe`). The `serde_json::Value` round trip, which re-sorts the heightfield workspace's map keys, also gave none over 300 quanta (`labp`, `recheck.exe`).

**Sound routes and their costs.**

- **(a) `warmstart_coefficient = 0`**, in T2's rebuild-every-quantum law, so there is nothing to carry.
  - Sound.
  - The coefficient is read on every step: `contact_with_twist_friction.rs:451` (`update`, called once per substep inside the substep loop at `src/dynamics/solver/staged_island_solver/worker.rs:227`); `worker.rs:296` gates the fused update; `worker.rs:438` skips the whole warm-start stage when it is 0. A world uses a new value from its first quantum.
  - Coefficient 0 also drops the warm start between the substeps of every quantum (`update` "banks the previous substep's impulse before the warm-start scaling", `contact_with_twist_friction.rs:500-518`). So it is weaker than an empty cache.
  - Measured separately. My numbers, a 4-box stack at the engine's parameters: all asleep at quantum 33 with 1.0 and 50 with 0.0; the top box sinks 2.71e-3 m and 3.57e-2 m (oracle `Stack at engine parameters: warm start on vs off`).
- **(b) A vendored rapier3d-f64 0.35.3 with one accessor**, through `[patch.crates-io] rapier3d-f64 = { path = "…" }`, where the vendored `Cargo.toml` stays at version `0.35.3`. The minimal sound diff is 16 lines in `src/geometry/narrow_phase/queries.rs`, after `contact_pairs`:

  ```rust
  /// The contact data of every point of every solver manifold, mutably, with the pair's
  /// collider handles: pairs in the order of [`Self::contact_pairs`], then manifolds, then
  /// points. Only [`ContactData`] is reachable, so the manifold and point counts that the
  /// persistent solver graph indexes cannot change through it.
  pub fn contact_data_mut(
      &mut self,
  ) -> impl Iterator<Item = (ColliderHandle, ColliderHandle, &mut ContactData)> {
      self.contact_graph.graph.edges.iter_mut().flat_map(|edge| {
          let pair = &mut edge.weight;
          let (c1, c2) = (pair.collider1, pair.collider2);
          pair.solver_manifolds_mut()
              .iter_mut()
              .flat_map(move |m| m.points.iter_mut().map(move |pt| (c1, c2, &mut pt.data)))
      })
  }
  ```

  - Its order matches `contact_pairs()`. That method is `self.contact_graph.interactions()` = `graph.raw_edges().iter()` (`interaction_graph.rs:98-100`), the same `Vec` (`src/data/graph.rs:138`) in the same order. Measured: "pairs with points, in contact_pairs() order == contact_data_mut() order: true".
  - It leaves physics bit-identical: snapshot FNV `57339140c4e9049a` at 90 quanta and `40cda3005d1a708c` at 300, equal to the unpatched crate (native at 90; wasm at 90 and 300).
  - Zeroing through it and stepping gives the same hashed state as zeroing through serde and stepping (`labp`, `vendored.exe`).
  - The internal `InteractionsWithMut` iterator (`interaction_graph.rs:254-284`) walks one node's edges through an `unsafe` transmute. `edges.iter_mut()` needs no `unsafe`.
  - A one-line `contact_pairs_mut() -> impl Iterator<Item = &mut ContactPair>` would also compile. It lets callers resize `manifolds`, which the persistent solver graph indexes by ordinal. The manifold store turns a stale ordinal into an always-on panic (`src/dynamics/solver/manifold_store.rs:56-91`), but I did not audit every narrow-phase path, so prefer the data-only accessor.
  - Cost: a patch carried across every bump (0.36.0 already renames the field the body reads), plus Apache-2.0 §4 obligations for a modified copy. This route only makes T2's *carry* sound. By itself it does not make a restore of a running world exact (E2).
- **(c) serde (`serde-serialize`)**: serialize the `PhysicsWorld` on save, deserialize on restore, and never run the load pass afterwards.
  - Sound. Exact continuation (§4). Manifold point order is preserved: `Vec` order is serialized, the round trip is byte-identical, and the continuation is exact.
  - Measured separately. My numbers:
    - The same test module is 1,457,799 bytes without serde and 2,143,817 bytes with it (+686,018, +47%).
    - The 10-body scene's bincode blob is 29–40 KB (JSON 90–121 KB).
    - Native serialize takes about 7–17 µs and deserialize 17–20 µs.
    - Nothing is paid per quantum unless you serialize every quantum.
  - Version-locked: 0.36.0's changelog says "Snapshots serialized with previous versions can't be loaded anymore".
- **(d) Persistent law (main) plus restore by replay** from the seed and the log to the save tick, proven by the T1 trace.
  - Sound: the law writes nothing inside Rapier. The three branch casts and `carry_warmstart` disappear.
  - Full fidelity: Rapier keeps its own warm start.
  - Per quantum: 744 ms / 10,000 quanta on node (coordinator's measurement), against 962 ms for T2's rebuild.
  - Restore: t × ≈74.4 µs for a save tick t, which is 0.744 s at t = 10,000.
  - T6 arithmetic: a sweep of R restores to settled cells at ticks t_i costs 74.4 µs × Σt_i. With R = 100 at a mean tick of 5,000 that is ≈37 s; with R = 1,000 it is ≈6.2 min.
  - Native cross-check (Rapier step only):
    - 119.9 µs/quantum for 64 awake boxes over their first 256 quanta.
    - 9.9 µs/quantum averaged over 10,000 quanta (60 of 64 asleep by the end).
    - 1.0 µs/quantum for the 10-body scene.
  - Checkpointing by replay-to-tick needs a checkpoint the law never writes. **(e)**, which I found in addition, is one:
    - Copy the module's whole linear memory in JS at the tick, and write it into a fresh instance to restore.
    - Measured on a 64-body law-shaped module: 3,538,944-byte image, 1.32 ms out and 0.93 ms in. At tick 260 the continued instance, the restored image and an uninterrupted run all hash `7a4c4d3296f61093` (`memimg/run.js`).
    - With (e), a sweep costs one replay (≤0.744 s) plus about 2 ms per restore, and image memory is paid per checkpoint kept.
    - The image is tied to the exact binary and happens entirely outside Rust (no Rust code runs during the copy). I found no Rust document on host writes to linear memory, so treat that as outside Rust's model: wasm-defined, and exact in the test.
  - What (d) gives up: T2's claim that the snapshot is the whole state. The hash fingerprints a history-determined state.
- **`solver_clear_warmstart` has no sound form under (d)** either, without (b) or serde.
  - **Replacement, part (i): pure-bytes sensitivity.** On a resting stack, check that the warm-start fields in the snapshot bytes are non-zero, flip them in a copy of the bytes, and require the hash to change.
  - **Replacement, part (ii): structural.** `rebuild_snapshot` must emit all seven floats of every point of every `solver_manifolds()` entry, in sorted pair order.
  - (i) and (ii) prove what the old test proved about the hash: the live warm-start cache is emitted and the hash covers it.
  - Neither proves that the cache steers the next quantum.
  - The candidate "same history, coefficient 1.0 against 0.0" does not prove it either:
    - Oracle `warmstart_coefficient is read from the first quantum` → "first quantum a contact carries an impulse: Some(1); first quantum 1.0 and 0.0 differ: Some(1)". The runs part on quantum 1, when the cache is still empty. So they show the coefficient steering the substep loop, not the cached values steering the next quantum.
    - A sound zero-then-step and coefficient 0 for one quantum both differ from control, and they also differ from each other ("zeroed == coefficient 0: false" at 20 and 40 quanta, `labp`, `recheck.exe`).
  - The steering claim needs a sound write in a test-only build: serde, or the (b) accessor in a native test crate, never the product binary.

**Recommendation.**

| Route | Soundness | Fidelity to Rapier's warm start | Per-quantum cost | Restore cost |
|---|---|---|---|---|
| (a) coefficient 0, rebuild each quantum | sound | none: no warm start across quanta or across substeps; the stack sinks 13× deeper and sleeps 17 quanta later | ≈ T2's rebuild (962 ms/10k on node), minus the carry | one rebuild from bytes |
| (b) vendored `contact_data_mut`, rebuild each quantum | sound (data-only accessor, tested) | approximate: carried by pair, subshape and fid, but recycling, parry's point persistence, frozen arms, colours, islands and Rapier's sleep timer reset each quantum | ≈ 962 ms/10k (node) | one rebuild from bytes; the patch carried across bumps |
| (c) serde blob, persistent law | sound | full (exact continuation, tested) | 0 per quantum; +686 KB wasm (+47% in my module) | deserialize (µs natively); blob locked to 0.35.3 |
| (d) persistent law, replay | sound (writes nothing) | full | 744 ms/10k (node, fastest) | t × 74.4 µs (≤0.74 s); ~2 ms with (e) images |

Take **(d)**. Drop every cast (main's `solver_clear_warmstart`, and the branch's `pairs_mut`, `carry_warmstart` and `solver_restore`), and replace the clear test with (i) + (ii). Add (e) images if T6's replay time matters, and keep (c) as the upgrade if restore from bytes becomes a requirement. Neither (a) nor (b) is recommended: (a) costs stacking quality, and (b) keeps a Rapier fork and still diverges from Rapier's own continuous run.

**Consequence for T2.**

1. Pin 1's write-back cannot be implemented soundly. A sound variant (serde) still reruns differently (E2), so pin 5's test would fail on every scene with contacts.
2. If the rebuild-each-quantum design (branch) is kept, its carry must go through (b) or be dropped with (a). Its restore is then exact by construction, but the golden is T2's, not Rapier's continuous run.
3. With (d), T2 becomes: save = tick index plus the T5 log; restore = replay; proof = T1 trace `identical`. Pins 4 and 7 become tests on replay and on the bytes checks above.

**Contradicts a pin?** Yes, pin 1: the write-back of warm-start impulses in sorted pair order, and the refusal on pair/point counts, which also rejects valid snapshots (see §3). Pins 4 and 7 are not contradicted. Under (d) they are carried by replay (the T1 trace) and by the bytes checks above instead of by `solver_restore`.

Pin check: contradicts pin 1 of dispatch-t2-restore.md because no sound public path writes a manifold point at 0.35.3 (NarrowPhase hands out only shared references; the engine's from_ref cast is UB), and a sound write still does not reproduce the next step, since solver_dp1/solver_dp2, the point geometry, recycle_state and solver_color are also read, rapier3d-f64-0.35.3/src/geometry/narrow_phase/queries.rs:21-182.

## 2. T2 restore — sleep state

**Answer.** `RigidBodyActivation` at 0.35.3 has six fields:

- `normalized_linear_threshold`, `angular_threshold`, `time_until_sleep`, `time_since_can_sleep` and `sleeping`, all `pub`.
- `sleep_prev_pose: Pose`, which is `pub(crate)`.

`sleep_prev_pose` is the body's pose at the previous energy update. The update runs before the solve and gets the pose at the start of the step, so at save time the field holds the pose from one quantum before the save, and the snapshot has no copy of it. It came with 0.35.0: "Sleep eligibility is now judged on the actual per-step pose displacement". `update_energy` compares it with the current pose, and a drift above the threshold resets the timer.

It has no public setter. `active()`, `inactive()` and `cannot_sleep()` set it to identity. Only a whole-struct copy carries it, in-process (the type is `Copy`), or serde. Rebuilding the activation from the five public fields therefore resets `time_since_can_sleep` to 0 on the next step for any body not at the origin: measured `[20, 6, 6]` against `[0, 0, 0]` quanta.

The public ways to set the fields, and their side effects:

- **`RigidBody::activation_mut()`** writes all five public fields. It sets the body's `SLEEP` change flag and, when reached through `RigidBodySet` indexing, puts the body in the modified set. It makes no immediate call into the island manager. At the next step, `handle_user_changes_to_rigid_bodies` calls `IslandManager::rigid_body_updated`. That always bumps `active_set_epoch`, admits a body not yet seen, and wakes the body's island when `SLEEP` is set and `sleeping` is false. It then restores the body's own activation value, but not the values of other island members it woke.
- **`set_linvel`, `set_angvel`, `set_translation`, `set_rotation`, `set_position`** with `wake_up = true` call `wake_up(true)`, which zeroes the timer. With `false` they leave it alone.
- **`RigidBody::wake_up(true)`** zeroes the timer; `wake_up(false)` does not.
- **`RigidBody::sleep()`** sets `sleeping`, sets the timer to `time_until_sleep`, and zeroes both velocities.
- **`IslandManager::wake_up`** and **`PhysicsWorld::wake_up`** wake the whole persistent island and strong-reset every member.

`IslandManager` holds state that survives a step and is not derivable from the bodies:

- `active_set_epoch`.
- The island containers: the awake island's body order (`active_set_id`), the sleeping chunks and the free lists.
- `PersistentIslands`:
  - island membership, with eager merges and deferred splits;
  - `constraint_remove_count`, which blocks sleep for a multi-body island;
  - `split_denied_until`, a 16-step cooldown;
  - `split_island`, `removal_journal`, `sleep_scan_stamp`;
  - `contact_link_locs`, keyed by contact-graph edge id;
  - `bootstrapped`.

A rebuilt world bootstraps fresh islands from the current touching pairs. Measured:

- The awake-body order is not result-bearing.
- Island membership gates only when an island sleeps. I did not reproduce a divergence from it in a small scene, because the local split settles most removals at once. So its effect is **not determined** empirically; a scene that forces a global split would settle it. Serde carries it either way.

**What I checked.**

- **Fields.**
  - `rapier3d-f64-0.35.3/src/dynamics/rigid_body_components.rs:1295-1326`.
  - `update_energy`: `:1417-1470`, with `prev_pose = replace(&mut self.sleep_prev_pose, *pose)` and `drift * 0.5 < linear_threshold * dt`.
  - https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/dynamics/rigid_body_components.rs. The API page https://docs.rs/rapier3d-f64/0.35.3/rapier3d_f64/dynamics/struct.RigidBodyActivation.html shows five fields; `sleep_prev_pose` is not public.
  - Changelog at the tag: https://raw.githubusercontent.com/dimforge/rapier/v0.35.3/CHANGELOG.md (v0.35.0 entry).
  - The energy update runs in the pre-solve traversal with `rb.pos.position` (`src/pipeline/physics_pipeline/solve.rs:234-250`; `src/dynamics/island_manager/manager.rs:320-333`).
- **Setters.**
  - `src/dynamics/rigid_body.rs:184-187` (`activation_mut`), `:804-807` (`sleep`), `:816-822` (`wake_up`), `:905-917` (`set_linvel`), `:988-1004` (`set_translation`); https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/dynamics/rigid_body.rs.
  - `src/pipeline/user_changes.rs:76-89, 188` (activation saved, then restored).
  - `manager.rs:257-316` (`rigid_body_updated`).
  - `src/dynamics/island_manager/sleep.rs:31-76` (whole-island wake).
- **Load-pass side effects.** Begin-touch transitions in `CollisionPipeline::step` call `strong_wake_sleeping_side` and `interaction_changed(…, true)`, which runs `activation.wake_up` (`src/geometry/narrow_phase/contacts.rs:312-351`; `manager.rs:118-145`). `warm_broadphase` then calls `wake_up(true)` on every non-fixed body (`rapier_law.rs` `warm_broadphase` on main).
- **Island state.**
  - `manager.rs:28-51`.
  - `src/dynamics/island_manager/persistent.rs:31, 71-90, 127-168`.
  - `finish_sleep_scan`: `:498-516`.
  - `bootstrap`: `:600-666`.
  - https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/dynamics/island_manager/persistent.rs. That page's summary tool claimed several of these fields were `serde(skip)`; the source says otherwise. So did the serialized JSON, which contains `bootstrapped`, `removal_journal`, `sleep_scan_stamp` and `split_island`.
- **Oracle, runs.**
  - `Rebuilding RigidBodyActivation from its pub fields resets the sleep timer` → "saved at step 20: quanta [19.0, 5.0, 5.0] / next step, whole activation kept: [20.0, 6.0, 6.0] / next step, pub fields rebuilt: [0.0, 0.0, 0.0]".
  - `Which public setters zero time_since_can_sleep` → "set_linvel(_, false) 0.25 | set_linvel(_, true) 0 | set_translation(_, false) 0.25 | set_translation(_, true) 0 | wake_up(false) 0.25 | wake_up(true) 0" and "sleep(): sleeping true timer 0.5 linvel [0.0, 0.0, 0.0]".
- **Experiments.** Awake order reversed with `active_set_id` rewritten, against a control with the same epoch bump: no difference over 300 quanta at 12, 20 and 33 (`order.exe`).
- **Debug builds.** The engine's load pass trips Rapier's `debug_assert!` at `manager.rs:137-144` ("assertion failed: rb.is_fixed() || !rb.is_enabled() || rb.ids.active_island_id != u32::MAX", exit 101) when any body touches geometry at load. `CollisionPipeline` never registers bodies with the island manager (`src/pipeline/collision_pipeline.rs:177-185`) but reports transitions to it. Oracle `The load pass panics in a debug build of Rapier when a body touches at load` → exit 101 after "before the pass". The release wasm compiles the check out.

**Consequence for T2.**

1. Under (c) or (d), sleep comes back with everything else. Do not run the load pass or any `wake_up` after deserializing: that measured a divergence at quantum 0 (`serde_pass.exe`).
2. Under any public-API rebuild, write the sleep state after the load pass, never before it, and never through a `wake_up = true` setter. Even then the first step resets the timers (`sleep_prev_pose`), so pin 5 fails for resting bodies. The branch knew this and replaced Rapier's sleep with the law's own; that is part of why its golden differs from main's.
3. Native debug-profile tests of any load or restore path will panic whenever bodies touch at load.

**Contradicts a pin?** Yes, pin 1, twice:

- Sleep state set before "the same collision pass load runs" is erased by the pass: the wake on begin-touch plus `warm_broadphase`'s `wake_up(true)`.
- The public fields cannot restore the timer's continuation.

Pin check: contradicts pin 1 of dispatch-t2-restore.md because the sleep state it writes before the load pass is erased by that pass, and the timer's continuation depends on the pub(crate) sleep_prev_pose (pose one quantum before the save) that no public call sets, rapier3d-f64-0.35.3/src/dynamics/rigid_body_components.rs:1295-1326.

## 3. T2 restore — broad phase

**Answer.** Yes. `BroadPhaseBvh` keeps state across steps that changes *which* pairs exist, not only their order. The state:

- The BVH itself: topology, optimizer state and `free_wide_nodes`.
- Each leaf's stored AABB.
- The pair map (an `IndexMap` under enhanced-determinism) and `pair_adjacency`.
- `pending_set_aabb`, filled at the end of every step by the pipeline's `set_aabb`.
- `prev_updated_leaves` ("needs to be serialized for determinism after snapshot restore").
- `changes_since_optimize`, `reinsert_leaf_updates` and `frame_index`.

The leaf AABB decides it. parry stores a new leaf **tight**. It adds the change-detection margin (0.04 × length_unit) only when a moving collider first leaves its leaf, and from then on only when it leaves the fat box. So a world that has run holds fat leaves around each moving collider's pose at its last refresh, while a world rebuilt from bodies holds tight leaves. Its first `CollisionPipeline` pass reports fewer pairs. Measured: bit-equal poses after 3 quanta give 1 pair running and 0 rebuilt. In the product-like scene, pin 1's count check refuses the rebuilt world at 5, 12 and 20 quanta.

New pairs are added in BVH traversal order, which becomes the contact-graph edge order. Only pairs next to changed leaves are ever tested for staleness.

There is a public full rebuild: `BroadPhaseBvh::new()` plus `set_aabb` for every collider. It is unsound as a law, though. A fresh broad phase has no record of the pairs the narrow phase holds, so it never emits `DeletePair`, and `NarrowPhase` removes contact pairs only on `DeletePair`, collider removal or a sensor change. Measured: a box 4.01 m from a pillar is still paired to it when the broad phase is rebuilt every step.

What `enhanced-determinism` guarantees:

- parry's `HashMap`/`HashSet` become `IndexMap`/`IndexSet` with `BuildHasherDefault<FxHasher32>`, a hash that does not depend on pointer size.
- simba and glamx use libm.
- Stored contact impulses get canonical signed zeros.
- Joint wake and join sets drain in insertion order, and `swap_remove` is explicit.
- `simd8` cannot be combined with it.

That makes every iteration order a deterministic function of the sequence of operations on every IEEE 754 platform, given the same initial conditions and insertion order. It does not make an order a function of the current state. Contact-graph edge order, solver colours (which set the Gauss–Seidel order), composite manifold ordinals, island ids and the pair map's order all depend on history.

**What I checked.**

- **Broad phase.**
  - `rapier3d-f64-0.35.3/src/geometry/broad_phase_bvh/mod.rs:21-103` (fields, `prev_updated_leaves` comment at `:58-62`), `:171-201` (margin `CHANGE_DETECTION_FACTOR = 4.0e-2`), `:235-263` (`set_aabb` pushes to `pending_set_aabb`).
  - `update.rs:64-72` (pending drain), `:398-427` (new pairs in traversal order and `AddPair`), `:441-601` (stale scan only over the adjacency of updated or removed colliders, then canonical sort and `DeletePair`).
  - https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/geometry/broad_phase_bvh/update.rs and https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/geometry/broad_phase_bvh/mod.rs; API page https://docs.rs/rapier3d-f64/0.35.3/rapier3d_f64/geometry/struct.BroadPhaseBvh.html.
  - The end of each step feeds moved AABBs through `set_aabb` (`src/pipeline/physics_pipeline/substep.rs:229-240, 555-565`).
- **parry leaves.**
  - `parry3d-f64-0.30.2/src/partitioning/bvh/bvh_insert.rs:152-216`: an existing leaf is replaced by the AABB grown by the margin only if it no longer contains the new one; otherwise `Unchanged`.
  - `:358-380`: `insert_new_unchecked` stores `BvhNode::leaf(aabb, …)` with the raw AABB.
  - https://docs.rs/crate/parry3d-f64/0.30.2/source/src/partitioning/bvh/bvh_insert.rs. The API doc at https://docs.rs/parry3d-f64/0.30.2/parry3d_f64/partitioning/struct.Bvh.html words this ambiguously; the code and the measurement agree.
- **Narrow-phase pair removal.** `src/geometry/narrow_phase/pair_management.rs:571-663` (`add_pair` adds only if `find_edge` is none) and `:665-690` (`register_pairs`); https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/geometry/narrow_phase/pair_management.rs.
- **enhanced-determinism.**
  - `parry3d-f64-0.30.2/src/utils/hashmap.rs:1-63` (https://docs.rs/crate/parry3d-f64/0.30.2/source/src/utils/hashmap.rs) and `fx_hasher.rs:1-10`.
  - `rapier3d-f64-0.35.3/src/utils/mod.rs:80-102` (`canonicalize_zero`), `:165-183` (`hashmap_remove` → `swap_remove`).
  - `src/pipeline/physics_pipeline/substep.rs:286-300, 343-356` (ordered drains).
  - `src/lib.rs:19-22`.
  - Features page https://docs.rs/crate/rapier3d-f64/0.35.3/features. Determinism guide https://rapier.rs/docs/user_guides/templates/determinism/ (conditions include the same initial conditions and the same insertion order).
  - Colour order: `staged_island_solver/mod.rs:1-4, 45-51`.
- **Oracle, runs.**
  - `A rebuilt broad phase reports a different pair set (tight vs fat leaves)` → "poses equal: true; fell 0.0095 m; pairs at load 0; after 3 quanta: running 1, rebuilt 0".
  - `Pin 6's per-step rebuild never deletes a narrow-phase pair` → "gap to pillar 4.01 m / 4.01 m; box-pillar pair present: kept false, rebuilt every step true".
  - `Under enhanced-determinism parry's HashMap is an IndexMap` → "[30, 10, 20, 5] -> [5, 10, 20]".
- **Experiments.**
  - E2 as in §1: refused at 5 quanta (uninterrupted pairs (2,7), (3,4), (4,5) are fat-leaf pairs absent from the rebuild; `pairs5.exe`).
  - With pin 6's per-step rebuild in both worlds (E4): refused at 12 quanta (26 against 71 points) and diverging on quantum 0 at 33 and 50 (`pin6.exe`).
  - Serde restore of everything except the broad phase, which is rebuilt once through `set_aabb`: exact for 300 quanta in the settling scene, but under churn it keeps a dead pair, 2 against 1 pairs for 64 quanta (`bponly.exe`, `bpchurn.exe`).

**Consequence for T2.**

1. Do not rebuild the broad phase, either at restore or every step. Restore it with everything else (serde), or avoid restoring it (replay).
2. Pin 1's refusal on pair and point counts will refuse valid snapshots whenever a body has moved since load.
3. The snapshot's sorted pair list is fine for hashing, but the solver's order is the colour order, which the list does not record.

**Contradicts a pin?** Yes:

- Pin 6's fallback (rebuild the broad phase from the colliders every step) leaks narrow-phase pairs and does not remove the history dependence.
- Pin 1's count check (§1).

Pin check: contradicts pin 6 of dispatch-t2-restore.md because a broad phase rebuilt from the colliders never emits DeletePair for pairs the narrow phase already holds (measured: a pair kept at 4.01 m) and starts from tight leaves where the running world has fat ones, rapier3d-f64-0.35.3/src/geometry/broad_phase_bvh/update.rs:441-601.

## 4. T2 restore — serde

**Answer.** With `serde-serialize` at 0.35.3, serialization of `PhysicsWorld` is byte-stable across runs and across the two targets tested. So is serialization of `RigidBodySet`, `ColliderSet`, `NarrowPhase`, `IslandManager` and `BroadPhaseBvh` separately. Measured:

- Two separate processes gave identical bytes for every part, in `serde_json` with `float_roundtrip` and in `bincode` 1.
- x86_64-pc-windows-msvc native and wasm32-unknown-unknown under node 22 (V8) gave identical bytes at 0, 20, 50 and 90 quanta.
- Deserialize then serialize gives identical bytes.
- A world deserialized mid-run continued bit-identically for 200–250 quanta at every save point tested (0 to 90 quanta), through landing, sleep transitions and CCD on a 40 m/s body.

The bytes include no allocator- or address-dependent data:

- Every hash map under enhanced-determinism is an `IndexMap`/`IndexSet` with `FxHasher32`, which has no random state.
- `BroadPhaseBvh::pairs` and `PersistentIslands::joint_link_locs` are serialized sorted by key, so they are canonical.
- `ImpulseJointSet`/`MultibodyJointSet` `to_wake_up`/`to_join` and parry's heightfield and composite workspaces (`sub_detectors`) are serialized in insertion order: deterministic, but history-dependent.
- parry's capacity-only serializers exist but are unused.
- `Vec` capacities, pointers and `Arc` identities are not serialized.

The bytes are **not canonical** in the strong sense. They encode the whole internal history (arena free lists, island ids, edge order, colours, `IndexMap` insertion order), so two worlds with the same physical state and different histories serialize differently. Stable, not canonical.

Limits:

- Version-locked: 0.36.0 cannot load 0.35.x snapshots.
- `serde_json` cannot encode composite-vs-composite workspaces, whose `(u32, u32)` map keys fail with "key must be a string"; bincode can. The engine's current shapes use `u32` keys.
- `serde_json::Value` without `preserve_order` re-sorts `IndexMap` keys. That was not result-bearing in a test, but it changes bytes.
- `NarrowPhase` holds `u128` colour masks that `Value` cannot hold without `arbitrary_precision`.
- `physics_pipeline` and `ccd_solver` are `serde(skip)`, and are workspace (measured).
- Not tested on ARM64 or Linux here; that is T3's lane.

**What I checked.**

- **Serialized types and skips.**
  - `src/pipeline/physics_world.rs:60-88` (https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/pipeline/physics_world.rs).
  - `src/pipeline/physics_pipeline/mod.rs:44-86` ("only workspace data").
  - `broad_phase_bvh/mod.rs:21-103, 156-168`.
  - `narrow_phase/mod.rs:324-405`.
  - `contact_pair.rs:208-256` (`solver_clusters_prev` skipped; used only with clustering, which the engine turns off).
  - `persistent.rs:127-168`, `manager.rs:28-51`.
  - `src/data/arena.rs:1-40` (arena serialized with its free list).
  - `src/utils/mod.rs:347-381` (sorted serializer).
  - `parry3d-f64-0.30.2/src/query/contact_manifolds/contact_manifolds_heightfield_shape.rs:16-32`.
  - Shapes are written by value through their typed form, so shared `Arc`s come back as separate copies; custom shapes cannot be deserialized (`parry3d-f64-0.30.2/src/shape/shared_shape.rs:695-713`).
  - Feature gate: oracle `The oracle links rapier3d-f64 as the engine does: PhysicsWorld is not Serialize` → compile_fail E0277.
- **Docs.**
  - https://rapier.rs/docs/user_guides/rust/serialization/: serialize the physics world as a whole; `PhysicsPipeline` and `CollisionPipeline` "don't hold any useful state"; with enhanced-determinism, "the exact same byte vectors" after the same number of timesteps. The page now documents 0.36.
  - https://docs.rs/rapier3d-f64/0.35.3/rapier3d_f64/pipeline/struct.PhysicsWorld.html (Serialize/Deserialize; `ccd_solver`: "Workspace only: not part of a snapshot").
  - 0.36.0 changelog: https://raw.githubusercontent.com/dimforge/rapier/master/CHANGELOG.md.
- **Workspace control.** Oracle `Cloning every set into a twin with a fresh pipeline and CCD solver continues bit-identically` → "twin first difference: None; dynamic bodies asleep at the end: 3".
- **Experiments** (`lab`, `labwasm`, `lab3`, `sz0`, `sz1`, `memimg`):
  - `q4.exe 90 200`, run twice: PhysicsWorld 120,690 bytes, FNV `f9e6a2eb42c880bb`, identical across runs. Round trip identical. "restored world vs uninterrupted over 200 more quanta: first difference None".
  - Save points 0, 1, 3, 7, 12, 20, 33, 50 and 75: none differ. With CCD on and a 40 m/s body (`CCD=1 FAST=1`): none differ at 0, 1, 2, 3, 5, 12 and 40 quanta; CCD was active for 4 quanta and no tunnelling occurred.
  - Native against wasm, per part, at 0/20/50/90 quanta: identical FNVs (for example n=90: world `f9e6a2eb42c880bb`, bodies `5ce6d122d7d53a13`, colliders `ac9e82da1913a8de`, narrow phase `4845b5c4bb7d98bb`, islands `04bbe79020d6962c`, broad phase `b19c12ec22216f1c`, engine-layout snapshot `57339140c4e9049a`). The wasm module imports nothing. The wasm restore also continues exactly.
  - bincode: identical bytes across two processes and between native and wasm (FNV>>1 `32cf8c62f5759a7a`, `8bc1c9b3b52cdc`, `27018d05887bab46` at 12/50/90).
  - Enabling the feature does not change results: the no-serde and serde wasm builds give identical snapshot hashes at 0/20/50/90/300 quanta.

**Consequence for T2.**

1. If restore from bytes is wanted (route (c)), serialize the whole `PhysicsWorld` in bincode on save. Keep the compact snapshot as the hashed record: after deserializing, `rebuild_snapshot` reproduces it, which makes a strong refusal check.
2. Do not re-run the load pass after deserializing.
3. Treat the blob as bound to rapier3d-f64 0.35.3 and to the law's insertion order. A Rapier bump invalidates stored T5 bundles.
4. Adding the feature moves the binary digest once but not the goldens.

**Contradicts a pin?** No, for pins 4 and 9: a serde restore meets pin 4's byte-exact round trip, and the feature changes the digest once without moving either golden. It does replace pin 1's input format; that is recorded in §1.

Pin check: consistent with the pin(s) — 4, 9.

---

Answers 5–8 — rapier3d-f64 0.35.3 (enhanced-determinism), rustc 1.98.1, wasm32-unknown-unknown, checked 2026-09-25.

Engine state checked: GitHub `main` at 4782a8a (after PR #42, the T4 amendment); `solver/` there is byte-identical to the local checkout apart from CRLF. Every binary number below comes from a scratch copy of `solver/` built on this rig with `build.mjs`'s exact `RUSTFLAGS` (`-C target-feature=-relaxed-simd` plus the three `--remap-path-prefix` flags). That copy reproduces both goldens (`fd2f6c03fb982d77`, `0d38671370d12d1e`) and passes all 73 tests. It is a Windows build, so its bytes differ from the pinned Linux artifact only in path strings. Scripts and binaries are in the lane's scratch directory (`…/scratchpad/q5-q8/`). Decoding used a scratch `wasmparser` 0.259 tool (`wscan`), and module execution used node 22.22.3 (V8). Rapier and parry line numbers are from the pinned registry sources, `rapier3d-f64-0.35.3/…` and `parry3d-f64-0.30.2/…`, which is the source docs.rs serves. Compile oracle on this lane: `python scripts/compile_oracle.py check waves/wave-03-si-rpg-engine/lanes/binary-and-limits.json` gives `19 checks over 10 recipes — 19 pass, 0 fail`.

## 5. T3 lint — memory

**Answer.** There are two stable linker arguments. Pass either through `-C link-arg=` to `rust-lld` (LLD 22.1.8):

- `--no-growable-memory` sets the maximum equal to the initial size that wasm-ld computes.
- `--initial-memory=N --max-memory=N` does the same with an explicit size. N must be a multiple of 65,536 and at least the static footprint wasm-ld reports. For the solver that footprint is 1,117,808 bytes: a 1 MiB stack placed first, about 53 KB of data, and the 15,872 bytes of `BODIES`/`COLLIDERS`/`HEIGHTS` statics. That makes the minimum 18 pages.

No `-Z` flag is needed. Neither argument removes the `memory.grow` instruction. std's wasm32 `System` allocator is dlmalloc 0.2.13, and its `alloc` calls `memory_grow`. The solver binary contains exactly one `memory.grow`, inside `<dlmalloc::sys::System as dlmalloc::Allocator>::alloc`, under every linker setting I tried. No other crate in the solver's graph calls `memory_grow`. When the maximum equals the initial size, that instruction returns −1 for any growth of one page or more, because growth past the maximum must fail. dlmalloc never asks for less. Running out of memory then becomes the same trap on every host. T3's lint as pinned still refuses the binary, though.

The fix for the instruction is a `#[global_allocator]` that never calls `memory_grow` and serves a fixed static arena. The smallest change keeps std's own algorithm: the public `dlmalloc` 0.2.13 crate's `Dlmalloc::new_with_allocator`, with an `Allocator` that hands out one static arena. I built and measured it: zero `memory.grow`, memory 532/532 pages with `--no-growable-memory`, both goldens and 73/73 tests unchanged.

Size of the heap:

- **Today's content** needs 21 pages in total: the product harness over 10,000 quanta. Each test file of the suite stays at 18–20.
- **Worlds at the buffer caps** need far more. Their need scales with contact manifolds, not with body count:
  - 49 pages: a settling pile of 64 boxes on a full heightfield.
  - 147 pages: 64 heavily overlapping boxes.
  - 3,320 pages: everything overlapping everything, including all 450 heightfield triangles.

So N is a policy bound, not a derived constant. Exceeding it traps the same way on every host.

**What I checked.**
- Sources:
  - LLD WebAssembly docs, https://lld.llvm.org/WebAssembly.html: `--initial-memory` defaults to the sum of stack, static data and heap; `--max-memory` defaults to unlimited; `--no-growable-memory` sets the maximum to the initial size.
  - rustc book codegen options, https://doc.rust-lang.org/stable/rustc/codegen-options/index.html: `-C link-arg` appends one argument to the linker invocation.
  - Cargo book build scripts, https://doc.rust-lang.org/cargo/reference/build-scripts.html: `cargo::rustc-link-arg-cdylib` passes `-C link-arg` for cdylib targets only.
  - std at the 1.98.1 tag, https://github.com/rust-lang/rust/blob/1.98.1/library/std/src/sys/alloc/wasm.rs: lines 11–17 name dlmalloc, 23–27 hold the `DLMALLOC` static, and 29–60 implement `GlobalAlloc for System`. `library/Cargo.lock` at 1.98.1 pins dlmalloc 0.2.13.
  - dlmalloc 0.2.13 `src/wasm.rs` (https://github.com/alexcrichton/dlmalloc-rs/blob/0.2.13/src/wasm.rs; also opened on docs.rs):
    - Lines 17–48 donate the linker's `[__heap_base, __heap_end)` once. The flag flips on the first request even when that request does not fit.
    - Lines 50–56 call `wasm::memory_grow(0, pages)` and return null on `usize::MAX`.
    - Lines 87–99 are `alloc`.
    - Lines 101–115: `remap`, `free_part` and `free` never release memory.
  - dlmalloc 0.2.13 API, https://docs.rs/dlmalloc/0.2.13/dlmalloc/struct.Dlmalloc.html and `trait.Allocator.html`: `Dlmalloc<A = System>`, `pub const fn new_with_allocator(sys_allocator: A)`, and `unsafe trait Allocator`.
  - `core::arch::wasm32::memory_grow`, https://doc.rust-lang.org/stable/core/arch/wasm32/fn.memory_grow.html: returns `usize::MAX` on failure.
  - WebAssembly 3.0 spec, Growing memories (https://webassembly.github.io/spec/core/exec/modules.html): growth fails when it would exceed the maximum. The profiles appendix (https://webassembly.github.io/spec/core/appendix/profiles.html) says `memory.grow` stays technically non-deterministic even in the deterministic profile.
  - Wasmtime deterministic execution, https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html: growth may succeed or fail non-deterministically. It recommends a validator that rejects growth instructions or memories that are not fixed-size.
  - `std::alloc` `#[global_allocator]`, https://doc.rust-lang.org/stable/std/alloc/index.html.
- Measured on the copy:
  - **Baseline** (`cargo +1.98.1 build --release --target wasm32-unknown-unknown` with build.mjs's RUSTFLAGS, then `wscan si_solver.wasm`):
    ```
    memory: initial=18 pages (1179648 bytes) maximum=None
    memory.grow instructions: 1
      memory.grow in func 1123 …: _RNvXs_NtCsi6WBrLFLuLB_8dlmalloc3sysNtB4_6SystemNtB6_9Allocator5alloc
    ```
    `cargo rustc … -- --print link-args` shows `-z stack-size=1048576 --stack-first … libdlmalloc.rlib … --gc-sections -O3` and no memory limit.
  - **Link variants** (`cargo +1.98.1 rustc --release --target wasm32-unknown-unknown -- -C link-arg=…`):
    - `--no-growable-memory` → 18/18 pages, `memory.grow` still 1.
    - `--initial-memory=4194304 --max-memory=4194304` → 64/64, still 1.
    - `--initial-memory=10485760 --no-growable-memory` → 160/160, still 1.
    - Errors, verbatim:
      - `rust-lld: error: initial memory must be aligned to the page size (65536 bytes)`
      - `rust-lld: error: initial memory too small, 1117808 bytes needed`
      - `rust-lld: error: maximum memory too small, 4194304 bytes needed`
  - **Runtime** (`node drive.mjs <wasm> <scene> 600` loads through `solver_load`, steps through `solver_step`, and reads `memory.buffer.byteLength`):

    | scene | pages after load | peak pages | snapshot bytes |
    |---|---|---|---|
    | pile | 25 | 49 | 49,848 |
    | dense | 61 | 147 | 213,560 |
    | crush | 1,129 | 3,320 | 6,480,000 |

    The product harness goes from 18 to 21 pages, with a 1,840-byte snapshot.
  - **Fixed memory with std's allocator**:
    - `--no-growable-memory` alone (18 fixed pages): both scenes trap with `RuntimeError: unreachable`, `harness/sim.mjs` prints `NAN`, and 32 of 73 tests fail.
    - 64 fixed pages: the goldens match and all 73 tests pass. The pile scene's every-quantum snapshot hash `33dde869dc037425` equals the growable build's. The dense scene traps.
  - **Allocator swap** (`var/dlarena`: dlmalloc 0.2.13 over a 32 MiB static arena, plus `--no-growable-memory`):
    - 532/532 pages, `memory.grow instructions: 0`.
    - `node harness/check.js` prints both goldens and `node --test …` passes 73/73.
    - pile and dense snapshot hashes are identical to the growable build (`33dde869dc037425`, `854795be09b370f3`), and crush traps.
    - It adds only `dlmalloc 0.2.13` and `cfg-if 1.0.5` to the wasm32 graph.
    - A hand-written size-class arena gave the same results (530/530 pages, 0 grows); the whole suite used at most 288,768 bytes of that arena.
  - **Link args from `build.rs`**: a `build.rs` printing `cargo::rustc-link-arg-cdylib=--no-growable-memory`, built with `RUSTFLAGS` set, still produced 18/18. So a build-script link arg survives `build.mjs`'s `RUSTFLAGS` override.
  - **Graph grep** over the cached sources of every crate in `cargo tree --target wasm32-unknown-unknown -e normal`: no `memory_grow` anywhere.
- Oracle (lane `binary-and-limits`, all PASS):
  - `grow()` returns 16 without a flag, −1 under `--no-growable-memory`, and 64 pages / −1 under equal initial and max of 4,194,304.
  - A misaligned `--initial-memory=4000000` fails with the page-size error.
  - std's allocator grows 65 pages for a 4 MiB `Vec` and keeps its pages after `drop`.
  - A fixed-arena `#[global_allocator]` grows 0.

**Consequence for T3.**
- **Make growth impossible and remove the instruction.**
  - Add a `#[global_allocator]` in `solver/src/lib.rs`: `dlmalloc::Dlmalloc::new_with_allocator(FixedArena)`, where `FixedArena::alloc` hands out one `static` zero-initialised arena once and returns `(null, 0, 0)` after that. Add `dlmalloc = "=0.2.13"` to `solver/Cargo.toml`.
  - Link with `--no-growable-memory`. wasm-ld then sets initial = maximum = stack + data + arena, rounded to pages.
  - Put the link argument in a `solver/build.rs` as `cargo::rustc-link-arg-cdylib=--no-growable-memory`, where `build.mjs`'s `RUSTFLAGS` cannot drop it. The alternative is to repeat `-C link-arg=--no-growable-memory` in both `.cargo/config.toml` and `build.mjs`, as the relaxed-SIMD pin already does.
- **Size the arena.** Under today's law, a 32 MiB arena (532 pages) passes the goldens, the suite and both 64-body scenes. The dense scene's dlmalloc heap peaked at about 8.5 MB there. Under PR #44's per-quantum rebuild, the same scene needs 245 pages in total (see the audit below). So fix the memory at 512 pages (32 MiB) and record N in `FLAGS.md`. The digest moves once and the goldens do not (measured).
- **Lint the memory section.** The lint reads the limits of the defined memory and of any imported memory. Flags 0x00 and 0x04 (no maximum) are refused. For 0x01 and 0x05 it compares max with min.
- **Measuring N later.** For any new world, the high-water mark is `memory.buffer.byteLength` after the run: dlmalloc never releases memory and wasm memory never shrinks.

**Audit of PR #44 (head b99a636), claims 1 and 2.** I rebuilt the PR's `solver/` with its own flags, `-C target-feature=-relaxed-simd -C link-arg=--initial-memory=16777216 -C link-arg=--max-memory=16777216`, and decoded the output.

- **Claim 1: agree.** The old binary declares `initial=18 pages, maximum=None`, and std's allocator contributes exactly one `memory.grow`. The PR's own `lint.mjs`, run on my baseline, reports that instruction at byte 1,248,211 in function body 1123. My decoder found it at the same place (`0x130bd3`).
- **Claim 2, the instruction: agree.** Memory is 256/256 pages and the module has **no** `memory.grow` instruction: wasmparser reports `memory.grow instructions: 0`, plus one `memory.size`, which `Arena::alloc` uses to find the end of memory. The PR's lint prints `lint clean: memory 256/256 pages, 1228 function bodies, 598036 instructions, 0 SIMD, no relaxed SIMD, no memory.grow`. The instruction is gone, not merely failing at run time, for three reasons:
  - the `#[global_allocator]` replaces std's `System`, so `--gc-sections` drops std's dlmalloc;
  - the crate's `Dlmalloc<Arena>` never instantiates its own grow-backed `System`;
  - this matches my own dlmalloc-arena build.
- **Claim 2, the headroom: disagree.** 256 pages is not enough headroom at peak under the PR's law. The PR's `build.mjs` says the old growable build "peaked at 71 pages" at capacity with a resting pile. But a limit on bodies is not a limit on contacts. The PR's law also rebuilds the Rapier world every quantum, which raised every peak I measured. I built the same law growable (the PR's `solver/` with its `mod arena` removed) and ran my scenes:

  | scene | old law, peak pages | PR's law, peak pages | fixed 256-page build |
  |---|---|---|---|
  | static footprint | 18 | 22 (the 256 KiB `RESTORE` buffer) | — |
  | pile | 49 | 53 | runs 2,000 quanta |
  | dense | 147 | 245 | runs 2,000 quanta, 11 pages under the limit (about 4%) |
  | crush | 3,320 | 3,973 | traps with `RuntimeError: unreachable` |

  Snapshots under the PR's law reach 37,952 bytes on pile and 211,880 on dense, which is 81% of the PR's 262,144-byte `RESTORE_CAP`. Crush reaches 6,480,000 bytes, so `solver_restore` would refuse it.
- **Recommendation.**
  - Use 512 pages (32 MiB), about 2× the dense peak.
  - Add a test that runs a contact-dense scene at the caps and asserts it completes. A law change that raises the peak then fails in CI instead of trapping in the field.
  - State in `FLAGS.md` that a world denser than the bound traps, the same way on every host. No fixed size covers every world the caps admit.
- **Pin 8.** In my builds the allocator swap and fixed memory alone keep the golden at `fd2f6c03fb982d77`. The PR's new golden `7f7040de58e74e86` therefore comes from its other law changes. This is an inference: I did not run the PR's harness.

**Contradicts a pin?** Yes, pin 2. It says the build fixes the memory "with the linker's initial and maximum memory arguments". Those arguments fix the limits, but std's allocator still contains a `memory.grow`, and pin 2's own lint refuses any `memory.grow`. So pin 2 needs the allocator swap, or a narrower lint that refuses only growable memories. The narrower lint is also deterministic: with max = initial, every growth by one page or more must fail. Pin 8 holds: the goldens did not move under either fixed-memory build.

Pin check: contradicts pin 2 of dispatch-t3-platforms.md because the linker's initial/maximum arguments leave std's allocator's memory.grow in the binary (one instance, measured) and the lint refuses the instruction, dlmalloc-0.2.13/src/wasm.rs:50-56.

## 6. T3 lint — opcodes

**Answer.**

- **Relaxed SIMD.** Each instruction is the `0xFD` prefix followed by its opcode as a u32 LEB128. The opcodes run from 256 to 275: 0x100 is `i8x16.relaxed_swizzle` and 0x113 is `i32x4.relaxed_dot_i8x16_i7x16_add_s`; 0x114–0x12F are reserved. The canonical encodings are the three bytes `fd 80 02` through `fd 93 02`.
- **memory.grow** is `0x40` followed by a memidx, which is also a u32 LEB128. The canonical encoding is `40 00`.
- **A byte scan is unsafe in both directions.**
  - False positives: 0x40 is also the empty block type, and both bytes appear inside LEB128 immediates.
    - The pinned binary's code section has 16,558 bytes equal to 0x40 against one `memory.grow` and 14,916 blocks with the empty type.
    - It has 277 bytes equal to 0xFD against zero SIMD instructions.
    - `i32.const 32893` encodes as `41 fd 80 02`.
  - False negatives: the spec allows padded LEB128. `fd 80 82 80 80 00` is a valid relaxed swizzle that both V8 and wasmparser accept, and a `fd 80 02` pattern misses it. Likewise `40 80 00` is a valid `memory.grow`.
- **The minimal sound lint is an instruction-length decoder.**
  1. Walk the sections by id and u32 size.
  2. Decode the memory section and the limits of imported memories.
  3. In the code section, skip each body's locals, then decode every instruction together with its immediates. Read 0xFC and 0xFD sub-opcodes as u32 LEB128 with any padding.
  4. Refuse ("fail closed") on any opcode the table does not know.
- **`-C target-feature=-relaxed-simd` alone does not guarantee none.**
  - Under that flag, a function-level `#[target_feature(enable = "relaxed-simd")]` still emits `f32x4.relaxed_madd`, and so does a plain call to the `core::arch::wasm32` intrinsic, which carries the attribute itself (measured). On Wasm neither needs `unsafe`.
  - The flag also cannot reach the precompiled std.
  - For the solver today, two crates in the graph carry relaxed-SIMD code: matrixmultiply 0.3.11 (`f32x4_relaxed_madd`) and wide 1.7.1 (`u8x16_relaxed_swizzle`). Both sit only under `#[cfg(target_feature = "relaxed-simd")]`, which the crate-level flag keeps false. Nothing uses a function-level enable or an ungated relaxed call, and the binary has zero 0xFD instructions. So the flag holds today, and it is what keeps those gated paths out. The lint is what guarantees it.

**What I checked.**
- Sources:
  - WebAssembly 3.0 (2026-09-21), binary instructions (https://webassembly.github.io/spec/core/binary/instructions.html):
    - `memory.grow` is `0x40 x:memidx` and `memory.size` is `0x3F x:memidx`.
    - Block type byte `0x40` is the empty type.
    - Vector instructions are `0xFD` plus a u32 opcode.
    - `memarg` bit 6 carries a memidx.
  - WebAssembly 3.0 values (https://webassembly.github.io/spec/core/binary/values.html): a uN takes at most ceil(N/7) bytes and trailing zeros are allowed. The spec's example: `0x03` and `0x83 0x00` both encode 3.
  - WebAssembly 3.0 types (https://webassembly.github.io/spec/core/binary/types.html): limits flags are 0x00 (min), 0x01 (min, max), 0x04 and 0x05 (the same pair for i64 address type).
  - Relaxed-SIMD overview (https://github.com/WebAssembly/relaxed-simd/blob/main/proposals/relaxed-simd/Overview.md): the table from 0x100 to 0x113, with 0x114–0x12F reserved. `relaxed_madd` may round once or twice, host-dependently. The instruction index of the spec itself was cut off at SIMD when I fetched it, so the proposal is the source for the number list.
  - rustc book, wasm32-unknown-unknown (https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html): the default features, and the precompiled std is built with them. Once a function enables SIMD with `#[target_feature(enable = …)]`, there is "no compiler flag to disable emission of SIMD instructions".
  - Rust Reference, codegen attributes (https://doc.rust-lang.org/stable/reference/attributes/codegen.html): safe `#[target_feature]` functions "may always be used in safe contexts on Wasm platforms", and `relaxed-simd` implicitly enables `simd128`.
  - `core::arch::wasm32::f32x4_relaxed_madd` (https://doc.rust-lang.org/stable/core/arch/wasm32/fn.f32x4_relaxed_madd.html): stable since 1.82.0.
  - wasmparser 0.259.0 `OperatorsReader` (https://docs.rs/wasmparser/0.259.0/wasmparser/struct.OperatorsReader.html).
  - WebAssembly design, Nondeterminism.md (https://github.com/WebAssembly/design/blob/main/Nondeterminism.md): relaxed SIMD results are nondeterministic.
- Measured, pinned-binary copy (`wscan`): 1,204 functions and 583,702 decoded operators:
  ```
  SIMD (0xfd-prefixed) instructions: 0
  block/loop/if with empty blocktype …: 14916
  naive scan of code section: bytes==0x40: 16558, bytes==0xfd: 277
  ```
  Its `target_features` section lists only `+bulk-memory +bulk-memory-opt +call-indirect-overlong +multivalue +mutable-globals +nontrapping-fptoint +reference-types +sign-ext`.
- Measured, hand-assembled modules (`node mods.mjs`, which runs `WebAssembly.validate` and executes each module, then `wscan` on each):
  - `i32.const 32893` (`41 fd 80 02`), `i32.const -64` (`41 40`), an empty block (`02 40`) and data bytes all validate. The decoder reports 0 `memory.grow` and 0 relaxed instructions for each.
  - `fd 80 82 80 80 00`: V8 validates it and runs it (`f()=1`); wasmparser decodes it as `I8x16RelaxedSwizzle`.
  - `40 80 00`: V8 validates it; wasmparser decodes it as `MemoryGrow { mem: 0 }`.
  - `fd 94 02`: V8 reports `validate=false`; wasmparser reports `unknown 0xfd subopcode: 0x114`.
- Measured, the `-relaxed-simd` flag (`rustc +1.98.1 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 -C target-feature=-relaxed-simd`):
  - A `#[target_feature(enable = "relaxed-simd")] fn` compiled under the flag, and so did a direct `f32x4_relaxed_madd` call from a plain function.
  - Each binary: `relaxed-SIMD instructions: {"F32x4RelaxedMadd": 1}`, bytes `fd 85 02`, and a `target_features` section with `+relaxed-simd +simd128`. node returns `madd(2,3,1)=7`.
- Graph grep over the wasm32 dependency tree:
  - `#[target_feature(enable=…)]` appears only in matrixmultiply 0.3.11, for `avx`/`avx2`/`avx512f`/`fma`/`neon` kernels (x86 and aarch64).
  - Every wasm SIMD path is under `#[cfg(target_feature = "simd128")]`: glam 0.33.10 `lib.rs:347-350`, wide 1.7.1 `f64x2_.rs:14`, and matrixmultiply `sgemm_kernel.rs:38,72,260`.
  - Relaxed intrinsics appear in exactly two places, both behind `#[cfg(target_feature = "relaxed-simd")]`:
    - matrixmultiply 0.3.11 `src/sgemm_kernel.rs:701-713`: `muladd` becomes `f32x4_relaxed_madd`, otherwise `f32x4_add(f32x4_mul(..))`.
    - wide 1.7.1 `src/u8x16_.rs:707-712`: `shuffle` becomes `u8x16_relaxed_swizzle`.
    Every other "relaxed" hit is `Ordering::Relaxed`, a deprecated `swizzle_relaxed` that forwards to `shuffle`, or documentation. My first grep was cut off by `head -20` and missed wide; the full grep is the one reported here.
- Oracle (PASS):
  - A body with `02 40`, `41 40` and `41 fd 80 02` byte-matches `0x40 x2 | fd 80 02 x1`, but decodes to `memory.grow x0 | relaxed x0`.
  - Eight encodings decode as stated: `40 00`, `40 80 00`, `fd 80 02`, `fd 80 82 80 80 00`, `fd 85 02`, `fd 87 02`, `fd 93 02`, and `fd 94 02` (an error). 0x100..=0x113 decode as relaxed 20/20.
  - Both relaxed builds compile under `-C target-feature=-relaxed-simd` without a warning and return `7`.

**Consequence for T3.**
- **Decoder.** `solver/lint.mjs` needs a small decoder with a complete opcode-immediate table; it does not need a validator. Walk the sections, skip locals, and decode each instruction.
  - Flag `0x40` only at an opcode position, then read a u32 LEB128 memidx.
  - Flag `0xFD` at an opcode position when the u32 LEB128 that follows is between 256 and 275 inclusive. It may be padded up to 5 bytes.
  - Exit 1 on any opcode the table lacks, so a gap in the table can only cause a false refusal.
- **Memory limits.** Refuse when the maximum is absent, or when max ≠ min, in the memory section and in any imported memory.
- **`lint.test.js` (pin 3).** Beyond the three bad modules and the clean one, add these:
  - Accepted, to prove it decodes rather than byte-scans: `i32.const 32893`, `i32.const -64`, an empty `block`, and data bytes `40 fd 80 02`.
  - Refused, to prove it reads LEB128: the padded `fd 80 82 80 80 00` and `40 80 00`.
- **Flags.** Keep `-relaxed-simd` in both flag locations. It is what keeps matrixmultiply's and wide's cfg-gated relaxed paths out if `simd128`, or a CPU level that implies relaxed SIMD, is ever enabled.
- **Signal.** The `target_features` custom section (`+relaxed-simd` / `+simd128`) is a cheap extra signal, but not the check, because custom sections are optional.

**Audit of PR #44 (head b99a636), claim 3: agree.** The PR's `solver/lint.mjs` really decodes:

- It walks the sections and skips each body's locals.
- It decodes every instruction. It reads the memidx after `0x40`, and the `0xFD` and `0xFC` sub-opcodes, as u32 LEB128 of up to 5 bytes.
- It refuses unknown single-byte opcodes and `0xFD` sub-opcodes above 0x113.
- It checks the limits of both defined and imported memories, and refuses any limits flag other than 0x00 or 0x01.

I ran it (`lintWasm`) on my hand-assembled modules:

- Accepted, with no opcode reason: the empty block, `i32.const -64`, `i32.const 32893` and the data bytes.
- Refused, each with the right opcode: canonical relaxed (0x100), padded relaxed (`fd 80 82 80 80 00`), 0x113, `40 00` and `40 80 00`. 0x114 is refused as undecodable. Both rustc-built relaxed modules are refused (`0xfd 0x105`).
- Passed: my two arena builds.

Three gaps, none of which affects rustc output:

1. A `0xFD` sub-opcode below 0x100 that its table does not list is treated as having no immediates instead of being refused. This contradicts its header ("an opcode this decoder does not know is itself a refusal").
2. `table.grow` (`0xFC 15`) is not refused. The profiles appendix and Wasmtime name it alongside `memory.grow` as non-deterministic.
3. `select t*` and reference block types assume one-byte value types.

Its `lint.test.js` already covers the empty-block and `i32.const -64` case and all twenty relaxed opcodes. Add three more cases: `i32.const 32893` (`41 fd 80 02`), the padded `fd 80 82 80 80 00`, and `40 80 00`.

**Contradicts a pin?** No. Pin 2's range, `0xfd` with 0x100 through 0x113, matches the proposal's table, and pin 2 already says the lint "parses" the binary. The byte-scan shortcut from the question is what fails, not a pin.

Pin check: consistent with the pin(s) — 2, 3 of dispatch-t3-platforms.md.

## 7. T4 outcome tests — CCD

**Answer.** CCD is deterministic in every measurement I could make, and it adds no state. But T4's premise is wrong.

**Automatic CCD.** At 0.35.3, CCD is not opt-in. A dynamic body is "fast" when its farthest point moves more than half its thinnest half-extent in one quantum. For T4's 0.05 box at dt = 1/64, that means any speed above 1.6 u/s. Every fast body is swept against fixed colliders, and its end pose is clamped to the first time of impact.

- `ccd_enabled(true)` only widens the targets to kinematic and dynamic bodies: the body becomes a "bullet", and bullets never sweep other bullets.
- `IntegrationParameters::max_ccd_substeps = 0` is the only off switch.

So the law as it stands already keeps T4's box on the near side: 14 of 14 start phases on the engine binary, falling and horizontal. With CCD switched off world-wide, 10 of 14 tunnel. `ccd_enabled(true)` changes nothing against a static slab.

**Determinism.** With `parallel` off, the CCD pass is serial. It walks bodies and targets in arena/BVH order and takes a strict minimum.

- I built a scene of 24 fast, spinning boxes; CCD is active in 2,076 body-quanta, or 2,019 with half of them bullets. It hashes identically on x86-64 release, on x86-64 debug (the oracle), and on wasm32 under V8, and across reruns.
- ARM64 is not determined. T3's ARM lane decides it.

**State.** At the default `max_ccd_substeps = 1`, nothing specific to CCD crosses a quantum.

- The per-body flags and velocities are rewritten after the solve, before they are read.
- The `CCDSolver` holds only a rebuildable cache of fixed targets, which is not serialized.
- The clamp writes the next pose, and the snapshot already records it.
- Swapping in a fresh `CCDSolver` mid-run leaves the hash identical.
- With `max_ccd_substeps > 1`, the pre-solve pass would read the previous quantum's crate-private `ccd_vels`, which a restore cannot set.

**Guarantee.** Rapier states no numeric bound. Measured at dt = 1/64 with 8 phases per cell, nothing tunnelled at speeds from 1 to 1,000 u/s against fixed slabs of half-thickness 0.02 down to 0.0001, with or without `ccd_enabled`. Rapier caps speed at 400 u/s per substep. The source sets four limits:

- a body that already overlaps a target is not clamped;
- non-bullets ignore moving bodies;
- bullets ignore bullets;
- heightfield targets are one-sided.

**What I checked.**
- Sources, rapier3d-f64 0.35.3 (https://docs.rs/crate/rapier3d-f64/0.35.3/source/…):
  - `src/dynamics/ccd/ccd_solver.rs`:
    - 17–25: the doc. Fast dynamic bodies sweep **fixed** colliders; `ccd_enabled` makes a bullet; `max_ccd_substeps = 0` disables CCD.
    - 26–34: `fixed_targets_cache`, under `serde(skip)`.
    - 61–63: "`ccd_enabled` no longer gates *activation*".
    - 328–340: the clamp moves the pose only, and velocities are preserved.
  - `src/dynamics/ccd/sweeps.rs`:
    - 28–42: `is_bullet` and `tier_allows`.
    - 282–283 and 417–419: solid pairs stop only at fractions strictly above 0.
    - 377–384: heightfields are one-sided in 3D.
    - 682–688: the serial map when `parallel` is off.
  - `src/dynamics/rigid_body_components.rs`:
    - 1050–1071: `RigidBodyCcd`. `ccd_active` is set "regardless of `self.ccd_enabled`".
    - 1102–1125: `is_moving_fast` and `FAST_BODY_SAFETY_FACTOR = 0.5`.
  - `src/dynamics/integration_parameters.rs`: 267–271 and 397, `max_ccd_substeps` defaults to 1 and 0 disables all CCD; 390, 395 and 396 give 0.005, 0.02 and 400.
  - `src/pipeline/physics_pipeline/substep.rs`:
    - 339: `ccd_scene_changed`.
    - 405–427: the pre-solve pass runs only when `remaining_substeps > 1`.
    - 496: the post-solve flags.
  - `src/dynamics/solver/staged_island_solver/worker.rs` 844–862: `ccd_vels` and `ccd_active` are written after the solve.
  - `src/pipeline/physics_world.rs` 85–87: `ccd_solver` is "Workspace only: not part of a snapshot".
  - `src/dynamics/rigid_body.rs` 1900–1904: the `ccd_enabled` builder doc.
  - parry3d-f64 0.30.2 `src/shape/shape.rs` 764–766: a cuboid's `ccd_thickness` is `half_extents.min_element()`.
- Other sources:
  - Rapier CHANGELOG at v0.35.3 (https://github.com/dimforge/rapier/blob/v0.35.3/CHANGELOG.md): "Fast dynamic bodies now always run CCD against fixed colliders; `ccd_enabled` upgrades a body to a 'bullet'…" (0.35.0), and "Set `IntegrationParameters::max_ccd_substeps` to `0` to disable CCD entirely."
  - Rapier determinism guide (https://rapier.rs/docs/user_guides/rust/determinism): cross-platform determinism requires IEEE 754-2008 platforms.
- Measured with the engine's own exports (`node drive_fast.mjs <wasm>`). A 0.05 box at 20 u/s against a 0.02 slab, 64 quanta, 7 start phases per direction:

  | build | falling | horizontal |
  |---|---|---|
  | base | all near, rests at y 0.0699 | all near |
  | `ccdoff` (adds `max_ccd_substeps = 0` in `build_world`) | FAR 5/7, e.g. 1.05 → −22.97 | FAR 5/7 |
  | `ccdon` (dynamic bodies `ccd_enabled(true)`) | identical to base | identical to base |

- Envelope (`ccd_matrix.rs` through the oracle, 96 quanta):
  - Engine settings: FAR 0/8 for v ∈ {1, 1.6, 2, 5, 20, 100, 400, 1000} and half-thickness ∈ {0.02, 0.005, 0.001, 0.0001}.
  - CCD off world-wide: FAR 1/8 from 5 u/s on thin slabs, 6/8 at 20, 7/8 at 100 and above.
  - Starting 0.01 inside the slab at 20 u/s: ends at 0.0699, near side.
- Cross-build hash (`ccdprobe`, 240 quanta), printed by the release host binary, by `node` on the wasm32 build, and by the oracle's debug build:
  ```
  bullets=false hash=3eb23b3feb5785fc ccd-active body-quanta=2076 fresh CCDSolver at q100 -> identical
  bullets=true hash=bfe836cfd760e133 ccd-active body-quanta=2019 fresh CCDSolver at q100 -> identical
  ```
- Oracle (PASS):
  ```
  CCD off world-wide (max_ccd_substeps 0): near FAR FAR FAR FAR FAR near
  engine today (ccd_enabled false, substeps 1): near near near near near near near
  T4 pin 2 (ccd_enabled true, substeps 1): near near near near near near near
  ```
  The two hash lines above also pass as an oracle check.

**Consequence for T4.**
- **Fast-body test.** It passes on today's binary. It can go red only with CCD off: `integration_parameters.max_ccd_substeps = 0` in a test-only build or a law flag. For the "shown failing" evidence, use that build: 5 of 7 phases tunnel.
- **Where `ccd_enabled(true)` matters.** Against the kinematic walker, which non-bullets ignore. Since every dynamic body becomes a bullet and bullets skip bullets, dynamic–dynamic sweeps are still not added.
- **Goldens.** They move only if some fast dynamic body meets the walker.
- **Settings.** Keep `max_ccd_substeps = 1` and set it explicitly in `build_world`. If it is ever raised, T2's restore would need the crate-private `ccd_vels`.
- **What the snapshot must carry.** Nothing new. On restore, set `ccd_enabled` from the law, as the builder already does.
- **PR #44's per-quantum rebuild.** PR #44 builds a fresh Rapier world from the snapshot every quantum. That loses no CCD state: a fresh `CCDSolver` mid-run left the hash identical, and at `max_ccd_substeps = 1` the per-body CCD fields are rewritten before they are read.

**Contradicts a pin?** Yes, pin 2 of T4 and the acceptance line. The pin says "At 1/64 s that body moves 0.31 per quantum, so the law as it stands passes through". It does not: automatic CCD against fixed colliders is on at 0.35.3. So "the fast-body test is shown failing on the binary before pin 2" cannot be produced from that binary.

Pin check: contradicts pin 2 of dispatch-t4-outcome-tests.md because rapier3d-f64 0.35.3 already sweeps every fast dynamic body against fixed colliders with ccd_enabled(false), so today's law keeps the box on the near side (14/14 engine runs), rapier3d-f64-0.35.3/src/dynamics/ccd/ccd_solver.rs:17-25.

## 8. T4 outcome tests — the character controller

**Answer.** The exact comparisons at 0.35.3 are grouped below, with what the engine binary does at each limit. All measurements use the product walker, a 0.25 box.

**Autostep.**

- It runs only when the hit is a "wall": the angle between the surface normal and up is at least `max_slope_climb_angle`, an inclusive `>=`.
- With `include_dynamic_bodies = false`, it never steps onto a collider whose parent body is dynamic. Dynamic bodies are also excluded from the step's own casts.
- Its limits are `max_height + offset` and `min_width + offset`: 0.31 and 0.21 for the engine. Shape casts that stop at `offset` check them:
  1. the character must fit when raised by `max_height + offset`;
  2. it must then fit moved forward by `min_width + offset`;
  3. the landing must not be steeper than the climb angle, a strict `>`.

Measured, steps up to 0.31010 are climbed at both 0.4 and 2 u/s. 0.31 is climbed and 0.311 is not. The feet always rest 0.0100–0.0101 above the surface, never on it.

**Slopes.**

- `is_wall` uses `>=`.
- `is_nonslip_slope` compares against `min_slope_slide_angle` with an inclusive `<=`.
- 44° and 44.9° are climbed; 45.1° through 52° are refused.
- Exactly 45° creeps upward: 0.17 in 160 quanta. Do not test at the limit.
- A refused 46° slope still gains height from the 1e-4 normal nudge: about 6e-5 per quantum at 2 u/s, 0.038 by 640 quanta and 0.077 by 1,280.

**Snap.**

- It applies only when the walker was grounded at the start of the move, meaning it had a contact within `offset + 0.05` whose normal·up ≥ 1e-3.
- The resulting translation must not be upward: `translation·up <= 0`.
- It then casts down by `snap`, with `offset` as the target distance.
- At a ledge, at 0.4 and 2 u/s, the walker is ungrounded for one quantum and a 0.19 drop lands on the lower floor two quanta after clearing the edge. At 1 u/s the 0.18 and 0.19 drops show no ungrounded quantum, and 0.19 lands one quantum after the edge.
- The fall threshold depends on speed: 0.2105 at 0.4 u/s, 0.2097 at 1 u/s, 0.2058 at 2 u/s. So a 0.21 drop is snapped at the product walker's 0.4 u/s.

**Start inside geometry.** A walker started 0.1 inside the floor rises only by the nudge, 1e-4 per quantum; its feet reach the floor after about 1,200 quanta. Rapier depenetrates only when the desired movement is zero, and the engine always passes gravity.

**What I checked.**
- Sources, `rapier3d-f64-0.35.3/src/control/character_controller.rs` (https://docs.rs/crate/rapier3d-f64/0.35.3/source/src/control/character_controller.rs):

  | lines | what they hold |
  |---|---|
  | 176–221 | fields and `Default` |
  | 313–324 | depenetrate "only when there is no desired movement" |
  | 328–336 and 442–451 | snap runs only if grounded at the start |
  | 466 | `result.translation.dot(self.up) <= 0.0` |
  | 469–479 | down cast with `max_time_of_impact: snap_distance` and `target_distance: offset` |
  | 491–493 | `predict_ground` = offset + 0.05 |
  | 612 | `normal.dot(self.up) >= 1.0e-3` |
  | 646–658 | slope handling, nudge added along the hit normal |
  | 673 | `is_wall = angle_with_floor >= self.max_slope_climb_angle && !is_ceiling` |
  | 674 | `is_nonslip_slope = angle_with_floor <= self.min_slope_slide_angle` |
  | 736–739 | autostep only on walls |
  | 742–743 | `min_width = … + offset`, `max_height = … + offset` |
  | 745–759 | `include_dynamic_bodies` |
  | 772–806 | up and forward casts |
  | 836 | `climbing && angle_with_floor > self.max_slope_climb_angle` |
  | 842–859 | step height |

- Other sources:
  - docs.rs `KinematicCharacterController` (https://docs.rs/rapier3d-f64/0.35.3/rapier3d_f64/control/struct.KinematicCharacterController.html): `offset` is "a small gap to preserve", and `normal_nudge_factor` is "a small distance applied to the movement toward the contact normals".
  - docs.rs `CharacterAutostep` (https://docs.rs/rapier3d-f64/0.35.3/rapier3d_f64/control/struct.CharacterAutostep.html).
  - Rapier CHANGELOG at v0.35.3: snap-to-ground "now triggers on any movement that isn't upwards".
- Measured, through the engine's own exports. The walker has `DRIVEN` = 1 and shape 0 and starts at y 0.26 on a floor whose top is 0.
  - **Steps** (`node drive_course.mjs <wasm> step`): the bisection prints `climbed at 0.3100989` at 0.4 u/s and `0.3100939` at 2 u/s. The stopped walker ends at x 10.7399, with its face 0.0101 short of the riser.
  - **Slopes** (`node drive_course.mjs <wasm> slope` and `node creep.mjs <wasm>`): the ramp is a 1.4-half-length rotated cuboid whose top face starts at floor level.
    - 44°: gain 1.945 at 2 u/s, reaching the top.
    - 45°: 0.169 after 160 quanta.
    - 46° at 2 u/s: q320 0.018, q640 0.038, q1280 0.077, q10000 0.611. At 0.4 u/s: q1280 0.042, q2560 0.088.
  - **Drops** (`node trace_drop.mjs`, `node drop2.mjs`): at 0.4 and 2 u/s, the quantum that clears the edge shows feet 0.0101 and vy −0.125 for every drop. Longest ungrounded runs:

    | drop | 0.4 u/s | 1 u/s | 2 u/s |
    |---|---|---|---|
    | 0.18 | 1 | 0 | 1 |
    | 0.19 | 1 | 0 | 1 |
    | 0.21 | 1 | 11 | 12 |
    | 0.22 | 12 | 12 | 12 |
    | 0.23 | 12 | 12 | 12 |

    Bisected thresholds: 0.210538, 0.209666 and 0.205759.
  - **Start inside by 0.1**: feet −0.0936 at q64, −0.0360 at q640, +0.0101 at q1280. The minimum is −0.0999, never below the start.
  - **Mechanism** (the `nudge0` build, with `normal_nudge_factor` set to 0): the creep is 0 at 45.1°, 46° and 50°, and the start-inside walker stays at −0.1000. With the nudge at 0, the walker also sticks: it climbs nothing. So the nudge is the cause, and it is needed.
- Oracle (PASS). A native copy of `integrate()` for one walker, run on the oracle's Rapier, reproduces the wasm numbers:
  ```
  step 0.31 at 2 u/s: climbed, feet 0.0100 above the step top
  step 0.311 at 2 u/s: stopped, feet 0.0100 above the floor
  44 deg … max gain 1.954 | 45 deg … 0.341 | 46 deg, 320 quanta … 0.018 | 46 deg, 1280 quanta … 0.077
  drop 0.21 at 0.4 u/s: longest ungrounded run 1 quanta | drop 0.21 at 2 u/s: … 12 quanta | drop 0.22 at 0.4 u/s: … 12 quanta
  start 0.1 inside, vx 0.4: feet q64 -0.0936, q640 -0.0360, q1280 0.0101
  ```

**Consequence for T4 (`harness/course.test.js`).** In every case, feet = `y − hy − SKIN`.

- **Step.** Use 0.29 and 0.33, or 0.30 and 0.32, around the real limit of `max_height + offset` = 0.3101.
  - Assert the feet at the step top, or at the floor, within 1e-3.
  - The stopped walker's face stays at least `SKIN` short of the riser.
- **Slope.** Use 44° and 46°, with the speed and quantum count written into the test.
  - At 2 u/s over at most 640 quanta, 46° gains less than 0.05 while 44° gains more than 1.
  - Measure the maximum height reached, or put a landing at the ramp's top. Past the top the walker walks off, and its end height falls back to the floor.
  - At 0.4 u/s, allow at most 1,280 quanta for the 46° case.
  - Never test exactly 45°.
- **Drop.** Use 0.19 and 0.22.
  - 0.19: the longest ungrounded run is at most 1, and the feet reach the lower floor within 2 quanta of clearing the edge.
  - 0.22: the longest ungrounded run is at least 2. It was 12 at 0.4, 1 and 2 u/s.
  - "Grounded on the next quantum" depends on speed: true at 1 u/s, false at 0.4 and 2 u/s.
- **Start inside.** Give it at least 1,300 quanta and assert the feet never go below their start. Alternatively, assert the recovery rate.
- **Record the speed.** Thresholds move with speed; 0.4 u/s is the product walker's speed.
- **Constants.** None of this changes the controller's constants, which T4 forbids.

**Contradicts a pin?** Yes, pin 5 of T4 (numbered the same on `main` after the amendment), in five places:

- The 0.31 step is climbed, not stopped.
- "Feet … within 1e-3" of the step top fails by the 0.01 skin.
- At 0.4 and 2 u/s the 0.19 walker is not grounded on the quantum after the edge. At 1 u/s it is.
- At the product walker's 0.4 u/s, the 0.21 drop is snapped, not a fall. Both 0.19 and 0.21 show exactly one ungrounded quantum.
- The 46° gain stays below 0.05 only for a bounded run. The start-inside walker needs about 1,200 quanta to stand.

The 44°/46° pair itself is on the right side of both slope comparisons.

Pin check: contradicts pin 5 of dispatch-t4-outcome-tests.md because autostep's limit is max_height + offset (a 0.31 step is climbed; measured limit 0.3101), feet rest one offset above surfaces, and a 0.21 drop is snapped at 0.4 u/s, rapier3d-f64-0.35.3/src/control/character_controller.rs:742-743.
