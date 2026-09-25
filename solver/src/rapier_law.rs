// The product step. One Rapier world lives in this module across quanta so the
// warm-start cache survives. The box step in lib.rs is a separate export.
//
// Pins: rapier3d-f64, enhanced-determinism, f64, no SIMD feature, dt = 1/64,
// sleep threshold = 32 quanta, rotations locked, contact clustering off so the
// hashed warm-start cache is the manifold points.

use rapier3d_f64::control::{
    CharacterAutostep, CharacterCollision, CharacterLength, KinematicCharacterController,
};
use rapier3d_f64::geometry::{ContactData, ContactPair};
use rapier3d_f64::pipeline::CollisionPipeline;
use rapier3d_f64::prelude::*;

use crate::{BODIES, BODY_STRIDE, COLLIDERS, COLLIDER_STRIDE, DRIVEN, HX, HY, HZ, MAX_BODIES, MAX_COLLIDERS};

const QX: usize = 6;
const QY: usize = 7;
const QZ: usize = 8;
const QW: usize = 9;
const WX: usize = 10;
const WY: usize = 11;
const WZ: usize = 12;

const DT: f64 = 1.0 / 64.0;
const G: f64 = -8.0;
const SLEEP_QUANTA: f64 = 32.0;
const MAX_HEIGHTS: usize = 256;
const STEP_HEIGHT: f64 = 0.3;
const STEP_MIN_WIDTH: f64 = 0.2;
const CLIMB_ANGLE: f64 = core::f64::consts::FRAC_PI_4;
const SLIDE_ANGLE: f64 = 50.0 * core::f64::consts::PI / 180.0;
const SNAP: f64 = 0.2;
const SKIN: f64 = 0.01;

pub(crate) static mut HEIGHTS: [f64; MAX_HEIGHTS] = [0.0; MAX_HEIGHTS];

struct Signature {
    world_id: u32,
    n_bodies: u32,
    n_colliders: u32,
    rows: u32,
    cols: u32,
    cell: u64,
    driven: u64,
    carried: u64,
    geom: u64,
    shape: u32,
}

struct Loaded {
    world: PhysicsWorld,
    n_bodies: usize,
    kinematic: Vec<bool>,
    handles: Vec<Option<RigidBodyHandle>>,
    halves: Vec<Vector>,
    signature: Signature,
    controller: KinematicCharacterController,
}

struct Solver {
    loaded: Option<Loaded>,
    snapshot: Vec<u8>,
}

static mut SOLVER: Solver = Solver { loaded: None, snapshot: Vec::new() };

fn canon(x: f64) -> f64 {
    if x == 0.0 { 0.0 } else { x }
}

fn bad(x: f64) -> bool {
    x.is_nan()
}

#[no_mangle]
pub extern "C" fn heights_ptr() -> *mut f64 {
    unsafe { HEIGHTS.as_mut_ptr() }
}

#[no_mangle]
pub extern "C" fn canon_zero(x: f64) -> f64 {
    if x.is_nan() { x } else { canon(x) }
}

fn body_at(i: usize) -> [f64; BODY_STRIDE] {
    let mut out = [0.0; BODY_STRIDE];
    unsafe {
        let base = i * BODY_STRIDE;
        for k in 0..BODY_STRIDE {
            out[k] = BODIES[base + k];
        }
    }
    out
}

fn collider_at(j: usize) -> [f64; COLLIDER_STRIDE] {
    let mut out = [0.0; COLLIDER_STRIDE];
    unsafe {
        let base = j * COLLIDER_STRIDE;
        for k in 0..COLLIDER_STRIDE {
            out[k] = COLLIDERS[base + k];
        }
    }
    out
}

fn write_body(
    i: usize,
    x: f64,
    y: f64,
    z: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    qx: f64,
    qy: f64,
    qz: f64,
    qw: f64,
    wx: f64,
    wy: f64,
    wz: f64,
) -> bool {
    let parts = [x, y, z, vx, vy, vz, qx, qy, qz, qw, wx, wy, wz];
    if parts.iter().any(|v| v.is_nan()) {
        return false;
    }
    unsafe {
        let base = i * BODY_STRIDE;
        for (k, v) in parts.iter().enumerate() {
            BODIES[base + k] = canon(*v);
        }
    }
    true
}

