// The engine's copy of Rapier's character controller: the movement routine
// `KinematicCharacterController::move_shape` and the private functions it
// calls, with one added branch (F2, docs/dispatch-f2-walker-stride.md).
//
// Source. rapier3d-f64 0.35.3, src/control/character_controller.rs, from the
// crate as published: the methods check_and_fix_penetrations (lines 240-293),
// move_shape (297-455), snap_to_ground (457-489), predict_ground (491-493),
// detect_grounded_status_and_apply_friction (496-600),
// is_grounded_at_contact_manifold (602-621), handle_slopes (623-659),
// split_into_components (661-665), compute_hit_info (667-681), decompose_hit
// (683-711), compute_dims (713-718) and handle_stairs (721-873); the free
// function subtract_hit (980-985); the private structs HitInfo (58-63) and
// HitDecomposition (87-100); and the private method CharacterLength::eval
// (50-55).
//
// Copyright Sébastien Crozet and Dimforge. Rapier's LICENSE at v0.35.3 carries
// the notice "Copyright 2020 Sébastien Crozet"; the crate's author is Sébastien
// Crozet <sebcrozet@dimforge.com>, and Dimforge publishes Rapier
// (https://github.com/dimforge/rapier). This file is licensed under the Apache
// License, Version 2.0, whose text is solver/LICENSE-APACHE-2.0; solver/NOTICE
// names this file and the change. The rest of the repository is MIT.
//
// Modified by si-rpg-engine, 2026-09-25. What differs from the source:
//
// - The one change, in decompose_hit: when the hit normal crossed with `up`
//   has no direction, the part of the tangent along `up` is the vertical
//   tangent and the rest is the horizontal tangent. Rapier files the whole
//   tangent, horizontal travel included, as vertical there. When the normal
//   is vertical but for its last bit (y = 1 - 2^-53, which GJK returns on
//   about one flat-ground quantum in 30 at the product walker's speed), that
//   tangent's up component is about -4.3e-19, handle_slopes reads the
//   character as slipping on a non-slip slope, and it keeps only the
//   horizontal tangent, which is zero: the quantum loses its travel but for
//   the 1e-4 normal nudge. The engine's walker lost 332 of 10,000 flat-ground
//   quanta that way at the origin and 323 at an offset of a million. The Rust
//   knowledge base measured it (readouts, rust-knowledge wave 3,
//   requests/walker-stall.md) and filed it upstream as
//   https://github.com/dimforge/rapier/issues/1019; the routine is unchanged
//   at rapier 0.36.0. Everywhere the direction exists the routine is Rapier's.
//   The branch is the const parameter BRANCH: the law runs the copy with it
//   on (Stride below), and only the tests run it off.
// - Rapier's public API only. The methods live on `Controller`, which wraps a
//   `KinematicCharacterController` and reads its fields through `Deref`, so
//   `self.up` and the rest read as in the source. CharacterLength::eval is
//   private, so `length(self.offset, x)` stands for `self.offset.eval(x)`,
//   with its body. Collider's `parent` field is crate-private, so
//   `collider.parent()`, which returns the handle that field holds, stands for
//   `collider.parent.map(|p| p.handle)`.
// - The `#[profiling::function]` attributes, the dim2 branches, and the
//   `#[cfg(feature = "dim3")]` guards are gone, since the engine is 3D. Every
//   statement that computes is the source's, in the source's order.
//
// The control test (the end of solver/src/rapier_law.rs, `cargo test --release`)
// runs the law with Rapier's own controller and this copy with the branch off
// side by side over the flat walk, the character course, the step in four
// directions, and the verb fixture's capsule carry, and requires every
// quantum's movement to match bit for bit. A bump of rapier3d-f64 re-syncs this
// file from the new source and reruns the control test before anything else
// (solver/FLAGS.md).

use core::ops::Deref;

