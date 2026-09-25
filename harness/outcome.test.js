// Outcome tests, T4 (docs/dispatch-t4-outcome-tests.md). A hash says two runs
// agree; these say what happened. Each builds its world inline from plain
// records, runs the product law for a stated number of quanta, and asserts
// positions, velocities, or sleep quanta with a stated tolerance. None
// asserts a hash. The character course is harness/course.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../packages/tick/world.js';
import { sleepWatch } from './behaviour.mjs';
import { recordRun, withBundles } from './bundle.mjs';
import { PRODUCT_STEPS } from './product-run.mjs';
import { applyProductAct, productDriven, productInit } from './product-scene.mjs';

// A failing outcome writes a bundle of each run it made (T5 pin 3).
/**
 * @param {string} name
 * @param {(t: import('node:test').TestContext) => void} body
 */
function bundled(name, body) {
  test(name, withBundles(name, body));
}

// The law's contact skin, SKIN in solver/src/rapier_law.rs.
const SKIN = 0.01;
// Gravity and friction as build_world sets them.
const G = 8;
const FRICTION = 0.8;
const DT = 1 / 64;

// ---------------------------------------------------------------------------
// 2. A thin fast body over a thin slab.
//
// rapier3d-f64 0.35.3 sweeps every fast dynamic body against fixed colliders
// with ccd_enabled(false); build_world writes max_ccd_substeps = 1, the only
// setting that keeps that sweep on. The same box passes through with
// max_ccd_substeps = 0 in 10 of these 14 runs: the native test at the end of
// solver/src/rapier_law.rs, `cargo test --release`, is this test's red.

const BOX = 0.05;
const SLAB = 0.02;
const FAST = 20;
const PHASES = 7;
const SLAB_QUANTA = 64;

/**
 * @param {boolean} falling
 * @param {number} phase 0 .. PHASES - 1, a fraction of one quantum's travel
 */
function slabRun(falling, phase) {
  const offset = (phase / PHASES) * FAST * DT;
  const init = falling
    ? {
      bodies: [{ id: 'box', x: 0, y: 1 + offset, z: 0, vx: 0, vy: -FAST, vz: 0, hx: BOX, hy: BOX, hz: BOX }],
      colliders: [{ id: 'slab', minX: -2, maxX: 2, minY: -SLAB, maxY: SLAB, minZ: -2, maxZ: 2 }],
    }
    : {
      bodies: [{ id: 'box', x: -1 - offset, y: 0, z: 0, vx: FAST, vy: 0, vz: 0, hx: BOX, hy: BOX, hz: BOX }],
      colliders: [{ id: 'slab', minX: -SLAB, maxX: SLAB, minY: -20, maxY: 20, minZ: -2, maxZ: 2 }],
    };
  recordRun({ seed: 0, steps: SLAB_QUANTA, driven: [], world: init });
  const world = createWorld(init, 'product');
  for (let q = 0; q < SLAB_QUANTA; q = q + 1) {
    world.step(new Set());
  }
  const box = world.body('box');
  if (!box) {
    throw new Error('the box is missing');
  }
  return box;
}

bundled('outcome 2: a 0.05 box at 20 units per second ends on the near side of a 0.02 slab, 14 of 14 runs over 64 quanta', (t) => {
  /** @type {string[]} */
  const ends = [];
  /** @type {string[]} */
  const far = [];
  for (const falling of [true, false]) {
    for (let phase = 0; phase < PHASES; phase = phase + 1) {
      const box = slabRun(falling, phase);
      // Near side: the box's far face has not crossed the slab's near face.
      const at = falling ? box.y : box.x;
      const near = falling ? box.y - BOX >= SLAB - SKIN : box.x + BOX <= -SLAB + SKIN;
      ends.push((falling ? 'falling ' : 'horizontal ') + phase + ' ' + at.toFixed(4));
      if (!near) {
        far.push((falling ? 'falling' : 'horizontal') + ' phase ' + phase + ' ended at ' + at);
      }
    }
  }
  t.diagnostic('ends: ' + ends.join(', '));
  assert.deepEqual(far, [], 'the box passed through the slab');
});

