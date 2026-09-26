// The engine's copy of Rapier's character push: the routine
// `KinematicCharacterController::solve_character_collision_impulses` and the
// private function it calls for one collision, with two changes: upstream's
// own (F3, docs/dispatch-f3-character-push.md), and the push's mass (F5,
// docs/dispatch-f5-push-mass.md), which Rapier has not fixed.
//
// Source. rapier3d-f64 0.35.3, src/control/character_controller.rs, from the
// crate as published: the methods solve_character_collision_impulses (lines
// 880-897) and solve_single_character_collision_impulse (904-977), the
// private method predict_ground (491-493), and the private method
// CharacterLength::eval (50-55); and from src/utils/mod.rs, the crate-private
// function inv (134-140) with its constant INV_EPSILON (131).
//
// Copyright Sébastien Crozet and Dimforge. Rapier's LICENSE at v0.35.3 carries
// the notice "Copyright 2020 Sébastien Crozet"; the crate's author is Sébastien
// Crozet <sebcrozet@dimforge.com>, and Dimforge publishes Rapier
// (https://github.com/dimforge/rapier). This file is licensed under the Apache
// License, Version 2.0, whose text is solver/LICENSE-APACHE-2.0; solver/NOTICE
// names this file and both changes. The rest of the repository is MIT.
//
// Modified by si-rpg-engine, 2026-09-26. What differs from the source:
//
// - Rapier's own fix, pull request dimforge/rapier#1004 (commit bd7a2f2e,
//   released in 0.36.0), as the const parameter SEPARATE. Each dynamic
//   collider's contact manifolds are computed into a Vec of their own, then
//   moved onto the shared list with that collider's body, normal, and pose.
//   At 0.35.3 the colliders share one list, and for a convex pair parry writes
//   into its first manifold instead of appending, so with two dynamic bodies
//   near the character the first is pushed at the second's contact points
//   (readouts, rust-knowledge wave 3, requests/squeeze-launch.md).
// - The push's mass, as the const parameter EFFECTIVE. Rapier has the defect as
//   dimforge/rapier#1020, open at 0.36.0. Its mass ratio for each contact
//   point, m·M/(m+M), counts the body's linear mass only, so a push off the
//   centre of mass, which also turns the body, overshoots the point's velocity
//   by 1 + k·m·M/(m+M), where k = (r×n)·I⁻¹(r×n). With EFFECTIVE the ratio is
//   the effective mass at the point, mass_ratio / (1 + k·mass_ratio), with r,
//   n, and I⁻¹ from RigidBody::mass_properties; with k exactly 0 it is the
//   source's bit for bit (readouts, wave 3, requests/push-mass.md).
// - Rapier's public API only. The methods live on `Impulses`, which wraps a
//   `KinematicCharacterController` and reads its fields through `Deref`, so
//   `self.up` and `self.offset` read as in the source. CharacterLength::eval
//   and predict_ground are private, so `length(self.offset, x)` stands for
//   `self.offset.eval(x)` and predict_ground is written here with its body;
//   utils::inv is crate-private, and `inv` is written here with its body too.
//   Collider's `parent` field is crate-private, so `collider.parent()`, the
//   handle that field holds, stands for `collider.parent` and `parent.handle`.
// - The `#[profiling::function]` attributes are gone. Apart from the two
//   changes, every statement that computes is the source's, in its order.
//
// The law runs the copy with both changes on (Shove below); only the tests run
// either off. The control test (the end of solver/src/rapier_law.rs) gives
// Rapier's routine and the copy the same world before every push of the flat
// walks, the course, the capsule carry, and every law run: with both off the
// copy is Rapier's bit for bit, SEPARATE acts only where two dynamic colliders
// are near the character, and EFFECTIVE on every push of a dynamic body and
// nowhere else. A bump of rapier3d-f64 reruns it first (solver/FLAGS.md). A
// version that carries #1004 retires SEPARATE, one that fixes #1020 is measured
// against EFFECTIVE, and the file goes when neither change is left.

use core::ops::Deref;

