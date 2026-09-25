// The product step. The box step in lib.rs is a separate export.
//
// Pins: rapier3d-f64, enhanced-determinism, f64, no SIMD feature, dt = 1/64,
// sleep threshold = 32 quanta, rotations locked, contact clustering off so the
// hashed warm-start cache is the manifold points.
//
// Every quantum steps a Rapier world built fresh from the snapshot's state:
// the colliders, then each body's pose, velocity, and sleep state, one
// collision pass, and the warm-start impulses of the previous quantum carried
// onto the new contact points by their feature ids. A running Rapier world
// keeps state no public call can read or write: contact points frozen by
// recycling and by parry's try_update, heightfield workspaces, persistent
// islands and pending splits, solver colours, the BVH's shape, and each
// body's sleep_prev_pose. solver_restore (T2) found it: a world rebuilt from
// the snapshot did not rerun as the running one did. Rebuilding every
// quantum makes the snapshot the whole state, so a restore is the same act
// as a step's own preparation. Sleep is the law's own for the same reason:
// Rapier's timer reads sleep_prev_pose, so its thresholds are off and the
// law counts quiet quanta and puts whole islands to sleep itself.

use rapier3d_f64::control::{
    CharacterAutostep, CharacterCollision, CharacterLength, KinematicCharacterController,
};
use rapier3d_f64::geometry::{ContactData, ContactManifold, ContactPair};
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

/// One solver body as the snapshot records it and as a quantum's world is
/// built from it. Every float is canonical: signed zero is +0, the
/// quaternion is unit with w non-negative.
#[derive(Clone, Copy)]
struct BodyState {
    p: Vector,
    v: Vector,
    q: (f64, f64, f64, f64),
    w: Vector,
    /// Quanta the body has been quiet. The snapshot's sleep timer.
    since: f64,
    sleeping: bool,
}

struct Loaded {
    world: PhysicsWorld,
    n_bodies: usize,
    kinematic: Vec<bool>,
    handles: Vec<Option<RigidBodyHandle>>,
    halves: Vec<Vector>,
    signature: Signature,
    controller: KinematicCharacterController,
    /// The state the world was built from, by record index. None for a carried body.
    states: Vec<Option<BodyState>>,
}

struct Solver {
    loaded: Option<Loaded>,
    snapshot: Vec<u8>,
}

static mut SOLVER: Solver = Solver { loaded: None, snapshot: Vec::new() };

/// Floats per solver body in the snapshot: pose and velocity, orientation and
/// angular velocity, the sleep timer and the sleep flag.
const SNAP_BODY: usize = 15;
/// Floats per contact point: the warm-start impulses.
const SNAP_POINT: usize = 7;
/// Bytes solver_restore can take. 32768 floats: 64 bodies and some two
/// thousand contact points.
const RESTORE_CAP: usize = 1 << 18;
static mut RESTORE: [u8; RESTORE_CAP] = [0; RESTORE_CAP];

// Why the last solver_restore returned 0. 0 after a restore that took.
const REFUSE_INPUT: u32 = 1;
const REFUSE_LENGTH: u32 = 2;
const REFUSE_NAN: u32 = 3;
const REFUSE_QUAT: u32 = 4;
const REFUSE_STATE: u32 = 5;
const REFUSE_RECORD: u32 = 6;
const REFUSE_PAIRS: u32 = 7;
const REFUSE_BYTES: u32 = 8;
static mut REFUSAL: u32 = 0;

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
fn warm_broadphase(world: &mut PhysicsWorld, sleepers: &[RigidBodyHandle]) {
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
    // reads to admit a new body to its active set. Touching each body through
    // iter_mut sets them again. Every touching pair is new to this world, so
    // the pass woke every body it built asleep; those go back to sleep, and
    // the step's first island pass wakes an island that mixes the two.
    for (handle, body) in world.bodies.iter_mut() {
        if body.is_fixed() {
            continue;
        }
        if sleepers.contains(&handle) {
            body.sleep();
        } else {
            body.wake_up(true);
        }
    }
}

/// The state a record describes: the load, and every change of signature.
fn record_state(i: usize, kinematic: bool) -> Option<BodyState> {
    let b = body_at(i);
    let p = Vector::new(canon(b[0]), canon(b[1]), canon(b[2]));
    let v = Vector::new(canon(b[3]), canon(b[4]), canon(b[5]));
    if kinematic {
        return Some(BodyState { p, v, q: (0.0, 0.0, 0.0, 1.0), w: Vector::ZERO, since: 0.0, sleeping: false });
    }
    let q = canon_quat(b[QX], b[QY], b[QZ], b[QW])?;
    let w = Vector::new(canon(b[WX]), canon(b[WY]), canon(b[WZ]));
    Some(BodyState { p, v, q, w, since: 0.0, sleeping: false })
}