// ---------------------------------------------------------------------------
// 3. A heightfield seam.
//
// A flat sled, half-extents 0.2 x 0.05 x 0.2, is set on a planar 9 x 9 field
// of cell 1, aligned with the slope, and launched downhill. Its centre must
// stay within the skin of its resting height over the surface at every
// quantum: supportAt under the centre (S2 made that the physics' own
// two-triangle surface) plus hy / cos(slope), the height of an aligned sled's
// centre above the plane. It must not rise by more than the skin in one
// quantum, keep its heading, and slide as far as Coulomb friction says. Every
// crossing includes row 0, the lowest-z row, moving +x.
//
// Without HeightFieldFlags::FIX_INTERNAL_EDGES (build_world before T4) the
// 20 degree sled catches on the first cell boundary in every direction,
// 0.047 above its resting height, and stops after 0.136; the 35 degree sled
// catches moving +x and -z and turns, qy 0.11 to 0.14. The PR records both.

const FIELD = 9;
const SLED = { hx: 0.2, hy: 0.05, hz: 0.2 };
// Coulomb friction on an ideal plane; Rapier's solver slides a few percent
// farther (1.4 to 5.5 percent in these runs).
const TRAVEL_TOLERANCE = 0.1;
const YAW_LIMIT = 0.005;

/**
 * @param {'+x' | '-x' | '+z' | '-z'} dir downhill direction
 * @param {number} degrees
 */
function planarField(dir, degrees) {
  const slope = Math.tan(degrees * Math.PI / 180);
  const sign = dir[0] === '+' ? 1 : -1;
  /** @type {number[]} */
  const heights = [];
  for (let row = 0; row < FIELD; row = row + 1) {
    for (let col = 0; col < FIELD; col = col + 1) {
      // The field is centred on the origin: column advances x, row advances z.
      const along = dir[1] === 'x' ? col - (FIELD - 1) / 2 : row - (FIELD - 1) / 2;
      heights.push(-sign * slope * along);
    }
  }
  return { rows: FIELD, cols: FIELD, cell: 1, heights };
}

/**
 * @param {'+x' | '-x' | '+z' | '-z'} dir
 * @param {number} lane the row (moving along x) or column (moving along z) of cells
 * @param {number} degrees
 * @param {number} speed along the slope, units per second
 * @param {number} quanta
 */
function slide(dir, lane, degrees, speed, quanta) {
  const angle = degrees * Math.PI / 180;
  const sign = dir[0] === '+' ? 1 : -1;
  const alongX = dir[1] === 'x';
  const field = planarField(dir, degrees);
  const surface = createWorld({ bodies: [], colliders: [], heightfield: field }, 'reference');
  const laneCentre = -(FIELD - 1) / 2 + lane + 0.5;
  const start = -sign * 3.3;
  const x = alongX ? start : laneCentre;
  const z = alongX ? laneCentre : start;
  const ground = surface.supportAt(x, z, 1e9);
  if (ground === null) {
    throw new Error('the sled starts off the field');
  }
  const lift = SLED.hy / Math.cos(angle);
  // Tilted with the slope: about z for x, about x for z.
  const half = (alongX ? -sign : sign) * angle / 2;
  const q = alongX
    ? { qx: 0, qy: 0, qz: Math.sin(half), qw: Math.cos(half) }
    : { qx: Math.sin(half), qy: 0, qz: 0, qw: Math.cos(half) };
  const across = sign * speed * Math.cos(angle);
  const init = {
    bodies: [{
      id: 'sled', x, y: ground + lift + 0.001, z,
      vx: alongX ? across : 0, vy: -speed * Math.sin(angle), vz: alongX ? 0 : across,
      ...SLED, ...q,
    }],
    colliders: [],
    heightfield: field,
  };
  recordRun({ seed: 0, steps: quanta, driven: [], world: init });
  const world = createWorld(init, 'product');
  let worst = 0;
  let worstAt = 0;
  let rise = 0;
  let yaw = 0;
  /** @type {number | null} */
  let previous = null;
  for (let i = 1; i <= quanta; i = i + 1) {
    world.step(new Set());
    const sled = world.body('sled');
    if (!sled) {
      throw new Error('the sled is missing');
    }
    const under = surface.supportAt(sled.x, sled.z, 1e9);
    if (under === null) {
      throw new Error(dir + ' lane ' + lane + ' left the field at quantum ' + i);
    }
    const dev = sled.y - (under + lift);
    if (Math.abs(dev) > Math.abs(worst)) {
      worst = dev;
      worstAt = i;
    }
    if (previous !== null && dev - previous > rise) {
      rise = dev - previous;
    }
    previous = dev;
    yaw = Math.max(yaw, Math.abs(sled.qy));
  }
  const sled = world.body('sled');
  if (!sled) {
    throw new Error('the sled is missing');
  }
  // Coulomb friction on the plane: a = g (mu cos - sin), a deceleration.
  const decel = G * (FRICTION * Math.cos(angle) - Math.sin(angle));
  const t = quanta * DT;
  const stop = speed / decel;
  const path = t >= stop ? (speed * speed) / (2 * decel) : speed * t - (decel * t * t) / 2;
  return {
    label: dir + ' ' + (alongX ? 'row ' : 'column ') + lane,
    worst,
    worstAt,
    rise,
    yaw,
    travel: sign * (alongX ? sled.x - x : sled.z - z),
    expected: path * Math.cos(angle),
  };
}

