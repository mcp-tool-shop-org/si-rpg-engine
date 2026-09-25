// The product harness steps the Rapier scene: a kinematic walker, a static
// heightfield, and two dynamic boxes. The box scene below is the E1 reference
// the migration gate still matches, law by law.

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

export const boxDriven = [
  'face-x-min', 'face-x-max', 'face-y-min', 'face-y-max', 'face-z-min', 'face-z-max',
  'corner-x', 'corner-y', 'corner-z', 'fast',
  'push-x', 'push-y', 'push-z',
];

// The product scene's act (a short lift, then the walker carries the parcel)
// and its driven body are packages/tick/sessions.js, since a bundle's replay
// runs the act without the harness; the records are below.
export { applyProductAct, productDriven } from '../packages/tick/sessions.js';

export function createBoxProductWorld() {
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
  }, 'box');
}

/**
 * The product scene as plain records. harness/outcome.test.js translates it.
 * @returns {Parameters<typeof createWorld>[0]}
 */
export function productInit() {
  return {
    bodies: [
      { id: 'walker', x: 10, y: 0.26, z: 0, vx: 0.4, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'lower', x: 6, y: 0.3, z: 3, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'upper', x: 6, y: 0.85, z: 3, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'tip', x: 8.15, y: 0.7, z: -1.5, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'slider', x: 22.53760930650349, y: 2.3347518010647184, z: 4, vx: 0, vy: 0, vz: 0, hx: 0.12, hy: 0.12, hz: 0.12 },
      { id: 'climber', x: 2, y: 0.3, z: 5, vx: 0, vy: 0, vz: 0, hx: 0.2, hy: 0.2, hz: 0.2 },
      { id: 'parcel', x: 14, y: 0.3, z: 2, vx: 0, vy: 0, vz: 0, hx: 0.2, hy: 0.2, hz: 0.2 },
    ],
    colliders: [
      { id: 'floor', minX: 4, maxX: 80, minY: -1, maxY: 0, minZ: -2, maxZ: 6 },
      { id: 'rail', minX: 7.7, maxX: 8, minY: 0, maxY: 0.4, minZ: -1.8, maxZ: -1.2 },
      // 45° about Z. Half-extents stay at 1.4, 0.35, 0.5: a longer rotated cuboid is missed after the broad-phase warm.
      { id: 'ramp', minX: 20.6, maxX: 23.4, minY: 0.5424621202458748, maxY: 1.2424621202458748, minZ: 3.5, maxZ: 4.5, qx: 0, qy: 0, qz: 0.3826834323650898, qw: 0.9238795325112867 },
      // The climber's floor (T4 pin 8). Before it the climber fell for the
      // whole run and never slept; the hash hid that.
      { id: 'pad', minX: 1, maxX: 3, minY: -1, maxY: 0, minZ: 4, maxZ: 6 },
    ],
    heightfield: {
      rows: 2,
      cols: 3,
      cell: 1,
      heights: [0, 0.25, 0.5, 0, 0.25, 0.5],
    },
    zones: [
      { id: 'west', minX: 4, maxX: 40, minY: -1, maxY: 4, minZ: -2, maxZ: 6 },
      { id: 'east', minX: 40, maxX: 80, minY: -1, maxY: 4, minZ: -2, maxZ: 6 },
    ],
    name: 'product',
    minds: [{
      body: 'lower',
      sight: 80,
      goals: [{ kind: 'reach', zone: 'east' }],
      beliefs: [],
    }],
  };
}

export function createProductWorld() {
  return createWorld(productInit(), 'product');
}