use rapier3d_f64::control::{CharacterCollision, CharacterLength, KinematicCharacterController};
use rapier3d_f64::geometry::{ContactManifold, Shape};
use rapier3d_f64::math::{Pose, Real};
use rapier3d_f64::parry::bounding_volume::BoundingVolume;
use rapier3d_f64::parry::query::{DefaultQueryDispatcher, PersistentQueryDispatcher};
use rapier3d_f64::pipeline::QueryPipelineMut;

/// How the law pushes the dynamic bodies a character touched in one quantum.
/// The law's is `Shove`; the control test passes one that runs Rapier's
/// routine beside the copy.
pub(crate) trait Pusher {
    fn push(
        &mut self,
        controller: &KinematicCharacterController,
        dt: Real,
        queries: &mut QueryPipelineMut,
        character_shape: &dyn Shape,
        character_mass: Real,
        collisions: &[CharacterCollision],
    );
}

/// The law's push: the copy with both changes on.
pub(crate) struct Shove;

impl Pusher for Shove {
    fn push(
        &mut self,
        controller: &KinematicCharacterController,
        dt: Real,
        queries: &mut QueryPipelineMut,
        character_shape: &dyn Shape,
        character_mass: Real,
        collisions: &[CharacterCollision],
    ) {
        Impulses::<true, true>(controller).solve_character_collision_impulses(dt, queries, character_shape, character_mass, collisions)
    }
}

/// Rapier's controller settings, pushing through the copy of its routine.
/// SEPARATE is #1004 and EFFECTIVE the push's mass: true in the law, and false
/// only in the tests, which is how each is held to what it changes.
pub(crate) struct Impulses<'c, const SEPARATE: bool, const EFFECTIVE: bool = false>(pub(crate) &'c KinematicCharacterController);

impl<const SEPARATE: bool, const EFFECTIVE: bool> Deref for Impulses<'_, SEPARATE, EFFECTIVE> {
    type Target = KinematicCharacterController;

    fn deref(&self) -> &KinematicCharacterController {
        self.0
    }
}

/// CharacterLength::eval, which is private in Rapier.
fn length(l: CharacterLength, value: Real) -> Real {
    match l {
        CharacterLength::Relative(x) => value * x,
        CharacterLength::Absolute(x) => x,
    }
}

/// utils::inv's threshold, which is crate-private in Rapier.
const INV_EPSILON: Real = 1.0e-20;

/// utils::inv, which is crate-private in Rapier.
fn inv(val: Real) -> Real {
    if (-INV_EPSILON..=INV_EPSILON).contains(&val) {
        0.0
    } else {
        1.0 / val
    }
}