/** @type {Array<'+x' | '-x' | '+z' | '-z'>} */
const DIRECTIONS = ['+x', '-x', '+z', '-z'];
// Row or column 0 is the field's edge lane; 3 and 7 are an interior lane and
// the far edge. Row 0 moving +x is the case the knowledge base found the flag
// did not fix on its field.
const LANES = [0, 3, 7];

/**
 * @param {import('node:test').TestContext} t
 * @param {number} degrees
 * @param {number} speed
 * @param {number} quanta
 */
function assertSeams(t, degrees, speed, quanta) {
  /** @type {string[]} */
  const failures = [];
  for (const dir of DIRECTIONS) {
    for (const lane of LANES) {
      const r = slide(dir, lane, degrees, speed, quanta);
      t.diagnostic(r.label + ': worst ' + r.worst.toExponential(3) + ' at q' + r.worstAt + ', rise ' + r.rise.toExponential(3) + ', |qy| ' + r.yaw.toExponential(2) + ', travel ' + r.travel.toFixed(4) + ' of ' + r.expected.toFixed(4));
      if (!(Math.abs(r.worst) <= SKIN)) {
        failures.push(r.label + ' left its resting height by ' + r.worst + ' at quantum ' + r.worstAt);
      }
      if (!(r.rise <= SKIN)) {
        failures.push(r.label + ' hitched up by ' + r.rise + ' in one quantum');
      }
      if (!(r.yaw <= YAW_LIMIT)) {
        failures.push(r.label + ' turned: |qy| ' + r.yaw);
      }
      if (!(Math.abs(r.travel - r.expected) <= TRAVEL_TOLERANCE * r.expected)) {
        failures.push(r.label + ' travelled ' + r.travel + ', friction says ' + r.expected);
      }
    }
  }
  assert.deepEqual(failures, []);
}

bundled('outcome 3a: a sled launched at 4 units per second down a 20 degree heightfield crosses every seam within the skin, 0.01, for 128 quanta', (t) => {
  assertSeams(t, 20, 4, 128);
});

bundled('outcome 3b: a sled launched at 2.5 units per second down a 35 degree heightfield keeps its heading (|qy| <= 0.005) and slides within 10% of Coulomb friction for 160 quanta', (t) => {
  assertSeams(t, 35, 2.5, 160);
});

