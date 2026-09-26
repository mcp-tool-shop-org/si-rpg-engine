// Load-time hazards for a world file. The product law must settle, and the
// load hash must come back the same twice.

import { createHasher } from '../frame/hash.js';
import { createWorld } from './world.js';

/**
 * The load hash of a world file: what `load world` writes to
 * worlds/index.json, and what indexReason compares a file with before the
 * host's first frame. It covers everything a world file holds but its name,
 * which is the key the index files the hash under, so a file edited after
 * admission no longer matches its entry, even by a wall nothing touches, and
 * is refused until it is admitted again (#76). In this order:
 *
 * 1. The seed as the tick mixes it, one 32-bit word (seed >>> 0).
 * 2. What world.mixLoad mixes into a tick's first frame: the zones, the
 *    minds, and the heightfield's rows, columns, cell, and every sample.
 *    mixLoad then loads the solver.
 * 3. The solver's snapshot after load: each body's pose, velocity,
 *    rotation, spin, and sleep state as the law holds them, and a contact
 *    pair for each two colliders, one of them a body's, within the
 *    prediction distance of each other.
 * 4. The records as the file holds them, which the snapshot does not hold in
 *    full: it has no ids or half-extents, it holds a body's rotation
 *    normalized, and it reaches a static collider only through a contact at
 *    load. In file order: the seed; every body, its id and its sixteen
 *    numbers; every static collider, its id, six bounds, and rotation; and
 *    the goal's actor and zone, or that there is none.
 *
 * A number in 4 is mixed as its exact bits, but a -0.0 as +0.0: the law
 * builds one world from either (canon in solver/src/rapier_law.rs), and S1
 * pin 4 holds them to one load hash. world.mixLoad is the tick's as it was,
 * and 4 is mixed here alone, so no frame hash, golden, or fixture's frames
 * move with the load hash.
 * @param {import('./scene.js').Scene} scene
 */
export function loadHash(scene) {
  const world = createWorld({
    bodies: scene.bodies,
    colliders: scene.colliders,
    zones: scene.zones,
    heightfield: scene.heightfield,
    minds: scene.minds,
  }, 'product');
  const hasher = createHasher();
  hasher.u32(scene.seed);
  world.mixLoad(hasher, new Set());
  const snap = world.snapshot();
  if (snap) {
    hasher.u32(snap.length);
    for (let i = 0; i < snap.length; i = i + 1) {
      hasher.u32(snap[i]);
    }
  }
  mixRecords(hasher, scene);
  return hasher.digest();
}

/**
 * Part 4 of the load hash: the seed, the bodies, the static colliders, and
 * the goal, as the file holds them. A body's rotation and spin are optional
 * in a file and read as createWorld reads them.
 * @param {import('../frame/types.js').Hasher} hasher
 * @param {import('./scene.js').Scene} scene
 */
function mixRecords(hasher, scene) {
  mixBits(hasher, scene.seed);
  hasher.u32(scene.bodies.length);
  for (const body of scene.bodies) {
    hasher.text(body.id);
    for (const value of [
      body.x, body.y, body.z, body.vx, body.vy, body.vz,
      body.qx ?? 0, body.qy ?? 0, body.qz ?? 0, body.qw ?? 1,
      body.wx ?? 0, body.wy ?? 0, body.wz ?? 0,
      body.hx, body.hy, body.hz,
    ]) {
      mixBits(hasher, value);
    }
  }
  hasher.u32(scene.colliders.length);
  for (const box of scene.colliders) {
    hasher.text(box.id);
    for (const value of [
      box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ,
      box.qx ?? 0, box.qy ?? 0, box.qz ?? 0, box.qw ?? 1,
    ]) {
      mixBits(hasher, value);
    }
  }
  if (scene.goal) {
    hasher.u32(1);
    hasher.text(scene.goal.actor);
    hasher.text(scene.goal.zone);
  } else {
    hasher.u32(0);
  }
}

/**
 * A number as its bits, a -0.0 as +0.0.
 * @param {import('../frame/types.js').Hasher} hasher
 * @param {number} value
 */
function mixBits(hasher, value) {
  if (!hasher.float(value === 0 ? 0 : value)) {
    throw new Error('NaN');
  }
}

/**
 * @param {import('./scene.js').Scene} scene
 * @param {{ worlds?: Record<string, string> }} index
 * @returns {string | null}
 */
export function indexReason(scene, index) {
  const listed = index.worlds && index.worlds[scene.name];
  if (!listed) {
    return 'world is not listed';
  }
  if (listed !== loadHash(scene)) {
    return 'world does not match the index';
  }
  return null;
}

/**
 * Lowest world-space corner of a collider, rotation included.
 * @param {import('../frame/types.js').StaticCollider} box
 */
export function lowest(box) {
  const qx = box.qx ?? 0;
  const qy = box.qy ?? 0;
  const qz = box.qz ?? 0;
  const qw = box.qw ?? 1;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const hx = (box.maxX - box.minX) / 2;
  const hy = (box.maxY - box.minY) / 2;
  const hz = (box.maxZ - box.minZ) / 2;
  let minY = Infinity;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * hx;
        const y = sy * hy;
        const z = sz * hz;
        const tx = 2 * (qy * z - qz * y);
        const ty = 2 * (qz * x - qx * z);
        const tz = 2 * (qx * y - qy * x);
        const wy = y + qw * ty + (qz * tx - qx * tz);
        minY = Math.min(minY, cy + wy);
      }
    }
  }
  return minY;
}

/**
 * The lowest collider's minimum: a body whose centre is below it has left the
 * world. The settle hazard and the sweep (T6) both hold a body to it. The
 * sweep passes the heightfield too, which the solver collides with as it does
 * a box, so a world made of a heightfield alone has a floor at its lowest
 * sample and not at infinity; a world file always has a box, and the settle
 * hazard reads the boxes alone, as it did.
 * @param {ReadonlyArray<import('../frame/types.js').StaticCollider>} colliders
 * @param {{ heights: ReadonlyArray<number> } | null} [heightfield]
 */
export function worldFloor(colliders, heightfield) {
  let floor = Infinity;
  for (let i = 0; i < colliders.length; i = i + 1) {
    floor = Math.min(floor, lowest(colliders[i]));
  }
  if (heightfield) {
    for (let i = 0; i < heightfield.heights.length; i = i + 1) {
      floor = Math.min(floor, heightfield.heights[i]);
    }
  }
  return floor;
}

/**
 * @param {import('./scene.js').Scene} scene
 */
export function settles(scene) {
  const world = createWorld({
    bodies: scene.bodies,
    colliders: scene.colliders,
    zones: scene.zones,
    heightfield: scene.heightfield,
  }, 'product');
  const floor = worldFloor(scene.colliders);
  try {
    for (let i = 0; i < 512; i = i + 1) {
      world.step(new Set());
    }
  } catch {
    return false;
  }
  for (let i = 0; i < world.bodies.length; i = i + 1) {
    const body = world.bodies[i];
    if (body.y !== body.y || body.y < floor) {
      return false;
    }
    const speed = Math.hypot(body.vx, body.vy, body.vz);
    const spin = Math.hypot(body.wx, body.wy, body.wz);
    if (speed > 1e-2 || spin > 1e-2) {
      return false;
    }
  }
  return true;
}
