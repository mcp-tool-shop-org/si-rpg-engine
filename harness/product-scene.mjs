// The 3D scene the product harness steps. The first quantum fires every
// static face, a corner on each axis, the speed clamp, and a driven body
// meeting an undriven one on each axis.

import { createWorld } from '../packages/tick/world.js';

/**
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} vx
 * @param {number} vy
 * @param {number} vz
 */
const box = (id, x, y, z, vx, vy, vz) => ({
  id, x, y, z, vx, vy, vz, hx: 0.25, hy: 0.25, hz: 0.25,
});

export const productDriven = [
  'face-x-min', 'face-x-max', 'face-y-min', 'face-y-max', 'face-z-min', 'face-z-max',
  'corner-x', 'corner-y', 'corner-z', 'fast',
  'push-x', 'push-y', 'push-z',
];

export function createProductWorld() {
  return createWorld({
    bodies: [
      box('face-x-min', -0.1, 1, 1, -0.4, 0, 0),
      box('face-x-max', 2.1, 1, 1, 0.4, 0, 0),
      box('face-y-min', 1, -0.1, 1, 0, -0.4, 0),
      box('face-y-max', 1, 2.1, 1, 0, 0.4, 0),
      box('face-z-min', 1, 1, -0.1, 0, 0, -0.4),
      box('face-z-max', 1, 1, 2.1, 0, 0, 0.4),
      // Just outside each post's min corner, moving into it. After one
      // integrate the named axis is the smallest penetration.
      box('corner-x', 29.84375, 7.951953125, 7.99, 0.4, 0, 0),
      box('corner-y', 39.97, 7.824140625, 8.01, 0, 0.5, 0),
      box('corner-z', 49.96, 8.001953125, 7.83375, 0, 0, 0.4),
      { id: 'fast', x: 10, y: 6, z: 0, vx: 3, vy: 0, vz: 0, hx: 0.2, hy: 0.2, hz: 0.2 },
      box('push-x', 12, 6, 0, 0.8, 0, 0),
      { id: 'yield-x', x: 12.4, y: 6, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      box('push-y', 16, 6, 0, 0, 0.8, 0),
      { id: 'yield-y', x: 16, y: 6.4, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      box('push-z', 20, 6, 0, 0, 0, 0.8),
      { id: 'yield-z', x: 20, y: 6, z: 0.4, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
    ],
    colliders: [
      { id: 'block', minX: 0, maxX: 2, minY: 0, maxY: 2, minZ: 0, maxZ: 2 },
      { id: 'post-x', minX: 30, maxX: 31, minY: 8, maxY: 9, minZ: 8, maxZ: 9 },
      { id: 'post-y', minX: 40, maxX: 41, minY: 8, maxY: 9, minZ: 8, maxZ: 9 },
      { id: 'post-z', minX: 50, maxX: 51, minY: 8, maxY: 9, minZ: 8, maxZ: 9 },
    ],
  });
}