// ---------------------------------------------------------------------------
// 4. The whole scene translated.
//
// The product scene offset by (1e6, 0, 1e6), every body, collider, and zone,
// for the full 10000 quanta. The heightfield has no position in a world
// record (the law centres every field on the origin), so it stays where it
// is; no body in the product scene touches it. Every dynamic body starts away
// from the origin in both runs, so Rapier's first sleep check, which compares
// against the identity pose, reads the same in both.
//
// An outcome since F2 (docs/dispatch-f2-walker-stride.md, pin 7). Until then
// this test listed the bodies that diverged between the offsets, with their
// causes: the sleeping stack, re-solved cold by the rebuild at a verb
// boundary until F1 switched bodies in place, and the walker with the parcel
// it carries, 0.038 apart because the walker lost most of a quantum's travel
// on about one flat-ground quantum in 30, and on other quanta at each offset,
// until F2's copy of the controller (solver/src/kcc.rs). What it asserts now:
// - lower, upper, tip, and climber, which neither tumble nor carry the
//   controller's hover, sleep at the same quantum in both runs and end within
//   1e-6 of their untranslated positions relative to the offset (measured
//   1.9e-10, 3.6e-10, 4.7e-9, and 1.4e-10);
// - the walker ends within 1e-6 horizontally (2.3e-7 measured: each quantum's
//   add at 1e6 rounds to the 2^-33 grid). Its height is held to the
//   controller's 1e-4 hover instead: the controller leaves the walker either
//   at its skin or one normal nudge, 1e-4, above it, and which of the two
//   depends on the last bits of the floor contact at the skin, so the offsets
//   choose differently on many quanta (the Rust knowledge base measured about
//   40%; this run prints its own count). The parcel rides on the walker from
//   quantum 400, so it carries the same hover and is held the same way, and
//   it sleeps at the same quantum before that;
// - the slider tumbles down the 45 degree ramp, where a 1e-9 difference at
//   quantum 22 grows to 1e-6 by 40 and lands 0.47 apart, so its position is
//   not compared: it must come to rest on the floor in both runs, asleep at the
//   end, its centre its half-extent above the floor's top within the skin,
//   and inside the floor's bounds.
// The flat walk and the step in four directions that F2 fixed and guards are
// 4b and 4c below.

const OFFSET_X = 1e6;
const OFFSET_Z = 1e6;
const RELATIVE_TOLERANCE = 1e-6;
// The controller's normal nudge, normal_nudge_factor in solver/src/rapier_law.rs.
const HOVER = 1e-4;
const HELD = ['lower', 'upper', 'tip', 'climber'];
const HOVERING = ['walker', 'parcel'];
const TUMBLES = 'slider';

/**
 * @param {number} ox
 * @param {number} oz
 */
function translatedRun(ox, oz) {
  const init = productInit();
  const moved = {
    ...init,
    bodies: init.bodies.map((b) => ({ ...b, x: b.x + ox, z: b.z + oz })),
    colliders: init.colliders.map((c) => ({ ...c, minX: c.minX + ox, maxX: c.maxX + ox, minZ: c.minZ + oz, maxZ: c.maxZ + oz })),
    zones: (init.zones || []).map((c) => ({ ...c, minX: c.minX + ox, maxX: c.maxX + ox, minZ: c.minZ + oz, maxZ: c.maxZ + oz })),
  };
  // The product scene's act over the moved records; the bundle's replay also
  // runs the scene's mind, which observes and does not move a body.
  recordRun({ scene: 'product', world: moved, quanta: PRODUCT_STEPS });
  const world = createWorld(moved, 'product');
  const driven = new Set(productDriven);
  const watch = sleepWatch(world, world.bodies.filter((b) => !driven.has(b.id)).map((b) => b.id));
  /** @type {number[]} */
  const walkerY = [];
  for (let i = 0; i < PRODUCT_STEPS; i = i + 1) {
    world.step(applyProductAct(world, i));
    watch.see(i + 1);
    walkerY.push(/** @type {{ y: number }} */ (world.body('walker')).y);
  }
  /** @type {Record<string, { x: number, y: number, z: number }>} */
  const final = {};
  for (const b of world.bodies) {
    final[b.id] = { x: b.x - ox, y: b.y, z: b.z - oz };
  }
  return { sleep: watch.sleep(), final, walkerY, asleep: world.bodies.filter((b) => world.sleeping(b.id)).map((b) => b.id) };
}

