// The product step. One Rapier world lives in this module across quanta so the
// warm-start cache survives. The box step in lib.rs is a separate export.
//
// Pins: rapier3d-f64, enhanced-determinism, f64, no SIMD feature, dt = 1/64,
// sleep threshold = 32 quanta, rotations locked, contact clustering off so the
// hashed warm-start cache is the manifold points.
//
// Every check inside the law returns `Result<_, Refusal>`; the exports turn a
// refusal into 0. lib.rs denies `unused_must_use`, so a dropped refusal fails
// the build (S1 pin 5).

use rapier3d_f64::control::{
    CharacterAutostep, CharacterCollision, CharacterLength, KinematicCharacterController,
};
use rapier3d_f64::geometry::{ContactData, ContactPair};
use rapier3d_f64::pipeline::CollisionPipeline;
use rapier3d_f64::prelude::*;

use crate::{mode, Mode, Refusal};
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
// Below this sum of squares, canon_quat divides by the largest magnitude
// first: the squares of small components may have lost bits to underflow.
const SCALE_BELOW: f64 = 1.0e-270;

pub(crate) static mut HEIGHTS: [f64; MAX_HEIGHTS] = [0.0; MAX_HEIGHTS];

// The driven and carried masks hold one bit per body, and `1u64 << 64` is 1
// on host and wasm with overflow checks off, so a limit above 64 would alias
// body 64 onto body 0. S1 pin 3.
const _: () = assert!(MAX_BODIES <= 64);

/// What a loaded Rapier world was built from. Pose and velocity are not in
/// it, so a later quantum keeps the same Rapier state. `ensure` rebuilds the
/// world only when this differs, so it compares the geometry itself (S1 pin
/// 15): a hash of it can collide, and the polynomial fold this replaced did,
/// for half-extents (0.5, 0.5) and (0.5000000000000001, 0.49993896484372585),
/// which would have kept a stale world. `geometry` is the bit pattern of every
/// value the build reads: each body's half-extents, each collider's ten
/// values, and the heights, with signed zero canonicalized as the snapshot
/// canonicalizes it (S1 pin 4). The modes are the two masks, which is how the
/// build reads them: 1 and 2 are both kinematic and differ only per quantum.
/// At the limits it is 64 * 3 + 64 * 10 + 256 words, about 8.7 kilobytes.
struct Signature {
    world_id: u32,
    n_bodies: u32,
    n_colliders: u32,
    rows: u32,
    cols: u32,
    cell: u64,
    driven: u64,
    carried: u64,
    shape: u32,
    geometry: Vec<u64>,
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

/// What `ensure` did.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Load {
    /// The loaded world was built from the same signature and stays.
    Kept,
    /// A new world was built.
    Built,
}

fn canon(x: f64) -> f64 {
    if x == 0.0 { 0.0 } else { x }
}

/// A value the law cannot use: NaN or either infinity. Testing NaN alone let
/// an infinite velocity reach Rapier, which disables the body and keeps its
/// state finite, so the step did not refuse. S1 pin 10.
fn bad(x: f64) -> bool {
    !x.is_finite()
}

fn finite(x: f64) -> Result<(), Refusal> {
    if bad(x) { Err(Refusal::NotFinite) } else { Ok(()) }
}

#[unsafe(no_mangle)]
pub extern "C" fn heights_ptr() -> *mut f64 {
    (&raw mut HEIGHTS).cast::<f64>()
}

#[unsafe(no_mangle)]
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
) -> Result<(), Refusal> {
    let parts = [x, y, z, vx, vy, vz, qx, qy, qz, qw, wx, wy, wz];
    if parts.iter().any(|v| bad(*v)) {
        return Err(Refusal::NotFinite);
    }
    unsafe {
        let base = i * BODY_STRIDE;
        for (k, v) in parts.iter().enumerate() {
            BODIES[base + k] = canon(*v);
        }
    }
    Ok(())
}

