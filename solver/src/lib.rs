// The E1 box step, in the same order the JavaScript kernel runs it.
// f64 only. No other operation than add, sub, mul, div, and sqrt.
// The product step lives in rapier_law and does not replace this function.
//
// Edition-2024 forms under edition 2021 (S1 pin 8): every export is
// `#[unsafe(no_mangle)]`, and a `static mut` is reached only through a raw
// pointer made by `&raw mut` or `&raw const` where the reference is taken, so
// no reference to a mutable static is ever named directly. The edition stays
// 2021; `cargo fix --edition` did not make these changes.

// A refusal is a `Result`, and dropping one is a build error, not a warning:
// `#[must_use]` alone only warns (measured on rustc 1.98.1). S1 pin 5.
#![deny(unused_must_use)]

#[cfg(target_arch = "wasm32")]
mod arena;
mod impulses;
mod kcc;
mod rapier_law;

/// Why the law refused a quantum. Every export turns a refusal into 0. Inside
/// the law each check returns `Result<_, Refusal>`, so a refusal cannot be
/// dropped without the build failing.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Refusal {
    /// More bodies or colliders than the buffers hold.
    Limits,
    /// A heightfield with fewer than two rows or columns, too many cells, or a
    /// cell size that is not positive.
    Grid,
    /// A value that is NaN or infinite.
    NotFinite,
    /// Body slot 16 is not exactly 0, 1, 2, or 3.
    Mode,
    /// A half-extent or a collider extent that is not positive.
    Extent,
    /// A quaternion `canon_quat` cannot normalize.
    Quaternion,
    /// A kinematic body with no plan after the world stepped.
    Plan,
    /// No world is loaded to step.
    Unloaded,
    /// At a switch in place, a body the running world should hold has no
    /// handle, or a carried body it should not hold has one. The masks the
    /// world last applied say which bodies it holds, so this cannot happen
    /// while they are kept; it refuses instead of panicking if it does.
    Handle,
}

/// What body slot 16 says the solver does with the body.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Mode {
    /// 0: the solver moves it.
    Dynamic,
    /// 1: a kinematic action.
    Kinematic,
    /// 2: the same action lifted (no gravity, no snap).
    Lifted,
    /// 3: carried: the body stays in the record and leaves the solver.
    Carried,
}

/// The one reading of body slot 16, for the box step and the product step
/// alike (S1 pin 2). It accepts exactly 0, 1, 2, and 3 and refuses anything
/// else, NaN included. Before this, the box step read `!= 0.0` and the product
/// step read `== 1.0 || == 2.0` then `== 3.0`, so 1.5, 4.0, and NaN were
/// driven in one and dynamic in the other.
pub(crate) fn mode(slot: f64) -> Result<Mode, Refusal> {
    if slot == 0.0 {
        Ok(Mode::Dynamic)
    } else if slot == 1.0 {
        Ok(Mode::Kinematic)
    } else if slot == 2.0 {
        Ok(Mode::Lifted)
    } else if slot == 3.0 {
        Ok(Mode::Carried)
    } else {
        Err(Refusal::Mode)
    }
}

const DT: f64 = 1.0 / 64.0;
const G: f64 = -8.0;
const MAX_SPEED: f64 = 2.0;
const UNDRIVEN_DRAG: f64 = 0.0;
pub(crate) const MAX_BODIES: usize = 64;
pub(crate) const MAX_COLLIDERS: usize = 64;
pub(crate) const BODY_STRIDE: usize = 17;
// 0..5 translation and linear velocity, 6..9 quaternion, 10..12 angular
// velocity, 13..15 half-extents, 16 driven. The box step reads only the
// half-extents and the driven flag out of that tail.
pub(crate) const HX: usize = 13;
pub(crate) const HY: usize = 14;
pub(crate) const HZ: usize = 15;
pub(crate) const DRIVEN: usize = 16;
pub(crate) const COLLIDER_STRIDE: usize = 10;