bundled('outcome 4: the product scene translated by (1e6, 0, 1e6) over 10000 quanta: every body that neither tumbles nor hovers keeps its sleep quantum and ends within 1e-6, the walker and its parcel within 1e-6 horizontally and the 1e-4 hover in height, and the tumbling slider comes to rest on the floor in both runs', (t) => {
  const home = translatedRun(0, 0);
  const far = translatedRun(OFFSET_X, OFFSET_Z);
  /** @type {string[]} */
  const failures = [];
  for (const id of Object.keys(home.sleep)) {
    t.diagnostic(id + ' sleeps at ' + home.sleep[id] + ' and ' + far.sleep[id]);
    if (id !== TUMBLES && home.sleep[id] !== far.sleep[id]) {
      failures.push(id + ' sleeps at ' + home.sleep[id] + ' and ' + far.sleep[id]);
    }
  }
  for (const id of HELD) {
    const a = home.final[id];
    const b = far.final[id];
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
    t.diagnostic(id + ' final relative position differs by ' + d.toExponential(2));
    if (!(d <= RELATIVE_TOLERANCE)) {
      failures.push(id + ' ends ' + d + ' from its untranslated position');
    }
  }
  for (const id of HOVERING) {
    const a = home.final[id];
    const b = far.final[id];
    const across = Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
    const up = Math.abs(a.y - b.y);
    t.diagnostic(id + ' final relative position differs by ' + across.toExponential(2) + ' horizontally and ' + up.toExponential(2) + ' in height');
    if (!(across <= RELATIVE_TOLERANCE)) {
      failures.push(id + ' ends ' + across + ' from its untranslated position horizontally');
    }
    if (!(up <= HOVER + RELATIVE_TOLERANCE)) {
      failures.push(id + ' ends ' + up + ' from its untranslated height, more than the hover');
    }
  }
  let flips = 0;
  for (let i = 0; i < home.walkerY.length; i = i + 1) {
    if (Math.abs(home.walkerY[i] - far.walkerY[i]) > RELATIVE_TOLERANCE) {
      flips = flips + 1;
    }
  }
  t.diagnostic('the walker\'s height differs between the offsets by more than 1e-6 on ' + flips + ' of ' + home.walkerY.length + ' quanta');
  const floor = /** @type {{ minX: number, maxX: number, maxY: number, minZ: number, maxZ: number }} */ (productInit().colliders.find((c) => c.id === 'floor'));
  const slider = /** @type {{ hy: number }} */ (productInit().bodies.find((b) => b.id === TUMBLES));
  for (const [name, run] of /** @type {Array<[string, ReturnType<typeof translatedRun>]>} */ ([['home', home], ['far', far]])) {
    const s = run.final[TUMBLES];
    t.diagnostic(TUMBLES + ' ' + name + ' rests at (' + s.x.toFixed(6) + ', ' + s.y.toFixed(6) + ', ' + s.z.toFixed(6) + '), asleep at ' + run.sleep[TUMBLES]);
    const rests = run.sleep[TUMBLES] !== null && run.asleep.includes(TUMBLES)
      && Math.abs(s.y - (floor.maxY + slider.hy)) <= SKIN
      && s.x > floor.minX && s.x < floor.maxX && s.z > floor.minZ && s.z < floor.maxZ;
    if (!rests) {
      failures.push(TUMBLES + ' is not at rest on the floor in the ' + name + ' run');
    }
  }
  assert.deepEqual(failures, []);
});

