// The product step. One Rapier world lives in this module across quanta so the
// warm-start cache survives, verb boundaries included: when an action starts or
// ends, or a body is picked up or put down, the bodies switch in place on the
// running world (F1). The world is built from the records only at its first
// load and when the world itself changes. A driven character moves through
// the engine's copy of Rapier's character controller, kcc.rs, which adds one
// branch for a floor normal parallel to `up` (F2), and pushes the dynamic
// bodies it touched through the engine's copy of Rapier's impulse routine,
// impulses.rs, which gathers each collider's contact manifolds into a vec of
// their own, as Rapier's #1004 does (F3). The box step in lib.rs is a separate
// export.
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

use crate::impulses::{Pusher, Shove};
use crate::kcc::{Mover, Stride};
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

/// What a loaded Rapier world was built from, and the modes last applied to
/// it. Pose and velocity are not in it, so a later quantum keeps the same
/// Rapier state. `ensure` rebuilds the world only when `same_world` says the
/// world itself differs, so it compares the geometry itself (S1 pin 15): a
/// hash of it can collide, and the polynomial fold this replaced did, for
/// half-extents (0.5, 0.5) and (0.5000000000000001, 0.49993896484372585),
/// which would have kept a stale world. `geometry` is the bit pattern of every
/// value the build reads: each body's half-extents, each collider's ten
/// values, and the heights, with signed zero canonicalized as the snapshot
/// canonicalizes it (S1 pin 4). The modes are the two masks, which is how the
/// law reads them: 1 and 2 are both kinematic and differ only per quantum.
/// They are not in the reload test (F1 pin 1): they are the state last
/// applied, and when only they differ `ensure` switches the bodies in place.
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

/// How many times `ensure` has built a world since the binary was
/// instantiated: each first load, each change of world, and each change of
/// geometry. A switch in place is not a build and does not count. The
/// counter lives in linear memory, so an image carries it and a restore puts
/// back the count it was taken at. F1 pin 4.
static mut BUILDS: u32 = 0;

/// What `ensure` did.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Load {
    /// The loaded world is the same world with the same modes, and stays.
    Kept,
    /// The loaded world is the same world and only the modes changed: its
    /// bodies switched in place, in record order (F1 pin 2).
    Switched,
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
/// callers and rebuild_snapshot), at the first load, and on a geometry change
/// only: build_world runs the records through canon_quat, and since F1 it runs
/// only when a world is first loaded or the world itself changes (its id, its
/// counts, its grid, its geometry, or the character shape). Before F1 `ensure`
/// also rebuilt whenever the driven or carried mask changed, at every verb
/// boundary, and ran every already-canonical record through canon_quat once
/// more (the knowledge base saw that renormalize one product body at trace
/// ticks 201 and 401 and flip its sign at 261); the switch in place ended
/// that, and harness/switch.test.js holds the minds fixture's quaternions to
/// their bits across its verb boundaries. A switch reads a record's rotation
/// for one body only, the one entering the running world as dynamic (a return
/// from driven, or a drop), and the tick writes identity there, on which
/// canon_quat is exact. A build is deterministic, part of the run every replay
/// repeats, and it is not a restore route. Nothing compares a re-canonicalized
/// quaternion bit for bit, and a restore is by replay or by image only, never
/// by reloading the saved records, which is why T2 restores as it does. The
/// tests at the end of this file hold both sides.
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

/// The reload test (F1 pin 1): the world id, the body and collider counts,
/// the heightfield's shape, the geometry bytes (S1 pin 15), and the character
/// shape. The driven and carried masks are not in it; a world whose masks
/// alone differ is the same world with bodies to switch.
fn same_world(a: &Signature, b: &Signature) -> bool {
    a.world_id == b.world_id
        && a.n_bodies == b.n_bodies
        && a.n_colliders == b.n_colliders
        && a.rows == b.rows
        && a.cols == b.cols
        && a.cell == b.cell
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
    // This pass is for a world just built, and only build_world calls it. It
    // cannot be reused for an in-place switch (S1 pin 12): it consumes the
    // bodies' type-change flags without updating the islands, and trips
    // Rapier's island-manager debug_assert (manager.rs:140). The switch in
    // place (switch_in_place, F1) does not call it, and pins what that costs
    // instead of hiding it (F1 pin 3): the character's queries run before the
    // step, so in the quantum of a switch a removed body is gone from them at
    // once, and a dropped body is not in them until that step's broad phase
    // takes it in. harness/switch.test.js holds both.
    for (_, body) in world.bodies.iter_mut() {
        if !body.is_fixed() {
            body.wake_up(true);
        }
    }
}

/// The shape of a body's collider: a capsule for a driven body in a capsule
/// world (shape 1), else the box of its half-extents. build_world builds it
/// and a switch sets it in place, so the two give a body the same shape.
fn collider_shape(driven: bool, shape: u32, half: Vector) -> SharedShape {
    if driven && shape == 1 {
        let radius = half.x.min(half.z);
        let cylinder = (half.y - radius).max(0.0);
        SharedShape::capsule_y(cylinder, radius)
    } else {
        SharedShape::cuboid(half.x, half.y, half.z)
    }
}

/// The body and collider build_world makes from record `b`. Driven: a
/// kinematic, position-based body at the record's position with identity
/// rotation, rotations locked, an additional mass of 1, and sleep off.
/// Dynamic: the record's position, velocities, and rotation through
/// canon_quat, sleeping after 32 quanta at rest. A drop at a switch inserts
/// exactly this (F1 pin 2), so a body put back is the body a build would make.
fn body_for(b: &[f64; BODY_STRIDE], driven: bool, shape: u32) -> Result<(RigidBody, Collider), Refusal> {
    let pos = Vector::new(b[0], b[1], b[2]);
    let vel = Vector::new(b[3], b[4], b[5]);
    let half = Vector::new(b[HX], b[HY], b[HZ]);
    let rotation = quat_from_body(b)?;
    let ang = Vector::new(b[WX], b[WY], b[WZ]);
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
    let co = ColliderBuilder::new(collider_shape(driven, shape, half)).restitution(0.0).friction(0.8).build();
    Ok((body, co))
}

/// The sleep settings a driven body is built with: `can_sleep(false)`, which
/// sets both thresholds to -1, and the default time until sleep.
fn driven_sleep(act: &mut RigidBodyActivation) {
    act.normalized_linear_threshold = -1.0;
    act.angular_threshold = -1.0;
    act.time_until_sleep = RigidBodyActivation::default_time_until_sleep();
}

/// The sleep settings a dynamic body is built with: the default thresholds
/// and a time until sleep of 32 quanta.
fn dynamic_sleep(act: &mut RigidBodyActivation) {
    act.normalized_linear_threshold = RigidBodyActivation::default_normalized_linear_threshold();
    act.angular_threshold = RigidBodyActivation::default_angular_threshold();
    act.time_until_sleep = SLEEP_QUANTA * DT;
}

/// Dynamic to driven, on the running body (F1 pin 2). The velocities are
/// zeroed first, while the body is still dynamic: Rapier ignores `set_linvel`
/// and `set_angvel` on a position-based kinematic body, so zeroed after the
/// type they would keep the dynamic velocities. Then the type, the rotation
/// lock, the additional mass, identity rotation, and the sleep settings a
/// driven body is built with, and the body is woken. The collider's shape is
/// the caller's, since it lives in the collider set.
fn to_driven(body: &mut RigidBody) {
    body.set_linvel(Vector::new(0.0, 0.0, 0.0), false);
    body.set_angvel(Vector::new(0.0, 0.0, 0.0), false);
    body.set_body_type(RigidBodyType::KinematicPositionBased, false);
    body.lock_rotations(true, false);
    body.set_additional_mass(1.0, false);
    body.set_rotation(Rotation::from_xyzw(0.0, 0.0, 0.0, 1.0), false);
    driven_sleep(body.activation_mut());
    body.wake_up(true);
}

/// Driven to dynamic, on the running body, from record `b` (F1 pin 2). The
/// type is set first, because Rapier drops a velocity set on a
/// position-based kinematic body; then the rotation unlocked, the additional
/// mass removed (the recompute treats `MassProperties::default()` as no
/// additional mass), the record's rotation through canon_quat, the record's
/// linear and angular velocity, and the sleep settings a dynamic body is
/// built with, and the body is woken.
fn to_dynamic(body: &mut RigidBody, b: &[f64; BODY_STRIDE], rotation: Rotation) {
    body.set_body_type(RigidBodyType::Dynamic, false);
    body.lock_rotations(false, false);
    body.set_additional_mass_properties(MassProperties::default(), false);
    body.set_rotation(rotation, false);
    body.set_linvel(Vector::new(b[3], b[4], b[5]), false);
    body.set_angvel(Vector::new(b[WX], b[WY], b[WZ]), false);
    dynamic_sleep(body.activation_mut());
    body.wake_up(true);
}

/// What one body does at a switch (F1 pin 2).
enum Transition {
    /// Dynamic to driven: the body and its collider.
    ToDriven(RigidBodyHandle, ColliderHandle),
    /// Driven to dynamic: the body, its collider, and the record's rotation
    /// through canon_quat.
    ToDynamic(RigidBodyHandle, ColliderHandle, Rotation),
    /// Picked up: the body leaves the running world.
    PickUp(RigidBodyHandle),
    /// Put down: build_world's body for the record, inserted, driven or not.
    Drop(RigidBody, Collider, bool),
}

/// The handle of a body the running world holds, and its one collider.
fn held(loaded: &Loaded, i: usize) -> Result<(RigidBodyHandle, ColliderHandle), Refusal> {
    let handle = loaded.handles[i].ok_or(Refusal::Handle)?;
    let collider = loaded.world.bodies.get(handle).and_then(|body| body.colliders().first().copied()).ok_or(Refusal::Handle)?;
    if loaded.world.colliders.get(collider).is_none() {
        return Err(Refusal::Handle);
    }
    Ok((handle, collider))
}