use rapier3d_f64::control::{CharacterCollision, CharacterLength, EffectiveCharacterMovement, KinematicCharacterController};
use rapier3d_f64::geometry::{ColliderHandle, ContactManifold, Shape, ShapeCastHit};
use rapier3d_f64::math::{Pose, Real, Vector};
use rapier3d_f64::na::Vector2;
use rapier3d_f64::parry::bounding_volume::BoundingVolume;
use rapier3d_f64::parry::query::details::ShapeCastOptions;
use rapier3d_f64::parry::query::{DefaultQueryDispatcher, PersistentQueryDispatcher};
use rapier3d_f64::pipeline::{QueryFilterFlags, QueryPipeline};
use rapier3d_f64::utils;

/// How the law moves a character for one quantum. The law's is `Stride`; the
/// control test passes one that runs Rapier's controller beside the copy.
pub(crate) trait Mover {
    fn move_shape(
        &mut self,
        controller: &KinematicCharacterController,
        dt: Real,
        queries: &QueryPipeline,
        character_shape: &dyn Shape,
        character_pos: &Pose,
        desired_translation: Vector,
        collisions: &mut Vec<CharacterCollision>,
    ) -> EffectiveCharacterMovement;
}

/// The law's movement: the copy with its branch on.
pub(crate) struct Stride;

impl Mover for Stride {
    fn move_shape(
        &mut self,
        controller: &KinematicCharacterController,
        dt: Real,
        queries: &QueryPipeline,
        character_shape: &dyn Shape,
        character_pos: &Pose,
        desired_translation: Vector,
        collisions: &mut Vec<CharacterCollision>,
    ) -> EffectiveCharacterMovement {
        Controller::<true>(controller).move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| collisions.push(hit))
    }
}

/// Rapier's controller settings, moved by the copy of its routine. BRANCH is
/// the engine's one change to decompose_hit: true in the law, false only in
/// the tests, which is how the copy is held to Rapier's own routine.
pub(crate) struct Controller<'c, const BRANCH: bool>(pub(crate) &'c KinematicCharacterController);

impl<const BRANCH: bool> Deref for Controller<'_, BRANCH> {
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

#[derive(Debug)]
struct HitInfo {
    toi: ShapeCastHit,
    is_wall: bool,
    is_nonslip_slope: bool,
}

#[derive(Debug)]
struct HitDecomposition {
    normal_part: Vector,
    horizontal_tangent: Vector,
    vertical_tangent: Vector,
    // NOTE: we don’t store the penetration part since we don’t really need it
    //       for anything.
}

impl HitDecomposition {
    pub fn unconstrained_slide_part(&self) -> Vector {
        self.normal_part + self.horizontal_tangent + self.vertical_tangent
    }
}