// ---------------------------------------------------------------------------
// 4b. The walker keeps its stride on flat ground (F2 pin 5).
//
// The product walker alone on the product floor, as the corpus's walker-stall
// bundle has it, for 10000 quanta at 0.4 units per second: at the origin, and
// moved with its floor by (1e6, 0, 1e6). A quantum is short when the walker
// travels less than the stride it was asked for by more than a millionth of
// it (at 1e6 every quantum loses 2.3e-11 to rounding, 4e-9 of a stride). The
// walker starts on the floor at its skin and must stay grounded throughout,
// so every quantum counts. On main 332 quanta were short at the origin and
// 323 at the offset: when the floor contact's normal came out vertical but
// for its last bit, Rapier's controller filed the horizontal travel as
// vertical and kept none of it (https://github.com/dimforge/rapier/issues/1019).
// The engine's copy of the controller, solver/src/kcc.rs, files it as
// horizontal; its native control test, at the end of solver/src/rapier_law.rs,
// holds the copy to Rapier's own controller bit for bit with the branch off.
// The run also prints the quanta where the walker sinks more than 1e-3 into
// its skin while keeping its travel, which docs/PHASE-2.md records as known
// and not fixed.

const FLAT_QUANTA = 10000;
const STRIDE = 0.4 * DT;
const PRODUCT_WALKER = { id: 'walker', x: 10, y: 0.26, z: 0, vx: 0.4, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 };
const PRODUCT_FLOOR = { id: 'floor', minX: 4, maxX: 80, minY: -1, maxY: 0, minZ: -2, maxZ: 6 };

/** @param {number} offset */
function flatWalk(offset) {
  const init = {
    bodies: [{ ...PRODUCT_WALKER, x: PRODUCT_WALKER.x + offset, z: PRODUCT_WALKER.z + offset }],
    colliders: [{ ...PRODUCT_FLOOR, minX: PRODUCT_FLOOR.minX + offset, maxX: PRODUCT_FLOOR.maxX + offset, minZ: PRODUCT_FLOOR.minZ + offset, maxZ: PRODUCT_FLOOR.maxZ + offset }],
  };
  recordRun({ seed: 0, steps: FLAT_QUANTA, driven: ['walker'], world: init });
  const world = createWorld(init, 'product');
  const driven = new Set(['walker']);
  let x = PRODUCT_WALKER.x + offset;
  /** @type {number[]} */
  const short = [];
  /** @type {number[]} */
  const airborne = [];
  /** @type {number[]} */
  const sunk = [];
  let least = Infinity;
  for (let q = 1; q <= FLAT_QUANTA; q = q + 1) {
    world.step(driven);
    const b = /** @type {{ x: number, y: number, vy: number }} */ (world.body('walker'));
    const travel = b.x - x;
    x = b.x;
    least = Math.min(least, travel / STRIDE);
    if (travel < STRIDE * (1 - 1e-6)) {
      short.push(q);
    }
    if (b.vy !== 0) {
      airborne.push(q);
    }
    if (b.y < PRODUCT_WALKER.y - 1e-3) {
      sunk.push(q);
    }
  }
  return { short, airborne, sunk, least };
}

bundled('outcome 4b: the product walker on the product floor travels its full stride on every one of 10000 quanta at 0.4 units per second, at the origin and at (1e6, 0, 1e6), grounded throughout', (t) => {
  /** @type {string[]} */
  const failures = [];
  for (const offset of [0, 1e6]) {
    const walk = flatWalk(offset);
    t.diagnostic('at ' + offset + ': ' + walk.short.length + ' short quanta' + (walk.short.length > 0 ? ', first ' + walk.short.slice(0, 5).join(' ') : '') + '; the least travel ' + walk.least + ' of a stride; ' + walk.airborne.length + ' quanta airborne; sunk more than 1e-3 into the skin at ' + (walk.sunk.join(' ') || 'none'));
    if (walk.short.length > 0) {
      failures.push('at ' + offset + ' the walker fell short of its stride on ' + walk.short.length + ' quanta, first ' + walk.short[0]);
    }
    if (walk.airborne.length > 0) {
      failures.push('at ' + offset + ' the walker left the floor on ' + walk.airborne.length + ' quanta, first ' + walk.airborne[0]);
    }
  }
  assert.deepEqual(failures, []);
});