impl<const SEPARATE: bool, const EFFECTIVE: bool> Impulses<'_, SEPARATE, EFFECTIVE> {
    fn predict_ground(&self, up_extends: Real) -> Real {
        length(self.offset, up_extends) + 0.05
    }

    /// For the given collisions between a character and its environment, this method will apply
    /// impulses to the rigid-bodies surrounding the character shape at the time of the collisions.
    /// Note that the impulse calculation is only approximate as it is not based on a global
    /// constraints resolution scheme.
    pub(crate) fn solve_character_collision_impulses<'a>(
        &self,
        dt: Real,
        queries: &mut QueryPipelineMut,
        character_shape: &dyn Shape,
        character_mass: Real,
        collisions: impl IntoIterator<Item = &'a CharacterCollision>,
    ) {
        for collision in collisions {
            self.solve_single_character_collision_impulse(
                dt,
                queries,
                character_shape,
                character_mass,
                collision,
            );
        }
    }

    /// For the given collision between a character and its environment, this method will apply
    /// impulses to the rigid-bodies surrounding the character shape at the time of the collision.
    /// Note that the impulse calculation is only approximate as it is not based on a global
    /// constraints resolution scheme.
    fn solve_single_character_collision_impulse(
        &self,
        dt: Real,
        queries: &mut QueryPipelineMut,
        character_shape: &dyn Shape,
        character_mass: Real,
        collision: &CharacterCollision,
    ) {
        let extents = character_shape.compute_local_aabb().extents();
        let up_extent = extents.dot(self.up.abs());
        let movement_to_transfer =
            collision.hit.normal1 * collision.translation_remaining.dot(collision.hit.normal1);
        let prediction = self.predict_ground(up_extent);

        // TODO: allow custom dispatchers.
        let dispatcher = DefaultQueryDispatcher;

        let mut manifolds: Vec<ContactManifold> = vec![];
        // World pose of the collider each manifold was computed against: the `local_p2`
        // points are in the collider’s frame, which differs from its body’s when offset.
        let mut manifold_collider_poses: Vec<Pose> = vec![];
        // output vec for contact manifolds returned by parry
        // (#1004; with SEPARATE off it stays empty, as the source has no such vec)
        let mut pair_manifolds: Vec<ContactManifold> = vec![];
        let character_aabb = character_shape
            .compute_aabb(&collision.character_pos)
            .loosened(prediction);

        for (_, collider) in queries.as_ref().intersect_aabb_conservative(character_aabb) {
            if let Some(parent) = collider.parent() {
                if let Some(body) = queries.bodies.get(parent) {
                    if body.is_dynamic() {
                        let pos12 = collision.character_pos.inv_mul(collider.position());
                        if SEPARATE {
                            // #1004: this collider's manifolds, in a vec of their own.
                            pair_manifolds.clear();
                            let _ = dispatcher.contact_manifolds(
                                &pos12,
                                character_shape,
                                collider.shape(),
                                prediction,
                                &mut pair_manifolds,
                                &mut None,
                            );

                            for mut m in pair_manifolds.drain(..) {
                                m.data.rigid_body2 = Some(parent);
                                m.data.normal = collision.character_pos.rotation * m.local_n1;
                                manifolds.push(m);
                                manifold_collider_poses.push(*collider.position());
                            }
                        } else {
                            // rapier3d-f64 0.35.3.
                            let prev_manifolds_len = manifolds.len();
                            let _ = dispatcher.contact_manifolds(
                                &pos12,
                                character_shape,
                                collider.shape(),
                                prediction,
                                &mut manifolds,
                                &mut None,
                            );

                            for m in &mut manifolds[prev_manifolds_len..] {
                                m.data.rigid_body2 = Some(parent);
                                m.data.normal = collision.character_pos.rotation * m.local_n1;
                            }
                            manifold_collider_poses.resize(manifolds.len(), *collider.position());
                        }
                    }
                }
            }
        }

        let velocity_to_transfer = movement_to_transfer * inv(dt);

        for (manifold, collider_pos) in manifolds.iter().zip(manifold_collider_poses.iter()) {
            let body_handle = manifold.data.rigid_body2.unwrap();
            let body = &mut queries.bodies[body_handle];

            for pt in &manifold.points {
                if pt.dist <= prediction {
                    let body_mass = body.mass();
                    let contact_point = collider_pos * pt.local_p2;
                    let delta_vel_per_contact = (velocity_to_transfer
                        - body.velocity_at_point(contact_point))
                    .dot(manifold.data.normal);
                    let mass_ratio = body_mass * character_mass / (body_mass + character_mass);
                    // EFFECTIVE (rapier#1020): the effective mass at the point,
                    // 1 / (1/m + 1/M + k), which counts the turn the impulse
                    // gives the body. apply_impulse_at_point turns it by
                    // effective_world_inv_inertia * ((point - world_com) x impulse),
                    // so k is (r x n) . I^-1 (r x n) with those two values.
                    let mass_ratio = if EFFECTIVE {
                        let mprops = body.mass_properties();
                        let rn = (contact_point - mprops.world_com).cross(manifold.data.normal);
                        let k = rn.dot(mprops.effective_world_inv_inertia * rn);
                        mass_ratio / (1.0 + k * mass_ratio)
                    } else {
                        mass_ratio
                    };

                    body.apply_impulse_at_point(
                        manifold.data.normal * delta_vel_per_contact.max(0.0) * mass_ratio,
                        contact_point,
                        true,
                    );
                }
            }
        }
    }
}