/// Unit quaternion, w non-negative, signed zero canonicalized.
///
/// It refuses what it cannot normalize: a component that is NaN or infinite,
/// and a quaternion whose components are all zero. Before S1 pin 11 an
/// infinite component returned a quaternion with a NaN inside, and a component
/// from about 1.34e154 up, where the square overflows, returned (0, 0, 0, 0),
/// which is not unit. When the sum of squares overflows, or falls below
/// `SCALE_BELOW` where the squares of small components lose bits to underflow,
/// it divides every component by the largest magnitude before normalizing.
/// Inside that range it normalizes without scaling, as it always did, so every
/// quaternion the product scene produces comes out bit for bit as before and
/// no golden moves; scaling there would change last bits.
///
/// Contract: canon_quat is not idempotent. A quaternion it returned can move
/// in its last bits when it is canonicalized again: over 200,000 inputs the
/// Rust knowledge base measured 31% of canonical quaternions moving under a
/// second application and 4,623 moving again under a third, so iterating does
/// not settle. The law canonicalizes at the output boundary (write_body's
/// callers and rebuild_snapshot), and again at every rebuild from the records:
/// `ensure` rebuilds whenever the driven or carried mask changes, which is at
/// every verb boundary, and build_world runs the already-canonical records
/// through canon_quat once more (the knowledge base saw that renormalize one
/// product body at trace ticks 201 and 401 and flip its sign at 261). That
/// path is deterministic, part of the run every replay repeats, and it is not
/// a restore route. Nothing compares a re-canonicalized quaternion bit for bit,
/// and a restore is by replay or by image only, never by reloading the saved
/// records, which is why T2 restores as it does. The tests at the end of this
/// file hold both sides.
fn canon_quat(x: f64, y: f64, z: f64, w: f64) -> Result<(f64, f64, f64, f64), Refusal> {
    if bad(x) || bad(y) || bad(z) || bad(w) {
        return Err(Refusal::Quaternion);
    }
    let s = x * x + y * y + z * z + w * w;
    let (x, y, z, w) = if s.is_finite() && s >= SCALE_BELOW {
        let n = s.sqrt();
        (x / n, y / n, z / n, w / n)
    } else {
        let m = x.abs().max(y.abs()).max(z.abs()).max(w.abs());
        if !(m > 0.0) {
            return Err(Refusal::Quaternion);
        }
        let (x, y, z, w) = (x / m, y / m, z / m, w / m);
        let n = (x * x + y * y + z * z + w * w).sqrt();
        (x / n, y / n, z / n, w / n)
    };
    let mut x = canon(x);
    let mut y = canon(y);
    let mut z = canon(z);
    let mut w = canon(w);
    if w.is_sign_negative() {
        x = canon(-x);
        y = canon(-y);
        z = canon(-z);
        w = canon(-w);
    }
    Ok((x, y, z, w))
}

fn quat_from_body(b: &[f64]) -> Result<Rotation, Refusal> {
    let (x, y, z, w) = canon_quat(b[QX], b[QY], b[QZ], b[QW])?;
    Ok(Rotation::from_xyzw(x, y, z, w))
}