/// Unit quaternion, w non-negative, signed zero canonicalized. None on NaN or a zero quaternion.
fn canon_quat(x: f64, y: f64, z: f64, w: f64) -> Option<(f64, f64, f64, f64)> {
    if x.is_nan() || y.is_nan() || z.is_nan() || w.is_nan() {
        return None;
    }
    let n = (x * x + y * y + z * z + w * w).sqrt();
    if !(n > 0.0) {
        return None;
    }
    let mut x = canon(x / n);
    let mut y = canon(y / n);
    let mut z = canon(z / n);
    let mut w = canon(w / n);
    if w.is_sign_negative() {
        x = canon(-x);
        y = canon(-y);
        z = canon(-z);
        w = canon(-w);
    }
    Some((x, y, z, w))
}

fn quat_from_body(b: &[f64]) -> Option<Rotation> {
    let (x, y, z, w) = canon_quat(b[QX], b[QY], b[QZ], b[QW])?;
    Some(Rotation::from_xyzw(x, y, z, w))
}

fn mix_u64(h: u64, x: u64) -> u64 {
    h.wrapping_mul(0x100000001b3).wrapping_add(x)
}

fn mix_f64(h: u64, x: f64) -> u64 {
    mix_u64(h, x.to_bits())
}

fn signature(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> Option<Signature> {
    if n_bodies as usize > MAX_BODIES || n_colliders as usize > MAX_COLLIDERS {
        return None;
    }
    if rows > 0 && (rows < 2 || cols < 2) {
        return None;
    }
    let n_heights = (rows as usize).saturating_mul(cols as usize);
    if rows > 0 && (n_heights == 0 || n_heights > MAX_HEIGHTS) {
        return None;
    }
    if bad(cell) || (rows > 0 && !(cell > 0.0)) {
        return None;
    }
    let mut driven = 0u64;
    let mut carried = 0u64;
    for i in 0..n_bodies as usize {
        let b = body_at(i);
        for k in 0..13 {
            if bad(b[k]) {
                return None;
            }
        }
        if canon_quat(b[QX], b[QY], b[QZ], b[QW]).is_none() {
            return None;
        }
        // 1 is a kinematic action, 2 is the same action lifted (no gravity, no snap).
        // 3 is carried: the body stays in the record and leaves the solver.
        if b[DRIVEN] == 1.0 || b[DRIVEN] == 2.0 {
            driven |= 1u64 << i;
        } else if b[DRIVEN] == 3.0 {
            carried |= 1u64 << i;
        }
    }
    // Half-extents and static geometry identify the world. Pose and velocity do not,
    // so a later quantum keeps the same Rapier state.
    let mut geom = 0xcbf29ce484222325u64;
    for i in 0..n_bodies as usize {
        let b = body_at(i);
        if bad(b[HX]) || bad(b[HY]) || bad(b[HZ]) || !(b[HX] > 0.0) || !(b[HY] > 0.0) || !(b[HZ] > 0.0) {
            return None;
        }
        geom = mix_f64(geom, b[HX]);
        geom = mix_f64(geom, b[HY]);
        geom = mix_f64(geom, b[HZ]);
        for k in 0..6 {
            if bad(b[k]) {
                return None;
            }
        }
    }
    for j in 0..n_colliders as usize {
        let c = collider_at(j);
        for k in 0..6 {
            if bad(c[k]) {
                return None;
            }
            geom = mix_f64(geom, c[k]);
        }
        for k in 6..10 {
            if bad(c[k]) {
                return None;
            }
            geom = mix_f64(geom, c[k]);
        }
        if canon_quat(c[6], c[7], c[8], c[9]).is_none() {
            return None;
        }
    }
    if rows > 0 {
        unsafe {
            for i in 0..n_heights {
                let h = HEIGHTS[i];
                if bad(h) {
                    return None;
                }
                geom = mix_f64(geom, h);
            }
        }
        geom = mix_f64(geom, cell);
        geom = mix_u64(geom, rows as u64);
        geom = mix_u64(geom, cols as u64);
    }
    geom = mix_u64(geom, shape as u64);
    Some(Signature { world_id, n_bodies, n_colliders, rows, cols, cell: cell.to_bits(), driven, carried, geom, shape })
}

fn same_sig(a: &Signature, b: &Signature) -> bool {
    a.world_id == b.world_id
        && a.n_bodies == b.n_bodies
        && a.n_colliders == b.n_colliders
        && a.rows == b.rows
        && a.cols == b.cols
        && a.cell == b.cell
        && a.driven == b.driven
        && a.carried == b.carried
        && a.geom == b.geom
        && a.shape == b.shape
}

fn character_shape(shape: u32, half: Vector) -> SharedShape {
    if shape == 1 {
        let radius = half.x.min(half.z);
        let cylinder = (half.y - radius).max(0.0);
        SharedShape::capsule_y(cylinder, radius)
    } else {
        SharedShape::cuboid(half.x, half.y, half.z)
    }
}

fn controller() -> KinematicCharacterController {
    KinematicCharacterController {
        up: Vector::new(0.0, 1.0, 0.0),
        offset: CharacterLength::Absolute(SKIN),
        slide: true,
        autostep: Some(CharacterAutostep {
            max_height: CharacterLength::Absolute(STEP_HEIGHT),
            min_width: CharacterLength::Absolute(STEP_MIN_WIDTH),
            include_dynamic_bodies: false,
        }),
        max_slope_climb_angle: CLIMB_ANGLE,
        min_slope_slide_angle: SLIDE_ANGLE,
        snap_to_ground: Some(CharacterLength::Absolute(SNAP)),
        normal_nudge_factor: 1.0e-4,
    }
}

// One collision pass at load through Rapier's own pipeline. The character's
// first query runs before the first step, so the broad phase must hold the
// colliders by then. Updating the broad phase by hand and discarding its pair
// events left pairs unregistered with the narrow phase: a box dropped above
// the centre of a rotated slab passed through it. The pipeline takes the
// modified colliders once, so the first step does not update them twice.
fn warm_broadphase(world: &mut PhysicsWorld) {
    let prediction = world.integration_parameters.prediction_distance();
    let mut pipeline = CollisionPipeline::new();
    pipeline.step(
        prediction,
        &mut world.islands,
        &mut world.broad_phase,
        &mut world.narrow_phase,
        &mut world.bodies,
        &mut world.colliders,
        &(),
        &(),
    );
    // The pass clears the bodies' change flags, which the physics pipeline
    // reads to admit a new body to its active set. Waking them restores that.
    for (_, body) in world.bodies.iter_mut() {
        if !body.is_fixed() {
            body.wake_up(true);
        }
    }
}

fn build_world(sig: &Signature) -> Option<Loaded> {
    let n_bodies = sig.n_bodies as usize;
    let n_colliders = sig.n_colliders as usize;
    let mut world = PhysicsWorld::new();
    world.gravity = Vector::new(0.0, G, 0.0);
    world.integration_parameters.dt = DT;
    // The warm-start the snapshot hashes is the manifold point cache. Clustering
    // keeps a second cache in a crate-private buffer, so it stays off.
    world.integration_parameters.contact_clustering = false;
    world.integration_parameters.warmstart_coefficient = 1.0;

    let mut collider_handles: Vec<ColliderHandle> = Vec::new();

    for j in 0..n_colliders {
        let c = collider_at(j);
        let cx = (c[0] + c[1]) * 0.5;
        let cy = (c[2] + c[3]) * 0.5;
        let cz = (c[4] + c[5]) * 0.5;
        let hx = (c[1] - c[0]) * 0.5;
        let hy = (c[3] - c[2]) * 0.5;
        let hz = (c[5] - c[4]) * 0.5;
        if !(hx > 0.0) || !(hy > 0.0) || !(hz > 0.0) {
            return None;
        }
        let Some((qx, qy, qz, qw)) = canon_quat(c[6], c[7], c[8], c[9]) else {
            return None;
        };
        let mut body = RigidBodyBuilder::fixed().translation(Vector::new(cx, cy, cz)).build();
        body.set_rotation(Rotation::from_xyzw(qx, qy, qz, qw), false);
        let co = ColliderBuilder::cuboid(hx, hy, hz).restitution(0.0).friction(0.8).build();
        let (_b, ch) = world.insert(body, co);
        collider_handles.push(ch);
    }

    if sig.rows > 0 {
        let rows = sig.rows as usize;
        let cols = sig.cols as usize;
        let cell = f64::from_bits(sig.cell);
        // The world record is row-major (row advances z, column advances x).
        // Parry stores the grid column-major: data[row + col * nrows].
        let mut data = vec![0.0; rows * cols];
        unsafe {
            for row in 0..rows {
                for col in 0..cols {
                    data[row + col * rows] = HEIGHTS[row * cols + col];
                }
            }
        }
        let heights = Array2::new(rows, cols, data);
        let scale = Vector::new((cols as f64 - 1.0) * cell, 1.0, (rows as f64 - 1.0) * cell);
        let body = RigidBodyBuilder::fixed().build();
        let co = ColliderBuilder::heightfield(heights, scale).restitution(0.0).friction(0.8).build();
        let (_b, ch) = world.insert(body, co);
        collider_handles.push(ch);
    }

    let mut handles = Vec::with_capacity(n_bodies);
    let mut kinematic = Vec::with_capacity(n_bodies);
    let mut halves = Vec::with_capacity(n_bodies);
    for i in 0..n_bodies {
        let b = body_at(i);
        let pos = Vector::new(b[0], b[1], b[2]);
        let vel = Vector::new(b[3], b[4], b[5]);
        let half = Vector::new(b[HX], b[HY], b[HZ]);
        let driven = (sig.driven & (1u64 << i)) != 0;
        let carried_body = (sig.carried & (1u64 << i)) != 0;
        let Some(rotation) = quat_from_body(&b) else {
            return None;
        };
        let ang = Vector::new(b[WX], b[WY], b[WZ]);
        if carried_body {
            handles.push(None);
            kinematic.push(false);
            halves.push(half);
            continue;
        }
        let body = if driven {
            let mut body = RigidBodyBuilder::kinematic_position_based()
                .translation(pos)
                .lock_rotations()
                .additional_mass(1.0)
                .can_sleep(false)
                .ccd_enabled(false)
                .build();
            body.set_rotation(Rotation::from_xyzw(0.0, 0.0, 0.0, 1.0), false);
            body
        } else {
            let mut body = RigidBodyBuilder::dynamic()
                .translation(pos)
                .linvel(vel)
                .angvel(ang)
                .can_sleep(true)
                .ccd_enabled(false)
                .build();
            body.set_rotation(rotation, false);
            body.activation_mut().time_until_sleep = SLEEP_QUANTA * DT;
            body
        };
        let co = if driven && sig.shape == 1 {
            let radius = half.x.min(half.z);
            let cylinder = (half.y - radius).max(0.0);
            ColliderBuilder::capsule_y(cylinder, radius)
        } else {
            ColliderBuilder::cuboid(half.x, half.y, half.z)
        }
        .restitution(0.0)
        .friction(0.8)
        .build();
        let (handle, ch) = world.insert(body, co);
        collider_handles.push(ch);
        handles.push(Some(handle));
        kinematic.push(driven);
        halves.push(half);
    }

    warm_broadphase(&mut world);

    Some(Loaded {
        world,
        n_bodies,
        kinematic,
        handles,
        halves,
        signature: Signature {
            world_id: sig.world_id,
            n_bodies: sig.n_bodies,
            n_colliders: sig.n_colliders,
            rows: sig.rows,
            cols: sig.cols,
            cell: sig.cell,
            driven: sig.driven,
            carried: sig.carried,
            geom: sig.geom,
            shape: sig.shape,
        },
        controller: controller(),
    })
}

struct Plan {
    index: usize,
    handle: RigidBodyHandle,
    translation: Vector,
    vy: f64,
    vx: f64,
    vz: f64,
    collisions: Vec<CharacterCollision>,
}

fn integrate(loaded: &mut Loaded) -> bool {
    let n = loaded.n_bodies;
    let mut plans: Vec<Plan> = Vec::new();
    let controller = loaded.controller;
    for i in 0..n {
        if !loaded.kinematic[i] {
            continue;
        }
        let Some(handle) = loaded.handles[i] else {
            continue;
        };
        let b = body_at(i);
        // A lifted kinematic takes its vertical velocity from the record.
        // Gravity and the controller's snap stay off for that quantum.
        if b[DRIVEN] == 2.0 {
            let vy = b[4];
            if bad(vy) || bad(b[3]) || bad(b[5]) {
                return false;
            }
            let pos = *loaded.world.bodies[handle].position();
            let translation = pos.translation + Vector::new(b[3], vy, b[5]) * DT;
            if bad(translation.x) || bad(translation.y) || bad(translation.z) {
                return false;
            }
            plans.push(Plan { index: i, handle, translation, vy, vx: b[3], vz: b[5], collisions: Vec::new() });
            continue;
        }
        let mut vy = b[4] + G * DT;
        if bad(vy) || bad(b[3]) || bad(b[5]) {
            return false;
        }
        let desired = Vector::new(b[3], vy, b[5]) * DT;
        let half = loaded.halves[i];
        let shape = character_shape(loaded.signature.shape, half);
        let mut collisions = Vec::new();
        let pos = *loaded.world.bodies[handle].position();
        let filter = QueryFilter::new().exclude_rigid_body(handle);
        let movement = {
            let world = &loaded.world;
            let query = world.broad_phase.as_query_pipeline(
                world.narrow_phase.query_dispatcher(),
                &world.bodies,
                &world.colliders,
                filter,
            );
            controller.move_shape(DT, &query, &*shape, &pos, desired, |hit| collisions.push(hit))
        };
        if movement.grounded {
            vy = 0.0;
        }
        let translation = pos.translation + movement.translation;
        if bad(translation.x) || bad(translation.y) || bad(translation.z) || bad(vy) {
            return false;
        }
        plans.push(Plan { index: i, handle, translation, vy, vx: b[3], vz: b[5], collisions });
    }

    for plan in &plans {
        loaded.world.bodies[plan.handle].set_next_kinematic_translation(plan.translation);
    }

    for plan in &plans {
        let half = loaded.halves[plan.index];
        let shape = character_shape(loaded.signature.shape, half);
        let filter = QueryFilter::new().exclude_rigid_body(plan.handle);
        let world = &mut loaded.world;
        let PhysicsWorld { broad_phase, narrow_phase, bodies, colliders, .. } = world;
        let mut query = broad_phase.as_query_pipeline_mut(
            narrow_phase.query_dispatcher(),
            bodies,
            colliders,
            filter,
        );
        controller.solve_character_collision_impulses(DT, &mut query, &*shape, 1.0, &plan.collisions);
    }

    loaded.world.step();

    for i in 0..n {
        let Some(handle) = loaded.handles[i] else {
            continue;
        };
        let body = &loaded.world.bodies[handle];
        let p = body.translation();
        if loaded.kinematic[i] {
            let plan = plans.iter().find(|plan| plan.index == i).unwrap();
            if !write_body(i, p.x, p.y, p.z, plan.vx, plan.vy, plan.vz, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0) {
                return false;
            }
        } else {
            let v = body.linvel();
            let w = body.angvel();
            let rot = body.rotation();
            let Some((qx, qy, qz, qw)) = canon_quat(rot.x, rot.y, rot.z, rot.w) else {
                return false;
            };
            if !write_body(i, p.x, p.y, p.z, v.x, v.y, v.z, qx, qy, qz, qw, w.x, w.y, w.z) {
                return false;
            }
        }
    }
    true
}

fn push_f64(out: &mut Vec<u8>, x: f64) {
    out.extend_from_slice(&canon(x).to_le_bytes());
}

fn rebuild_snapshot(loaded: &Loaded, out: &mut Vec<u8>) -> bool {
    out.clear();
    for i in 0..loaded.n_bodies {
        let Some(handle) = loaded.handles[i] else {
            continue;
        };
        let body = &loaded.world.bodies[handle];
        let p = body.translation();
        let (qx, qy, qz, qw, wx, wy, wz) = if loaded.kinematic[i] {
            (0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0)
        } else {
            let rot = body.rotation();
            let Some((qx, qy, qz, qw)) = canon_quat(rot.x, rot.y, rot.z, rot.w) else {
                return false;
            };
            let w = body.angvel();
            (qx, qy, qz, qw, w.x, w.y, w.z)
        };
        if loaded.kinematic[i] {
            let b = body_at(i);
            push_f64(out, p.x);
            push_f64(out, p.y);
            push_f64(out, p.z);
            push_f64(out, b[3]);
            push_f64(out, b[4]);
            push_f64(out, b[5]);
        } else {
            let v = body.linvel();
            push_f64(out, p.x);
            push_f64(out, p.y);
            push_f64(out, p.z);
            push_f64(out, v.x);
            push_f64(out, v.y);
            push_f64(out, v.z);
        }
        push_f64(out, qx);
        push_f64(out, qy);
        push_f64(out, qz);
        push_f64(out, qw);
        push_f64(out, wx);
        push_f64(out, wy);
        push_f64(out, wz);
        if loaded.kinematic[i] {
            push_f64(out, 0.0);
            push_f64(out, 0.0);
        } else {
            let act = body.activation();
            push_f64(out, act.time_since_can_sleep / DT);
            push_f64(out, if act.sleeping { 1.0 } else { 0.0 });
        }
    }

    let mut pairs: Vec<&ContactPair> = loaded.world.narrow_phase.contact_pairs().collect();
    pairs.sort_by(|a, b| {
        let ka = (a.collider1.into_raw_parts(), a.collider2.into_raw_parts());
        let kb = (b.collider1.into_raw_parts(), b.collider2.into_raw_parts());
        ka.cmp(&kb)
    });
    push_f64(out, pairs.len() as f64);
    for pair in pairs {
        let (i1, g1) = pair.collider1.into_raw_parts();
        let (i2, g2) = pair.collider2.into_raw_parts();
        push_f64(out, i1 as f64);
        push_f64(out, g1 as f64);
        push_f64(out, i2 as f64);
        push_f64(out, g2 as f64);
        let manifolds = pair.solver_manifolds();
        let mut n_points = 0usize;
        for manifold in manifolds {
            n_points += manifold.points.len();
        }
        push_f64(out, n_points as f64);
        for manifold in manifolds {
            for point in &manifold.points {
                push_contact(out, &point.data);
            }
        }
    }
    true
}

fn push_contact(out: &mut Vec<u8>, data: &ContactData) {
    push_f64(out, data.warmstart_impulse);
    push_f64(out, data.warmstart_tangent_impulse.x);
    push_f64(out, data.warmstart_tangent_impulse.y);
    push_f64(out, data.warmstart_twist_impulse);
    push_f64(out, data.warmstart_tangent_world.x);
    push_f64(out, data.warmstart_tangent_world.y);
    push_f64(out, data.warmstart_tangent_world.z);
}

fn ensure(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> bool {
    let Some(sig) = signature(world_id, n_bodies, n_colliders, rows, cols, cell, shape) else {
        return false;
    };
    let solver = unsafe { &mut *core::ptr::addr_of_mut!(SOLVER) };
    let reload = match &solver.loaded {
        Some(loaded) => !same_sig(&loaded.signature, &sig),
        None => true,
    };
    if reload {
        let Some(loaded) = build_world(&sig) else {
            return false;
        };
        solver.loaded = Some(loaded);
        if let Some(loaded) = solver.loaded.as_ref() {
            if !rebuild_snapshot(loaded, &mut solver.snapshot) {
                return false;
            }
        }
    }
    true
}

#[no_mangle]
pub extern "C" fn solver_load(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> u32 {
    if ensure(world_id, n_bodies, n_colliders, rows, cols, cell, shape) { 1 } else { 0 }
}

#[no_mangle]
pub extern "C" fn solver_step(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> u32 {
    if !ensure(world_id, n_bodies, n_colliders, rows, cols, cell, shape) {
        return 0;
    }
    let solver = unsafe { &mut *core::ptr::addr_of_mut!(SOLVER) };
    let Some(loaded) = solver.loaded.as_mut() else {
        return 0;
    };
    if !integrate(loaded) {
        return 0;
    }
    if !rebuild_snapshot(loaded, &mut solver.snapshot) {
        return 0;
    }
    1
}

#[no_mangle]
pub extern "C" fn snapshot_ptr() -> *const u8 {
    unsafe { SOLVER.snapshot.as_ptr() }
}

#[no_mangle]
pub extern "C" fn snapshot_len() -> u32 {
    unsafe { SOLVER.snapshot.len() as u32 }
}