impl<const BRANCH: bool> Controller<'_, BRANCH> {
    /// Pushes the character out of any non-sensor collider it is overlapping with, which is
    /// what stops an obstacle pushed into a non-moving character from tunneling through it
    /// ([`Self::move_shape`]'s shape-casts never run on a zero desired translation).
    ///
    /// The total correction per call is capped relative to the character’s height.
    fn check_and_fix_penetrations(
        &self,
        queries: &QueryPipeline,
        character_shape: &dyn Shape,
        character_pos: &Pose,
        dims: Vector2<Real>,
        result: &mut EffectiveCharacterMovement,
    ) {
        let offset = length(self.offset, dims.y);
        let max_correction = dims.y * 0.25;
        let mut applied = 0.0;

        // Run a few passes so that getting pushed out of one collider doesn’t leave the
        // character stuck inside another one.
        for _ in 0..4 {
            let character_aabb = character_shape
                .compute_aabb(&(Pose::from_translation(result.translation) * *character_pos))
                .loosened(offset);
            let mut corrected = false;

            for (_, collider) in queries.intersect_aabb_conservative(character_aabb) {
                if collider.is_sensor() {
                    continue;
                }

                let character_pos = Pose::from_translation(result.translation) * *character_pos;
                let pos12 = character_pos.inv_mul(collider.position());

                if let Ok(Some(contact)) =
                    queries
                        .dispatcher
                        .contact(&pos12, character_shape, collider.shape(), 0.0)
                {
                    if contact.dist < -1.0e-5 {
                        // Push out until the usual `offset` gap is restored.
                        let push = (offset - contact.dist).min(max_correction - applied);
                        if push <= 0.0 {
                            return; // The per-call correction budget is exhausted.
                        }

                        // `normal1` (expressed in the character’s local frame) points towards
                        // the obstacle: move backwards along it to resolve the overlap.
                        result.translation -= (character_pos.rotation * contact.normal1) * push;
                        applied += push;
                        corrected = true;
                    }
                }
            }

            if !corrected {
                break;
            }
        }
    }

    /// Computes the possible movement for a shape.
    pub fn move_shape(
        &self,
        dt: Real,
        queries: &QueryPipeline,
        character_shape: &dyn Shape,
        character_pos: &Pose,
        desired_translation: Vector,
        mut events: impl FnMut(CharacterCollision),
    ) -> EffectiveCharacterMovement {
        let mut result = EffectiveCharacterMovement {
            translation: Vector::ZERO,
            grounded: false,
            is_sliding_down_slope: false,
        };
        let dims = self.compute_dims(character_shape);

        // 1. Depenetrate, but only when there is no desired movement: the shape-casting
        //    loop below never runs then, so obstacles pushed into the character would
        //    tunnel through it (#485). When it moves, the shape-casts handle them instead.
        if utils::try_normalize_and_get_length(desired_translation, 1.0e-5).is_none() {
            self.check_and_fix_penetrations(
                queries,
                character_shape,
                character_pos,
                dims,
                &mut result,
            );
        }

        let mut translation_remaining = desired_translation;

        let grounded_at_starting_pos = self.detect_grounded_status_and_apply_friction(
            dt,
            queries,
            character_shape,
            &(Pose::from_translation(result.translation) * *character_pos),
            dims,
            None,
            None,
        );

        let mut max_iters = 20;
        let mut kinematic_friction_translation = Vector::ZERO;
        let offset = length(self.offset, dims.y);
        let mut is_moving = false;

        while let Some((translation_dir, translation_dist)) =
            utils::try_normalize_and_get_length(translation_remaining, 1.0e-5)
        {
            if max_iters == 0 {
                break;
            } else {
                max_iters -= 1;
            }
            is_moving = true;

            // 2. Cast towards the movement direction.
            if let Some((handle, hit)) = queries.cast_shape(
                &(Pose::from_translation(result.translation) * *character_pos),
                translation_dir,
                character_shape,
                ShapeCastOptions {
                    target_distance: offset,
                    stop_at_penetration: false,
                    max_time_of_impact: translation_dist,
                    compute_impact_geometry_on_penetration: true,
                },
            ) {
                // We hit something, compute and apply the allowed interference-free translation.
                let allowed_dist = hit.time_of_impact;
                let allowed_translation = translation_dir * allowed_dist;
                result.translation += allowed_translation;
                translation_remaining -= allowed_translation;

                events(CharacterCollision {
                    handle,
                    character_pos: Pose::from_translation(result.translation) * *character_pos,
                    translation_applied: result.translation,
                    translation_remaining,
                    hit,
                });

                let hit_info = self.compute_hit_info(hit);

                // Try to go upstairs.
                if !self.handle_stairs(
                    *queries,
                    character_shape,
                    &(Pose::from_translation(result.translation) * *character_pos),
                    dims,
                    handle,
                    &hit_info,
                    &mut translation_remaining,
                    &mut result,
                ) {
                    // No stairs, try to move along slopes.
                    translation_remaining = self.handle_slopes(
                        &hit_info,
                        desired_translation,
                        translation_remaining,
                        self.normal_nudge_factor,
                        &mut result,
                    );
                }
            } else {
                // No interference along the path.
                result.translation += translation_remaining;
                result.grounded = self.detect_grounded_status_and_apply_friction(
                    dt,
                    queries,
                    character_shape,
                    &(Pose::from_translation(result.translation) * *character_pos),
                    dims,
                    None,
                    None,
                );
                break;
            }
            result.grounded = self.detect_grounded_status_and_apply_friction(
                dt,
                queries,
                character_shape,
                &(Pose::from_translation(result.translation) * *character_pos),
                dims,
                Some(&mut kinematic_friction_translation),
                Some(&mut translation_remaining),
            );

            if !self.slide {
                break;
            }
        }
        // When not moving, `detect_grounded_status_and_apply_friction` is not reached
        // so we call it explicitly here.
        if !is_moving {
            result.grounded = self.detect_grounded_status_and_apply_friction(
                dt,
                queries,
                character_shape,
                &(Pose::from_translation(result.translation) * *character_pos),
                dims,
                None,
                None,
            );
        }
        // If needed, and if we are not already grounded, snap to the ground.
        if grounded_at_starting_pos {
            self.snap_to_ground(
                queries,
                character_shape,
                &(Pose::from_translation(result.translation) * *character_pos),
                dims,
                &mut result,
            );
        }

        // Return the result.
        result
    }

    fn snap_to_ground(
        &self,
        queries: &QueryPipeline,
        character_shape: &dyn Shape,
        character_pos: &Pose,
        dims: Vector2<Real>,
        result: &mut EffectiveCharacterMovement,
    ) -> Option<(ColliderHandle, ShapeCastHit)> {
        if let Some(snap_distance) = self.snap_to_ground {
            if result.translation.dot(self.up) <= 0.0 {
                let snap_distance = length(snap_distance, dims.y);
                let offset = length(self.offset, dims.y);
                if let Some((hit_handle, hit)) = queries.cast_shape(
                    character_pos,
                    -self.up,
                    character_shape,
                    ShapeCastOptions {
                        target_distance: offset,
                        stop_at_penetration: false,
                        max_time_of_impact: snap_distance,
                        compute_impact_geometry_on_penetration: true,
                    },
                ) {
                    // Apply the snap.
                    result.translation -= self.up * hit.time_of_impact;
                    result.grounded = true;
                    return Some((hit_handle, hit));
                }
            }
        }

        None
    }

    fn predict_ground(&self, up_extends: Real) -> Real {
        length(self.offset, up_extends) + 0.05
    }

    fn detect_grounded_status_and_apply_friction(
        &self,
        dt: Real,
        queries: &QueryPipeline,
        character_shape: &dyn Shape,
        character_pos: &Pose,
        dims: Vector2<Real>,
        mut kinematic_friction_translation: Option<&mut Vector>,
        mut translation_remaining: Option<&mut Vector>,
    ) -> bool {
        let prediction = self.predict_ground(dims.y);

        // TODO: allow custom dispatchers.
        let dispatcher = DefaultQueryDispatcher;

        let mut manifolds: Vec<ContactManifold> = vec![];
        let character_aabb = character_shape
            .compute_aabb(character_pos)
            .loosened(prediction);

        let mut grounded = false;

        'outer: for (_, collider) in queries.intersect_aabb_conservative(character_aabb) {
            manifolds.clear();
            let pos12 = character_pos.inv_mul(collider.position());
            let _ = dispatcher.contact_manifolds(
                &pos12,
                character_shape,
                collider.shape(),
                prediction,
                &mut manifolds,
                &mut None,
            );

            if let (Some(kinematic_friction_translation), Some(translation_remaining)) = (
                kinematic_friction_translation.as_deref_mut(),
                translation_remaining.as_deref_mut(),
            ) {
                let init_kinematic_friction_translation = *kinematic_friction_translation;
                let kinematic_parent = collider
                    .parent()
                    .and_then(|p| queries.bodies.get(p))
                    .filter(|rb| rb.is_kinematic());

                for m in &manifolds {
                    if self.is_grounded_at_contact_manifold(m, character_pos, dims) {
                        grounded = true;
                    }

                    if let Some(kinematic_parent) = kinematic_parent {
                        let mut num_active_contacts = 0;
                        let mut manifold_center = Vector::ZERO;
                        let normal = -(character_pos.rotation * m.local_n1);

                        for contact in &m.points {
                            if contact.dist <= prediction {
                                num_active_contacts += 1;
                                let contact_point = collider.position() * contact.local_p2;
                                let target_vel = kinematic_parent.velocity_at_point(contact_point);

                                let normal_target_mvt = target_vel.dot(normal) * dt;
                                let normal_current_mvt = translation_remaining.dot(normal);

                                manifold_center += contact_point;
                                *translation_remaining +=
                                    normal * (normal_target_mvt - normal_current_mvt);
                            }
                        }

                        if num_active_contacts > 0 {
                            let target_vel = kinematic_parent
                                .velocity_at_point(manifold_center / num_active_contacts as Real);
                            let tangent_platform_mvt =
                                (target_vel - normal * target_vel.dot(normal)) * dt;
                            // Apply larger-absolute-value-wins component-wise
                            if tangent_platform_mvt.x.abs() > kinematic_friction_translation.x.abs()
                            {
                                kinematic_friction_translation.x = tangent_platform_mvt.x;
                            }
                            if tangent_platform_mvt.y.abs() > kinematic_friction_translation.y.abs()
                            {
                                kinematic_friction_translation.y = tangent_platform_mvt.y;
                            }
                            if tangent_platform_mvt.z.abs() > kinematic_friction_translation.z.abs()
                            {
                                kinematic_friction_translation.z = tangent_platform_mvt.z;
                            }
                        }
                    }
                }

                *translation_remaining +=
                    *kinematic_friction_translation - init_kinematic_friction_translation;
            } else {
                for m in &manifolds {
                    if self.is_grounded_at_contact_manifold(m, character_pos, dims) {
                        grounded = true;
                        break 'outer; // We can stop the search early.
                    }
                }
            }
        }
        grounded
    }

    fn is_grounded_at_contact_manifold(
        &self,
        manifold: &ContactManifold,
        character_pos: &Pose,
        dims: Vector2<Real>,
    ) -> bool {
        let normal = -(character_pos.rotation * manifold.local_n1);

        // For the controller to be grounded, the angle between the contact normal and the up vector
        // has to be smaller than acos(1.0e-3) = 89.94 degrees.
        if normal.dot(self.up) >= 1.0e-3 {
            let prediction = self.predict_ground(dims.y);
            for contact in &manifold.points {
                if contact.dist <= prediction {
                    return true;
                }
            }
        }
        false
    }

    fn handle_slopes(
        &self,
        hit: &HitInfo,
        movement_input: Vector,
        translation_remaining: Vector,
        normal_nudge_factor: Real,
        result: &mut EffectiveCharacterMovement,
    ) -> Vector {
        let [_vertical_input, horizontal_input] = self.split_into_components(movement_input);
        let horiz_input_decomp = self.decompose_hit(horizontal_input, &hit.toi);
        let decomp = self.decompose_hit(translation_remaining, &hit.toi);

        // An object is trying to slip if the tangential movement induced by its vertical movement
        // points downward.
        let slipping_intent = self.up.dot(horiz_input_decomp.vertical_tangent) < 0.0;
        // An object is slipping if its vertical movement points downward.
        let slipping = self.up.dot(decomp.vertical_tangent) < 0.0;

        // An object is trying to climb if its vertical input motion points upward.
        let climbing_intent = self.up.dot(_vertical_input) > 0.0;
        // An object is climbing if the tangential movement induced by its vertical movement points upward.
        let climbing = self.up.dot(decomp.vertical_tangent) > 0.0;

        let allowed_movement = if hit.is_wall && climbing && !climbing_intent {
            // Can’t climb the slope, remove the vertical tangent motion induced by the forward motion.
            decomp.horizontal_tangent + decomp.normal_part
        } else if hit.is_nonslip_slope && slipping && !slipping_intent {
            // Prevent the vertical movement from sliding down.
            decomp.horizontal_tangent + decomp.normal_part
        } else {
            // Let it slide (including climbing the slope).
            result.is_sliding_down_slope = true;
            decomp.unconstrained_slide_part()
        };

        allowed_movement + hit.toi.normal1 * normal_nudge_factor
    }

    fn split_into_components(&self, translation: Vector) -> [Vector; 2] {
        let vertical_translation = self.up * (self.up.dot(translation));
        let horizontal_translation = translation - vertical_translation;
        [vertical_translation, horizontal_translation]
    }

    fn compute_hit_info(&self, toi: ShapeCastHit) -> HitInfo {
        let angle_with_floor = self.up.angle_between(toi.normal1);
        let is_ceiling = self.up.dot(toi.normal1) < 0.0;
        let is_wall = angle_with_floor >= self.max_slope_climb_angle && !is_ceiling;
        let is_nonslip_slope = angle_with_floor <= self.min_slope_slide_angle;

        HitInfo {
            toi,
            is_wall,
            is_nonslip_slope,
        }
    }

    fn decompose_hit(&self, translation: Vector, hit: &ShapeCastHit) -> HitDecomposition {
        let dist_to_surface = translation.dot(hit.normal1);
        let normal_part;
        let penetration_part;

        if dist_to_surface < 0.0 {
            normal_part = Vector::ZERO;
            penetration_part = dist_to_surface * hit.normal1;
        } else {
            penetration_part = Vector::ZERO;
            normal_part = dist_to_surface * hit.normal1;
        }

        let tangent = translation - normal_part - penetration_part;
        let horizontal_tangent_dir = hit.normal1.cross(self.up);

        let horizontal_tangent_dir = horizontal_tangent_dir.try_normalize().unwrap_or_default();
        // The engine's change (F2). With the normal parallel to `up` the cross
        // product has no direction, and Rapier's two lines below file the whole
        // tangent, the horizontal travel included, as vertical. Here the part
        // along `up` is vertical and the rest horizontal, which is what the
        // tangent to a level surface is. Where the direction exists, and with
        // BRANCH off, the lines below are Rapier's.
        let (horizontal_tangent, vertical_tangent) = if BRANCH && horizontal_tangent_dir == Vector::ZERO {
            let vertical_tangent = self.up * self.up.dot(tangent);
            (tangent - vertical_tangent, vertical_tangent)
        } else {
            let horizontal_tangent = tangent.dot(horizontal_tangent_dir) * horizontal_tangent_dir;
            let vertical_tangent = tangent - horizontal_tangent;
            (horizontal_tangent, vertical_tangent)
        };

        HitDecomposition {
            normal_part,
            horizontal_tangent,
            vertical_tangent,
        }
    }

    fn compute_dims(&self, character_shape: &dyn Shape) -> Vector2<Real> {
        let extents = character_shape.compute_local_aabb().extents();
        let up_extent = extents.dot(self.up.abs());
        let side_extent = (extents - (self.up).abs() * up_extent).length();
        Vector2::new(side_extent, up_extent)
    }

    fn handle_stairs(
        &self,
        mut queries: QueryPipeline,
        character_shape: &dyn Shape,
        character_pos: &Pose,
        dims: Vector2<Real>,
        stair_handle: ColliderHandle,
        hit: &HitInfo,
        translation_remaining: &mut Vector,
        result: &mut EffectiveCharacterMovement,
    ) -> bool {
        let Some(autostep) = self.autostep else {
            return false;
        };

        // Only try to autostep on walls.
        if !hit.is_wall {
            return false;
        }

        let offset = length(self.offset, dims.y);
        let min_width = length(autostep.min_width, dims.x) + offset;
        let max_height = length(autostep.max_height, dims.y) + offset;

        if !autostep.include_dynamic_bodies {
            if queries
                .colliders
                .get(stair_handle)
                .and_then(|co| co.parent())
                .and_then(|p| queries.bodies.get(p))
                .map(|b| b.is_dynamic())
                == Some(true)
            {
                // The "stair" is a dynamic body, which the user wants to ignore.
                return false;
            }

            queries.filter.flags |= QueryFilterFlags::EXCLUDE_DYNAMIC;
        }

        let shifted_character_pos = Pose::from_parts(
            character_pos.translation + self.up * max_height,
            character_pos.rotation,
        );

        let Some(horizontal_dir) =
            (*translation_remaining - self.up * translation_remaining.dot(self.up)).try_normalize()
        else {
            return false;
        };

        if queries
            .cast_shape(
                character_pos,
                self.up,
                character_shape,
                ShapeCastOptions {
                    target_distance: offset,
                    stop_at_penetration: false,
                    max_time_of_impact: max_height,
                    compute_impact_geometry_on_penetration: true,
                },
            )
            .is_some()
        {
            // We can’t go up.
            return false;
        }

        if queries
            .cast_shape(
                &shifted_character_pos,
                horizontal_dir,
                character_shape,
                ShapeCastOptions {
                    target_distance: offset,
                    stop_at_penetration: false,
                    max_time_of_impact: min_width,
                    compute_impact_geometry_on_penetration: true,
                },
            )
            .is_some()
        {
            // We don’t have enough room on the stair to stay on it.
            return false;
        }

        // Check that we are not getting into a ramp that is too steep
        // after stepping.
        if let Some((_, hit)) = queries.cast_shape(
            &Pose::from_parts(
                shifted_character_pos.translation + horizontal_dir * min_width,
                shifted_character_pos.rotation,
            ),
            -self.up,
            character_shape,
            ShapeCastOptions {
                target_distance: offset,
                stop_at_penetration: false,
                max_time_of_impact: max_height,
                compute_impact_geometry_on_penetration: true,
            },
        ) {
            let [vertical_slope_translation, horizontal_slope_translation] = self
                .split_into_components(*translation_remaining)
                .map(|remaining| subtract_hit(remaining, &hit));

            let slope_translation = horizontal_slope_translation + vertical_slope_translation;

            let angle_with_floor = self.up.angle_between(hit.normal1);
            let climbing = self.up.dot(slope_translation) >= 0.0;

            if climbing && angle_with_floor > self.max_slope_climb_angle {
                return false; // The target ramp is too steep.
            }
        }

        // We can step, we need to find the actual step height.
        let step_height = max_height
            - queries
                .cast_shape(
                    &Pose::from_parts(
                        shifted_character_pos.translation + horizontal_dir * min_width,
                        shifted_character_pos.rotation,
                    ),
                    -self.up,
                    character_shape,
                    ShapeCastOptions {
                        target_distance: offset,
                        stop_at_penetration: false,
                        max_time_of_impact: max_height,
                        compute_impact_geometry_on_penetration: true,
                    },
                )
                .map(|hit| hit.1.time_of_impact)
                .unwrap_or(max_height);

        // Remove the step height from the vertical part of the self.
        let step = self.up * step_height;
        *translation_remaining -= step;

        // Advance the collider on the step horizontally, to make sure further
        // movement won’t just get stuck on its edge.
        let horizontal_nudge =
            horizontal_dir * horizontal_dir.dot(*translation_remaining).min(min_width);
        *translation_remaining -= horizontal_nudge;

        result.translation += step + horizontal_nudge;
        true
    }
}

fn subtract_hit(translation: Vector, hit: &ShapeCastHit) -> Vector {
    let surface_correction = (-translation).dot(hit.normal1).max(0.0);
    // This fixes some instances of moving through walls
    let surface_correction = surface_correction * (1.0 + 1.0e-5);
    translation + hit.normal1 * surface_correction
}
