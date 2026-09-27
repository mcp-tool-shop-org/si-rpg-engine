// #121. A driven walker autosteps onto a 0.25 step while a dynamic box
// overlaps it, or meets its head and is not carried
// (docs/dispatch-128-driven-contacts.md). On main the contact solve writes
// that pose change onto the box at about 16 m/s. A carried box is not this
// room: the tick copies it to the walker's head and sets its speed to 0.
// Here neither box rises faster than the walker. The walker's upward speed
// is the rise of its centre over the quantum. The step lands grounded, so
// the record's vertical velocity is 0 and is not that speed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playSession } from './solver-scene.mjs';

/** The law's quantum, solver/src/rapier_law.rs. */
const DT = 1 / 64;

/**
 * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} a
 * @param {{ x: number, y: number, z: number, hx: number, hy: number, hz: number }} b
 */
function overlaps(a, b) {
  return Math.abs(a.x - b.x) < a.hx + b.hx && Math.abs(a.y - b.y) < a.hy + b.hy && Math.abs(a.z - b.z) < a.hz + b.hz;
}

/**
 * @typedef {{ id: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, hx: number, hy: number, hz: number }} Box
 */

/**
 * Eight quanta of one walker and one dynamic box. The step is 0.25, under
 * the controller's 0.3 autostep, and the walker reaches it on the first quantum.
 * @param {Box} box
 */
function stepRoom(box) {
  const session = playSession({
    seed: 1,
    steps: 8,
    driven: ['walker'],
    world: {
      bodies: [
        { id: 'walker', x: 0.74, y: 0.26, z: 0, vx: 1, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
        box,
      ],
      colliders: [
        { id: 'floor', minX: -2, maxX: 6, minY: -1, maxY: 0, minZ: -2, maxZ: 2 },
        { id: 'step', minX: 1, maxX: 3, minY: 0, maxY: 0.25, minZ: -1, maxZ: 1 },
      ],
    },
  });
  const world = session.world;
  const walker0 = world.body('walker');
  const box0 = world.body('box');
  if (!walker0 || !box0) {
    throw new Error('the room has no walker or no box');
  }
  let prevWalker = walker0.y;
  let prevBox = box0.y;
  let walkerUp = 0;
  let boxUp = 0;
  /** @type {{ tick: number, rise: number, before: boolean, after: boolean, walkerY: number, boxY: number, boxHy: number } | null} */
  let step = null;
  for (let i = 0; i < 8; i = i + 1) {
    const beforeWalker = world.body('walker');
    const beforeBox = world.body('box');
    if (!beforeWalker || !beforeBox) {
      throw new Error('the room lost a body');
    }
    const before = overlaps(beforeWalker, beforeBox);
    session.advance();
    const walker = world.body('walker');
    const body = world.body('box');
    if (!walker || !body) {
      throw new Error('the room lost a body');
    }
    const walkerRate = Math.max(walker.vy, Math.max(0, walker.y - prevWalker) / DT);
    const boxRate = Math.max(body.vy, Math.max(0, body.y - prevBox) / DT);
    if (walkerRate > walkerUp) {
      walkerUp = walkerRate;
    }
    if (boxRate > boxUp) {
      boxUp = boxRate;
    }
    if (step === null && walker.y - prevWalker > 0.2) {
      step = {
        tick: session.tick,
        rise: walker.y - prevWalker,
        before,
        after: overlaps(walker, body),
        walkerY: walker.y,
        boxY: body.y,
        boxHy: body.hy,
      };
    }
    prevWalker = walker.y;
    prevBox = body.y;
  }
  return { walkerUp, boxUp, step, carried: world.carriedByOf('box') };
}

test('#121: a walker autostep of 0.25 does not throw an overlapping box, or a box that meets its head, up faster than the walker rises', (t) => {
  const overlap = stepRoom({ id: 'box', x: 0.74, y: 0.3, z: 0.3, vx: 0, vy: 0, vz: 0, hx: 0.12, hy: 0.12, hz: 0.12 });
  assert.equal(overlap.carried, null, 'the overlapping box is not carried');
  assert.ok(overlap.step, 'the walker did not autostep');
  assert.ok(overlap.step.rise > 0.24 && overlap.step.rise < 0.26, 'the step rose ' + (overlap.step && overlap.step.rise) + ', not 0.25');
  assert.equal(overlap.step.before, true, 'the box did not overlap the walker as it stepped');
  assert.ok(overlap.boxUp <= overlap.walkerUp, 'the overlapping box rose at ' + overlap.boxUp + ' and the walker at ' + overlap.walkerUp);
  t.diagnostic('overlapping box peak upward speed ' + overlap.boxUp + ', walker ' + overlap.walkerUp);

  const head = stepRoom({ id: 'box', x: 0.74, y: 0.62, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.1, hy: 0.1, hz: 0.1 });
  assert.equal(head.carried, null, 'the box on the head is not carried');
  assert.ok(head.step, 'the walker did not autostep under the box');
  assert.ok(head.step.rise > 0.24 && head.step.rise < 0.26, 'the step rose ' + (head.step && head.step.rise) + ', not 0.25');
  assert.equal(head.step.before, false, 'the box overlapped the walker before the step');
  assert.equal(head.step.after, true, 'the step did not bring the head up to the box');
  assert.ok(head.step.boxY - head.step.boxHy > head.step.walkerY, 'the box is not above the walker\'s centre');
  assert.ok(head.boxUp <= head.walkerUp, 'the box on the head rose at ' + head.boxUp + ' and the walker at ' + head.walkerUp);
  t.diagnostic('head box peak upward speed ' + head.boxUp + ', walker ' + head.walkerUp);
});
