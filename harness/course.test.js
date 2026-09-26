// The character course, T4 pin 5 (docs/dispatch-t4-outcome-tests.md, amended
// after docs/rust-kb-answers.md answer 8). Each case builds a floor and one
// feature, drives the product walker (a 0.25 box, shape 0) at it, and asserts
// the outcome from the setup's numbers, just below and just above each limit,
// so the limit is shown to be real and not merely permissive. Never at the
// limit itself.
//
// Every threshold moves with speed, so each case states its speed; the
// product walker's is 0.4 units per second. Feet are y - hy - SKIN: the
// controller keeps one offset, SKIN, between the walker and every surface,
// so feet read the surface under them within 1e-4 when standing. Airborne is
// a quantum after which the walker's vertical velocity is not zero: the law
// zeroes it only when the controller reports the walker grounded.
//
// The controller's constants are solver/src/rapier_law.rs: STEP_HEIGHT 0.3,
// CLIMB_ANGLE 45 degrees, SNAP 0.2, SKIN 0.01. At 0.35.3 autostep's limit is
// max_height + offset: 0.31 is climbed and 0.3101 stops the walker. The drop
// between snapped and fallen depends on the geometry and on the exact bits,
// not on the speed alone: in this course's geometry the walker snaps 0.200
// and falls from 0.205, and between 0.200 and 0.2105 the outcome can turn on
// one bit, so 5.5 and 5.6 stay at 0.19 and 0.22, either side of that band
// (the Rust knowledge base, requests/walker-stall.md; the 0.2105 T4 gave
// holds for one other geometry). F2 moved neither limit. Any bump of the
// toolchain or of rapier3d-f64 reruns this course before a golden may move
// (solver/FLAGS.md; write-golden runs it first).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../packages/tick/world.js';
import { recordRun, withBundles } from './bundle.mjs';

// A failing case writes a bundle of each run it drove (T5 pin 3): the world,
// the driven walkers, the quanta, and an image at the end, one command from
// `replay`.
/**
 * @param {string} name
 * @param {(t: import('node:test').TestContext) => void} body
 */
function bundled(name, body) {
  test(name, withBundles(name, body));
}

const HALF = 0.25;
const SKIN = 0.01;
const WALK = 0.4;
const FEET_TOLERANCE = 1e-3;
const FLOOR = { id: 'floor', minX: -10, maxX: 60, minY: -1, maxY: 0, minZ: -5, maxZ: 5 };

/**
 * A walker whose feet stand on y = 0 when y is 0.26.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @param {number} vx
 */
function walker(id, x, y, vx) {
  return { id, x, y, z: 0, vx, vy: 0, vz: 0, hx: HALF, hy: HALF, hz: HALF };
}

/** @param {{ y: number, hy: number }} b */
function feet(b) {
  return b.y - b.hy - SKIN;
}

/**
 * Runs every body as a driven walker and calls visit after each quantum.
 * @param {Array<import('../packages/frame/types.js').StaticCollider>} colliders
 * @param {ReturnType<typeof walker>[]} bodies
 * @param {number} quanta
 * @param {(tick: number, world: ReturnType<typeof createWorld>) => void} visit
 */
function drive(colliders, bodies, quanta, visit) {
  // The same run as a fixture case: harness/solver-scene.mjs loads, then steps
  // with the same driven set, which is what this loop's first step does.
  recordRun({ seed: 0, steps: quanta, driven: bodies.map((b) => b.id), world: { bodies: bodies.map((b) => ({ ...b })), colliders: colliders.map((c) => ({ ...c })) } });
  const world = createWorld({ bodies, colliders }, 'product');
  const driven = new Set(bodies.map((b) => b.id));
  for (let tick = 1; tick <= quanta; tick = tick + 1) {
    world.step(driven);
    visit(tick, world);
  }
  return world;
}

/**
 * @param {ReturnType<typeof createWorld>} world
 * @param {string} id
 */
function get(world, id) {
  const b = world.body(id);
  if (!b) {
    throw new Error(id + ' is missing');
  }
  return b;
}

// ---------------------------------------------------------------------------
// Steps. The riser is at x 11, the walker starts at x 10 at 0.4 units per
// second and has 480 quanta, 3 units of travel.

const RISER = 11;
const STEP_QUANTA = 480;

/** @param {number} height */
function stepRun(height) {
  const step = { id: 'step', minX: RISER, maxX: 20, minY: 0, maxY: height, minZ: -5, maxZ: 5 };
  return get(drive([FLOOR, step], [walker('walker', 10, 0.26, WALK)], STEP_QUANTA, () => {}), 'walker');
}

bundled('course 5.1: at 0.4 units per second a 0.29 step is climbed: feet end at its top within 1e-3', (t) => {
  const b = stepRun(0.29);
  t.diagnostic('x ' + b.x + ', feet ' + feet(b));
  assert.ok(Math.abs(feet(b) - 0.29) <= FEET_TOLERANCE, 'feet ' + feet(b));
  assert.ok(b.x - HALF > RISER, 'the walker is on the step: x ' + b.x);
});