// ---------------------------------------------------------------------------
// 4c. The step in four directions (F2 pin 5).
//
// The course climbs its 0.29 step moving +x only. Here the step's riser is 1
// ahead of the origin in each of +x, -x, +z, and -z, and the walker starts
// from 20 positions a twentieth of a stride apart behind the origin, so it
// meets the riser at 20 phases of a quantum; after 480 quanta every one of the
// 80 must stand on the step, its feet at 0.29 within 1e-3 and its back face
// past the riser. The settings fix F2 rejected, tilting `up`, broke this
// outside a window: the native test
// the_step_is_climbed_from_every_start_in_four_directions_and_a_tilted_up_refuses_it,
// at the end of solver/src/rapier_law.rs, runs the same 80 and, with `up`
// tilted to (0, 1, 1e-8), sees the +z step refused from most starts. That is
// this test's red; main climbs all 80 too.

const STEP_STARTS = 20;
const STEP_QUANTA = 480;
const STEP_HEIGHT = 0.29;
/** @type {Array<{ name: string, step: { minX: number, maxX: number, minZ: number, maxZ: number }, vx: number, vz: number, along: (b: { x: number, z: number }) => number, start: (back: number) => { x: number, z: number } }>} */
const STEP_DIRECTIONS = [
  // 0 - back, not -back, so the first start is +0 and not -0.
  { name: '+x', step: { minX: 1, maxX: 10, minZ: -5, maxZ: 5 }, vx: 0.4, vz: 0, along: (b) => b.x, start: (back) => ({ x: 0 - back, z: 0 }) },
  { name: '-x', step: { minX: -10, maxX: -1, minZ: -5, maxZ: 5 }, vx: -0.4, vz: 0, along: (b) => -b.x, start: (back) => ({ x: back, z: 0 }) },
  { name: '+z', step: { minX: -5, maxX: 5, minZ: 1, maxZ: 10 }, vx: 0, vz: 0.4, along: (b) => b.z, start: (back) => ({ x: 0, z: 0 - back }) },
  { name: '-z', step: { minX: -5, maxX: 5, minZ: -10, maxZ: -1 }, vx: 0, vz: -0.4, along: (b) => -b.z, start: (back) => ({ x: 0, z: back }) },
];

bundled('outcome 4c: at 0.4 units per second the 0.29 step is climbed from 20 start positions in each of +x, -x, +z, and -z, 80 of 80', (t) => {
  /** @type {string[]} */
  const refused = [];
  for (const dir of STEP_DIRECTIONS) {
    let climbed = 0;
    for (let k = 0; k < STEP_STARTS; k = k + 1) {
      const at = dir.start(k * STRIDE / STEP_STARTS);
      const init = {
        bodies: [{ id: 'walker', x: at.x, y: 0.26, z: at.z, vx: dir.vx, vy: 0, vz: dir.vz, hx: 0.25, hy: 0.25, hz: 0.25 }],
        colliders: [
          { id: 'floor', minX: -10, maxX: 10, minY: -1, maxY: 0, minZ: -10, maxZ: 10 },
          { id: 'step', minX: dir.step.minX, maxX: dir.step.maxX, minY: 0, maxY: STEP_HEIGHT, minZ: dir.step.minZ, maxZ: dir.step.maxZ },
        ],
      };
      recordRun({ seed: 0, steps: STEP_QUANTA, driven: ['walker'], world: init });
      const world = createWorld(init, 'product');
      const driven = new Set(['walker']);
      for (let q = 0; q < STEP_QUANTA; q = q + 1) {
        world.step(driven);
      }
      const b = /** @type {{ x: number, y: number, z: number, hy: number }} */ (world.body('walker'));
      const feet = b.y - b.hy - SKIN;
      if (Math.abs(feet - STEP_HEIGHT) <= 1e-3 && dir.along(b) - 0.25 > 1) {
        climbed = climbed + 1;
      } else {
        refused.push(dir.name + ' from start ' + k + ': feet ' + feet + ', ' + dir.along(b) + ' along');
      }
    }
    t.diagnostic(dir.name + ': climbed from ' + climbed + ' of ' + STEP_STARTS + ' starts');
  }
  assert.deepEqual(refused, []);
});