pub(crate) static mut BODIES: [f64; MAX_BODIES * BODY_STRIDE] = [0.0; MAX_BODIES * BODY_STRIDE];
pub(crate) static mut COLLIDERS: [f64; MAX_COLLIDERS * COLLIDER_STRIDE] = [0.0; MAX_COLLIDERS * COLLIDER_STRIDE];

#[unsafe(no_mangle)]
pub extern "C" fn bodies_ptr() -> *mut f64 {
    (&raw mut BODIES).cast::<f64>()
}

#[unsafe(no_mangle)]
pub extern "C" fn colliders_ptr() -> *mut f64 {
    (&raw mut COLLIDERS).cast::<f64>()
}

fn js_min(a: f64, b: f64) -> f64 {
    if b < a || (a == 0.0 && b == 0.0 && b.is_sign_negative() && !a.is_sign_negative()) {
        b
    } else {
        a
    }
}

fn js_max(a: f64, b: f64) -> f64 {
    if a < b || (a == 0.0 && b == 0.0 && a.is_sign_negative() && !b.is_sign_negative()) {
        b
    } else {
        a
    }
}

struct Face {
    axis: u8,
    pen: f64,
    dir: f64,
}

fn rank(axis: u8) -> u8 {
    if axis == b'y' {
        0
    } else if axis == b'x' {
        1
    } else {
        2
    }
}

fn body_at(i: usize) -> usize {
    i * BODY_STRIDE
}

fn field(bodies: &mut [f64], i: usize, slot: usize) -> &mut f64 {
    &mut bodies[body_at(i) + slot]
}

/// Driven, for the box step: any mode but dynamic. The step has already
/// refused the quantum when a mode is not 0, 1, 2, or 3.
fn driven(bodies: &mut [f64], i: usize) -> bool {
    mode(*field(bodies, i, DRIVEN)) != Ok(Mode::Dynamic)
}

