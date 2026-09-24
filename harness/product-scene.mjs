// The scene the product harness steps. One world, every branch of
// world.step on the first quantum: the floor, both walls, a corner
// where each penetration axis wins once, the speed clamp, and more
// than one body, plus a driven body meeting an undriven one. The
// harness and the Node test both build this.

export const productDriven = ['on-floor', 'into-left', 'into-right', 'corner-x', 'corner-y', 'fast', 'pusher'];

import { createWorld } from '../packages/tick/world.js';

export function createProductWorld() {
  return createWorld({
    bodies: [
      { id: 'on-floor', x: 1, y: 0.2, vx: 0.4, vy: 0, hw: 0.25, hh: 0.25 },
      { id: 'into-left', x: -0.85, y: 2, vx: -0.5, vy: 0, hw: 0.25, hh: 0.25 },
      { id: 'into-right', x: 8.15, y: 2, vx: 0.5, vy: 0, hw: 0.25, hh: 0.25 },
      { id: 'corner-x', x: 1.9, y: 2.2, vx: 0.5, vy: 0, hw: 0.25, hh: 0.25 },
      { id: 'corner-y', x: 2.2, y: 1.9, vx: 0.3, vy: 0, hw: 0.25, hh: 0.25 },
      { id: 'fast', x: 5, y: 4, vx: 3, vy: 0, hw: 0.2, hh: 0.2 },
      { id: 'pusher', x: 12, y: 5, vx: 0.8, vy: 0, hw: 0.25, hh: 0.25 },
      { id: 'yields', x: 12.4, y: 5, vx: 0.2, vy: 0, hw: 0.25, hh: 0.25 },
    ],
    colliders: [
      { id: 'floor', minX: -10, maxX: 10, minY: -2, maxY: 0 },
      { id: 'wall-left', minX: -2, maxX: -1, minY: 0, maxY: 6 },
      { id: 'wall-right', minX: 8, maxX: 9, minY: 0, maxY: 6 },
      { id: 'post', minX: 2, maxX: 3, minY: 2, maxY: 3 },
    ],
  });
}