bundled('course 5.2: at 0.4 units per second a 0.33 step stops the walker: feet stay at the floor within 1e-3 and its face at least the skin short of the riser', (t) => {
  const b = stepRun(0.33);
  const gap = RISER - (b.x + HALF);
  t.diagnostic('x ' + b.x + ', feet ' + feet(b) + ', face ' + gap + ' short of the riser');
  assert.ok(Math.abs(feet(b)) <= FEET_TOLERANCE, 'feet ' + feet(b));
  // Measured 0.0101: the controller stops one offset from a wall.
  assert.ok(gap >= SKIN && gap <= SKIN + FEET_TOLERANCE, 'face ' + gap + ' short of the riser');
});

// ---------------------------------------------------------------------------
// Slopes. A rotated cuboid, half-extents 1.4 x 0.35 x 0.5, whose top face
// starts at floor level at x 10.5 and rises 2 * 1.4 * sin(angle). The walker
// starts at x 10 at 0.4 units per second for 960 quanta; the 44 degree walk
// reaches the top at quantum 932. The maximum height is measured, since past
// the top the walker walks off and falls back.

const RAMP_START = 10.5;
const RAMP_HALF = { x: 1.4, y: 0.35, z: 0.5 };
const SLOPE_QUANTA = 960;

/** @param {number} degrees */
function slopeRun(degrees) {
  const angle = degrees * Math.PI / 180;
  const cx = RAMP_START + RAMP_HALF.x * Math.cos(angle) + RAMP_HALF.y * Math.sin(angle);
  const cy = RAMP_HALF.x * Math.sin(angle) - RAMP_HALF.y * Math.cos(angle);
  const ramp = {
    id: 'ramp',
    minX: cx - RAMP_HALF.x, maxX: cx + RAMP_HALF.x,
    minY: cy - RAMP_HALF.y, maxY: cy + RAMP_HALF.y,
    minZ: -RAMP_HALF.z, maxZ: RAMP_HALF.z,
    qx: 0, qy: 0, qz: Math.sin(angle / 2), qw: Math.cos(angle / 2),
  };
  let highest = -Infinity;
  drive([FLOOR, ramp], [walker('walker', 10, 0.26, WALK)], SLOPE_QUANTA, (_tick, world) => {
    highest = Math.max(highest, feet(get(world, 'walker')));
  });
  return { top: 2 * RAMP_HALF.x * Math.sin(angle), highest };
}

bundled('course 5.3: at 0.4 units per second a 44 degree slope is climbed to its top within 960 quanta', (t) => {
  const r = slopeRun(44);
  t.diagnostic('top ' + r.top + ', highest feet ' + r.highest);
  assert.ok(Math.abs(r.highest - r.top) <= 0.01, 'highest feet ' + r.highest + ' against the top ' + r.top);
});

bundled('course 5.4: at 0.4 units per second a 46 degree slope is not climbed: the height gained over 960 quanta is below 0.05', (t) => {
  const r = slopeRun(46);
  // The controller's 1e-4 normal nudge still lifts a refused walker, about
  // 3.5e-5 per quantum at this speed; 0.033 by 960 quanta.
  t.diagnostic('top ' + r.top + ', highest feet ' + r.highest);
  assert.ok(r.highest < 0.05, 'gained ' + r.highest);
});

// ---------------------------------------------------------------------------
// Ledge drops. The upper floor ends at x 12 and the lower floor's top is at
// -drop. The walker starts at x 11.5 at 0.4 units per second; its back face
// clears the edge at quantum 124.

const EDGE = 12;
const DROP_QUANTA = 240;

/** @param {number} drop */
function dropRun(drop) {
  const upper = { id: 'upper', minX: -10, maxX: EDGE, minY: -1, maxY: 0, minZ: -5, maxZ: 5 };
  const lower = { id: 'lower', minX: EDGE, maxX: 60, minY: -1 - drop, maxY: -drop, minZ: -5, maxZ: 5 };
  /** @type {number | null} */
  let cleared = null;
  /** @type {number | null} */
  let landed = null;
  let run = 0;
  let longest = 0;
  drive([upper, lower], [walker('walker', 11.5, 0.26, WALK)], DROP_QUANTA, (tick, world) => {
    const b = get(world, 'walker');
    if (cleared === null && b.x - HALF > EDGE) {
      cleared = tick;
    }
    run = b.vy !== 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
    if (landed === null && Math.abs(feet(b) + drop) <= FEET_TOLERANCE) {
      landed = tick;
    }
  });
  return { cleared, landed, longest };
}

bundled('course 5.5: at 0.4 units per second a 0.19 drop is snapped: at most one airborne quantum, and the feet are at the lower floor within 4 quanta of clearing the edge', (t) => {
  const r = dropRun(0.19);
  t.diagnostic('cleared at ' + r.cleared + ', landed at ' + r.landed + ', longest airborne run ' + r.longest);
  assert.ok(r.cleared !== null && r.landed !== null, 'never cleared or never landed');
  assert.ok(r.longest <= 1, 'airborne for ' + r.longest + ' quanta in a row');
  assert.ok(r.landed - r.cleared <= 4, 'landed ' + (r.landed - r.cleared) + ' quanta after clearing');
});