/// Applies a change of the driven and carried masks to the running world, in
/// place (F1 pin 2). It walks the bodies in record order, never a map's
/// order. Every lookup and every value that can refuse is taken first, and
/// nothing moves until all of them have, so a refusal leaves the world as it
/// was. Modes 1 and 2 are both in the driven mask, so lifted to driving and
/// back is no switch. A pick-up is `remove_body`; a drop inserts
/// build_world's body for the record, which takes the most recently freed
/// slot at the arena's next generation, so handle generations follow the
/// carry history and reach the hash through the snapshot's pair keys (S1 pin
/// 9). In a capsule world a driven body's collider becomes the capsule and a
/// dynamic body's the box, as build_world would make them. The load pass is
/// never run here (S1 pin 12); see warm_broadphase for what that costs.
fn switch_in_place(loaded: &mut Loaded, driven: u64, carried: u64) -> Result<(), Refusal> {
    let shape = loaded.signature.shape;
    let mut plan: Vec<(usize, Transition)> = Vec::new();
    for i in 0..loaded.n_bodies {
        let bit = 1u64 << i;
        let was_carried = loaded.signature.carried & bit != 0;
        let now_carried = carried & bit != 0;
        let was_driven = loaded.signature.driven & bit != 0;
        let now_driven = driven & bit != 0;
        let transition = if was_carried != now_carried {
            if now_carried {
                Transition::PickUp(held(loaded, i)?.0)
            } else {
                if loaded.handles[i].is_some() {
                    return Err(Refusal::Handle);
                }
                let (body, co) = body_for(&body_at(i), now_driven, shape)?;
                Transition::Drop(body, co, now_driven)
            }
        } else if now_carried || was_driven == now_driven {
            continue;
        } else if now_driven {
            let (handle, collider) = held(loaded, i)?;
            Transition::ToDriven(handle, collider)
        } else {
            let (handle, collider) = held(loaded, i)?;
            Transition::ToDynamic(handle, collider, quat_from_body(&body_at(i))?)
        };
        plan.push((i, transition));
    }
    for (i, transition) in plan {
        match transition {
            Transition::ToDriven(handle, collider) => {
                to_driven(&mut loaded.world.bodies[handle]);
                if shape == 1 {
                    if let Some(co) = loaded.world.colliders.get_mut(collider) {
                        co.set_shape(collider_shape(true, shape, loaded.halves[i]));
                    }
                }
                loaded.kinematic[i] = true;
            }
            Transition::ToDynamic(handle, collider, rotation) => {
                to_dynamic(&mut loaded.world.bodies[handle], &body_at(i), rotation);
                if shape == 1 {
                    if let Some(co) = loaded.world.colliders.get_mut(collider) {
                        co.set_shape(collider_shape(false, shape, loaded.halves[i]));
                    }
                }
                loaded.kinematic[i] = false;
            }
            Transition::PickUp(handle) => {
                let _removed = loaded.world.remove_body(handle);
                loaded.handles[i] = None;
                loaded.kinematic[i] = false;
            }
            Transition::Drop(body, co, now_driven) => {
                let (handle, _) = loaded.world.insert(body, co);
                loaded.handles[i] = Some(handle);
                loaded.kinematic[i] = now_driven;
            }
        }
    }
    loaded.signature.driven = driven;
    loaded.signature.carried = carried;
    Ok(())
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
        let half = Vector::new(b[HX], b[HY], b[HZ]);
        let driven = (sig.driven & (1u64 << i)) != 0;
        let carried_body = (sig.carried & (1u64 << i)) != 0;
        if carried_body {
            handles.push(None);
            kinematic.push(false);
            halves.push(half);
            continue;
        }
        let (body, co) = body_for(&b, driven, sig.shape)?;
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

/// One quantum on the loaded world. Each driven character moves through
/// `mover` with the law's controller settings: the law passes `Stride`, the
/// engine's copy of Rapier's controller with its branch on (kcc.rs, F2), and
/// the control test at the end of this file passes Rapier's own controller
/// beside the copy with the branch off. The dynamic bodies each character
/// touched are pushed through `pusher`, with the character mass of 1: the law
/// passes `Shove`, the engine's copy of Rapier's impulse routine with
/// upstream's change on (impulses.rs, F3), and the control test passes
/// Rapier's own routine beside the copy with the change off.
fn integrate(loaded: &mut Loaded, mover: &mut impl Mover, pusher: &mut impl Pusher) -> Result<(), Refusal> {
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
            mover.move_shape(&controller, DT, &query, &*shape, &pos, desired, &mut collisions)
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
        pusher.push(&controller, DT, &mut query, &*shape, 1.0, &plan.collisions);
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

/// Makes the loaded world the one the records describe. The same world with
/// the same modes is kept. The same world with other modes switches its
/// bodies in place (F1 pins 1 and 2) and stores the new masks. Anything else
/// (no world yet, another world id, other counts, grid, geometry, or
/// character shape) builds a new world from the records and counts the build.
fn ensure(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32) -> Result<Load, Refusal> {
    let sig = signature(world_id, n_bodies, n_colliders, rows, cols, cell, shape)?;
    let solver = unsafe { &mut *(&raw mut SOLVER) };
    if let Some(loaded) = solver.loaded.as_mut() {
        if same_world(&loaded.signature, &sig) {
            if loaded.signature.driven == sig.driven && loaded.signature.carried == sig.carried {
                return Ok(Load::Kept);
            }
            switch_in_place(loaded, sig.driven, sig.carried)?;
            rebuild_snapshot(loaded, &mut solver.snapshot)?;
            return Ok(Load::Switched);
        }
    }
    let loaded = build_world(sig)?;
    solver.loaded = Some(loaded);
    unsafe {
        let builds = &raw mut BUILDS;
        *builds = (*builds).wrapping_add(1);
    }
    if let Some(loaded) = solver.loaded.as_ref() {
        rebuild_snapshot(loaded, &mut solver.snapshot)?;
    }
    Ok(Load::Built)
}

/// The quantum `solver_step` runs, with the character's movement and push
/// named: the export passes `Stride` and `Shove`; only the tests pass others.
fn step_law(world_id: u32, n_bodies: u32, n_colliders: u32, rows: u32, cols: u32, cell: f64, shape: u32, mover: &mut impl Mover, pusher: &mut impl Pusher) -> Result<(), Refusal> {
    ensure(world_id, n_bodies, n_colliders, rows, cols, cell, shape)?;
    let solver = unsafe { &mut *(&raw mut SOLVER) };
    let loaded = solver.loaded.as_mut().ok_or(Refusal::Unloaded)?;
    integrate(loaded, mover, pusher)?;
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
    match step_law(world_id, n_bodies, n_colliders, rows, cols, cell, shape, &mut Stride, &mut Shove) {
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

/// The number of worlds `ensure` has built since instantiation (F1 pin 4):
/// one per first load, change of world, or change of geometry, and none for
/// a switch in place.
#[unsafe(no_mangle)]
pub extern "C" fn solver_rebuilds() -> u32 {
    unsafe { *(&raw const BUILDS) }
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
//
// F1, the switch in place, at the law: a mask change switches and only a
// build counts (pins 1 and 4); an untouched sleeping stack keeps its sleep and
// its warm start through a switch, where a rebuild in the same quantum wakes
// it and starts it cold (pin 5); a picked-up body leaves the queries at once
// and a dropped one enters them only at the step (pin 3); a body switched back
// to dynamic keeps its record velocity, and the wrong order is caught; a
// capsule world switches the collider's shape, and an omitted shape is caught;
// and a drop carries a handle generation into the snapshot (pin 6, S1 pin 9).
//
// #71, after F1's switch tests: a body put down in the quantum another is
// picked up enters the queries at the step whichever has the lower record
// index; the pick-up switched before the drop, the order main applied a
// lower-index pick-up in, lets the queries over the old footprint find the
// dropped body until the step, and never hits it where the picked-up body was.
//
// F2, the character's controller, at the end of the module: the control test
// holds the copy with its branch off to Rapier's controller bit for bit, its
// red finds the branch on exactly Rapier's stalled quanta, the flat walk keeps
// its stride, the step is climbed in four directions and a tilted `up` refuses
// it, and the costs are printed.
//
// F3, the character's push, after it: every law run in fixtures/law-runs/
// replays to the product binary's digest, the control test holds the copy of
// the impulse routine with its change off to Rapier's routine bit for bit, its
// red finds the change only where two dynamic colliders are near the
// character in red room A, the guard bounds how fast a push may leave a body,
// and the costs are printed.
#[cfg(test)]
mod tests {
    use super::*;
    use rapier3d_f64::parry::shape::ShapeType;
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

    /// A pair in the snapshot: both collider handles as (index, generation),
    /// its point count, and its bytes from the count through its last point.
    struct SnapPair {
        first: (u32, u32),
        second: (u32, u32),
        points: usize,
        bytes: Vec<u8>,
    }

    /// The snapshot's pairs, after `bodies` bodies of 15 words each.
    fn snap_pairs(snap: &[u8], bodies: usize) -> Vec<SnapPair> {
        let mut w = bodies * 15;
        let count = snap_f64(snap, w) as usize;
        w += 1;
        let mut out = Vec::new();
        for _ in 0..count {
            let points = snap_f64(snap, w + 4) as usize;
            out.push(SnapPair {
                first: (snap_f64(snap, w) as u32, snap_f64(snap, w + 1) as u32),
                second: (snap_f64(snap, w + 2) as u32, snap_f64(snap, w + 3) as u32),
                points,
                bytes: snap[(w + 4) * 8..(w + 5 + points * 7) * 8].to_vec(),
            });
            w += 5 + points * 7;
        }
        out
    }

    // Pin 9, and F1 pin 6. Rapier's handle generations come from one counter
    // per set, raised on every removal, so removal history decides handles.
    // Before F1 the law never removed from a loaded world: a carry or a
    // release rebuilt it, so every handle the snapshot recorded was from a
    // world with no removals. Since F1 a carry removes the body from the
    // running world and a release inserts it again, so the dropped body's
    // collider takes its old slot at generation 1, and the generation reaches
    // the hash through the snapshot's pair keys.
    #[test]
    fn removal_history_decides_rapier_handles_and_a_drop_carries_it_into_the_snapshot() {
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
        let before: Vec<(u32, u32)> = snap_pairs(&snapshot(), 2).iter().flat_map(|p| [p.first, p.second]).collect();
        assert!(before.iter().all(|&(_, g)| g == 0), "a fresh build: every generation is 0, {before:?}");
        set_slot(1, DRIVEN, 3.0);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Switched), "a carry switches in place");
        assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
        set_slot(1, DRIVEN, 0.0);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Switched), "a release switches in place");
        for _ in 0..8 {
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
        }
        let pairs = snap_pairs(&snapshot(), 2);
        assert!(pairs.iter().any(|p| p.points > 0), "the stack has contact points");
        // The floor is collider 0, the lower box 1, and the upper box, put
        // back, is collider 2 again at generation 1.
        let keys: Vec<((u32, u32), (u32, u32))> = pairs.iter().map(|p| (p.first, p.second)).collect();
        assert!(keys.contains(&((1, 0), (2, 1))), "the dropped box's pair carries generation 1: {keys:?}");
        assert!(keys.contains(&((0, 0), (1, 0))), "the untouched pair keeps generation 0: {keys:?}");
    }

    // F1 pins 1 and 4. The masks are not in the reload test: a mode change is
    // a switch in place, and the build counter moves only for a build.
    #[test]
    fn a_mode_change_switches_in_place_and_only_a_build_counts() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        stack();
        *turn += 1;
        let before = solver_rebuilds();
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        assert_eq!(solver_rebuilds(), before.wrapping_add(1), "the load is one build");
        // Dynamic, driven, lifted (the same mask), dynamic, carried, put
        // back, lifted, carried from driving, put back.
        let expected = [
            (1.0, Load::Switched),
            (2.0, Load::Kept),
            (0.0, Load::Switched),
            (3.0, Load::Switched),
            (0.0, Load::Switched),
            (2.0, Load::Switched),
            (3.0, Load::Switched),
            (0.0, Load::Switched),
        ];
        for (mode, load) in expected {
            set_slot(1, DRIVEN, mode);
            assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(load), "mode {mode}");
            for _ in 0..4 {
                assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1, "mode {mode}");
            }
        }
        assert_eq!(solver_rebuilds(), before.wrapping_add(1), "a switch built a world");
        // A change of geometry is a build, and so is another world.
        set_collider(0, [-4.0, 4.0, -1.0, 0.0, -4.0, 3.5, 0.0, 0.0, 0.0, 1.0]);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        assert_eq!(solver_rebuilds(), before.wrapping_add(2));
        *turn += 1;
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        assert_eq!(solver_rebuilds(), before.wrapping_add(3));
    }

    /// Two boxes stacked at the origin and one at x = 2, on the floor, run
    /// until all three sleep, in world `turn`.
    fn sleeping_stack_and_box(turn: u32) {
        set_body(0, box_at(0.0, 0.26, 0.0));
        set_body(1, box_at(0.0, 0.77, 0.0));
        set_body(2, box_at(2.0, 0.26, 0.0));
        set_collider(0, FLOOR);
        assert_eq!(ensure(turn, 3, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        for _ in 0..160 {
            assert_eq!(solver_step(turn, 3, 1, 0, 0, 0.0, 0), 1);
        }
        let snap = snapshot();
        for i in 0..3 {
            assert_eq!(snap_f64(&snap, i * 15 + 14), 1.0, "box {i} sleeps before the switch");
        }
    }

    /// The stack's two body entries and its two pairs (floor and lower,
    /// lower and upper), bit for bit.
    fn stack_state(snap: &[u8]) -> (Vec<u8>, Vec<Vec<u8>>) {
        let bodies = snap[..2 * 15 * 8].to_vec();
        let pairs = snap_pairs(snap, 3)
            .into_iter()
            .filter(|p| p.first.0 <= 2 && p.second.0 <= 2)
            .map(|p| p.bytes)
            .collect();
        (bodies, pairs)
    }

    // F1 pin 5 at the law. The box at x = 2 switches to driven; the stack at
    // the origin, asleep and untouched, keeps its sleep flags, timers, poses,
    // and warm-start words bit for bit through the switch and the quantum
    // after. The same quantum with a rebuild instead (another world id, as a
    // mask change did before F1) wakes the stack and restarts its contacts,
    // which is this check's red.
    #[test]
    fn an_untouched_sleeping_stack_keeps_its_sleep_and_warm_start_through_a_switch() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        *turn += 1;
        sleeping_stack_and_box(*turn);
        let (bodies, pairs) = stack_state(&snapshot());
        assert_eq!(pairs.len(), 2, "the stack rests on its two pairs");
        set_slot(2, DRIVEN, 1.0);
        assert_eq!(ensure(*turn, 3, 1, 0, 0, 0.0, 0), Ok(Load::Switched));
        assert_eq!(stack_state(&snapshot()), (bodies.clone(), pairs.clone()), "the switch touched the stack");
        assert_eq!(solver_step(*turn, 3, 1, 0, 0, 0.0, 0), 1);
        assert_eq!(stack_state(&snapshot()), (bodies.clone(), pairs.clone()), "the quantum of the switch touched the stack");

        // The red: the same quantum, rebuilt.
        *turn += 1;
        set_slot(2, DRIVEN, 0.0);
        sleeping_stack_and_box(*turn);
        assert_eq!(stack_state(&snapshot()), (bodies.clone(), pairs.clone()), "the same run reached the same stack");
        set_slot(2, DRIVEN, 1.0);
        *turn += 1;
        assert_eq!(solver_step(*turn, 3, 1, 0, 0, 0.0, 0), 1);
        let (rebuilt_bodies, rebuilt_pairs) = stack_state(&snapshot());
        assert_ne!(rebuilt_bodies, bodies, "a rebuild left the stack's sleep as it was, so this check could not go red");
        assert_ne!(rebuilt_pairs, pairs, "a rebuild left the stack's warm start as it was, so this check could not go red");
        let snap = snapshot();
        assert_eq!(snap_f64(&snap, 14), 0.0, "the rebuild woke the lower box");
    }

    /// How many colliders of bodies (not fixed) a box of half-extent 0.3 at
    /// `at` meets, through the broad phase as the character's queries see it.
    fn bodies_found_at(at: Vector) -> usize {
        let solver = unsafe { &*(&raw const SOLVER) };
        let Some(loaded) = solver.loaded.as_ref() else {
            return 0;
        };
        let world = &loaded.world;
        let query = world.broad_phase.as_query_pipeline(
            world.narrow_phase.query_dispatcher(),
            &world.bodies,
            &world.colliders,
            QueryFilter::exclude_fixed(),
        );
        let shape = SharedShape::cuboid(0.3, 0.3, 0.3);
        query.intersect_shape(Pose::from_translation(at), &*shape).count()
    }

    // F1 pin 3 at the law. The character's queries run before the step and
    // read the broad phase, which a switch does not update (no load pass). A
    // picked-up body's collider is removed from the set, so the query cannot
    // resolve its leaf and it is gone at once; a dropped body's collider has
    // no leaf until the step's broad phase gives it one.
    #[test]
    fn a_picked_up_body_leaves_the_queries_at_once_and_a_dropped_one_enters_them_at_the_step() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let here = Vector::new(0.0, 0.26, 0.0);
        set_body(0, box_at(0.0, 0.26, 0.0));
        set_collider(0, FLOOR);
        *turn += 1;
        assert_eq!(ensure(*turn, 1, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        for _ in 0..8 {
            assert_eq!(solver_step(*turn, 1, 1, 0, 0, 0.0, 0), 1);
        }
        assert_eq!(bodies_found_at(here), 1, "the box is in the queries");
        set_slot(0, DRIVEN, 3.0);
        assert_eq!(ensure(*turn, 1, 1, 0, 0, 0.0, 0), Ok(Load::Switched));
        assert_eq!(bodies_found_at(here), 0, "a picked-up body is in the queries before the step");
        assert_eq!(solver_step(*turn, 1, 1, 0, 0, 0.0, 0), 1);
        assert_eq!(bodies_found_at(here), 0);
        set_body(0, box_at(0.0, 0.26, 0.0));
        assert_eq!(ensure(*turn, 1, 1, 0, 0, 0.0, 0), Ok(Load::Switched));
        assert_eq!(bodies_found_at(here), 0, "a dropped body is in the queries before its step");
        assert_eq!(solver_step(*turn, 1, 1, 0, 0, 0.0, 0), 1);
        assert_eq!(bodies_found_at(here), 1, "the step's broad phase took the dropped body in");
    }

    // #71: a pick-up and a drop in one quantum.

    use rapier3d_f64::parry::query::details::ShapeCastOptions;

    /// A body of the #71 scene: the one picked up, or the one put down in the
    /// same quantum.
    #[derive(Clone, Copy, Debug, PartialEq)]
    enum Role {
        PickedUp,
        Dropped,
    }

    /// Where a probe's cast along +x hits the dropped body's near face: the
    /// body is put down at x = 3 with half-extent 0.25, and the probe's
    /// half-extent is 0.1.
    const DROPPED_FACE: f64 = 3.0 - 0.25 - 0.1;

    /// What the character's queries find of the bodies, fixed colliders left
    /// out: the bodies whose leaf in the broad phase meets `footprint`, and
    /// for a probe box of half-extent 0.1 cast along +x at y = 0.25, through
    /// the picked-up body's place alone (x from -1 to 1), through the dropped
    /// body's place alone (x from 2 to 4), and through both (x from -1 to 4),
    /// the body the probe hits first and the probe's x at the hit.
    #[derive(Clone, Debug, PartialEq)]
    struct Seen {
        footprint: Vec<Role>,
        old_place: Option<(Role, f64)>,
        new_place: Option<(Role, f64)>,
        both: Option<(Role, f64)>,
    }

    /// The queries of the loaded world as the character's see them, `was`
    /// being the picked-up body's handle before the pick-up and `dropped` the
    /// dropped body's record.
    fn seen(dropped: usize, was: RigidBodyHandle, footprint: Aabb) -> Seen {
        let solver = unsafe { &*(&raw const SOLVER) };
        let loaded = solver.loaded.as_ref().expect("a loaded world");
        let world = &loaded.world;
        let query = world.broad_phase.as_query_pipeline(
            world.narrow_phase.query_dispatcher(),
            &world.bodies,
            &world.colliders,
            QueryFilter::exclude_fixed(),
        );
        let role = |co: &Collider| -> Role {
            match co.parent() {
                Some(parent) if Some(parent) == loaded.handles[dropped] => Role::Dropped,
                Some(parent) if parent == was => Role::PickedUp,
                other => panic!("a query found the collider of body {other:?}, which is neither body of the scene"),
            }
        };
        let probe = SharedShape::cuboid(0.1, 0.1, 0.1);
        let cast = |from: f64, to: f64| -> Option<(Role, f64)> {
            let start = Pose::from_translation(Vector::new(from, 0.25, 0.0));
            let travel = Vector::new(to - from, 0.0, 0.0);
            query
                .cast_shape(&start, travel, &*probe, ShapeCastOptions::with_max_time_of_impact(1.0))
                .map(|(handle, hit)| (role(&world.colliders[handle]), from + hit.time_of_impact * (to - from)))
        };
        Seen {
            footprint: query.intersect_aabb_conservative(footprint).map(|(_, co)| role(co)).collect(),
            old_place: cast(-1.0, 1.0),
            new_place: cast(2.0, 4.0),
            both: cast(-1.0, 4.0),
        }
    }

    /// The #71 scene in world `turn`: the floor, body `picked` resting on it
    /// at the origin, and body `dropped` carried, its record at x = 3 for the
    /// drop. Eight quanta settle the resting body and give it a leaf in the
    /// broad phase. Returns the resting body's handle, its collider's handle,
    /// and its footprint, the box of its record.
    fn pick_and_drop_scene(turn: u32, picked: usize, dropped: usize) -> (RigidBodyHandle, ColliderHandle, Aabb) {
        set_body(picked, box_at(0.0, 0.26, 0.0));
        let mut carried = box_at(3.0, 0.26, 0.0);
        carried[DRIVEN] = 3.0;
        set_body(dropped, carried);
        set_collider(0, FLOOR);
        assert_eq!(ensure(turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        for _ in 0..8 {
            assert_eq!(solver_step(turn, 2, 1, 0, 0, 0.0, 0), 1);
        }
        let b = body_at(picked);
        let footprint = Aabb::from_half_extents(Vector::new(b[0], b[1], b[2]), Vector::new(b[HX], b[HY], b[HZ]));
        let solver = unsafe { &*(&raw const SOLVER) };
        let (handle, collider) = held(solver.loaded.as_ref().expect("a loaded world"), picked).expect("the resting body");
        (handle, collider, footprint)
    }

    /// The handle of body `i`'s collider in the loaded world.
    fn collider_of(i: usize) -> ColliderHandle {
        let solver = unsafe { &*(&raw const SOLVER) };
        held(solver.loaded.as_ref().expect("a loaded world"), i).expect("a body in the world").1
    }

    // #71. Body `picked` rests on the floor and body `dropped` is carried; in
    // one quantum `picked` is picked up and `dropped` put down 3 away, in
    // both record orders. Until the quantum's step, the broad phase still
    // holds the picked-up body's leaf, with its old box, under its collider's
    // slot, and every query resolves a leaf by slot alone. Rapier's collider
    // arena gives an insert the slot the latest removal freed, so a drop
    // applied after the pick-up takes that slot, and the queries over the old
    // footprint then find the dropped body. Whichever body has the lower
    // record index, the queries must see the same: nothing over the old
    // footprint before the step and the dropped body in no query yet, and
    // after the step the dropped body at its real face and nothing over the
    // old footprint.
    //
    // The check's red, planted: the same quantum as two switches with no step
    // between them, the pick-up's first, which is the order a single switch
    // applied the two in on main whenever the picked-up body had the lower
    // index. The drop takes the freed slot at a new generation and the old
    // footprint finds the dropped body; still no query hits anything where
    // the picked-up body was, and a cast crossing both places hits the
    // dropped body only at its real face, where the step puts it anyway.
    #[test]
    fn a_body_put_down_as_another_is_picked_up_enters_the_queries_at_the_step_in_either_record_order() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let mut orders = Vec::new();
        for (picked, dropped) in [(0, 1), (1, 0)] {
            *turn += 1;
            let (was, freed, footprint) = pick_and_drop_scene(*turn, picked, dropped);
            let resting = seen(dropped, was, footprint);
            set_slot(picked, DRIVEN, 3.0);
            set_slot(dropped, DRIVEN, 0.0);
            assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Switched), "picked-up body {picked}");
            let taken = collider_of(dropped).into_raw_parts().0 == freed.into_raw_parts().0;
            let before = seen(dropped, was, footprint);
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
            let after = seen(dropped, was, footprint);
            println!("body {picked} picked up and body {dropped} put down: at rest {resting:?}; the drop took the freed slot: {taken}; before the step {before:?}; after it {after:?}");
            orders.push((picked, resting, taken, before, after));
        }
        for (picked, resting, taken, before, after) in &orders {
            assert_eq!(resting.footprint, vec![Role::PickedUp], "picked-up body {picked}: at rest, the query over its footprint did not find it, so the check could not go red");
            assert!(!before.footprint.contains(&Role::Dropped), "picked-up body {picked}: before the step, the query over its old footprint found the dropped body: {before:?}");
            assert!(!taken, "picked-up body {picked}: the drop took the collider slot the pick-up freed in its quantum");
            assert_eq!(*before, Seen { footprint: vec![], old_place: None, new_place: None, both: None }, "picked-up body {picked}: the queries found a body before the step");
            assert!(after.footprint.is_empty() && after.old_place.is_none(), "picked-up body {picked}: after the step, a query found a body where the picked-up body was: {after:?}");
            for hit in [after.new_place, after.both] {
                assert!(hit.is_some_and(|(role, x)| role == Role::Dropped && (x - DROPPED_FACE).abs() < 1.0e-6), "picked-up body {picked}: after the step, the dropped body is not hit at its face: {after:?}");
            }
        }
        assert_eq!(orders[0].3, orders[1].3, "the two record orders see different bodies before the step");
        assert_eq!(orders[0].4, orders[1].4, "the two record orders see different bodies after the step");

        // The red: the pick-up switched first, then the drop, before the step.
        *turn += 1;
        let (was, freed, footprint) = pick_and_drop_scene(*turn, 0, 1);
        set_slot(0, DRIVEN, 3.0);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Switched));
        set_slot(1, DRIVEN, 0.0);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Switched));
        let (slot, generation) = collider_of(1).into_raw_parts();
        let (freed_slot, freed_generation) = freed.into_raw_parts();
        let aliased = seen(1, was, footprint);
        println!("the pick-up switched before the drop: the dropped body's collider is at slot {slot} generation {generation}, the freed one at slot {freed_slot} generation {freed_generation}; before the step {aliased:?}");
        assert!(slot == freed_slot && generation != freed_generation, "the drop did not take the freed slot at a new generation, so the check could not go red");
        assert_eq!(aliased.footprint, vec![Role::Dropped], "the old footprint did not find the dropped body, so the check could not go red");
        assert_eq!(aliased.old_place, None, "a cast through the picked-up body's old place alone hit a body");
        assert_eq!(aliased.new_place, None, "a cast through the dropped body's place alone found it before the step, which has no leaf for it yet");
        assert!(aliased.both.is_some_and(|(role, x)| role == Role::Dropped && (x - DROPPED_FACE).abs() < 1.0e-6), "a cast crossing both places hit elsewhere than the dropped body's face: {aliased:?}");
    }

    /// Driven to dynamic with the velocities set before the type: the order
    /// F1 pin 2 forbids, planted so the check below is seen to catch it.
    fn to_dynamic_velocities_first(body: &mut RigidBody, b: &[f64; BODY_STRIDE], rotation: Rotation) {
        body.set_linvel(Vector::new(b[3], b[4], b[5]), false);
        body.set_angvel(Vector::new(b[WX], b[WY], b[WZ]), false);
        body.set_body_type(RigidBodyType::Dynamic, false);
        body.lock_rotations(false, false);
        body.set_additional_mass_properties(MassProperties::default(), false);
        body.set_rotation(rotation, false);
        dynamic_sleep(body.activation_mut());
        body.wake_up(true);
    }

    /// A driven body as the world holds it, switched to dynamic by `apply`
    /// from a record with velocities: whether it has the record's velocities.
    fn keeps_record_velocity(apply: fn(&mut RigidBody, &[f64; BODY_STRIDE], Rotation)) -> bool {
        let mut record = box_at(0.0, 1.0, 0.0);
        record[3] = 0.5;
        record[4] = 0.75;
        record[5] = -0.25;
        record[WX] = 0.125;
        record[WY] = -0.5;
        record[WZ] = 0.25;
        let Ok((mut body, _)) = body_for(&record, true, 0) else {
            return false;
        };
        let Ok(rotation) = quat_from_body(&record) else {
            return false;
        };
        apply(&mut body, &record, rotation);
        body.is_dynamic() && body.linvel() == Vector::new(0.5, 0.75, -0.25) && body.angvel() == Vector::new(0.125, -0.5, 0.25)
    }

    // F1 pin 6. Rapier ignores set_linvel and set_angvel on a position-based
    // kinematic body, so going back to dynamic sets the type first.
    #[test]
    fn a_body_switched_back_to_dynamic_keeps_its_record_velocity_and_the_wrong_order_is_caught() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        assert!(keeps_record_velocity(to_dynamic), "the law's order lost the record velocity");
        assert!(!keeps_record_velocity(to_dynamic_velocities_first), "velocities set before the type survived, so the check could not go red");

        // Through the law: the upper box driven, then dynamic again with a
        // velocity in its record.
        stack();
        *turn += 1;
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Built));
        set_slot(1, DRIVEN, 1.0);
        for _ in 0..4 {
            assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, 0), 1);
        }
        for (slot, v) in [(3, 0.5), (4, 0.75), (5, -0.25), (WX, 0.125), (WY, -0.5), (WZ, 0.25)] {
            set_slot(1, slot, v);
        }
        set_slot(1, DRIVEN, 0.0);
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 0), Ok(Load::Switched));
        let solver = unsafe { &*(&raw const SOLVER) };
        let loaded = solver.loaded.as_ref().expect("a loaded world");
        let body = &loaded.world.bodies[loaded.handles[1].expect("the upper box")];
        assert!(body.is_dynamic());
        assert_eq!(body.linvel(), Vector::new(0.5, 0.75, -0.25));
        assert_eq!(body.angvel(), Vector::new(0.125, -0.5, 0.25));
    }

    /// The shape of body `i`'s collider in the loaded world.
    fn shape_of(i: usize) -> Option<ShapeType> {
        let solver = unsafe { &*(&raw const SOLVER) };
        let loaded = solver.loaded.as_ref()?;
        let handle = loaded.handles[i]?;
        let collider = *loaded.world.bodies.get(handle)?.colliders().first()?;
        Some(loaded.world.colliders.get(collider)?.shape().shape_type())
    }

    // F1 pin 6: a switch in a capsule world. A driven body's collider is the
    // capsule and a dynamic body's the box, as build_world makes them, through
    // every transition; a box world keeps boxes. A to-driven switch that left
    // the collider alone keeps the box, which the same check sees.
    #[test]
    fn in_a_capsule_world_a_switch_sets_the_collider_shape_with_the_type() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        for shape in [1u32, 0] {
            let capsule = if shape == 1 { ShapeType::Capsule } else { ShapeType::Cuboid };
            stack();
            *turn += 1;
            assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, shape), Ok(Load::Built));
            assert_eq!((shape_of(0), shape_of(1)), (Some(ShapeType::Cuboid), Some(ShapeType::Cuboid)));
            // Driven, dynamic, carried, put back driven, dynamic again.
            let expected = [(1.0, Some(capsule)), (0.0, Some(ShapeType::Cuboid)), (3.0, None), (1.0, Some(capsule)), (0.0, Some(ShapeType::Cuboid))];
            for (mode, want) in expected {
                set_slot(1, DRIVEN, mode);
                assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, shape), Ok(Load::Switched), "shape {shape} mode {mode}");
                assert_eq!(shape_of(1), want, "shape {shape} mode {mode}");
                assert_eq!(shape_of(0), Some(ShapeType::Cuboid), "the untouched box, shape {shape} mode {mode}");
                for _ in 0..4 {
                    assert_eq!(solver_step(*turn, 2, 1, 0, 0, 0.0, shape), 1);
                }
            }
        }
        // The red: the type switched and the collider left alone.
        stack();
        *turn += 1;
        assert_eq!(ensure(*turn, 2, 1, 0, 0, 0.0, 1), Ok(Load::Built));
        let solver = unsafe { &mut *(&raw mut SOLVER) };
        let loaded = solver.loaded.as_mut().expect("a loaded world");
        to_driven(&mut loaded.world.bodies[loaded.handles[1].expect("the upper box")]);
        assert_ne!(shape_of(1), Some(ShapeType::Capsule), "a switch without set_shape made a capsule, so the check could not go red");
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
    // in harness/soundness.test.js). Before F1 a rebuild at every verb
    // boundary did the same thing inside a run; since F1 a build happens only
    // at a world's first load and when the world itself changes, and a verb
    // boundary switches in place (harness/switch.test.js holds the minds
    // fixture's quaternions to their bits across its verb boundaries).
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

    // -----------------------------------------------------------------------
    // F2: the character moves through the engine's copy of Rapier's
    // controller, solver/src/kcc.rs, which adds one branch to decompose_hit
    // (docs/dispatch-f2-walker-stride.md).
    //
    // Pin 4, the control test. Rapier's own controller and the copy with its
    // branch off are called with the same inputs at every quantum of the flat
    // walk (the product walker alone on the product floor, at the origin and
    // at an offset of a million), the ten cases of the character course
    // (harness/course.test.js), the 0.29 step from 20 start positions in each
    // of four directions (harness/outcome.test.js), and the verb fixture's
    // carry in a capsule world, and each call must return the same movement
    // bit for bit. Rapier's result moves the character, so every run is the
    // run main makes. The same comparison against the copy with its branch on
    // is the test's red: it parts on the flat walk's stalled quanta, and only
    // there.
    //
    // Pin 5 at the law: with the branch the flat walk keeps its stride at
    // both offsets, and the step is climbed from all 80 starts; an `up`
    // tilted past the window the settings fix works in refuses the step,
    // which is the step check's red.
    //
    // Pin 10: the time per call of the copy against Rapier's controller on
    // the product walker's flat walk, printed.

    use crate::kcc::Controller;
    use rapier3d_f64::control::EffectiveCharacterMovement;
    use std::time::{Duration, Instant};

    const WALK: f64 = 0.4;
    const STRIDE: f64 = WALK * DT;
    const QUANTA_FLAT: usize = 10_000;
    const MILLION: f64 = 1.0e6;

    /// One controller call as words, bit for bit: the translation, grounded,
    /// the sliding flag, and each collision's collider, pose, applied and
    /// remaining translations, and hit.
    fn movement_words(m: &EffectiveCharacterMovement, collisions: &[CharacterCollision]) -> Vec<u64> {
        fn v(out: &mut Vec<u64>, v: Vector) {
            out.extend([v.x.to_bits(), v.y.to_bits(), v.z.to_bits()]);
        }
        let mut out = Vec::new();
        v(&mut out, m.translation);
        out.push(m.grounded as u64);
        out.push(m.is_sliding_down_slope as u64);
        out.push(collisions.len() as u64);
        for c in collisions {
            let (index, generation) = c.handle.into_raw_parts();
            out.extend([index as u64, generation as u64]);
            v(&mut out, c.character_pos.translation);
            let r = c.character_pos.rotation;
            out.extend([r.x.to_bits(), r.y.to_bits(), r.z.to_bits(), r.w.to_bits()]);
            v(&mut out, c.translation_applied);
            v(&mut out, c.translation_remaining);
            out.push(c.hit.time_of_impact.to_bits());
            v(&mut out, c.hit.witness1);
            v(&mut out, c.hit.witness2);
            v(&mut out, c.hit.normal1);
            v(&mut out, c.hit.normal2);
            out.push(c.hit.status as u64);
        }
        out
    }

    /// Rapier's own controller, the copy with its branch off, and the copy
    /// with its branch on, called with the same inputs; Rapier's result moves
    /// the character. It keeps the first call where the copy with the branch
    /// off parts from Rapier, the quanta where the copy with the branch on
    /// does, and how many hits had a normal parallel to `up`, where the branch
    /// applies.
    #[derive(Default)]
    struct Control {
        run: String,
        quantum: usize,
        calls: usize,
        parted: Option<String>,
        branch: Vec<usize>,
        degenerate: usize,
    }

    impl Mover for Control {
        fn move_shape(
            &mut self,
            controller: &KinematicCharacterController,
            dt: f64,
            queries: &QueryPipeline,
            character_shape: &dyn Shape,
            character_pos: &Pose,
            desired_translation: Vector,
            collisions: &mut Vec<CharacterCollision>,
        ) -> EffectiveCharacterMovement {
            self.calls += 1;
            let mut theirs = Vec::new();
            let rapier = controller.move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| theirs.push(hit));
            let mut ours = Vec::new();
            let off = Controller::<false>(controller).move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| ours.push(hit));
            let mut patched = Vec::new();
            let on = Controller::<true>(controller).move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| patched.push(hit));
            let want = movement_words(&rapier, &theirs);
            let got = movement_words(&off, &ours);
            if self.parted.is_none() && got != want {
                let word = want.iter().zip(got.iter()).position(|(a, b)| a != b).unwrap_or(want.len().min(got.len()));
                self.parted = Some(format!(
                    "{} quantum {}: word {} of the movement differs.\nRapier: {:?} {:?}\nthe copy, branch off: {:?} {:?}",
                    self.run, self.quantum, word, rapier, theirs, off, ours
                ));
            }
            if movement_words(&on, &patched) != want && self.branch.last() != Some(&self.quantum) {
                self.branch.push(self.quantum);
            }
            self.degenerate += theirs.iter().filter(|c| c.hit.normal1.cross(controller.up).try_normalize().is_none()).count();
            collisions.extend(theirs);
            rapier
        }
    }

    /// Rapier's own controller, alone.
    struct Rapier;

    impl Mover for Rapier {
        fn move_shape(
            &mut self,
            controller: &KinematicCharacterController,
            dt: f64,
            queries: &QueryPipeline,
            character_shape: &dyn Shape,
            character_pos: &Pose,
            desired_translation: Vector,
            collisions: &mut Vec<CharacterCollision>,
        ) -> EffectiveCharacterMovement {
            controller.move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| collisions.push(hit))
        }
    }

    /// The copy with its branch off, alone.
    struct Unpatched;

    impl Mover for Unpatched {
        fn move_shape(
            &mut self,
            controller: &KinematicCharacterController,
            dt: f64,
            queries: &QueryPipeline,
            character_shape: &dyn Shape,
            character_pos: &Pose,
            desired_translation: Vector,
            collisions: &mut Vec<CharacterCollision>,
        ) -> EffectiveCharacterMovement {
            Controller::<false>(controller).move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| collisions.push(hit))
        }
    }

    /// Another mover, timed.
    struct Timed<M: Mover> {
        inner: M,
        spent: Duration,
        calls: usize,
    }

    impl<M: Mover> Mover for Timed<M> {
        fn move_shape(
            &mut self,
            controller: &KinematicCharacterController,
            dt: f64,
            queries: &QueryPipeline,
            character_shape: &dyn Shape,
            character_pos: &Pose,
            desired_translation: Vector,
            collisions: &mut Vec<CharacterCollision>,
        ) -> EffectiveCharacterMovement {
            let start = Instant::now();
            let out = self.inner.move_shape(controller, dt, queries, character_shape, character_pos, desired_translation, collisions);
            self.spent += start.elapsed();
            self.calls += 1;
            out
        }
    }

    /// A walker as the course drives it: a 0.25 box at (x, y, z), driven
    /// (mode 1) at (vx, 0, vz).
    fn walker(x: f64, y: f64, z: f64, vx: f64, vz: f64) -> [f64; BODY_STRIDE] {
        [x, y, z, vx, 0.0, vz, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.25, 0.25, 0.25, 1.0]
    }

    fn slab(min_x: f64, max_x: f64, min_y: f64, max_y: f64, min_z: f64, max_z: f64) -> [f64; COLLIDER_STRIDE] {
        [min_x, max_x, min_y, max_y, min_z, max_z, 0.0, 0.0, 0.0, 1.0]
    }

    /// A run of the law: its bodies and colliders, its length, the character
    /// shape, and the record edits the tick makes before a quantum, as
    /// (quantum, body, slot, value). Between edits the tick writes back what
    /// the law returned, so a record the law wrote stays as it is.
    struct Run {
        name: String,
        bodies: Vec<[f64; BODY_STRIDE]>,
        colliders: Vec<[f64; COLLIDER_STRIDE]>,
        quanta: usize,
        shape: u32,
        edits: Vec<(usize, usize, usize, f64)>,
        /// A controller `up` planted after the build, for a red.
        up: Option<Vector>,
    }

    impl Run {
        fn new(name: &str, bodies: Vec<[f64; BODY_STRIDE]>, colliders: Vec<[f64; COLLIDER_STRIDE]>, quanta: usize) -> Run {
            Run { name: name.to_string(), bodies, colliders, quanta, shape: 0, edits: Vec::new(), up: None }
        }

        fn edit(&self, q: usize) {
            for &(at, i, slot, v) in &self.edits {
                if at == q {
                    set_slot(i, slot, v);
                }
            }
        }
    }

    /// Runs `run` through the law with `mover` as a new world: the load, a
    /// planted `up` if the run has one, then each quantum's edits and step.
    /// `before` sees the mover and the quantum about to be stepped, counted
    /// from 1 as the course counts its ticks; `after` sees the quantum once it
    /// has stepped. A load before the first step is what the first step's own
    /// load would do. The push is the law's, `Shove` (F3); none of these runs
    /// brings two dynamic colliders near a character, and F3's control test
    /// holds the push to Rapier's routine bit for bit on each of them, so every
    /// run is still the run main makes.
    fn drive<M: Mover>(turn: &mut u32, run: &Run, mover: &mut M, mut before: impl FnMut(&mut M, usize), after: impl FnMut(usize)) {
        drive_pushed(turn, run, mover, &mut Shove, |m, _, q| before(m, q), after);
    }

    /// `drive` with the push named: `before` sees the mover, the pusher, and
    /// the quantum about to be stepped.
    fn drive_pushed<M: Mover, P: Pusher>(turn: &mut u32, run: &Run, mover: &mut M, pusher: &mut P, mut before: impl FnMut(&mut M, &mut P, usize), mut after: impl FnMut(usize)) {
        *turn += 1;
        for (i, b) in run.bodies.iter().enumerate() {
            set_body(i, *b);
        }
        for (j, c) in run.colliders.iter().enumerate() {
            set_collider(j, *c);
        }
        let (n, m) = (run.bodies.len() as u32, run.colliders.len() as u32);
        run.edit(0);
        assert_eq!(ensure(*turn, n, m, 0, 0, 0.0, run.shape), Ok(Load::Built), "{}", run.name);
        if let Some(up) = run.up {
            let solver = unsafe { &mut *(&raw mut SOLVER) };
            solver.loaded.as_mut().expect("a loaded world").controller.up = up;
        }
        for q in 0..run.quanta {
            if q > 0 {
                run.edit(q);
            }
            before(mover, pusher, q + 1);
            assert_eq!(step_law(*turn, n, m, 0, 0, 0.0, run.shape, mover, pusher), Ok(()), "{} at quantum {}", run.name, q + 1);
            after(q + 1);
        }
    }

    /// The product walker alone on the product floor, as the corpus's
    /// walker-stall bundle has it, moved by (offset, 0, offset).
    fn flat_walk(offset: f64) -> Run {
        Run::new(
            &format!("the flat walk at {offset:e}"),
            vec![walker(10.0 + offset, 0.26, 0.0 + offset, WALK, 0.0)],
            vec![slab(4.0 + offset, 80.0 + offset, -1.0, 0.0, -2.0 + offset, 6.0 + offset)],
            QUANTA_FLAT,
        )
    }

    /// What a flat walk did: the quanta whose travel fell short of the stride
    /// by more than a millionth of it, the least travel as a share of the
    /// stride, and the quanta on which the walker was not grounded.
    struct FlatWalk {
        short: Vec<usize>,
        least: f64,
        airborne: usize,
    }

    fn walk_flat<M: Mover>(turn: &mut u32, offset: f64, mover: &mut M, before: impl FnMut(&mut M, usize)) -> FlatWalk {
        let run = flat_walk(offset);
        let mut x = run.bodies[0][0];
        let mut out = FlatWalk { short: Vec::new(), least: f64::INFINITY, airborne: 0 };
        drive(turn, &run, mover, before, |q| {
            let b = body_at(0);
            let travel = b[0] - x;
            x = b[0];
            out.least = out.least.min(travel / STRIDE);
            if travel < STRIDE * (1.0 - 1.0e-6) {
                out.short.push(q);
            }
            if b[4] != 0.0 {
                out.airborne += 1;
            }
        });
        out
    }

    /// The ten cases of harness/course.test.js, with its floors, features,
    /// walkers, and lengths. The slope ramps are the colliders course.test.js
    /// computes with V8's Math.sin and Math.cos, written as V8 returns them.
    fn course() -> Vec<Run> {
        let floor = slab(-10.0, 60.0, -1.0, 0.0, -5.0, 5.0);
        let ramp44 = [10.35020615013476, 13.15020615013476, 0.3707527885240681, 1.070752788524068, -0.5, 0.5, 0.0, 0.0, 0.374606593415912, 0.9271838545667874];
        let ramp46 = [10.324290648761124, 13.124290648761125, 0.4139452908134623, 1.1139452908134624, -0.5, 0.5, 0.0, 0.0, 0.3907311284892737, 0.9205048534524404];
        let drop = |d: f64| vec![slab(-10.0, 12.0, -1.0, 0.0, -5.0, 5.0), slab(12.0, 60.0, -1.0 - d, -d, -5.0, 5.0)];
        let meet = |speed: f64| vec![walker(10.0, 0.26, 0.0, speed, 0.0), walker(12.0, 0.26, 0.0, -speed, 0.0)];
        vec![
            Run::new("course 5.1, the 0.29 step", vec![walker(10.0, 0.26, 0.0, WALK, 0.0)], vec![floor, slab(11.0, 20.0, 0.0, 0.29, -5.0, 5.0)], 480),
            Run::new("course 5.2, the 0.33 step", vec![walker(10.0, 0.26, 0.0, WALK, 0.0)], vec![floor, slab(11.0, 20.0, 0.0, 0.33, -5.0, 5.0)], 480),
            Run::new("course 5.3, the 44 degree slope", vec![walker(10.0, 0.26, 0.0, WALK, 0.0)], vec![floor, ramp44], 960),
            Run::new("course 5.4, the 46 degree slope", vec![walker(10.0, 0.26, 0.0, WALK, 0.0)], vec![floor, ramp46], 960),
            Run::new("course 5.5, the 0.19 drop", vec![walker(11.5, 0.26, 0.0, WALK, 0.0)], drop(0.19), 240),
            Run::new("course 5.6, the 0.22 drop", vec![walker(11.5, 0.26, 0.0, WALK, 0.0)], drop(0.22), 240),
            Run::new("course 5.7, feet 0.1 inside the floor", vec![walker(0.0, 0.16, 0.0, WALK, 0.0)], vec![floor], 1300),
            Run::new("course 5.8, centre 0.1 inside the floor", vec![walker(0.0, -0.1, 0.0, WALK, 0.0)], vec![floor], 4000),
            Run::new("course 5.9, walkers meeting at 1", meet(1.0), vec![floor], 192),
            Run::new("course 5.10, walkers meeting at 8", meet(8.0), vec![floor], 192),
        ]
    }

    /// The directions of the step scan: the step's slab beyond a riser 1 from
    /// the origin, and the walker's velocity.
    const STEP_DIRECTIONS: [(&str, [f64; 6], f64, f64); 4] = [
        ("+x", [1.0, 10.0, 0.0, 0.29, -5.0, 5.0], WALK, 0.0),
        ("-x", [-10.0, -1.0, 0.0, 0.29, -5.0, 5.0], -WALK, 0.0),
        ("+z", [-5.0, 5.0, 0.0, 0.29, 1.0, 10.0], 0.0, WALK),
        ("-z", [-5.0, 5.0, 0.0, 0.29, -10.0, -1.0], 0.0, -WALK),
    ];
    const STEP_STARTS: usize = 20;
    const STEP_QUANTA: usize = 480;

    /// The 0.29 step in one direction from start `k`: the walker starts k
    /// twentieths of a stride back from the origin, so the 20 starts meet the
    /// riser at 20 phases of a quantum. harness/outcome.test.js runs the same.
    fn step_run(direction: usize, k: usize) -> Run {
        let (name, s, vx, vz) = STEP_DIRECTIONS[direction];
        let back = k as f64 * STRIDE / STEP_STARTS as f64;
        // 0 - back, not -back, so the first start is +0 and not -0.
        let (x, z) = match direction {
            0 => (0.0 - back, 0.0),
            1 => (back, 0.0),
            2 => (0.0, 0.0 - back),
            _ => (0.0, back),
        };
        Run::new(
            &format!("the 0.29 step {name} from start {k}"),
            vec![walker(x, 0.26, z, vx, vz)],
            vec![slab(-10.0, 10.0, -1.0, 0.0, -10.0, 10.0), slab(s[0], s[1], s[2], s[3], s[4], s[5])],
            STEP_QUANTA,
        )
    }

    /// Whether the walker of a step run is on the step: its feet within 1e-3
    /// of 0.29 and its back face past the riser.
    fn on_the_step(direction: usize) -> bool {
        let b = body_at(0);
        let along = match direction {
            0 => b[0],
            1 => -b[0],
            2 => b[2],
            _ => -b[2],
        };
        (b[1] - 0.25 - SKIN - 0.29).abs() <= 1.0e-3 && along - 0.25 > 1.0
    }

    /// The verb fixture's carry in a capsule world (fixtures/behavior-verbs.json,
    /// carry-capsule) as the law receives it: the walker, a dynamic box until
    /// the crate sleeps, is driven to the crate at quantum 42, picks it up at
    /// 104, carries it over the gap to the far floor, puts it down at 260, and
    /// stops at 261. The edits are the tick's writes before each quantum that
    /// differ from what the law returned, recorded from the tick at 48da598;
    /// the put-down writes the crate's whole record, as the tick's release
    /// does. The finals are the fixture's, which the replay must reproduce to
    /// be that run.
    fn capsule_carry() -> (Run, [[f64; 3]; 2]) {
        let mut walker_box = walker(0.0, 0.3, 0.0, 0.0, 0.0);
        walker_box[DRIVEN] = 0.0;
        let crate_box = [1.1, 0.26, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.12, 0.2, 0.12, 0.0];
        let mut edits = vec![
            (41, 0, 3, 1.0),
            (41, 0, 5, 4.869862308973424e-20),
            (41, 0, DRIVEN, 1.0),
            (103, 1, DRIVEN, 3.0),
            (104, 0, 5, -1.5145179960926063e-11),
            (256, 0, 3, -1.0),
            (256, 0, 5, 2.577034723244152e-10),
        ];
        let put_down = [3.1436155842291598, 0.25, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];
        for (slot, v) in put_down.iter().enumerate() {
            edits.push((259, 1, slot, *v));
        }
        edits.extend([(259, 1, DRIVEN, 0.0), (260, 0, 3, 0.0), (260, 0, 5, 0.0), (260, 0, DRIVEN, 0.0)]);
        let run = Run {
            name: "the capsule carry".to_string(),
            bodies: vec![walker_box, crate_box],
            colliders: vec![slab(-2.0, 1.6, -1.0, 0.0, -1.0, 1.0), slab(1.85, 6.0, -1.0, 0.0, -1.0, 1.0)],
            quanta: 262,
            shape: 1,
            edits,
            up: None,
        };
        let finals = [
            [3.135213727477656, 0.2557054694165416, 5.671878432180297e-12],
            [3.0131310282146035, 0.2431685875530545, 8.224034844550117e-12],
        ];
        (run, finals)
    }

    fn controlled(turn: &mut u32, run: &Run) -> Control {
        let mut control = Control { run: run.name.clone(), ..Control::default() };
        drive(turn, run, &mut control, |c, q| c.quantum = q, |_| {});
        control
    }

    // Pin 4.
    #[test]
    fn the_copy_with_its_branch_off_moves_the_character_as_rapiers_controller_does_bit_for_bit() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());

        // The flat walk, which crosses the normal the branch is for.
        for offset in [0.0, MILLION] {
            let mut control = Control { run: format!("the flat walk at {offset:e}"), ..Control::default() };
            let walk = walk_flat(&mut turn, offset, &mut control, |c, q| c.quantum = q);
            println!(
                "flat walk at {offset:e}: {} calls, Rapier's run falls short on {} quanta; the branch changes {} quanta; {} hits with the normal parallel to up",
                control.calls, walk.short.len(), control.branch.len(), control.degenerate
            );
            assert_eq!(control.parted, None, "the copy with its branch off parted from Rapier");
            assert_eq!(control.calls, QUANTA_FLAT);
            assert!(control.degenerate > 0, "the flat walk at {offset:e} never hit a normal parallel to up, so the control test does not cover the branch's case");
        }

        // The course, and the step in four directions.
        for run in course() {
            let control = controlled(&mut turn, &run);
            println!("{}: {} calls, the branch changes {} quanta", run.name, control.calls, control.branch.len());
            assert_eq!(control.parted, None, "the copy with its branch off parted from Rapier");
            assert!(control.calls >= run.quanta);
        }
        let mut changed = 0;
        for direction in 0..STEP_DIRECTIONS.len() {
            for k in 0..STEP_STARTS {
                let control = controlled(&mut turn, &step_run(direction, k));
                assert_eq!(control.parted, None, "the copy with its branch off parted from Rapier");
                assert_eq!(control.calls, STEP_QUANTA);
                changed += control.branch.len();
            }
        }
        println!("the step scan: 80 runs, the branch changes {changed} quanta");

        // The capsule carry: the copy matches in a capsule world, and the
        // replay under Rapier's controller ends where the fixture's run ended
        // at 48da598, so it is that run. A bump that moves that run fails the
        // last check, not the copy, and its edits are recorded again from the
        // tick.
        let (run, finals) = capsule_carry();
        let control = controlled(&mut turn, &run);
        println!("{}: {} calls, the branch changes {} quanta", run.name, control.calls, control.branch.len());
        assert_eq!(control.parted, None, "the copy with its branch off parted from Rapier");
        for (i, want) in finals.iter().enumerate() {
            let b = body_at(i);
            assert_eq!([b[0], b[1], b[2]], *want, "body {i} of the capsule carry did not end where the fixture's run ended at 48da598");
        }

        // The routine's first step runs only when the desired translation is
        // under 1e-5, which the law never asks for, so it is called directly:
        // a box and a capsule sunk into the floor and into a wall.
        let mut world = PhysicsWorld::new();
        for c in [slab(-4.0, 4.0, -1.0, 0.0, -4.0, 4.0), slab(1.0, 2.0, 0.0, 2.0, -4.0, 4.0)] {
            let body = RigidBodyBuilder::fixed().translation(Vector::new((c[0] + c[1]) * 0.5, (c[2] + c[3]) * 0.5, (c[4] + c[5]) * 0.5)).build();
            let _ = world.insert(body, ColliderBuilder::cuboid((c[1] - c[0]) * 0.5, (c[3] - c[2]) * 0.5, (c[5] - c[4]) * 0.5).build());
        }
        warm_broadphase(&mut world);
        let query = world.broad_phase.as_query_pipeline(world.narrow_phase.query_dispatcher(), &world.bodies, &world.colliders, QueryFilter::new());
        let settings = controller();
        let mut pushed = 0;
        for shape in [0u32, 1] {
            let character = character_shape(shape, Vector::new(0.25, 0.25, 0.25));
            for (at, desired) in [
                (Vector::new(0.0, 0.2, 0.0), Vector::ZERO),
                (Vector::new(0.8, 0.26, 0.0), Vector::ZERO),
                (Vector::new(0.8, 0.2, 0.0), Vector::new(5.0e-6, 0.0, 0.0)),
            ] {
                let pos = Pose::from_translation(at);
                let mut theirs = Vec::new();
                let rapier = settings.move_shape(DT, &query, &*character, &pos, desired, |hit| theirs.push(hit));
                let mut ours = Vec::new();
                let off = Controller::<false>(&settings).move_shape(DT, &query, &*character, &pos, desired, |hit| ours.push(hit));
                assert_eq!(movement_words(&off, &ours), movement_words(&rapier, &theirs), "shape {shape} at {at:?}: {rapier:?} against {off:?}");
                if rapier.translation != Vector::ZERO {
                    pushed += 1;
                }
            }
        }
        assert_eq!(pushed, 6, "a sunk character was not pushed out, so the depenetration was not compared");
    }

    // Pin 4's red, and pin 5's at the law. On Rapier's own flat walk the
    // walker falls short of its stride on 332 quanta at the origin and 323 at
    // 1e6, the counts main's binary gives (harness/outcome.test.js, outcome
    // 4b), and the copy with its branch on, called with the same inputs,
    // differs from Rapier on exactly those quanta: the comparison the control
    // test makes goes red on a copy that parts from Rapier, and the branch
    // changes the stalled quanta and nothing else. Run whole, the law driven
    // by the copy with the branch off keeps every record bit for bit with the
    // law driven by Rapier, and the law driven by the copy with the branch on
    // parts at the first stall.
    #[test]
    fn the_control_check_goes_red_on_the_copy_with_its_branch_on_exactly_where_rapier_stalls() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        for (offset, stalls, first_stall) in [(0.0, 332, 98), (MILLION, 323, 3)] {
            let mut control = Control { run: format!("the flat walk at {offset:e}"), ..Control::default() };
            let walk = walk_flat(&mut turn, offset, &mut control, |c, q| c.quantum = q);
            println!("flat walk at {offset:e}, Rapier's run: {} short quanta, first {:?}; the branch-on copy differs on {} quanta", walk.short.len(), walk.short.first(), control.branch.len());
            assert_eq!((walk.short.len(), walk.short.first()), (stalls, Some(&first_stall)), "Rapier's flat walk at {offset:e} is not the run main's binary makes");
            assert_eq!(control.branch, walk.short, "the branch changed a quantum Rapier did not stall on, or missed one");
            assert_eq!(control.parted, None);

            let run = flat_walk(offset);
            let mut rapier = Vec::new();
            drive(&mut turn, &run, &mut Rapier, |_, _| {}, |_| rapier.push(body_at(0)));
            let mut unpatched = Vec::new();
            drive(&mut turn, &run, &mut Unpatched, |_, _| {}, |_| unpatched.push(body_at(0)));
            let mut patched = Vec::new();
            drive(&mut turn, &run, &mut Stride, |_, _| {}, |_| patched.push(body_at(0)));
            let first = |a: &[[f64; BODY_STRIDE]], b: &[[f64; BODY_STRIDE]]| a.iter().zip(b.iter()).position(|(x, y)| x.map(f64::to_bits) != y.map(f64::to_bits)).map(|q| q + 1);
            assert_eq!(first(&unpatched, &rapier), None, "the law driven by the copy with its branch off parted from the law driven by Rapier");
            assert_eq!(first(&patched, &rapier), Some(first_stall), "the law driven by the copy with its branch on did not part at the first stall");
        }
    }

    // Pin 5 at the law.
    #[test]
    fn with_the_branch_the_flat_walk_keeps_its_stride_at_both_offsets() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        for offset in [0.0, MILLION] {
            let walk = walk_flat(&mut turn, offset, &mut Stride, |_, _| {});
            println!("flat walk at {offset:e} with the branch: {} short quanta, the least travel {} of a stride, {} quanta airborne", walk.short.len(), walk.least, walk.airborne);
            assert_eq!(walk.short, Vec::<usize>::new(), "the walker lost travel at {offset:e}");
            assert_eq!(walk.airborne, 0);
        }
    }

    // Pin 5's step at the law, and its red.
    #[test]
    fn the_step_is_climbed_from_every_start_in_four_directions_and_a_tilted_up_refuses_it() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let scan = |turn: &mut u32, up: Option<Vector>| -> [usize; 4] {
            let mut climbed = [0; 4];
            for (direction, count) in climbed.iter_mut().enumerate() {
                for k in 0..STEP_STARTS {
                    let run = Run { up, ..step_run(direction, k) };
                    drive(turn, &run, &mut Stride, |_, _| {}, |_| {});
                    if on_the_step(direction) {
                        *count += 1;
                    }
                }
            }
            climbed
        };
        let climbed = scan(&mut turn, None);
        println!("the 0.29 step, climbed from 20 starts in +x, -x, +z, -z: {climbed:?}");
        assert_eq!(climbed, [STEP_STARTS; 4]);
        let tilted = scan(&mut turn, Some(Vector::new(0.0, 1.0, 1.0e-8)));
        println!("with up tilted to (0, 1, 1e-8): {tilted:?}");
        assert!(tilted.iter().any(|&c| c < STEP_STARTS), "a tilted up climbed from every start, so the step check could not go red");
    }

    // Pin 10: the costs on record.
    #[test]
    fn the_copy_costs_about_what_rapiers_controller_costs_on_the_product_walkers_flat_walk() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let rounds = 5;
        let per_call = |turn: &mut u32, name: &str, mut run: Box<dyn FnMut(&mut u32) -> (Duration, usize)>| {
            let mut times: Vec<f64> = (0..rounds)
                .map(|_| {
                    let (spent, calls) = run(turn);
                    spent.as_secs_f64() * 1.0e6 / calls as f64
                })
                .collect();
            times.sort_by(|a, b| a.total_cmp(b));
            println!("{name}: median of {rounds} flat walks of {QUANTA_FLAT} quanta, {:.2} us a call (from {:.2} to {:.2})", times[rounds / 2], times[0], times[rounds - 1]);
            times[rounds / 2]
        };
        let rapier = per_call(&mut turn, "Rapier's controller", Box::new(|turn| {
            let mut m = Timed { inner: Rapier, spent: Duration::ZERO, calls: 0 };
            walk_flat(turn, 0.0, &mut m, |_, _| {});
            (m.spent, m.calls)
        }));
        let off = per_call(&mut turn, "the copy, branch off", Box::new(|turn| {
            let mut m = Timed { inner: Unpatched, spent: Duration::ZERO, calls: 0 };
            walk_flat(turn, 0.0, &mut m, |_, _| {});
            (m.spent, m.calls)
        }));
        let on = per_call(&mut turn, "the copy, branch on (the law)", Box::new(|turn| {
            let mut m = Timed { inner: Stride, spent: Duration::ZERO, calls: 0 };
            walk_flat(turn, 0.0, &mut m, |_, _| {});
            (m.spent, m.calls)
        }));
        assert!(rapier > 0.0 && off > 0.0 && on > 0.0);
    }

    // -----------------------------------------------------------------------
    // F3: the character's push goes through the engine's copy of Rapier's
    // impulse routine, solver/src/impulses.rs, with upstream's change, Rapier's
    // #1004 (docs/dispatch-f3-character-push.md).
    //
    // The law runs. fixtures/law-runs/ holds the product scene, every
    // behaviour fixture run on the product law, and every fixture with a push
    // (fixtures/push/) as the law receives them: the records the load wrote,
    // and before each quantum what the tick wrote differently from what the
    // law left (harness/law-runs.mjs, which harness/push.test.js holds to the
    // tick). `replay` steps one through the law. Pushed by the law's own push,
    // each must reproduce its file's digest of every quantum's records and
    // snapshot, which makes it the product binary's run bit for bit.
    //
    // Pin 4, the control test. Rapier's own routine, the copy with the change
    // off, and the copy with the change on are given the same world before
    // every push of the flat walks, the ten course cases, the step from 80
    // starts, the verb fixture's capsule carry as F2 replays it, and every law
    // run. The copy with the change off must leave the bodies as Rapier's
    // routine does, compared whole; the copy with the change on may act only
    // on a quantum on which a collision had two or more dynamic colliders near
    // the character, within the box the routine gathers from. Rapier's result
    // moves the world, so every run is the run main makes. Run whole, the law
    // pushing through the copy with the change off keeps every quantum with
    // the law pushing through Rapier's routine. On red room A the change is
    // the test's red: it acts on each of the quanta 42 to 53 that have the
    // crate and the shade near the walker and on no other, pushes differently
    // from 45, and the law parts from Rapier's routine there.
    //
    // Pin 5 at the law: through Rapier's routine the replay of red room A is
    // main's binary's run, every quantum's records and snapshot, and the
    // crate leaves quantum 53 at 26.06416630354704.
    //
    // Pin 6, the guard: no body leaves a push, or ends the quantum's step,
    // faster than PUSH_MULTIPLE times the speed its character is driven at,
    // over every law run; red room A through Rapier's routine exceeds it, first
    // at quantum 53. The bound it sits above is measured too: the engine's
    // smallest crate, struck square and listed twice among the character's
    // collisions, leaves the law's push at 6.3751 times the character's speed.
    //
    // Pin 8: the time per quantum of the push through the copy and through
    // Rapier's routine, on red room A and the product scene, printed.

    use crate::impulses::Impulses;
    use rapier3d_f64::parry::bounding_volume::BoundingVolume;
    use rapier3d_f64::parry::query::ShapeCastStatus;
    use rapier3d_f64::pipeline::QueryPipelineMut;

    /// How many times the speed its character is driven at a body may leave
    /// a push with, and still have after the quantum's step (pin 6).
    ///
    /// Below it: #1004 removes the overwrite, not the amplifier. Rapier's
    /// impulse sizes each contact point's push with the body's linear mass
    /// alone, so an ordinary push overshoots, and 0.36.0 keeps that ratio until
    /// it is fixed on its own. The engine's smallest crate struck square on its
    /// face leaves the push at 6.3751 times the character's speed along the
    /// normal when the move lists it twice or more among its collisions, and
    /// 4.5747 when it lists it once: the knowledge base's measurement on
    /// rapier3d-f64 0.36.0 (6.375 and 4.575), which
    /// a_crate_listed_twice_among_the_collisions_leaves_the_push_at_about_six_and_a_half_times_the_pushers_speed_under_the_guard
    /// reproduces through the law's push. Eight is 1.25 times that. Over every
    /// law run the highest is lower, 3.7008 as the push leaves the body (the
    /// crate of the verb fixture's carry at quantum 88, as the walker reaches it
    /// to pick it up) and 2.8785 after the step, 2.16 times under eight.
    ///
    /// Above it: through Rapier's 0.35.3 routine red room A's crate leaves the
    /// push at quantum 53 at 25.2731 times its pusher's speed, and 26.0642
    /// after the step, 3.16 times eight.
    const PUSH_MULTIPLE: f64 = 8.0;

    /// A law run as harness/law-runs.mjs writes it: every double as its bit
    /// pattern, bodies and slots from 0, quanta from 1.
    struct LawRun {
        name: String,
        quanta: usize,
        shape: u32,
        rows: u32,
        cols: u32,
        cell: f64,
        colliders: Vec<[f64; COLLIDER_STRIDE]>,
        heights: Vec<f64>,
        ids: Vec<String>,
        bodies: Vec<[f64; BODY_STRIDE]>,
        /// (first quantum, last quantum, carried body, actor)
        pins: Vec<(usize, usize, usize, usize)>,
        /// (quantum, body, slot, value), in quantum order
        edits: Vec<(usize, usize, usize, f64)>,
        finals: Vec<[f64; BODY_STRIDE]>,
        digest: String,
    }

    fn bit_word(word: &str) -> f64 {
        f64::from_bits(u64::from_str_radix(word, 16).unwrap_or_else(|e| panic!("{word} is not a bit pattern: {e}")))
    }

    fn bit_record<const N: usize>(words: &[&str]) -> [f64; N] {
        assert_eq!(words.len(), N, "a record of {N} values has {}", words.len());
        let mut out = [0.0; N];
        for (value, word) in out.iter_mut().zip(words) {
            *value = bit_word(word);
        }
        out
    }

    fn parse_law_run(text: &str) -> LawRun {
        let mut run = LawRun {
            name: String::new(),
            quanta: 0,
            shape: 0,
            rows: 0,
            cols: 0,
            cell: 0.0,
            colliders: Vec::new(),
            heights: Vec::new(),
            ids: Vec::new(),
            bodies: Vec::new(),
            pins: Vec::new(),
            edits: Vec::new(),
            finals: Vec::new(),
            digest: String::new(),
        };
        let count = |word: &str| -> usize { word.parse().unwrap_or_else(|e| panic!("{word} is not a count: {e}")) };
        for line in text.lines() {
            let words: Vec<&str> = line.split_whitespace().collect();
            match words.first().copied() {
                Some("run") => {
                    run.name = words[1].to_string();
                    run.quanta = count(words[2]);
                    run.shape = count(words[3]) as u32;
                    run.rows = count(words[4]) as u32;
                    run.cols = count(words[5]) as u32;
                    run.cell = bit_word(words[6]);
                }
                Some("collider") => run.colliders.push(bit_record(&words[1..])),
                Some("heights") => run.heights = words[1..].iter().map(|w| bit_word(w)).collect(),
                Some("body") => {
                    run.ids.push(words[1].to_string());
                    run.bodies.push(bit_record(&words[2..]));
                }
                Some("pin") => run.pins.push((count(words[1]), count(words[2]), count(words[3]), count(words[4]))),
                Some("edit") => run.edits.push((count(words[1]), count(words[2]), count(words[3]), bit_word(words[4]))),
                Some("final") => run.finals.push(bit_record(&words[2..])),
                Some("digest") => run.digest = words[1].to_string(),
                None => {}
                Some(other) => panic!("a law run has no line that starts {other}"),
            }
        }
        assert!(run.edits.windows(2).all(|w| w[0].0 <= w[1].0), "{}: the edits are not in quantum order", run.name);
        run
    }

    /// Every law run in fixtures/law-runs/, in file order.
    fn law_runs() -> Vec<LawRun> {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures/law-runs");
        let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("{dir}: {e}"))
            .map(|entry| entry.expect("a directory entry").path())
            .filter(|path| path.extension().is_some_and(|x| x == "txt"))
            .collect();
        files.sort();
        files.iter().map(|path| parse_law_run(&std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display())))).collect()
    }

    fn law_run(name: &str) -> LawRun {
        law_runs().into_iter().find(|run| run.name == name).unwrap_or_else(|| panic!("fixtures/law-runs/ has no run {name}"))
    }

    /// packages/frame/hash.js's byte stream: two FNV-1a lanes; of every eight
    /// bytes a call gives it, the first four feed lane 0 and the last four
    /// lane 1.
    struct Lanes(u32, u32);

    impl Lanes {
        fn new() -> Lanes {
            Lanes(0x811c_9dc5, 0x811c_9dc5)
        }

        fn bytes(&mut self, data: &[u8]) {
            for (i, &byte) in data.iter().enumerate() {
                if i & 4 == 0 {
                    self.0 = (self.0 ^ byte as u32).wrapping_mul(0x0100_0193);
                } else {
                    self.1 = (self.1 ^ byte as u32).wrapping_mul(0x0100_0193);
                }
            }
        }

        fn digest(&self) -> String {
            format!("{:08x}{:08x}", self.0, self.1)
        }
    }

    /// The first `n` body records, as the solver's buffer holds them.
    fn record_bytes(n: usize) -> Vec<u8> {
        (0..n).flat_map(|i| body_at(i)).flat_map(f64::to_le_bytes).collect()
    }

    /// The pose the tick's pinCarried gives a carried body on its actor: the
    /// actor's x and z, its y plus both half-heights, no velocity, no rotation.
    fn pin_carried(body: usize, actor: usize) {
        let a = body_at(actor);
        let c = body_at(body);
        let pose = [a[0], a[1] + a[HY] + c[HY], a[2], 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];
        for (slot, value) in pose.iter().enumerate() {
            set_slot(body, slot, *value);
        }
    }

    /// Steps a law run through the law with `mover` and `pusher` as a new
    /// world: the load's records, then before each quantum its pins and its
    /// edits, then the step. `before` sees the pusher and the quantum about to
    /// be stepped; `after` sees the pusher and the quantum once it has stepped. Returns each
    /// quantum's digest of its records and snapshot, and the run's digest over
    /// all of them, as harness/law-runs.mjs computes it.
    fn replay<M: Mover, P: Pusher>(
        turn: &mut u32,
        run: &LawRun,
        mover: &mut M,
        pusher: &mut P,
        mut before: impl FnMut(&mut P, usize),
        mut after: impl FnMut(&mut P, usize),
    ) -> (Vec<String>, String) {
        *turn += 1;
        for (i, b) in run.bodies.iter().enumerate() {
            set_body(i, *b);
        }
        for (j, c) in run.colliders.iter().enumerate() {
            set_collider(j, *c);
        }
        set_heights(&run.heights);
        let (n, m) = (run.bodies.len() as u32, run.colliders.len() as u32);
        assert_eq!(ensure(*turn, n, m, run.rows, run.cols, run.cell, run.shape), Ok(Load::Built), "{}", run.name);
        let mut lanes = Lanes::new();
        let mut quanta = Vec::with_capacity(run.quanta);
        let mut edits = run.edits.iter().peekable();
        for q in 1..=run.quanta {
            for &(first, last, body, actor) in &run.pins {
                if first <= q && q <= last {
                    pin_carried(body, actor);
                }
            }
            while let Some(&&(at, i, slot, value)) = edits.peek() {
                if at != q {
                    break;
                }
                set_slot(i, slot, value);
                edits.next();
            }
            before(pusher, q);
            assert_eq!(step_law(*turn, n, m, run.rows, run.cols, run.cell, run.shape, mover, pusher), Ok(()), "{} at quantum {q}", run.name);
            let records = record_bytes(run.bodies.len());
            let snap = snapshot();
            let mut one = Lanes::new();
            one.bytes(&records);
            one.bytes(&snap);
            quanta.push(one.digest());
            lanes.bytes(&records);
            lanes.bytes(&snap);
            after(pusher, q);
        }
        (quanta, lanes.digest())
    }

    /// The first quantum, counted from 1, at which two runs' digests differ.
    fn parting(a: &[String], b: &[String]) -> Option<usize> {
        a.iter().zip(b.iter()).position(|(x, y)| x != y).map(|q| q + 1)
    }

    /// Every record and snapshot of a run driven by `drive_pushed`, one
    /// digest a quantum.
    fn driven_hashes<P: Pusher>(turn: &mut u32, run: &Run, pusher: &mut P) -> Vec<String> {
        let mut out = Vec::new();
        let n = run.bodies.len();
        drive_pushed(turn, run, &mut Stride, pusher, |_, _, _| {}, |_| {
            let mut one = Lanes::new();
            one.bytes(&record_bytes(n));
            one.bytes(&snapshot());
            out.push(one.digest());
        });
        out
    }

    /// Rapier's own routine, alone.
    struct RapierRoutine;

    impl Pusher for RapierRoutine {
        fn push(&mut self, controller: &KinematicCharacterController, dt: f64, queries: &mut QueryPipelineMut, character_shape: &dyn Shape, character_mass: f64, collisions: &[CharacterCollision]) {
            controller.solve_character_collision_impulses(dt, queries, character_shape, character_mass, collisions);
        }
    }

    /// The copy with the change off, alone.
    struct CopyOff;

    impl Pusher for CopyOff {
        fn push(&mut self, controller: &KinematicCharacterController, dt: f64, queries: &mut QueryPipelineMut, character_shape: &dyn Shape, character_mass: f64, collisions: &[CharacterCollision]) {
            Impulses::<false>(controller).solve_character_collision_impulses(dt, queries, character_shape, character_mass, collisions);
        }
    }

    /// The dynamic colliders the routine gathers for one collision: those
    /// whose box in the query tree meets the character's box at the
    /// collision, loosened by the prediction distance, and whose body is
    /// dynamic. Two or more is where the change applies.
    fn dynamic_near(controller: &KinematicCharacterController, queries: &QueryPipelineMut, character_shape: &dyn Shape, collision: &CharacterCollision) -> usize {
        let extents = character_shape.compute_local_aabb().extents();
        let up_extent = extents.dot(controller.up.abs());
        let offset = match controller.offset {
            CharacterLength::Relative(x) => up_extent * x,
            CharacterLength::Absolute(x) => x,
        };
        let aabb = character_shape.compute_aabb(&collision.character_pos).loosened(offset + 0.05);
        queries
            .as_ref()
            .intersect_aabb_conservative(aabb)
            .filter(|(_, collider)| collider.parent().and_then(|parent| queries.bodies.get(parent)).is_some_and(|body| body.is_dynamic()))
            .count()
    }

    /// Where two Debug texts first differ, with some of each around it.
    fn text_difference(want: &str, got: &str) -> String {
        let at = want.bytes().zip(got.bytes()).position(|(a, b)| a != b).unwrap_or(want.len().min(got.len()));
        let from = at.saturating_sub(160);
        let window = |s: &str| s.get(from..(at + 160).min(s.len())).unwrap_or("").to_string();
        format!("at byte {at}:\nRapier: ...{}...\nthe copy: ...{}...", window(want), window(got))
    }

    /// Rapier's own routine, the copy with the change off, and the copy with
    /// the change on, given the same world before each push; Rapier's result
    /// moves the world. After each push the three body sets are compared
    /// whole, by their Debug text: every body's velocities, activation, and
    /// change flags, and the set's list of modified bodies. It keeps the first
    /// push where the copy with the change off parts from Rapier, the quanta
    /// where the copy with the change on leaves the set differently and where
    /// it leaves some body's velocities differently, the quanta on which a
    /// collision had two or more dynamic colliders near the character, and how
    /// many collisions had one or more.
    #[derive(Default)]
    struct PushControl {
        run: String,
        quantum: usize,
        calls: usize,
        near: usize,
        two: Vec<usize>,
        parted: Option<String>,
        changed: Vec<usize>,
        moved: Vec<usize>,
    }

    impl Pusher for PushControl {
        fn push(&mut self, controller: &KinematicCharacterController, dt: f64, queries: &mut QueryPipelineMut, character_shape: &dyn Shape, character_mass: f64, collisions: &[CharacterCollision]) {
            self.calls += 1;
            for collision in collisions {
                let near = dynamic_near(controller, queries, character_shape, collision);
                if near > 0 {
                    self.near += 1;
                }
                if near > 1 && self.two.last() != Some(&self.quantum) {
                    self.two.push(self.quantum);
                }
            }
            let colliders = queries.colliders.clone();
            let mut off = queries.bodies.clone();
            let mut on = queries.bodies.clone();
            controller.solve_character_collision_impulses(dt, queries, character_shape, character_mass, collisions);
            let mut off_colliders = colliders.clone();
            let mut aside = QueryPipelineMut { dispatcher: queries.dispatcher, bvh: queries.bvh, bodies: &mut off, colliders: &mut off_colliders, filter: queries.filter };
            Impulses::<false>(controller).solve_character_collision_impulses(dt, &mut aside, character_shape, character_mass, collisions);
            let mut on_colliders = colliders;
            let mut aside = QueryPipelineMut { dispatcher: queries.dispatcher, bvh: queries.bvh, bodies: &mut on, colliders: &mut on_colliders, filter: queries.filter };
            Impulses::<true>(controller).solve_character_collision_impulses(dt, &mut aside, character_shape, character_mass, collisions);
            let want = format!("{:?}", queries.bodies);
            let got = format!("{off:?}");
            if self.parted.is_none() && got != want {
                self.parted = Some(format!("{} quantum {}: the copy with the change off left the bodies differently from Rapier's routine, {}", self.run, self.quantum, text_difference(&want, &got)));
            }
            if format!("{on:?}") != want && self.changed.last() != Some(&self.quantum) {
                self.changed.push(self.quantum);
            }
            let velocities = |set: &RigidBodySet| -> Vec<u64> { set.iter().flat_map(|(_, b)| [b.linvel().x, b.linvel().y, b.linvel().z, b.angvel().x, b.angvel().y, b.angvel().z].map(f64::to_bits)).collect() };
            if velocities(&on) != velocities(queries.bodies) && self.moved.last() != Some(&self.quantum) {
                self.moved.push(self.quantum);
            }
        }
    }

    /// The fastest a guarded run found: the speed as a multiple of its
    /// pusher's, the speed, the quantum, and the body.
    #[derive(Clone, Debug)]
    struct Fastest {
        multiple: f64,
        speed: f64,
        quantum: usize,
        id: String,
    }

    impl Fastest {
        fn keep(slot: &mut Option<Fastest>, multiple: f64, speed: f64, quantum: usize, id: &str) {
            if slot.as_ref().is_none_or(|f| multiple > f.multiple) {
                *slot = Some(Fastest { multiple, speed, quantum, id: id.to_string() });
            }
        }
    }

    /// A pusher, watched (pin 6). Before it runs, the velocities of every
    /// dynamic body; after, each body whose velocities it changed, with its
    /// speed as the push leaves it, as a multiple of the speed its character
    /// is driven at this quantum: the horizontal speed of the driven record.
    /// After the quantum's step, the same bodies' speeds again. It keeps the
    /// fastest of each.
    struct Guarded<P: Pusher> {
        inner: P,
        driven: f64,
        quantum: usize,
        pushes: usize,
        pushed: Vec<(RigidBodyHandle, f64)>,
        left: Option<Fastest>,
        stepped: Option<Fastest>,
        /// The first body over the bound, as the push leaves it or after the step.
        over: Option<Fastest>,
    }

    impl<P: Pusher> Guarded<P> {
        fn new(inner: P) -> Guarded<P> {
            Guarded { inner, driven: 0.0, quantum: 0, pushes: 0, pushed: Vec::new(), left: None, stepped: None, over: None }
        }

        /// The quantum about to be stepped, and the speed of the fastest
        /// driven character in the records, which is the one pushing when
        /// there is one.
        fn before(&mut self, q: usize, n: usize) {
            self.quantum = q;
            self.pushed.clear();
            self.driven = (0..n)
                .map(body_at)
                .filter(|b| mode(b[DRIVEN]) == Ok(Mode::Kinematic))
                .map(|b| (b[3] * b[3] + b[5] * b[5]).sqrt())
                .fold(0.0, f64::max);
        }

        /// After the step: names the bodies this quantum pushed, while their
        /// handles are the loaded world's, and reads their speeds again.
        fn after(&mut self, ids: &[String]) {
            let solver = unsafe { &*(&raw const SOLVER) };
            let loaded = solver.loaded.as_ref().expect("a loaded world");
            for &(handle, speed) in &self.pushed {
                let id = loaded.handles.iter().position(|h| *h == Some(handle)).map_or_else(|| format!("{handle:?}"), |i| ids[i].clone());
                Fastest::keep(&mut self.left, speed / self.driven, speed, self.quantum, &id);
                if self.over.is_none() && speed / self.driven > PUSH_MULTIPLE {
                    self.over = Some(Fastest { multiple: speed / self.driven, speed, quantum: self.quantum, id: id.clone() });
                }
                if let Some(body) = loaded.world.bodies.get(handle) {
                    let speed = body.linvel().length();
                    Fastest::keep(&mut self.stepped, speed / self.driven, speed, self.quantum, &id);
                    if self.over.is_none() && speed / self.driven > PUSH_MULTIPLE {
                        self.over = Some(Fastest { multiple: speed / self.driven, speed, quantum: self.quantum, id: id.clone() });
                    }
                }
            }
        }
    }

    impl<P: Pusher> Pusher for Guarded<P> {
        fn push(&mut self, controller: &KinematicCharacterController, dt: f64, queries: &mut QueryPipelineMut, character_shape: &dyn Shape, character_mass: f64, collisions: &[CharacterCollision]) {
            let words = |b: &RigidBody| [b.linvel().x, b.linvel().y, b.linvel().z, b.angvel().x, b.angvel().y, b.angvel().z].map(f64::to_bits);
            let was: Vec<(RigidBodyHandle, [u64; 6])> = queries.bodies.iter().filter(|(_, b)| b.is_dynamic()).map(|(h, b)| (h, words(b))).collect();
            self.inner.push(controller, dt, queries, character_shape, character_mass, collisions);
            for (handle, before) in was {
                let Some(body) = queries.bodies.get(handle) else {
                    continue;
                };
                if words(body) == before {
                    continue;
                }
                self.pushes += 1;
                self.pushed.retain(|(h, _)| *h != handle);
                self.pushed.push((handle, body.linvel().length()));
            }
        }
    }

    /// The fastest a guarded replay of the run found as the push leaves a
    /// body and after the step, printed.
    fn guarded<P: Pusher>(turn: &mut u32, run: &LawRun, inner: P, law: &str) -> (Option<Fastest>, Option<Fastest>, Option<Fastest>) {
        let mut guard = Guarded::new(inner);
        let n = run.bodies.len();
        replay(turn, run, &mut Stride, &mut guard, |g, q| g.before(q, n), |g, _| g.after(&run.ids));
        match (&guard.left, &guard.stepped) {
            (Some(left), Some(stepped)) => println!(
                "{}, {law}: {} pushes; the fastest leaves a push at {:.6}, {:.4} times its pusher's speed ({} at quantum {}), and after the step {:.6}, {:.4} times ({} at quantum {})",
                run.name, guard.pushes, left.speed, left.multiple, left.id, left.quantum, stepped.speed, stepped.multiple, stepped.id, stepped.quantum
            ),
            _ => println!("{}, {law}: no body pushed", run.name),
        }
        (guard.left, guard.stepped, guard.over)
    }

    // Every law run is the product binary's run: stepped through the law as
    // the export steps it, each reproduces its file's digest and final
    // records, bit for bit.
    #[test]
    fn each_law_run_replays_through_the_law_to_the_product_binarys_digest() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let runs = law_runs();
        let names: Vec<&str> = runs.iter().map(|run| run.name.as_str()).collect();
        assert!(names.contains(&"product-scene") && names.contains(&"red-room-a"), "fixtures/law-runs/ holds {names:?}");
        for run in &runs {
            let (_, digest) = replay(&mut turn, run, &mut Stride, &mut Shove, |_, _| {}, |_, _| {});
            for (i, want) in run.finals.iter().enumerate() {
                assert_eq!(body_at(i).map(f64::to_bits), want.map(f64::to_bits), "{}: body {} ended elsewhere than the product binary left it", run.name, run.ids[i]);
            }
            assert_eq!(digest, run.digest, "{}: the replay is not the product binary's run", run.name);
            println!("{}: {} quanta, {} edits, {} pins, digest {digest}", run.name, run.quanta, run.edits.len(), run.pins.len());
        }
    }

    // Pin 4.
    #[test]
    fn the_copy_with_its_change_off_pushes_as_rapiers_routine_does_bit_for_bit() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let judge = |control: &PushControl| {
            assert_eq!(control.parted, None, "the copy with its change off parted from Rapier's routine");
            let outside: Vec<&usize> = control.changed.iter().filter(|q| !control.two.contains(q)).collect();
            assert!(outside.is_empty(), "{}: the change acted on quanta without two dynamic colliders near the character: {outside:?}", control.run);
            assert!(control.moved.iter().all(|q| control.changed.contains(q)));
        };
        let mut runs: Vec<Run> = vec![flat_walk(0.0), flat_walk(MILLION)];
        runs.extend(course());
        for direction in 0..STEP_DIRECTIONS.len() {
            for k in 0..STEP_STARTS {
                runs.push(step_run(direction, k));
            }
        }
        runs.push(capsule_carry().0);
        let mut scan = (0, 0);
        for run in &runs {
            let mut control = PushControl { run: run.name.clone(), ..PushControl::default() };
            drive_pushed(&mut turn, run, &mut Stride, &mut control, |_, c, q| c.quantum = q, |_| {});
            if run.name.starts_with("the 0.29 step") {
                scan = (scan.0 + 1, scan.1 + control.near);
            } else {
                println!(
                    "{}: {} pushes, {} collisions with a dynamic collider near, {} quanta with two or more; the change acts on {} quanta",
                    run.name, control.calls, control.near, control.two.len(), control.changed.len()
                );
            }
            judge(&control);
            assert!(control.calls > 0, "{} made no push", run.name);
            let rapier = driven_hashes(&mut turn, run, &mut RapierRoutine);
            let off = driven_hashes(&mut turn, run, &mut CopyOff);
            assert_eq!(parting(&off, &rapier), None, "{}: the law pushing through the copy with its change off parted from the law pushing through Rapier's routine", run.name);
        }
        println!("the 0.29 step from {} starts: {} collisions with a dynamic collider near", scan.0, scan.1);
        for run in law_runs() {
            let mut control = PushControl { run: run.name.clone(), ..PushControl::default() };
            let (_, digest) = replay(&mut turn, &run, &mut Stride, &mut control, |c, q| c.quantum = q, |_, _| {});
            println!(
                "{}: {} pushes, {} collisions with a dynamic collider near, {} quanta with two or more ({:?}); the change acts on {} quanta and changes velocities on {}, first {:?}",
                run.name, control.calls, control.near, control.two.len(), control.two.first().zip(control.two.last()), control.changed.len(), control.moved.len(), control.moved.first()
            );
            judge(&control);
            let (rapier, rapier_digest) = replay(&mut turn, &run, &mut Stride, &mut RapierRoutine, |_, _| {}, |_, _| {});
            let (off, _) = replay(&mut turn, &run, &mut Stride, &mut CopyOff, |_, _| {}, |_, _| {});
            assert_eq!(parting(&off, &rapier), None, "{}: the law pushing through the copy with its change off parted from the law pushing through Rapier's routine", run.name);
            assert_eq!(digest, rapier_digest);
            // Where no quantum has two dynamic colliders near the walker, main's
            // run is the product binary's, bit for bit, so no golden can move.
            if control.two.is_empty() {
                assert_eq!(digest, run.digest, "{}: main's run is not the product binary's, with no quantum the change applies to", run.name);
            }
        }
    }

    // Pin 4's red, and pin 5 at the law, on red room A.
    #[test]
    fn the_change_parts_from_rapiers_routine_in_red_room_a_only_where_two_dynamic_colliders_are_near() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let run = law_run("red-room-a");
        let crate_at = run.ids.iter().position(|id| id == "crate").expect("red room A has a crate");
        let mut control = PushControl { run: run.name.clone(), ..PushControl::default() };
        let mut launch = None;
        replay(&mut turn, &run, &mut Stride, &mut control, |c, q| c.quantum = q, |_, q| {
            let b = body_at(crate_at);
            let speed = (b[3] * b[3] + b[4] * b[4] + b[5] * b[5]).sqrt();
            if launch.is_none() && speed > 10.0 {
                launch = Some((q, speed));
            }
        });
        println!(
            "red room A through Rapier's routine: {} collisions with a dynamic collider near, quanta {:?} with two or more; the crate first exceeds 10 units a second at {:?}; the change acts on quanta {:?} and changes velocities on {:?}",
            control.near, control.two, launch, control.changed, control.moved
        );
        let two: Vec<usize> = (42..=53).collect();
        assert_eq!(control.parted, None);
        assert_eq!(control.near, 208, "collisions with a dynamic collider near the walker");
        assert_eq!(control.two, two, "the quanta with the crate and the shade near the walker");
        // On every one of them the change gathers the shade's manifold as its
        // own, which marks the shade modified in the body set; on 42 to 44
        // none of its points is within the prediction distance, so no
        // velocity differs, and from 45 the crate is pushed at its own points.
        assert_eq!(control.changed, two, "the quanta the change acts on");
        assert_eq!(control.moved, (45..=53).collect::<Vec<usize>>(), "the quanta the change pushes differently");
        assert_eq!(launch, Some((53, 26.06416630354704)), "through Rapier's routine the crate does not leave quantum 53 as main's binary records it");
        let (rapier, rapier_digest) = replay(&mut turn, &run, &mut Stride, &mut RapierRoutine, |_, _| {}, |_, _| {});
        // harness/law-runs.mjs, run on main's binary at 5d6bbea, records red
        // room A with the same load and edits as this file and this digest.
        assert_eq!(rapier_digest, "bade6b0b91814181", "through Rapier's routine the replay is not main's binary's run");
        let (off, _) = replay(&mut turn, &run, &mut Stride, &mut CopyOff, |_, _| {}, |_, _| {});
        let (on, digest) = replay(&mut turn, &run, &mut Stride, &mut Shove, |_, _| {}, |_, _| {});
        assert_eq!(parting(&off, &rapier), None, "the law pushing through the copy with its change off parted from the law pushing through Rapier's routine");
        assert_eq!(parting(&on, &rapier), Some(45), "the law's own push did not part from Rapier's routine at 45");
        assert_eq!(digest, run.digest);
    }

    // Pin 6, the guard, and its red.
    #[test]
    fn no_body_leaves_a_push_faster_than_eight_times_its_pushers_speed_and_through_rapiers_routine_red_room_a_does() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let mut highest: Option<(Fastest, String)> = None;
        let mut highest_stepped: Option<(Fastest, String)> = None;
        let mut pushing = Vec::new();
        for run in law_runs() {
            let (left, stepped, over) = guarded(&mut turn, &run, Shove, "the law's push");
            assert!(over.is_none(), "{}: {:?} is above {PUSH_MULTIPLE} times its pusher's speed", run.name, over);
            if let Some(f) = left {
                pushing.push(run.name.clone());
                if highest.as_ref().is_none_or(|h| f.multiple > h.0.multiple) {
                    highest = Some((f, run.name.clone()));
                }
            }
            if let Some(f) = stepped {
                if highest_stepped.as_ref().is_none_or(|h| f.multiple > h.0.multiple) {
                    highest_stepped = Some((f, run.name.clone()));
                }
            }
        }
        let (f, at) = highest.expect("no law run pushed a body, so the guard measured nothing");
        let (s, s_at) = highest_stepped.expect("a pushed body");
        println!("the law runs that push a body: {pushing:?}");
        println!(
            "through the law's push the highest multiple as a push leaves a body is {:.4} ({at}, {} at quantum {}), and after the step {:.4} ({s_at}, {} at quantum {}); the guard allows {PUSH_MULTIPLE}, headroom {:.2}",
            f.multiple, f.id, f.quantum, s.multiple, s.id, s.quantum, PUSH_MULTIPLE / f.multiple.max(s.multiple)
        );
        assert!(pushing.contains(&"red-room-a".to_string()) && pushing.len() >= 2, "the guard pushed too few runs to measure: {pushing:?}");
        let (red, red_stepped, over) = guarded(&mut turn, &law_run("red-room-a"), RapierRoutine, "Rapier's routine");
        let (red, red_stepped) = (red.expect("red room A pushed no body"), red_stepped.expect("a pushed body"));
        let over = over.expect("through Rapier's routine red room A stays under the guard, so the guard cannot go red");
        println!(
            "the guard's red: through Rapier's routine {} first goes over at quantum {}, {:.4} times its pusher's speed; the fastest leaves a push at {:.4} times ({} at quantum {}), and after the step {:.4} times",
            over.id, over.quantum, over.multiple, red.multiple, red.id, red.quantum, red_stepped.multiple
        );
        assert!(red.multiple > PUSH_MULTIPLE && red_stepped.multiple > PUSH_MULTIPLE);
    }

    /// The speed the law's push gives the engine's smallest crate at rest,
    /// struck square on its face by the 0.25 box character, with that one
    /// collision listed `listed` times among the character's collisions, as a
    /// move that meets the crate more than once lists it: the crate's speed
    /// as the push leaves it, over the speed the character moves along the
    /// normal, through the copy with the change on and through Rapier's own
    /// routine, which agree with one dynamic collider in range.
    fn square_push(listed: usize) -> (f64, f64) {
        let settings = controller();
        let character = character_shape(0, Vector::new(0.25, 0.25, 0.25));
        // The crate of the verb and minds fixtures and red room A, built as the
        // law builds a dynamic body, with its face SKIN beyond the character's.
        let record = [0.25 + SKIN + 0.12, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.12, 0.2, 0.12, 0.0];
        // The character meets the crate as its move starts, so the whole
        // quantum's travel remains: the push is to move the crate at 1.
        let speed = 1.0;
        let collision = CharacterCollision {
            handle: ColliderHandle::invalid(),
            character_pos: Pose::IDENTITY,
            translation_applied: Vector::ZERO,
            translation_remaining: Vector::new(speed * DT, 0.0, 0.0),
            hit: ShapeCastHit {
                time_of_impact: 0.0,
                witness1: Vector::new(0.25, 0.0, 0.0),
                witness2: Vector::new(-0.12, 0.0, 0.0),
                normal1: Vector::new(1.0, 0.0, 0.0),
                normal2: Vector::new(-1.0, 0.0, 0.0),
                status: ShapeCastStatus::Converged,
            },
        };
        let collisions = vec![collision; listed];
        let mut speeds = [0.0; 2];
        for (k, speed_out) in speeds.iter_mut().enumerate() {
            let mut world = PhysicsWorld::new();
            let (body, co) = body_for(&record, false, 0).expect("the crate's record");
            let (handle, _) = world.insert(body, co);
            warm_broadphase(&mut world);
            let PhysicsWorld { broad_phase, narrow_phase, bodies, colliders, .. } = &mut world;
            let mut query = broad_phase.as_query_pipeline_mut(narrow_phase.query_dispatcher(), bodies, colliders, QueryFilter::new());
            if k == 0 {
                Impulses::<true>(&settings).solve_character_collision_impulses(DT, &mut query, &*character, 1.0, &collisions);
            } else {
                settings.solve_character_collision_impulses(DT, &mut query, &*character, 1.0, &collisions);
            }
            assert_eq!(world.bodies[handle].mass(), 0.12 * 0.2 * 0.12 * 8.0, "the crate is not the engine's");
            *speed_out = world.bodies[handle].linvel().length() / speed;
        }
        (speeds[0], speeds[1])
    }

    // Pin 6's measured bound. #1004 removes the overwrite, not the amplifier:
    // Rapier's impulse sizes each contact point's push with the crate's
    // linear mass alone and re-reads the point's velocity after each one, so
    // the crate leaves faster than the character that pushed it. Listed once,
    // the square push gives it about 4.6 times the character's speed along
    // the normal; listed twice or more, about 6.4, and no more with further
    // listings. The knowledge base measured the same on rapier3d-f64 0.36.0,
    // which carries #1004: 4.575 and 6.375. PUSH_MULTIPLE sits above that.
    #[test]
    fn a_crate_listed_twice_among_the_collisions_leaves_the_push_at_about_six_and_a_half_times_the_pushers_speed_under_the_guard() {
        let _turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let mut multiples = Vec::new();
        for listed in 1..=5 {
            let (copy, rapier) = square_push(listed);
            println!("the square push listed {listed} times: the crate leaves at {copy:.4} times the character's speed along the normal through the law's push, {rapier:.4} through Rapier's routine");
            assert_eq!(copy.to_bits(), rapier.to_bits(), "with one dynamic collider in range the copy and Rapier's routine push alike");
            multiples.push(copy);
        }
        assert!((multiples[0] - 4.575).abs() < 0.001, "listed once the crate leaves at {}, not the measured 4.575", multiples[0]);
        for (i, m) in multiples.iter().enumerate().skip(1) {
            assert!((m - 6.375).abs() < 0.001, "listed {} times the crate leaves at {m}, not the measured 6.375", i + 1);
        }
        let highest = multiples.iter().copied().fold(0.0, f64::max);
        assert!(highest < PUSH_MULTIPLE, "the square push leaves the crate at {highest}, above the guard's {PUSH_MULTIPLE}");
        println!("the highest is {highest:.4}; the guard's {PUSH_MULTIPLE} leaves {:.2} of headroom over it", PUSH_MULTIPLE / highest);
    }

    /// A pusher, timed.
    struct TimedPush<P: Pusher> {
        inner: P,
        spent: Duration,
    }

    impl<P: Pusher> Pusher for TimedPush<P> {
        fn push(&mut self, controller: &KinematicCharacterController, dt: f64, queries: &mut QueryPipelineMut, character_shape: &dyn Shape, character_mass: f64, collisions: &[CharacterCollision]) {
            let start = Instant::now();
            self.inner.push(controller, dt, queries, character_shape, character_mass, collisions);
            self.spent += start.elapsed();
        }
    }

    /// Rapier's routine, the copy with its change off, and the copy with its
    /// change on, each timed on the same world before every push; Rapier's
    /// result moves the world.
    #[derive(Default)]
    struct SideBySide {
        spent: [Duration; 3],
    }

    impl Pusher for SideBySide {
        fn push(&mut self, controller: &KinematicCharacterController, dt: f64, queries: &mut QueryPipelineMut, character_shape: &dyn Shape, character_mass: f64, collisions: &[CharacterCollision]) {
            let mut off = queries.bodies.clone();
            let mut on = queries.bodies.clone();
            let mut off_colliders = queries.colliders.clone();
            let mut on_colliders = queries.colliders.clone();
            let start = Instant::now();
            controller.solve_character_collision_impulses(dt, queries, character_shape, character_mass, collisions);
            self.spent[0] += start.elapsed();
            let mut aside = QueryPipelineMut { dispatcher: queries.dispatcher, bvh: queries.bvh, bodies: &mut off, colliders: &mut off_colliders, filter: queries.filter };
            let start = Instant::now();
            Impulses::<false>(controller).solve_character_collision_impulses(dt, &mut aside, character_shape, character_mass, collisions);
            self.spent[1] += start.elapsed();
            let mut aside = QueryPipelineMut { dispatcher: queries.dispatcher, bvh: queries.bvh, bodies: &mut on, colliders: &mut on_colliders, filter: queries.filter };
            let start = Instant::now();
            Impulses::<true>(controller).solve_character_collision_impulses(dt, &mut aside, character_shape, character_mass, collisions);
            self.spent[2] += start.elapsed();
        }
    }

    // Pin 8: the costs on record. Each routine timed on the same world before
    // every push of main's run, and each pushing its own run whole: through
    // the law's push red room A is another run from quantum 45, in which the
    // walker keeps pushing the shade.
    #[test]
    fn the_copy_costs_about_what_rapiers_routine_costs_a_quantum_on_red_room_a_and_the_product_scene() {
        let mut turn = TURN.lock().unwrap_or_else(|e| e.into_inner());
        let rounds = 7;
        for name in ["red-room-a", "product-scene"] {
            let run = law_run(name);
            let mut same: Vec<[f64; 3]> = (0..rounds)
                .map(|_| {
                    let mut side = SideBySide::default();
                    replay(&mut turn, &run, &mut Stride, &mut side, |_, _| {}, |_, _| {});
                    side.spent.map(|d| d.as_secs_f64() * 1.0e6 / run.quanta as f64)
                })
                .collect();
            for (k, label) in ["Rapier's routine", "the copy, change off", "the copy, change on (the law)"].iter().enumerate() {
                same.sort_by(|a, b| a[k].total_cmp(&b[k]));
                println!("{name}, {label}, on the same world before every push of main's run: median of {rounds} runs, {:.3} us a quantum (from {:.3} to {:.3})", same[rounds / 2][k], same[0][k], same[rounds - 1][k]);
            }
            let mut per_quantum = |label: &str, time: &mut dyn FnMut(&mut u32) -> Duration| {
                let mut times: Vec<f64> = (0..rounds).map(|_| time(&mut turn).as_secs_f64() * 1.0e6 / run.quanta as f64).collect();
                times.sort_by(|a, b| a.total_cmp(b));
                println!("{name}, {label}: median of {rounds} runs of {} quanta, {:.3} us a quantum (from {:.3} to {:.3})", run.quanta, times[rounds / 2], times[0], times[rounds - 1]);
                times[rounds / 2]
            };
            let rapier = per_quantum("Rapier's routine", &mut |turn| {
                let mut timed = TimedPush { inner: RapierRoutine, spent: Duration::ZERO };
                replay(turn, &run, &mut Stride, &mut timed, |_, _| {}, |_, _| {});
                timed.spent
            });
            let off = per_quantum("the copy, change off", &mut |turn| {
                let mut timed = TimedPush { inner: CopyOff, spent: Duration::ZERO };
                replay(turn, &run, &mut Stride, &mut timed, |_, _| {}, |_, _| {});
                timed.spent
            });
            let on = per_quantum("the copy, change on (the law)", &mut |turn| {
                let mut timed = TimedPush { inner: Shove, spent: Duration::ZERO };
                replay(turn, &run, &mut Stride, &mut timed, |_, _| {}, |_, _| {});
                timed.spent
            });
            assert!(rapier > 0.0 && off > 0.0 && on > 0.0);
        }
    }
}