fn signature(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> Result<Signature, Refusal> {
    if n_bodies as usize > MAX_BODIES || n_colliders as usize > MAX_COLLIDERS {
        return Err(Refusal::Limits);
    }
    if rows > 0 && (rows < 2 || cols < 2) {
        return Err(Refusal::Grid);
    }
    let n_heights = (rows as usize).saturating_mul(cols as usize);
    if rows > 0 && (n_heights == 0 || n_heights > MAX_HEIGHTS) {
        return Err(Refusal::Grid);
    }
    finite(cell)?;
    if rows > 0 && !(cell > 0.0) {
        return Err(Refusal::Grid);
    }
    let mut driven = 0u64;
    let mut carried = 0u64;
    for i in 0..n_bodies as usize {
        let b = body_at(i);
        for k in 0..13 {
            finite(b[k])?;
        }
        canon_quat(b[QX], b[QY], b[QZ], b[QW])?;
        // 1 is a kinematic action, 2 is the same action lifted (no gravity, no snap).
        // 3 is carried: the body stays in the record and leaves the solver.
        match mode(b[DRIVEN])? {
            Mode::Kinematic | Mode::Lifted => driven |= 1u64 << i,
            Mode::Carried => carried |= 1u64 << i,
            Mode::Dynamic => {}
        }
    }
    let heights = if rows > 0 { n_heights } else { 0 };
    let mut geometry = Vec::with_capacity(3 * n_bodies as usize + COLLIDER_STRIDE * n_colliders as usize + heights);
    for i in 0..n_bodies as usize {
        let b = body_at(i);
        for k in [HX, HY, HZ] {
            finite(b[k])?;
            if !(b[k] > 0.0) {
                return Err(Refusal::Extent);
            }
            geometry.push(b[k].to_bits());
        }
    }
    for j in 0..n_colliders as usize {
        let c = collider_at(j);
        for k in 0..COLLIDER_STRIDE {
            finite(c[k])?;
            geometry.push(canon(c[k]).to_bits());
        }
        canon_quat(c[6], c[7], c[8], c[9])?;
    }
    for i in 0..heights {
        let h = unsafe { HEIGHTS[i] };
        finite(h)?;
        geometry.push(canon(h).to_bits());
    }
    Ok(Signature {
        world_id,
        n_bodies,
        n_colliders,
        rows,
        cols,
        cell: canon(cell).to_bits(),
        driven,
        carried,
        shape,
        geometry,
    })
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
        && a.shape == b.shape
        && a.geometry == b.geometry
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
    // The pass takes the body set's modified list and clears it, and the
    // physics pipeline admits a new body to its active set only from that
    // list. What puts every body back on it is `bodies.iter_mut()` itself:
    // RigidBodySet::iter_mut pushes each body it yields onto the modified list.
    // `wake_up` does not re-admit anything: it raises a change flag only for a
    // body that is asleep, and none is at load. It is kept for what it does
    // do, which is to zero each body's sleep timer after the pass. Any restore
    // path that reuses this pass depends on the iter_mut, not on the wake_up.
    // (rapier3d-f64 0.35.3: rigid_body_set.rs iter_mut, collision_pipeline.rs
    // take_modified, rigid_body.rs wake_up.)
    //
    // This pass is for a world just built, and it cannot be reused for an
    // in-place type switch: it consumes the bodies' type-change flags without
    // updating the islands, and trips Rapier's island-manager debug_assert
    // (manager.rs:140). A later slice that switches driven and carried bodies
    // in place must not call it.
    for (_, body) in world.bodies.iter_mut() {
        if !body.is_fixed() {
            body.wake_up(true);
        }
    }
}

fn build_world(sig: Signature) -> Result<Loaded, Refusal> {
    let n_bodies = sig.n_bodies as usize;
    let n_colliders = sig.n_colliders as usize;
    let mut world = PhysicsWorld::new();
    world.gravity = Vector::new(0.0, G, 0.0);
    world.integration_parameters.dt = DT;
    // The warm-start the snapshot hashes is the manifold point cache. Clustering
    // keeps a second cache in a crate-private buffer, so it stays off.
    world.integration_parameters.contact_clustering = false;
    world.integration_parameters.warmstart_coefficient = 1.0;
    // At 0.35.3 every fast dynamic body is swept against fixed colliders
    // whether or not it is ccd_enabled; 0 here is the only off switch, and a
    // thin fast box then passes through a thin slab (the native test at the
    // end of this file). 1 is the default, written out so the behaviour does
    // not rest on it. Above 1 the pre-solve pass reads the previous quantum's
    // crate-private ccd_vels, which a restore could not set, so it stays 1.
    world.integration_parameters.max_ccd_substeps = 1;

    let mut collider_handles: Vec<ColliderHandle> = Vec::new();

    for j in 0..n_colliders {
        // Signed zero canonicalized, as the signature compares it, so a world
        // kept across a -0.0 is the world that value would build.
        let c = collider_at(j).map(canon);
        let cx = (c[0] + c[1]) * 0.5;
        let cy = (c[2] + c[3]) * 0.5;
        let cz = (c[4] + c[5]) * 0.5;
        let hx = (c[1] - c[0]) * 0.5;
        let hy = (c[3] - c[2]) * 0.5;
        let hz = (c[5] - c[4]) * 0.5;
        if !(hx > 0.0) || !(hy > 0.0) || !(hz > 0.0) {
            return Err(Refusal::Extent);
        }
        let (qx, qy, qz, qw) = canon_quat(c[6], c[7], c[8], c[9])?;
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
                    data[row + col * rows] = canon(HEIGHTS[row * cols + col]);
                }
            }
        }
        let heights = Array2::new(rows, cols, data);
        let scale = Vector::new((cols as f64 - 1.0) * cell, 1.0, (rows as f64 - 1.0) * cell);
        let body = RigidBodyBuilder::fixed().build();
        // FIX_INTERNAL_EDGES corrects contact normals at the edges between
        // the field's triangles. It does not change the triangles, so
        // supportAt is unchanged. Without it a box sliding down a 20 degree
        // field catches on the first cell boundary in every direction and a
        // sled on a 35 degree field catches moving +x and -z (T4 pin 3,
        // harness/outcome.test.js).
        let co = ColliderBuilder::heightfield_with_flags(heights, scale, HeightFieldFlags::FIX_INTERNAL_EDGES)
            .restitution(0.0)
            .friction(0.8)
            .build();
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
        let rotation = quat_from_body(&b)?;
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

    Ok(Loaded {
        world,
        n_bodies,
        kinematic,
        handles,
        halves,
        signature: sig,
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

fn integrate(loaded: &mut Loaded) -> Result<(), Refusal> {
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
        if mode(b[DRIVEN])? == Mode::Lifted {
            let vy = b[4];
            if bad(vy) || bad(b[3]) || bad(b[5]) {
                return Err(Refusal::NotFinite);
            }
            let pos = *loaded.world.bodies[handle].position();
            let translation = pos.translation + Vector::new(b[3], vy, b[5]) * DT;
            if bad(translation.x) || bad(translation.y) || bad(translation.z) {
                return Err(Refusal::NotFinite);
            }
            plans.push(Plan { index: i, handle, translation, vy, vx: b[3], vz: b[5], collisions: Vec::new() });
            continue;
        }
        let mut vy = b[4] + G * DT;
        if bad(vy) || bad(b[3]) || bad(b[5]) {
            return Err(Refusal::NotFinite);
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
            return Err(Refusal::NotFinite);
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
            // Every kinematic body with a handle made a plan above; a missing
            // one is a refusal, not a panic.
            let plan = plans.iter().find(|plan| plan.index == i).ok_or(Refusal::Plan)?;
            write_body(i, p.x, p.y, p.z, plan.vx, plan.vy, plan.vz, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0)?;
        } else {
            let v = body.linvel();
            let w = body.angvel();
            let rot = body.rotation();
            let (qx, qy, qz, qw) = canon_quat(rot.x, rot.y, rot.z, rot.w)?;
            write_body(i, p.x, p.y, p.z, v.x, v.y, v.z, qx, qy, qz, qw, w.x, w.y, w.z)?;
        }
    }
    Ok(())
}

fn push_f64(out: &mut Vec<u8>, x: f64) {
    out.extend_from_slice(&canon(x).to_le_bytes());
}

fn rebuild_snapshot(loaded: &Loaded, out: &mut Vec<u8>) -> Result<(), Refusal> {
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
            let (qx, qy, qz, qw) = canon_quat(rot.x, rot.y, rot.z, rot.w)?;
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
    // A stable sort, and it stays one (S1 pin 6). `sort_unstable` lost its
    // deterministic wording in Rust 1.81, and on 1.98.1 it reorders equal keys
    // from 21 elements up (Rust knowledge base). The key cannot tie at 0.35.3:
    // the narrow phase holds one contact pair per pair of colliders, so two
    // pairs never share both handles. The stable sort stays anyway, so that if
    // a later Rapier makes a tie possible, tied pairs keep the narrow phase's
    // own order, which is deterministic, instead of one the sort chooses.
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
    Ok(())
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

fn ensure(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> Result<Load, Refusal> {
    let sig = signature(world_id, n_bodies, n_colliders, rows, cols, cell, shape)?;
    let solver = unsafe { &mut *(&raw mut SOLVER) };
    let reload = match &solver.loaded {
        Some(loaded) => !same_sig(&loaded.signature, &sig),
        None => true,
    };
    if !reload {
        return Ok(Load::Kept);
    }
    let loaded = build_world(sig)?;
    solver.loaded = Some(loaded);
    if let Some(loaded) = solver.loaded.as_ref() {
        rebuild_snapshot(loaded, &mut solver.snapshot)?;
    }
    Ok(Load::Built)
}

fn step_law(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> Result<(), Refusal> {
    ensure(world_id, n_bodies, n_colliders, rows, cols, cell, shape)?;
    let solver = unsafe { &mut *(&raw mut SOLVER) };
    let loaded = solver.loaded.as_mut().ok_or(Refusal::Unloaded)?;
    integrate(loaded)?;
    rebuild_snapshot(loaded, &mut solver.snapshot)
}

#[unsafe(no_mangle)]
pub extern "C" fn solver_load(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> u32 {
    match ensure(world_id, n_bodies, n_colliders, rows, cols, cell, shape) {
        Ok(_) => 1,
        Err(_) => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn solver_step(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> u32 {
    match step_law(world_id, n_bodies, n_colliders, rows, cols, cell, shape) {
        Ok(()) => 1,
        Err(_) => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn snapshot_ptr() -> *const u8 {
    unsafe { (*(&raw const SOLVER)).snapshot.as_ptr() }
}

#[unsafe(no_mangle)]
pub extern "C" fn snapshot_len() -> u32 {
    unsafe { (*(&raw const SOLVER)).snapshot.len() as u32 }
}

// Native tests, at the end of the file: a test module above the product code
// shifts the line numbers in the binary's panic locations and moves the wasm
// digest; here the release wasm is unchanged. Run with `cargo test --release`
// (Rapier's island-manager debug_assert fires when bodies touch at load).
//
// T4 pin 2, the red evidence: the same thin fast box that
// harness/outcome.test.js keeps on the near side with the product binary
// passes through the slab once max_ccd_substeps is 0, which only this test
// sets, after the law has built the world.
//
// S1: pins 2, 4, 9, 10, 11, and 15, each with the input that goes red.
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // The law's state is module statics, so the tests take turns.
    static TURN: Mutex<u32> = Mutex::new(1000);

    const HALF: f64 = 0.05;
    const SLAB: f64 = 0.02;
    const SPEED: f64 = 20.0;
    const PHASES: usize = 7;
    const QUANTA: usize = 64;

    /// Runs one thin fast box at the slab and returns its final position on
    /// the axis it was launched along. The slab's near side is negative for
    /// horizontal and positive for falling.
    fn run(turn: &mut u32, falling: bool, phase: usize, substeps: Option<usize>) -> f64 {
        *turn += 1;
        let offset = (phase as f64 / PHASES as f64) * (SPEED * DT);
        let (pos, vel) = if falling {
            ([0.0, 1.0 + offset, 0.0], [0.0, -SPEED, 0.0])
        } else {
            ([-1.0 - offset, 0.0, 0.0], [SPEED, 0.0, 0.0])
        };
        let slab = if falling {
            [-2.0, 2.0, -SLAB, SLAB, -2.0, 2.0]
        } else {
            [-SLAB, SLAB, -20.0, 20.0, -2.0, 2.0]
        };
        unsafe {
            let b = &mut *core::ptr::addr_of_mut!(BODIES);
            let record = [
                pos[0], pos[1], pos[2], vel[0], vel[1], vel[2], 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, HALF, HALF, HALF, 0.0,
            ];
            b[..BODY_STRIDE].copy_from_slice(&record);
            let c = &mut *core::ptr::addr_of_mut!(COLLIDERS);
            c[..6].copy_from_slice(&slab);
            c[6..10].copy_from_slice(&[0.0, 0.0, 0.0, 1.0]);
        }
        assert_eq!(solver_load(*turn, 1, 1, 0, 0, 0.0, 0), 1);
        if let Some(n) = substeps {
            let solver = unsafe { &mut *core::ptr::addr_of_mut!(SOLVER) };
            solver.loaded.as_mut().unwrap().world.integration_parameters.max_ccd_substeps = n;
        }
        for _ in 0..QUANTA {
            assert_eq!(solver_step(*turn, 1, 1, 0, 0, 0.0, 0), 1);
        }
        let b = body_at(0);
        if falling { b[1] } else { b[0] }
    }

    fn near(falling: bool, at: f64) -> bool {
        if falling { at > 0.0 } else { at < 0.0 }
    }

    #[test]
    fn thin_fast_box_stays_on_the_near_side_as_the_law_builds_it() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        for falling in [true, false] {
            for phase in 0..PHASES {
                let at = run(&mut turn, falling, phase, None);
                assert!(near(falling, at), "falling {falling} phase {phase}: ended at {at}, past the slab");
            }
        }
    }

    #[test]
    fn thin_fast_box_passes_through_with_max_ccd_substeps_0() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let mut far = Vec::new();
        for falling in [true, false] {
            for phase in 0..PHASES {
                let at = run(&mut turn, falling, phase, Some(0));
                if !near(falling, at) {
                    far.push((falling, phase, at));
                }
            }
        }
        println!("max_ccd_substeps 0: {} of {} runs passed through the slab: {:?}", far.len(), 2 * PHASES, far);
        assert!(!far.is_empty(), "with CCD off no run passed through, so the near-side test could not go red");
    }

    // S1 helpers. A box of half-extent 0.25 over a floor whose top is y = 0.

    const FLOOR: [f64; COLLIDER_STRIDE] = [-4.0, 4.0, -1.0, 0.0, -4.0, 4.0, 0.0, 0.0, 0.0, 1.0];

    fn box_at(x: f64, y: f64, z: f64) -> [f64; BODY_STRIDE] {
        [x, y, z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.25, 0.25, 0.25, 0.0]
    }

    fn set_body(i: usize, record: [f64; BODY_STRIDE]) {
        let b = unsafe { &mut *(&raw mut BODIES) };
        b[i * BODY_STRIDE..(i + 1) * BODY_STRIDE].copy_from_slice(&record);
    }

    fn set_slot(i: usize, slot: usize, v: f64) {
        let b = unsafe { &mut *(&raw mut BODIES) };
        b[i * BODY_STRIDE + slot] = v;
    }

    fn set_collider(j: usize, record: [f64; COLLIDER_STRIDE]) {
        let c = unsafe { &mut *(&raw mut COLLIDERS) };
        c[j * COLLIDER_STRIDE..(j + 1) * COLLIDER_STRIDE].copy_from_slice(&record);
    }

    fn set_heights(values: &[f64]) {
        let h = unsafe { &mut *(&raw mut HEIGHTS) };
        h[..values.len()].copy_from_slice(values);
    }

    fn snapshot() -> Vec<u8> {
        unsafe { (*(&raw const SOLVER)).snapshot.clone() }
    }

    fn snap_f64(snap: &[u8], word: usize) -> f64 {
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&snap[word * 8..word * 8 + 8]);
        f64::from_le_bytes(bytes)
    }

    /// Two boxes resting on the floor, one on top of the other.
    fn stack() {
        set_body(0, box_at(0.0, 0.26, 0.0));
        set_body(1, box_at(0.0, 0.77, 0.0));
        set_collider(0, FLOOR);
    }

    // Pin 2. Before S1 the box step read 1.5, 4.0, and NaN as driven and the
    // product step read them as dynamic, and both stepped.
    #[test]
    fn a_mode_outside_0_to_3_is_refused_by_the_box_step_and_the_product_step() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        for good in [0.0, -0.0, 1.0, 2.0, 3.0] {
            assert!(mode(good).is_ok(), "{good} is a mode");
        }
        for wrong in [1.5, 4.0, f64::NAN, -1.0, 0.5, 2.5, f64::INFINITY, 1.0 + f64::EPSILON] {
            assert_eq!(mode(wrong), Err(Refusal::Mode), "{wrong} is not a mode");
            stack();
            set_slot(1, DRIVEN, wrong);
            assert_eq!(crate::step(2, 1), 0, "the box step stepped mode {wrong}");
            assert_eq!(body_at(0)[1], 0.26, "the box step moved a body before refusing mode {wrong}");
            *turn += 1;
            assert_eq!(solver_load(*turn, 2, 1, 0, 0, 0.0, 0), 0, "the product law loaded mode {wrong}");
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 0, "the product law stepped mode {wrong}");
        }
        // A good world whose mode goes bad on a later quantum is refused then.
        stack();
        *turn += 1;
        assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
        set_slot(1, DRIVEN, 1.5);
        assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 0);
        assert_eq!(crate::step(2, 1), 0);
    }

    // Pin 4. The signature hashed the raw bits of bounds and heights, so a
    // -0.0 where +0.0 had been made the same world look new and rebuilt it,
    // losing the warm start and the sleep timers.
    #[test]
    fn a_signed_zero_in_a_bound_or_a_height_is_the_same_world() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        // One load hash: a world built with +0.0 and one built with -0.0 load
        // to the same snapshot.
        stack();
        *turn += 1;
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        let plus = snapshot();
        let mut floor = FLOOR;
        floor[3] = -0.0;
        set_collider(0, floor);
        *turn += 1;
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        assert_eq!(snapshot(), plus);

        // No reload: a running world whose bound turns to -0.0 is kept, and it
        // runs on as if nothing changed.
        let run = |turn: u32, flip: bool| -> Vec<u8> {
            stack();
            assert_eq!(ensure(turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
            for q in 0..48 {
                if flip && q == 24 {
                    let mut floor = FLOOR;
                    floor[3] = -0.0;
                    set_collider(0, floor);
                }
                assert_eq!(ensure(turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Kept), "quantum {q} rebuilt the world");
                assert_eq!(solver_step(turn, 2, 1, 0, 0, 0.0, 0), 1);
            }
            snapshot()
        };
        *turn += 1;
        let whole = run(*turn, false);
        *turn += 1;
        let flipped = run(*turn, true);
        assert_eq!(flipped, whole);

        // The same for a height and for the cell word of a world with no field.
        set_body(0, box_at(0.5, 0.26, 0.5));
        set_heights(&[0.0, 0.0, 0.0, 0.0]);
        *turn += 1;
        assert_eq!(ensure(*turn, 1, 0, 2, 2, 1.0, 0), Ok(Load::Built));
        assert_eq!(solver_step(*turn, 1, 0, 2, 2, 1.0, 0), 1);
        set_heights(&[0.0, -0.0, 0.0, -0.0]);
        assert_eq!(ensure(*turn, 1, 0, 2, 2, 1.0, 0), Ok(Load::Kept));
        stack();
        *turn += 1;
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        assert_eq!(ensure(*turn, 2, 1, 0, 0, -0.0, 0), Ok(Load::Kept));
    }

    // Pin 9. Rapier's handle generations come from one counter per set,
    // raised on every removal, so removal history decides handles. The law
    // never removes from a loaded world: a carry or a release changes the
    // signature and builds a new world, so every handle the snapshot records
    // is from a world with no removals.
    #[test]
    fn removal_history_decides_rapier_handles_and_the_law_never_carries_it() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let mut world = PhysicsWorld::new();
        let (body, first) = world.insert(RigidBodyBuilder::dynamic().build(), ColliderBuilder::cuboid(0.5, 0.5, 0.5).build());
        assert!(world.remove_body(body).is_some());
        let (_, again) = world.insert(RigidBodyBuilder::dynamic().build(), ColliderBuilder::cuboid(0.5, 0.5, 0.5).build());
        let (i1, g1) = first.into_raw_parts();
        let (i2, g2) = again.into_raw_parts();
        assert_eq!(i1, i2, "the slot is reused");
        assert_ne!(g1, g2, "the generation records the removal");

        stack();
        *turn += 1;
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        for _ in 0..8 {
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
        }
        set_slot(1, DRIVEN, 3.0);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built), "a carry builds a new world");
        assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
        set_slot(1, DRIVEN, 0.0);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built), "a release builds a new world");
        for _ in 0..8 {
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
        }
        let snap = snapshot();
        let mut w = 2 * 15;
        let pairs = snap_f64(&snap, w) as usize;
        assert!(pairs > 0, "the stack has contact pairs");
        w += 1;
        for _ in 0..pairs {
            assert_eq!(snap_f64(&snap, w + 1), 0.0, "collider generation");
            assert_eq!(snap_f64(&snap, w + 3), 0.0, "collider generation");
            let points = snap_f64(&snap, w + 4) as usize;
            w += 5 + points * 7;
        }
    }

    // Pin 10. `bad()` tested NaN only, so an infinite velocity reached Rapier,
    // which disabled the body, kept its state finite, and stepped.
    #[test]
    fn an_infinity_in_a_pose_or_a_velocity_is_refused() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        for (slot, v) in [(0, f64::INFINITY), (1, f64::NEG_INFINITY), (2, f64::INFINITY), (3, f64::INFINITY), (4, f64::NEG_INFINITY), (5, f64::INFINITY), (10, f64::INFINITY)] {
            stack();
            set_slot(0, slot, v);
            *turn += 1;
            assert_eq!(solver_load(*turn, 2, 1, 0, 0, 0.0, 0), 0, "loaded {v} in slot {slot}");
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 0, "stepped {v} in slot {slot}");
        }
        for (slot, v) in [(3, f64::INFINITY), (4, f64::NEG_INFINITY), (0, f64::INFINITY)] {
            stack();
            *turn += 1;
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
            set_slot(0, slot, v);
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 0, "stepped {v} in slot {slot} on a running world");
        }
        assert!(bad(f64::INFINITY) && bad(f64::NEG_INFINITY) && bad(f64::NAN) && !bad(f64::MAX) && !bad(-0.0));
    }

    // Pin 11. The cases: an infinite or NaN component, all zeros, components
    // from 1.34e154 up (where the square overflows), components whose squares
    // underflow, and ordinary ones, which must come out as the unscaled
    // formula gives them, bit for bit, so no golden moves.

    fn is_unit(q: (f64, f64, f64, f64)) -> bool {
        let (x, y, z, w) = q;
        let n = x * x + y * y + z * z + w * w;
        (n - 1.0).abs() <= 8.0 * f64::EPSILON
            && w.is_sign_positive()
            && [x, y, z, w].iter().all(|c| c.is_finite() && !(*c == 0.0 && c.is_sign_negative()))
    }

    /// The formula before S1: no scaling.
    fn unscaled(x: f64, y: f64, z: f64, w: f64) -> (f64, f64, f64, f64) {
        let n = (x * x + y * y + z * z + w * w).sqrt();
        let (mut x, mut y, mut z, mut w) = (canon(x / n), canon(y / n), canon(z / n), canon(w / n));
        if w.is_sign_negative() {
            x = canon(-x);
            y = canon(-y);
            z = canon(-z);
            w = canon(-w);
        }
        (x, y, z, w)
    }

    struct Xorshift(u64);

    impl Xorshift {
        fn next(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            x
        }

        /// A double in [-1, 1) from 53 random bits.
        fn unit(&mut self) -> f64 {
            ((self.next() >> 11) as f64) / ((1u64 << 52) as f64) - 1.0
        }
    }

    fn cq(q: (f64, f64, f64, f64)) -> (f64, f64, f64, f64) {
        canon_quat(q.0, q.1, q.2, q.3).unwrap()
    }

    fn bits(q: (f64, f64, f64, f64)) -> [u64; 4] {
        [q.0.to_bits(), q.1.to_bits(), q.2.to_bits(), q.3.to_bits()]
    }

    #[test]
    fn canon_quat_refuses_a_non_finite_component_and_all_zeros() {
        for v in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            for k in 0..4 {
                let mut q = [0.0, 0.0, 0.0, 1.0];
                q[k] = v;
                assert_eq!(canon_quat(q[0], q[1], q[2], q[3]), Err(Refusal::Quaternion), "{v} at {k}");
            }
        }
        for signs in 0..16u32 {
            let z = |bit: u32| if signs & (1 << bit) != 0 { -0.0 } else { 0.0 };
            assert_eq!(canon_quat(z(0), z(1), z(2), z(3)), Err(Refusal::Quaternion));
        }
    }

    #[test]
    fn canon_quat_normalizes_components_whose_squares_overflow_or_underflow() {
        for v in [1.34e154, 1.4e154, 1.0e200, 1.0e300, f64::MAX, 1.0e-160, 1.0e-200, 1.0e-310, f64::MIN_POSITIVE, 5.0e-324] {
            assert_eq!(cq((v, 0.0, 0.0, 0.0)), (1.0, 0.0, 0.0, 0.0), "({v}, 0, 0, 0)");
            assert_eq!(cq((0.0, 0.0, 0.0, -v)), (0.0, 0.0, 0.0, 1.0), "(0, 0, 0, -{v})");
            assert_eq!(cq((v, v, v, v)), (0.5, 0.5, 0.5, 0.5), "({v}, {v}, {v}, {v})");
            assert_eq!(cq((v, -v, v, -v)), (-0.5, 0.5, -0.5, 0.5), "({v}, -{v}, {v}, -{v})");
            for q in [(v, 0.0, 0.0, v), (-v, v, 0.0, 0.0), (v, v * 0.5, v * 0.25, v * 0.125), (0.0, v, -v * 0.75, 0.0)] {
                assert!(is_unit(cq(q)), "{q:?} gave {:?}", cq(q));
            }
        }
        // A huge component beside ordinary ones: the ordinary ones round to 0.
        assert_eq!(cq((1.0e300, 1.0, 0.0, 0.0)), (1.0, 1.0 / 1.0e300, 0.0, 0.0));
    }

    #[test]
    fn canon_quat_in_range_is_the_unscaled_formula_bit_for_bit() {
        let mut rng = Xorshift(0x9e3779b97f4a7c15);
        let mut scaled = 0;
        for i in 0..200_000 {
            let e = [1.0, 1.0e-3, 1.0e3, 1.0e-100, 1.0e100][i % 5];
            let q = (rng.unit() * e, rng.unit() * e, rng.unit() * e, rng.unit() * e);
            let s = q.0 * q.0 + q.1 * q.1 + q.2 * q.2 + q.3 * q.3;
            if !(s.is_finite() && s >= SCALE_BELOW) {
                scaled += 1;
                continue;
            }
            assert_eq!(bits(cq(q)), bits(unscaled(q.0, q.1, q.2, q.3)), "{q:?}");
        }
        assert!(scaled < 10, "{scaled} of the sweep left the range");
    }

    #[test]
    fn canon_quat_is_not_idempotent_and_iterating_does_not_settle() {
        let mut rng = Xorshift(0x2545f4914f6cdd1d);
        let mut second = 0;
        let mut third = 0;
        for _ in 0..200_000 {
            let once = cq((rng.unit(), rng.unit(), rng.unit(), rng.unit()));
            assert!(is_unit(once));
            let twice = cq(once);
            let thrice = cq(twice);
            if bits(twice) != bits(once) {
                second += 1;
            }
            if bits(thrice) != bits(twice) {
                third += 1;
            }
        }
        println!("canon_quat over 200000 inputs: {second} moved under a second application, {third} under a third");
        assert!(second > 0, "a second application moved nothing, so the contract's premise is gone");
        assert!(third > 0, "a third application moved nothing: iterating settled");
    }

    // The contract from the other side: a record reloaded through build_world
    // is allowed to differ in the last bits of its quaternion, because
    // build_world canonicalizes it again. That is why a restore never reloads
    // from the saved records (the replay and image restores are held to that
    // in harness/soundness.test.js). A rebuild at a verb boundary does the
    // same thing inside a run, deterministically, and nothing here forbids it.
    #[test]
    fn a_record_reloaded_through_build_world_may_differ_in_the_last_bits_of_its_quaternion() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let mut rng = Xorshift(0x5851f42d4c957f2d);
        let mut moved = 0;
        for _ in 0..64 {
            let saved = cq((rng.unit(), rng.unit(), rng.unit(), rng.unit()));
            let mut record = box_at(0.0, 2.0, 0.0);
            record[QX] = saved.0;
            record[QY] = saved.1;
            record[QZ] = saved.2;
            record[QW] = saved.3;
            set_body(0, record);
            set_collider(0, FLOOR);
            *turn += 1;
            assert_eq!(ensure(*turn, 1, 1, 0, 0, 0.0, 0), Ok(Load::Built));
            let snap = snapshot();
            let reloaded = (snap_f64(&snap, 6), snap_f64(&snap, 7), snap_f64(&snap, 8), snap_f64(&snap, 9));
            assert_eq!(bits(reloaded), bits(cq(cq(saved))), "the load canonicalizes the record, and the snapshot canonicalizes its output");
            for (a, b) in bits(reloaded).iter().zip(bits(saved).iter()) {
                assert!(a.abs_diff(*b) <= 4, "{reloaded:?} is more than last bits from {saved:?}");
            }
            if bits(reloaded) != bits(saved) {
                moved += 1;
            }
        }
        println!("{moved} of 64 records came back from build_world with other last bits");
        assert!(moved > 0);
    }

    // Pin 15. The signature folded geometry with h * 0x100000001b3 + x, and
    // these half-extents fold to the same word, so the world was kept.
    #[test]
    fn colliding_half_extents_reload_the_world() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let fold = |values: &[f64]| {
            values.iter().fold(0xcbf29ce484222325u64, |h, v| h.wrapping_mul(0x100000001b3).wrapping_add(v.to_bits()))
        };
        let a = [0.5, 0.5, 0.25];
        let b = [0.5000000000000001, 0.49993896484372585, 0.25];
        assert_ne!(bits((a[0], a[1], a[2], 0.0)), bits((b[0], b[1], b[2], 0.0)));
        assert_eq!(fold(&a), fold(&b), "the premise: the old fold collides on these");

        let with = |half: [f64; 3]| {
            let mut record = box_at(0.0, 1.0, 0.0);
            record[HX] = half[0];
            record[HY] = half[1];
            record[HZ] = half[2];
            set_body(0, record);
            set_collider(0, FLOOR);
        };
        with(b);
        *turn += 1;
        assert_eq!(ensure(*turn, 1, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        let fresh = snapshot();

        with(a);
        *turn += 1;
        assert_eq!(ensure(*turn, 1, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        for _ in 0..16 {
            assert_eq!(solver_step(*turn, 1, 1, 0, 0, 0.0, 0), 1);
        }
        with(b);
        assert_eq!(ensure(*turn, 1, 1, 0, 0, 0.0, 0), Ok(Load::Built), "a world whose geometry changed was kept");
        assert_eq!(snapshot(), fresh, "the rebuilt world is not the one those half-extents build");
    }
}
