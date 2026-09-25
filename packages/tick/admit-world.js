// Load-time hazards for a world file. The product law must settle, and the
// load hash must come back the same twice.

import { createHasher } from '../frame/hash.js';
import { createWorld } from './world.js';

/**
 * @param {import('./scene.js').Scene} scene
 */
export function loadHash(scene) {
  const world = createWorld({
    bodies: scene.bodies,
    colliders: scene.colliders,
    zones: scene.zones,
    heightfield: scene.heightfield,
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
  return hasher.digest();
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
function lowest(box) {
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
 * @param {import('./scene.js').Scene} scene
 */
export function settles(scene) {
  const world = createWorld({
    bodies: scene.bodies,
    colliders: scene.colliders,
    zones: scene.zones,
    heightfield: scene.heightfield,
  }, 'product');
  let floor = Infinity;
  for (let i = 0; i < scene.colliders.length; i = i + 1) {
    floor = Math.min(floor, lowest(scene.colliders[i]));
  }
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