fn record_states(sig: &Signature) -> Option<Vec<Option<BodyState>>> {
    let mut states = Vec::with_capacity(sig.n_bodies as usize);
    for i in 0..sig.n_bodies as usize {
        if (sig.carried & (1u64 << i)) != 0 {
            states.push(None);
        } else {
            states.push(Some(record_state(i, (sig.driven & (1u64 << i)) != 0)?));
        }
    }
    Some(states)
}

fn build_world(sig: &Signature, states: Vec<Option<BodyState>>) -> Option<Loaded> {
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

    if states.len() != n_bodies {
        return None;
    }
    let mut handles = Vec::with_capacity(n_bodies);
    let mut kinematic = Vec::with_capacity(n_bodies);
    let mut halves = Vec::with_capacity(n_bodies);
    let mut sleepers: Vec<RigidBodyHandle> = Vec::new();
    for i in 0..n_bodies {
        let b = body_at(i);
        let half = Vector::new(b[HX], b[HY], b[HZ]);
        let driven = (sig.driven & (1u64 << i)) != 0;
        let carried_body = (sig.carried & (1u64 << i)) != 0;
        if carried_body {
            if states[i].is_some() {
                return None;
            }
            handles.push(None);
            kinematic.push(false);
            halves.push(half);
            continue;
        }
        let Some(state) = states[i] else {
            return None;
        };
        let body = if driven {
            let mut body = RigidBodyBuilder::kinematic_position_based()
                .translation(state.p)
                .lock_rotations()
                .additional_mass(1.0)
                .can_sleep(false)
                .ccd_enabled(false)
                .build();
            body.set_rotation(Rotation::from_xyzw(0.0, 0.0, 0.0, 1.0), false);
            body
        } else {
            let (qx, qy, qz, qw) = state.q;
            let mut body = RigidBodyBuilder::dynamic()
                .translation(state.p)
                .linvel(state.v)
                .angvel(state.w)
                .can_sleep(true)
                .sleeping(state.sleeping)
                .ccd_enabled(false)
                .build();
            body.set_rotation(Rotation::from_xyzw(qx, qy, qz, qw), false);
            // Rapier's own timer never runs out: the law keeps the timer.
            let activation = body.activation_mut();
            activation.time_until_sleep = SLEEP_QUANTA * DT;
            activation.normalized_linear_threshold = -1.0;
            activation.angular_threshold = -1.0;
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
        if !driven && state.sleeping {
            sleepers.push(handle);
        }
        handles.push(Some(handle));
        kinematic.push(driven);
        halves.push(half);
    }

    warm_broadphase(&mut world, &sleepers);

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
        states,
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

/// One quantum on a prepared world. Writes the records and returns the state
/// the next quantum's world is built from. None on NaN.
fn integrate(loaded: &mut Loaded) -> Option<Vec<Option<BodyState>>> {
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
                return None;
            }
            let pos = *loaded.world.bodies[handle].position();
            let translation = pos.translation + Vector::new(b[3], vy, b[5]) * DT;
            if bad(translation.x) || bad(translation.y) || bad(translation.z) {
                return None;
            }
            plans.push(Plan { index: i, handle, translation, vy, vx: b[3], vz: b[5], collisions: Vec::new() });
            continue;
        }
        let mut vy = b[4] + G * DT;
        if bad(vy) || bad(b[3]) || bad(b[5]) {
            return None;
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
            return None;
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

    let Some(next) = settle(loaded, &plans) else {
        return None;
    };
    for i in 0..n {
        let Some(s) = next[i] else {
            continue;
        };
        let (qx, qy, qz, qw) = s.q;
        if !write_body(i, s.p.x, s.p.y, s.p.z, s.v.x, s.v.y, s.v.z, qx, qy, qz, qw, s.w.x, s.w.y, s.w.z) {
            return None;
        }
    }
    Some(next)
}

fn canon_vec(v: Vector) -> Option<Vector> {
    if bad(v.x) || bad(v.y) || bad(v.z) {
        return None;
    }
    Some(Vector::new(canon(v.x), canon(v.y), canon(v.z)))
}

/// Translation plus rotation chord, as Rapier measures a body's drift.
fn pose_drift(start: &BodyState, p: Vector, q: (f64, f64, f64, f64), extent: f64) -> f64 {
    let trans = (p - start.p).length();
    let a = Rotation::from_xyzw(q.0, q.1, q.2, q.3);
    let b = Rotation::from_xyzw(start.q.0, start.q.1, start.q.2, start.q.3);
    let delta = a * b.inverse();
    trans + 2.0 * Vector::new(delta.x, delta.y, delta.z).length() * extent
}

fn find(parent: &mut [usize], mut i: usize) -> usize {
    while parent[i] != i {
        parent[i] = parent[parent[i]];
        i = parent[i];
    }
    i
}

/// The state each body ends the quantum in, and the law's sleep. A dynamic
/// body is quiet in a quantum when its angular speed is under a quarter turn
/// per second and half its drift over the quantum is under 0.05 × dt, the
/// test Rapier makes. Bodies joined by a touching contact form an island;
/// an island with no kinematic member sleeps when every member has been
/// quiet 32 quanta, and its bodies stop.
fn settle(loaded: &Loaded, plans: &[Plan]) -> Option<Vec<Option<BodyState>>> {
    let n = loaded.n_bodies;
    let mut next: Vec<Option<BodyState>> = vec![None; n];
    for i in 0..n {
        let Some(handle) = loaded.handles[i] else {
            continue;
        };
        let body = &loaded.world.bodies[handle];
        let p = canon_vec(body.translation())?;
        if loaded.kinematic[i] {
            let plan = plans.iter().find(|plan| plan.index == i)?;
            let v = canon_vec(Vector::new(plan.vx, plan.vy, plan.vz))?;
            next[i] = Some(BodyState { p, v, q: (0.0, 0.0, 0.0, 1.0), w: Vector::ZERO, since: 0.0, sleeping: false });
            continue;
        }
        let start = loaded.states[i]?;
        if body.is_sleeping() {
            // Not woken this quantum: it did not move.
            next[i] = Some(BodyState { v: Vector::ZERO, w: Vector::ZERO, sleeping: true, ..start });
            continue;
        }
        let rot = body.rotation();
        let q = canon_quat(rot.x, rot.y, rot.z, rot.w)?;
        let v = canon_vec(body.linvel())?;
        let w = canon_vec(body.angvel())?;
        let extent = loaded.halves[i].length();
        let quiet = w.dot(w) < core::f64::consts::FRAC_PI_2 * core::f64::consts::FRAC_PI_2
            && pose_drift(&start, p, q, extent) * 0.5 < 0.05 * DT;
        let since = if start.sleeping || !quiet { 0.0 } else { start.since + 1.0 };
        next[i] = Some(BodyState { p, v, q, w, since, sleeping: false });
    }

    let mut parent: Vec<usize> = (0..n).collect();
    let index_of = |collider: ColliderHandle| -> Option<usize> {
        let owner = loaded.world.colliders.get(collider)?.parent()?;
        loaded.handles.iter().position(|h| *h == Some(owner))
    };
    for pair in loaded.world.narrow_phase.contact_pairs() {
        if !pair.has_any_active_contact() {
            continue;
        }
        let (Some(a), Some(b)) = (index_of(pair.collider1), index_of(pair.collider2)) else {
            continue;
        };
        let ra = find(&mut parent, a);
        let rb = find(&mut parent, b);
        if ra != rb {
            let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
            parent[hi] = lo;
        }
    }
    let mut blocked = vec![false; n];
    let mut awake = vec![false; n];
    for i in 0..n {
        let Some(s) = next[i] else {
            continue;
        };
        let root = find(&mut parent, i);
        if loaded.kinematic[i] || (!s.sleeping && s.since < SLEEP_QUANTA) {
            blocked[root] = true;
        }
        if !loaded.kinematic[i] && !s.sleeping {
            awake[root] = true;
        }
    }
    for i in 0..n {
        let root = find(&mut parent, i);
        if blocked[root] || !awake[root] || loaded.kinematic[i] {
            continue;
        }
        if let Some(s) = next[i].as_mut() {
            s.sleeping = true;
            s.v = Vector::ZERO;
            s.w = Vector::ZERO;
        }
    }
    Some(next)
}

fn push_f64(out: &mut Vec<u8>, x: f64) {
    out.extend_from_slice(&canon(x).to_le_bytes());
}

/// The contact pairs in snapshot order: by the two collider handles.
fn sorted_pairs(world: &PhysicsWorld) -> Vec<&ContactPair> {
    let mut pairs: Vec<&ContactPair> = world.narrow_phase.contact_pairs().collect();
    pairs.sort_by(|a, b| {
        let ka = (a.collider1.into_raw_parts(), a.collider2.into_raw_parts());
        let kb = (b.collider1.into_raw_parts(), b.collider2.into_raw_parts());
        ka.cmp(&kb)
    });
    pairs
}

fn rebuild_snapshot(loaded: &Loaded, out: &mut Vec<u8>) -> bool {
    out.clear();
    for i in 0..loaded.n_bodies {
        let Some(s) = loaded.states[i] else {
            continue;
        };
        push_f64(out, s.p.x);
        push_f64(out, s.p.y);
        push_f64(out, s.p.z);
        push_f64(out, s.v.x);
        push_f64(out, s.v.y);
        push_f64(out, s.v.z);
        push_f64(out, s.q.0);
        push_f64(out, s.q.1);
        push_f64(out, s.q.2);
        push_f64(out, s.q.3);
        push_f64(out, s.w.x);
        push_f64(out, s.w.y);
        push_f64(out, s.w.z);
        push_f64(out, s.since);
        push_f64(out, if s.sleeping { 1.0 } else { 0.0 });
    }

    let pairs = sorted_pairs(&loaded.world);
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

/// Writes the seven warm-start floats of one contact point, canonical.
fn write_contact(data: &mut ContactData, w: &[f64]) {
    data.warmstart_impulse = canon(w[0]);
    data.warmstart_tangent_impulse.x = canon(w[1]);
    data.warmstart_tangent_impulse.y = canon(w[2]);
    data.warmstart_twist_impulse = canon(w[3]);
    data.warmstart_tangent_world = Vector::new(canon(w[4]), canon(w[5]), canon(w[6]));
}

fn contact_floats(data: &ContactData) -> [f64; SNAP_POINT] {
    [
        data.warmstart_impulse,
        data.warmstart_tangent_impulse.x,
        data.warmstart_tangent_impulse.y,
        data.warmstart_twist_impulse,
        data.warmstart_tangent_world.x,
        data.warmstart_tangent_world.y,
        data.warmstart_tangent_world.z,
    ]
}

/// The narrow phase publishes pairs by shared reference. The world is ours
/// alone on this thread, so a write through these pointers is the manifold
/// points the next step reads. Cargo.lock pins rapier3d-f64 0.35.3, where
/// those points are the warm-start cache once contact clustering is off.
fn pairs_mut(world: &PhysicsWorld) -> Vec<*mut ContactPair> {
    let mut ptrs: Vec<*mut ContactPair> = Vec::new();
    for pair in sorted_pairs(world) {
        ptrs.push(core::ptr::from_ref(pair) as *mut ContactPair);
    }
    ptrs
}

/// Carries the warm-start impulses of the quantum just solved onto the
/// contact points of the next quantum's world, as parry's own match does:
/// the same pair, the same subshapes, the same two feature ids.
fn carry_warmstart(old: &PhysicsWorld, next: &PhysicsWorld) {
    let old_pairs = sorted_pairs(old);
    for ptr in pairs_mut(next) {
        let pair = unsafe { &mut *ptr };
        let Some(before) = old_pairs.iter().find(|p| p.collider1 == pair.collider1 && p.collider2 == pair.collider2) else {
            continue;
        };
        for manifold in pair.manifolds.iter_mut() {
            let Some(was) = before
                .solver_manifolds()
                .iter()
                .find(|m| m.subshape1 == manifold.subshape1 && m.subshape2 == manifold.subshape2)
            else {
                continue;
            };
            for point in manifold.points.iter_mut() {
                if let Some(old_point) = was.points.iter().find(|o| o.fid1 == point.fid1 && o.fid2 == point.fid2) {
                    write_contact(&mut point.data, &contact_floats(&old_point.data));
                }
            }
        }
    }
}

fn zero_manifolds(manifolds: &mut [ContactManifold]) -> u32 {
    let mut n = 0u32;
    for manifold in manifolds {
        for point in &mut manifold.points {
            point.data.warmstart_impulse = 0.0;
            point.data.warmstart_tangent_impulse.x = 0.0;
            point.data.warmstart_tangent_impulse.y = 0.0;
            point.data.warmstart_twist_impulse = 0.0;
            point.data.warmstart_tangent_world = Vector::ZERO;
            n += 1;
        }
    }
    n
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
        let Some(states) = record_states(&sig) else {
            return false;
        };
        let Some(loaded) = build_world(&sig, states) else {
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
    let Some(states) = integrate(loaded) else {
        return 0;
    };
    // The next quantum's world, built from the state this one ended in.
    let Some(next) = build_world(&loaded.signature, states) else {
        return 0;
    };
    carry_warmstart(&loaded.world, &next.world);
    solver.loaded = Some(next);
    let Some(loaded) = solver.loaded.as_ref() else {
        return 0;
    };
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

#[no_mangle]
pub extern "C" fn solver_clear_warmstart() -> u32 {
    let solver = unsafe { &mut *core::ptr::addr_of_mut!(SOLVER) };
    let Some(loaded) = solver.loaded.as_mut() else {
        return 0;
    };
    let mut n = 0u32;
    for ptr in pairs_mut(&loaded.world) {
        unsafe {
            let pair = &mut *ptr;
            n += zero_manifolds(&mut pair.manifolds);
            n += zero_manifolds(&mut pair.solver_clusters);
        }
    }
    if !rebuild_snapshot(loaded, &mut solver.snapshot) {
        return 0;
    }
    n
}

/// Where the binding copies a snapshot before solver_restore.
#[no_mangle]
pub extern "C" fn restore_ptr() -> *mut u8 {
    unsafe { core::ptr::addr_of_mut!(RESTORE) as *mut u8 }
}

/// The most bytes solver_restore takes.
#[no_mangle]
pub extern "C" fn restore_cap() -> u32 {
    RESTORE_CAP as u32
}

/// Why the last solver_restore returned 0, or 0 when it took.
#[no_mangle]
pub extern "C" fn solver_restore_refusal() -> u32 {
    unsafe { REFUSAL }
}

/// Rebuilds the world for the signature in the input buffers from `len`
/// bytes of a snapshot at restore_ptr(): each body's pose, velocity, and
/// sleep state, the collision pass load runs, then the warm-start impulses of
/// every manifold point in the snapshot's pair order. Returns 1 and leaves
/// snapshot_ptr() holding the same bytes. Returns 0 and changes nothing on a
/// length that is not the layout for the signature, a NaN, a quaternion not
/// unit within 1e-9, a sleep field that is not a count and a flag, a body
/// whose pose or velocity is not its record's, or pairs and points after the
/// pass that are not the snapshot's.
#[no_mangle]
pub extern "C" fn solver_restore(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32, len: u32) -> u32 {
    let code = restore(world_id, n_bodies, n_colliders, rows, cols, cell, shape, len as usize);
    unsafe {
        REFUSAL = code;
    }
    if code == 0 { 1 } else { 0 }
}

fn integral(x: f64) -> Option<u64> {
    if x >= 0.0 && x <= 4294967295.0 && x == (x as u64) as f64 {
        Some(x as u64)
    } else {
        None
    }
}

fn same_bits(a: f64, b: f64) -> bool {
    a.to_bits() == b.to_bits()
}

fn restore(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32, len: usize) -> u32 {
    let Some(sig) = signature(world_id, n_bodies, n_colliders, rows, cols, cell, shape) else {
        return REFUSE_INPUT;
    };
    if len > RESTORE_CAP || len % 8 != 0 {
        return REFUSE_LENGTH;
    }
    let bytes: &[u8] = unsafe { core::slice::from_raw_parts(core::ptr::addr_of!(RESTORE) as *const u8, len) };
    let mut f: Vec<f64> = Vec::with_capacity(len / 8);
    for chunk in bytes.chunks_exact(8) {
        let mut word = [0u8; 8];
        word.copy_from_slice(chunk);
        f.push(f64::from_le_bytes(word));
    }
    if f.iter().any(|x| x.is_nan()) {
        return REFUSE_NAN;
    }

    // Bodies: fifteen floats for each one the solver holds, in record order.
    let n = sig.n_bodies as usize;
    let mut states: Vec<Option<BodyState>> = Vec::with_capacity(n);
    let mut at = 0usize;
    for i in 0..n {
        if (sig.carried & (1u64 << i)) != 0 {
            states.push(None);
            continue;
        }
        if at + SNAP_BODY > f.len() {
            return REFUSE_LENGTH;
        }
        let s = &f[at..at + SNAP_BODY];
        at += SNAP_BODY;
        let norm = (s[6] * s[6] + s[7] * s[7] + s[8] * s[8] + s[9] * s[9]).sqrt();
        if !((norm - 1.0).abs() <= 1e-9) {
            return REFUSE_QUAT;
        }
        let Some(since) = integral(s[13]) else {
            return REFUSE_STATE;
        };
        if s[14] != 0.0 && s[14] != 1.0 {
            return REFUSE_STATE;
        }
        let kinematic = (sig.driven & (1u64 << i)) != 0;
        let state = BodyState {
            p: Vector::new(s[0], s[1], s[2]),
            v: Vector::new(s[3], s[4], s[5]),
            q: (s[6], s[7], s[8], s[9]),
            w: Vector::new(s[10], s[11], s[12]),
            since: since as f64,
            sleeping: s[14] == 1.0,
        };
        // The record and the snapshot describe one body. A kinematic body's
        // velocity is its next action's, which the tick may change between
        // quanta, so only its position is held to the record.
        let Some(record) = record_state(i, kinematic) else {
            return REFUSE_INPUT;
        };
        let held = if kinematic {
            vec![(record.p.x, state.p.x), (record.p.y, state.p.y), (record.p.z, state.p.z)]
        } else {
            vec![
                (record.p.x, state.p.x),
                (record.p.y, state.p.y),
                (record.p.z, state.p.z),
                (record.v.x, state.v.x),
                (record.v.y, state.v.y),
                (record.v.z, state.v.z),
                (record.q.0, state.q.0),
                (record.q.1, state.q.1),
                (record.q.2, state.q.2),
                (record.q.3, state.q.3),
                (record.w.x, state.w.x),
                (record.w.y, state.w.y),
                (record.w.z, state.w.z),
            ]
        };
        if held.iter().any(|(a, b)| !same_bits(*a, canon(*b))) {
            return REFUSE_RECORD;
        }
        states.push(Some(state));
    }

    // Pairs: a count, then per pair two handles, a point count, and seven
    // floats per point.
    if at >= f.len() {
        return REFUSE_LENGTH;
    }
    let Some(n_pairs) = integral(f[at]) else {
        return REFUSE_LENGTH;
    };
    at += 1;
    let mut pairs: Vec<([u64; 4], usize, usize)> = Vec::new();
    for _ in 0..n_pairs {
        if at + 5 > f.len() {
            return REFUSE_LENGTH;
        }
        let mut handle = [0u64; 4];
        for k in 0..4 {
            let Some(h) = integral(f[at + k]) else {
                return REFUSE_LENGTH;
            };
            handle[k] = h;
        }
        let Some(points) = integral(f[at + 4]) else {
            return REFUSE_LENGTH;
        };
        at += 5;
        let points = points as usize;
        if points > (f.len() - at) / SNAP_POINT {
            return REFUSE_LENGTH;
        }
        pairs.push((handle, points, at));
        at += points * SNAP_POINT;
    }
    if at != f.len() {
        return REFUSE_LENGTH;
    }

    let Some(loaded) = build_world(&sig, states) else {
        return REFUSE_INPUT;
    };
    let ptrs = pairs_mut(&loaded.world);
    if ptrs.len() != pairs.len() {
        return REFUSE_PAIRS;
    }
    for (ptr, (handle, points, _)) in ptrs.iter().zip(pairs.iter()) {
        let pair = unsafe { &**ptr };
        let (i1, g1) = pair.collider1.into_raw_parts();
        let (i2, g2) = pair.collider2.into_raw_parts();
        if [i1 as u64, g1 as u64, i2 as u64, g2 as u64] != *handle {
            return REFUSE_PAIRS;
        }
        let count: usize = pair.solver_manifolds().iter().map(|m| m.points.len()).sum();
        if count != *points {
            return REFUSE_PAIRS;
        }
    }
    for (ptr, (_, _, start)) in ptrs.iter().zip(pairs.iter()) {
        let pair = unsafe { &mut **ptr };
        let mut k = *start;
        for manifold in pair.manifolds.iter_mut() {
            for point in manifold.points.iter_mut() {
                write_contact(&mut point.data, &f[k..k + SNAP_POINT]);
                k += SNAP_POINT;
            }
        }
    }

    let mut rebuilt = Vec::with_capacity(len);
    if !rebuild_snapshot(&loaded, &mut rebuilt) || rebuilt.as_slice() != bytes {
        return REFUSE_BYTES;
    }
    let solver = unsafe { &mut *core::ptr::addr_of_mut!(SOLVER) };
    solver.loaded = Some(loaded);
    solver.snapshot = rebuilt;
    0
}