fn resolve_pair(bodies: &mut [f64], i: usize, j: usize) {
    let ax = *field(bodies, i, 0);
    let ay = *field(bodies, i, 1);
    let az = *field(bodies, i, 2);
    let ahx = *field(bodies, i, HX);
    let ahy = *field(bodies, i, HY);
    let ahz = *field(bodies, i, HZ);
    let a_driven = driven(bodies, i);
    let bx = *field(bodies, j, 0);
    let by = *field(bodies, j, 1);
    let bz = *field(bodies, j, 2);
    let bhx = *field(bodies, j, HX);
    let bhy = *field(bodies, j, HY);
    let bhz = *field(bodies, j, HZ);
    let b_driven = driven(bodies, j);
    let overlap_x = js_min(ax + ahx, bx + bhx) - js_max(ax - ahx, bx - bhx);
    let overlap_y = js_min(ay + ahy, by + bhy) - js_max(ay - ahy, by - bhy);
    let overlap_z = js_min(az + ahz, bz + bhz) - js_max(az - ahz, bz - bhz);
    if overlap_x <= 0.0 || overlap_y <= 0.0 || overlap_z <= 0.0 {
        return;
    }
    if a_driven && b_driven {
        return;
    }
    let amounts = [overlap_x, overlap_y, overlap_z];
    let axes = [b'x', b'y', b'z'];
    let mut chosen = 0usize;
    let mut n = 1usize;
    while n < 3 {
        if amounts[n] < amounts[chosen]
            || (amounts[n] == amounts[chosen] && rank(axes[n]) < rank(axes[chosen]))
        {
            chosen = n;
        }
        n += 1;
    }
    let horizontal = axes[chosen] == b'x';
    let depth = axes[chosen] == b'z';
    if a_driven != b_driven {
        let driver = if a_driven { i } else { j };
        let other = if a_driven { j } else { i };
        let tie = if a_driven { j > i } else { i > j };
        if horizontal {
            let dx = *field(bodies, other, 0);
            let ox = *field(bodies, driver, 0);
            let dir = if dx > ox || (dx == ox && tie) { 1.0 } else { -1.0 };
            let dvx = *field(bodies, driver, 3);
            *field(bodies, other, 0) = dx + dir * overlap_x;
            *field(bodies, other, 3) = dvx;
        } else if !depth {
            let dy = *field(bodies, other, 1);
            let oy = *field(bodies, driver, 1);
            let dir = if dy > oy || (dy == oy && tie) { 1.0 } else { -1.0 };
            let dvy = *field(bodies, driver, 4);
            *field(bodies, other, 1) = dy + dir * overlap_y;
            *field(bodies, other, 4) = dvy;
        } else {
            let dz = *field(bodies, other, 2);
            let oz = *field(bodies, driver, 2);
            let dir = if dz > oz || (dz == oz && tie) { 1.0 } else { -1.0 };
            let dvz = *field(bodies, driver, 5);
            *field(bodies, other, 2) = dz + dir * overlap_z;
            *field(bodies, other, 5) = dvz;
        }
        return;
    }
    if depth {
        let half = overlap_z / 2.0;
        let azn = *field(bodies, i, 2);
        let bzn = *field(bodies, j, 2);
        let a_near = azn < bzn || (azn == bzn && i < j);
        *field(bodies, i, 2) = azn + if a_near { 0.0 - half } else { half };
        *field(bodies, j, 2) = bzn + if a_near { half } else { 0.0 - half };
        *field(bodies, i, 5) = 0.0;
        *field(bodies, j, 5) = 0.0;
        return;
    }
    if horizontal {
        let half = overlap_x / 2.0;
        let axn = *field(bodies, i, 0);
        let bxn = *field(bodies, j, 0);
        let a_left = axn < bxn || (axn == bxn && i < j);
        *field(bodies, i, 0) = axn + if a_left { 0.0 - half } else { half };
        *field(bodies, j, 0) = bxn + if a_left { half } else { 0.0 - half };
        *field(bodies, i, 3) = 0.0;
        *field(bodies, j, 3) = 0.0;
    } else {
        let half = overlap_y / 2.0;
        let ayn = *field(bodies, i, 1);
        let byn = *field(bodies, j, 1);
        let a_below = ayn < byn || (ayn == byn && i < j);
        *field(bodies, i, 1) = ayn + if a_below { 0.0 - half } else { half };
        *field(bodies, j, 1) = byn + if a_below { half } else { 0.0 - half };
        *field(bodies, i, 4) = 0.0;
        *field(bodies, j, 4) = 0.0;
    }
}

