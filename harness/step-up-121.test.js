// #121. A driven walker autosteps onto a 0.25 step while a dynamic box
// overlaps its body, or meets its head and is not carried
// (docs/dispatch-128-driven-contacts.md). Both boxes are the measured
// placements: the walker's size, centred on it, on a step one skin ahead of
// its face, at horizontal speed 1. The overlapping box sits in the body. The
// other meets the head and does not overlap. On main the contact solve writes
// that pose change onto each box at about 16 m/s. The push alone is about
// 0.007. A carried box is not this room: the tick copies it to the walker's
// head and sets its speed to 0. Here neither box rises faster than the
// walker. The walker's upward speed is the rise of its centre over the
// quantum. The step lands grounded, so the record's vertical velocity is 0
// and is not that speed.

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
 * How far the box's bottom sits above the walker's top. Zero meets the head.
 * Negative is the box inside the body.
 * @param {{ y: number, hy: number }} walker
 * @param {{ y: number, hy: number }} box
 */
function gap(walker, box) {
  return (box.y - box.hy) - (walker.y + walker.hy);
}

/**
 * @typedef {{ id: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, hx: number, hy: number, hz: number }} Box
 */

/**
 * Eight quanta of one walker and one dynamic box. The step is 0.25, under
 * the controller's 0.3 autostep. The walker's face is one skin short of the
 * step, so horizontal speed 1 climbs it on the first quantum.
 * @param {Box} box
 */
function stepRoom(box) {
  const session = playSession({
    seed: 1,
    steps: 8,
    driven: ['walker'],
    world: {
      bodies: [
        { id: 'walker', x: 0.24, y: 0.26, z: 0, vx: 1, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
        box,
      ],
      colliders: [
        { id: 'floor', minX: -2, maxX: 4, minY: -1, maxY: 0, minZ: -2, maxZ: 2 },
        { id: 'step', minX: 0.5, maxX: 2, minY: 0, maxY: 0.25, minZ: -1, maxZ: 1 },
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
  /** @type {{ rise: number, before: boolean, gap: number, centred: boolean } | null} */
  let step = null;
  for (let i = 0; i < 8; i = i + 1) {
    const beforeWalker = world.body('walker');
    const beforeBox = world.body('box');
    if (!beforeWalker || !beforeBox) {
      throw new Error('the room lost a body');
    }
    const before = overlaps(beforeWalker, beforeBox);
    const beforeGap = gap(beforeWalker, beforeBox);
    const centred = beforeWalker.x === beforeBox.x && beforeWalker.z === beforeBox.z;
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
      step = { rise: walker.y - prevWalker, before, gap: beforeGap, centred };
    }
    prevWalker = walker.y;
    prevBox = body.y;
  }
  return { walkerUp, boxUp, step, carried: world.carriedByOf('box') };
}

test('#121: a walker autostep of 0.25 does not throw an overlapping box, or a box that meets its head, up faster than the walker rises', (t) => {
  const overlap = stepRoom({ id: 'box', x: 0.24, y: 0.55, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 });
  assert.equal(overlap.carried, null, 'the overlapping box is not carried');
  assert.ok(overlap.step, 'the walker did not autostep');
  assert.ok(overlap.step.rise > 0.24 && overlap.step.rise < 0.26, 'the step rose ' + (overlap.step && overlap.step.rise) + ', not 0.25');
  assert.equal(overlap.step.centred, true, 'the overlapping box is not centred on the walker');
  assert.equal(overlap.step.before, true, 'the box did not overlap the walker as it stepped');
  assert.ok(overlap.step.gap < -0.2, 'the box does not overlap the body, gap ' + (overlap.step && overlap.step.gap));

  const head = stepRoom({ id: 'box', x: 0.24, y: 0.76, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 });
  assert.equal(head.carried, null, 'the box on the head is not carried');
  assert.ok(head.step, 'the walker did not autostep under the box');
  assert.ok(head.step.rise > 0.24 && head.step.rise < 0.26, 'the step rose ' + (head.step && head.step.rise) + ', not 0.25');
  assert.equal(head.step.centred, true, 'the box on the head is not centred on the walker');
  assert.equal(head.step.before, false, 'the box overlapped the walker before the step');
  assert.ok(Math.abs(head.step.gap) < 1e-9, 'the box does not meet the head, gap ' + (head.step && head.step.gap));

  t.diagnostic('overlapping box peak upward speed ' + overlap.boxUp + ', walker ' + overlap.walkerUp);
  t.diagnostic('head box peak upward speed ' + head.boxUp + ', walker ' + head.walkerUp);
  assert.ok(overlap.boxUp < 1, 'the overlapping box rose at ' + overlap.boxUp + ', and the push alone is about 0.007');
  assert.ok(head.boxUp < 1, 'the box on the head rose at ' + head.boxUp + ', and the push alone is about 0.007');
});
