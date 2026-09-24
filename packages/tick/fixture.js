// The slice 2 fixture: one body in the fixture room. play, replay, and the
// tests all start from this so a log written by one is readable by the others.

import { fixtureColliders } from './world.js';

export const FIXTURE_SEED = 7;

export function fixtureWorld() {
  return {
    bodies: [{ id: 'walker', x: 1, y: 1, vx: 0, vy: 0, hw: 0.25, hh: 0.25 }],
    colliders: fixtureColliders(),
  };
}