/// One quantum. Returns 0 when a pose or a velocity is NaN, and before it
/// moves anything when a body's mode is not 0, 1, 2, or 3.
#[unsafe(no_mangle)]
pub extern "C" fn step(n_bodies: u32, n_colliders: u32) -> u32 {
    if n_bodies as usize > MAX_BODIES || n_colliders as usize > MAX_COLLIDERS {
        return 0;
    }
    let n = n_bodies as usize;
    let nc = n_colliders as usize;
    unsafe {
        let bodies = &mut *(&raw mut BODIES);
        let colliders = &*(&raw const COLLIDERS);
        let mut i = 0usize;
        while i < n {
            if mode(*field(bodies, i, DRIVEN)).is_err() {
                return 0;
            }
            i += 1;
        }
        let mut i = 0usize;
        while i < n {
            if !driven(bodies, i) {
                let vx = *field(bodies, i, 3);
                let vz = *field(bodies, i, 5);
                *field(bodies, i, 3) = vx * UNDRIVEN_DRAG;
                *field(bodies, i, 5) = vz * UNDRIVEN_DRAG;
            }
            let vy = *field(bodies, i, 4);
            *field(bodies, i, 4) = vy + G * DT;
            let x = *field(bodies, i, 0);
            let y = *field(bodies, i, 1);
            let z = *field(bodies, i, 2);
            let vx = *field(bodies, i, 3);
            let vy = *field(bodies, i, 4);
            let vz = *field(bodies, i, 5);
            *field(bodies, i, 0) = x + vx * DT;
            *field(bodies, i, 1) = y + vy * DT;
            *field(bodies, i, 2) = z + vz * DT;
            let mut j = 0usize;
            while j < nc {
                let cmin_x = colliders[j * COLLIDER_STRIDE];
                let cmax_x = colliders[j * COLLIDER_STRIDE + 1];
                let cmin_y = colliders[j * COLLIDER_STRIDE + 2];
                let cmax_y = colliders[j * COLLIDER_STRIDE + 3];
                let cmin_z = colliders[j * COLLIDER_STRIDE + 4];
                let cmax_z = colliders[j * COLLIDER_STRIDE + 5];
                let hx = *field(bodies, i, HX);
                let hy = *field(bodies, i, HY);
                let hz = *field(bodies, i, HZ);
                let bx = *field(bodies, i, 0);
                let by = *field(bodies, i, 1);
                let bz = *field(bodies, i, 2);
                let bmin_x = bx - hx;
                let bmax_x = bx + hx;
                let bmin_y = by - hy;
                let bmax_y = by + hy;
                let bmin_z = bz - hz;
                let bmax_z = bz + hz;
                if bmax_x <= cmin_x
                    || bmin_x >= cmax_x
                    || bmax_y <= cmin_y
                    || bmin_y >= cmax_y
                    || bmax_z <= cmin_z
                    || bmin_z >= cmax_z
                {
                    j += 1;
                    continue;
                }
                let faces = [
                    Face { axis: b'x', pen: bmax_x - cmin_x, dir: -1.0 },
                    Face { axis: b'x', pen: cmax_x - bmin_x, dir: 1.0 },
                    Face { axis: b'y', pen: bmax_y - cmin_y, dir: -1.0 },
                    Face { axis: b'y', pen: cmax_y - bmin_y, dir: 1.0 },
                    Face { axis: b'z', pen: bmax_z - cmin_z, dir: -1.0 },
                    Face { axis: b'z', pen: cmax_z - bmin_z, dir: 1.0 },
                ];
                let mut best = 0usize;
                let mut f = 1usize;
                while f < 6 {
                    if faces[f].pen < faces[best].pen
                        || (faces[f].pen == faces[best].pen && rank(faces[f].axis) < rank(faces[best].axis))
                    {
                        best = f;
                    }
                    f += 1;
                }
                let chosen = &faces[best];
                if chosen.axis == b'x' {
                    let x = *field(bodies, i, 0);
                    let vx = *field(bodies, i, 3);
                    *field(bodies, i, 0) = x + chosen.dir * chosen.pen;
                    *field(bodies, i, 3) = 0.0 - vx;
                } else if chosen.axis == b'y' {
                    let y = *field(bodies, i, 1);
                    let vy = *field(bodies, i, 4);
                    *field(bodies, i, 1) = y + chosen.dir * chosen.pen;
                    *field(bodies, i, 4) = 0.0 - vy;
                } else {
                    let z = *field(bodies, i, 2);
                    let vz = *field(bodies, i, 5);
                    *field(bodies, i, 2) = z + chosen.dir * chosen.pen;
                    *field(bodies, i, 5) = 0.0 - vz;
                }
                j += 1;
            }
            let vx = *field(bodies, i, 3);
            let vy = *field(bodies, i, 4);
            let vz = *field(bodies, i, 5);
            let speed2 = vx * vx + vy * vy + vz * vz;
            if speed2 > MAX_SPEED * MAX_SPEED {
                let speed = speed2.sqrt();
                let scale = MAX_SPEED / speed;
                *field(bodies, i, 3) = vx * scale;
                *field(bodies, i, 4) = vy * scale;
                *field(bodies, i, 5) = vz * scale;
            }
            i += 1;
        }
        let mut i = 0usize;
        while i < n {
            let mut j = i + 1;
            while j < n {
                resolve_pair(bodies, i, j);
                j += 1;
            }
            i += 1;
        }
        let mut i = 0usize;
        while i < n {
            let mut slot = 0usize;
            while slot < 6 {
                if field(bodies, i, slot).is_nan() {
                    return 0;
                }
                slot += 1;
            }
            i += 1;
        }
    }
    1
}