bundled('course 5.6: at 0.4 units per second a 0.22 drop is a fall: airborne for at least 2 quanta in a row', (t) => {
  const r = dropRun(0.22);
  t.diagnostic('cleared at ' + r.cleared + ', landed at ' + r.landed + ', longest airborne run ' + r.longest);
  assert.ok(r.longest >= 2, 'airborne for only ' + r.longest + ' quanta in a row');
  assert.ok(r.landed !== null, 'never landed on the lower floor');
});

// ---------------------------------------------------------------------------
// Starting inside the floor. Rapier depenetrates only when the desired
// movement is zero, and the law always passes gravity, so the walker rises by
// the controller's 1e-4 normal nudge a quantum: feet 0.1 inside take about
// 1,000 quanta, a centre 0.1 inside (feet 0.36 inside) about 3,600.

/**
 * @param {number} y the walker's starting centre
 * @param {number} quanta
 */
function insideRun(y, quanta) {
  let lowest = Infinity;
  /** @type {number | null} */
  let standing = null;
  const world = drive([FLOOR], [walker('walker', 0, y, WALK)], quanta, (tick, w) => {
    const f = feet(get(w, 'walker'));
    lowest = Math.min(lowest, f);
    if (standing === null && Math.abs(f) <= FEET_TOLERANCE) {
      standing = tick;
    }
  });
  return { start: y - HALF - SKIN, lowest, standing, final: feet(get(world, 'walker')) };
}

bundled('course 5.7: at 0.4 units per second a walker with its feet 0.1 inside the floor ends standing on it after 1300 quanta, never below its start', (t) => {
  const r = insideRun(0.16, 1300);
  t.diagnostic('feet start ' + r.start + ', lowest ' + r.lowest + ', standing at ' + r.standing + ', final ' + r.final);
  assert.ok(r.lowest >= r.start, 'sank to ' + r.lowest);
  assert.ok(Math.abs(r.final) <= FEET_TOLERANCE, 'feet end at ' + r.final);
});

bundled('course 5.8: at 0.4 units per second a walker with its centre 0.1 inside the floor ends standing on it after 4000 quanta, never below its start', (t) => {
  const r = insideRun(-0.1, 4000);
  t.diagnostic('feet start ' + r.start + ', lowest ' + r.lowest + ', standing at ' + r.standing + ', final ' + r.final);
  assert.ok(r.lowest >= r.start, 'sank to ' + r.lowest);
  assert.ok(Math.abs(r.final) <= FEET_TOLERANCE, 'feet end at ' + r.final);
});

// ---------------------------------------------------------------------------
// Walker against walker. Two walkers 2 apart driven at each other for 192
// quanta. Each plans against the other's pose from the previous quantum.

/** @param {number} speed */
function meetRun(speed) {
  let closest = Infinity;
  let passed = false;
  const world = drive([FLOOR], [walker('west', 10, 0.26, speed), walker('east', 12, 0.26, -speed)], 192, (_tick, w) => {
    const a = get(w, 'west');
    const b = get(w, 'east');
    closest = Math.min(closest, b.x - a.x);
    if (a.x >= 12 || b.x <= 10) {
      passed = true;
    }
  });
  const a = get(world, 'west');
  const b = get(world, 'east');
  return { closest, final: b.x - a.x, passed, west: a.x, east: b.x };
}

bundled('course 5.9: two walkers driven at each other at 1 unit per second stay at least 0.49 apart (the half-extents less the skin) at every quantum, and neither passes the other\'s start', (t) => {
  const r = meetRun(1);
  t.diagnostic('closest ' + r.closest + ', final ' + r.final + ' (west ' + r.west + ', east ' + r.east + ')');
  const least = HALF + HALF - SKIN;
  assert.ok(r.closest >= least, 'closest ' + r.closest);
  assert.ok(r.final >= least, 'final ' + r.final);
  assert.equal(r.passed, false);
});

// At 8 units per second each walker moves 0.125 a quantum toward a pose the
// other is leaving, so nothing in the law keeps them 0.49 apart, and where
// they meet turns on the last bits. On main at 48da598 they came within
// 0.387; with F2's controller copy this run's closest approach is 0.5, and
// the Rust knowledge base saw it move with every change to the controller
// it measured (requests/walker-stall.md). So it is recorded, not asserted.
bundled('course 5.10: two walkers driven at each other at 8 units per second, recorded: each plans against the other\'s last pose, so the law does not guarantee their separation there and it is not asserted', (t) => {
  const r = meetRun(8);
  t.diagnostic('closest ' + r.closest + ', final ' + r.final + ' (west ' + r.west + ', east ' + r.east + '), passed ' + r.passed);
  assert.ok(Number.isFinite(r.closest) && Number.isFinite(r.final));
});
