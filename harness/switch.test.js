// F1, the switch in place (docs/dispatch-f1-switch-in-place.md). When an
// action starts or ends, or a body is picked up or put down, the solver
// switches that body on the running Rapier world instead of rebuilding the
// world from the records. These tests hold what that changes, through the
// binary every engine runs:
//
//   pin 5, each red on main: the product scene's untouched sleepers stay
//   asleep through every switch; every resting pair not involving the switched
//   body keeps its warm-start words through the switch quantum; and neither
//   the product scene nor any fixture builds a world after its load, read
//   from solver_rebuilds();
//   pin 3, the cost of no load pass, pinned: a picked-up body leaves the
//   character's queries in its own quantum, and a dropped body is not in them
//   until the step of its quantum has run;
//   pin 6: a body switched back to dynamic keeps its record velocity, a drop
//   carries a handle generation into the snapshot, a capsule world's walker is
//   a box again when it stops, and the minds fixture's quaternions keep their
//   bits across its verb boundaries (the planted wrong orders are the native
//   tests at the end of solver/src/rapier_law.rs; the restores that straddle
//   every switch are in harness/restore.test.js);
//   pin 8: what a switch costs against a rebuild, printed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { loadSolver, solverRebuilds, stepSolver } from '../solver/dist/solver.mjs';
import { pairs, switchTicks } from './events.mjs';
import { productInit } from './product-scene.mjs';
import { replayTo } from './replay-to.mjs';
import { playVerbs } from './verbs-scene.mjs';

/**
 * @typedef {import('./replay-to.mjs').ReplaySpec} ReplaySpec
 * @typedef {import('./replay-to.mjs').Run} Run
 * @typedef {import('./events.mjs').Pair} Pair
 */

const PRODUCT = /** @type {ReplaySpec} */ ({ scene: 'product' });
const rules = loadIntentRules().rules;

/** @param {Uint8Array} a @param {Uint8Array} b */
function sameBytes(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * A verbs fixture case as the log its script admits.
 * @param {string} name
 * @returns {ReplaySpec}
 */
function verbsCase(name) {
  const spec = JSON.parse(readFileSync('fixtures/behavior-verbs.json', 'utf8')).cases.find((/** @type {{ name: string }} */ c) => c.name === name);
  if (!spec) {
    throw new Error('no verbs case ' + name);
  }
  const played = playVerbs(spec, rules);
  if (!played.ok || !played.log) {
    throw new Error(name + ' did not play: ' + played.reason);
  }
  return { seed: spec.seed, world: spec.world, log: played.log };
}

/** @returns {ReplaySpec} */
function mindsCase() {
  const minds = JSON.parse(readFileSync('fixtures/behavior-minds.json', 'utf8'));
  return { seed: minds.seed, world: minds.world, log: minds.log };
}

// ---------------------------------------------------------------------------
// Pin 5: red on main, green in place.

const WINDOWS = [[199, 202], [259, 262], [399, 402]];
const STILL = ['lower', 'upper', 'tip', 'slider', 'parcel'];

test('F1 pin 5: lower, upper, tip, slider, and parcel stay asleep through ticks 199 to 202 and 259 to 262, and all but the carried parcel through 399 to 402', (t) => {
  const run = replayTo(PRODUCT, 0);
  /** @type {string[]} */
  const awake = [];
  let looked = 0;
  while (run.tick < 402 && run.advance()) {
    const tick = run.tick;
    if (!WINDOWS.some(([from, to]) => tick >= from && tick <= to)) {
      continue;
    }
    for (const id of STILL) {
      if (run.world.carriedByOf(id)) {
        continue;
      }
      looked = looked + 1;
      if (!run.world.sleeping(id)) {
        awake.push(id + ' awake at ' + tick);
      }
    }
  }
  t.diagnostic(looked + ' looks at a sleeper; awake: ' + (awake.join(', ') || 'none'));
  assert.equal(run.world.carriedByOf('parcel'), 'walker', 'the parcel is carried from 401');
  assert.equal(looked, 5 * 8 + 5 * 2 + 4 * 2, 'every sleeper was looked at in every window');
  assert.deepEqual(awake, []);
});

/** The product scene's switches, by frame tick, and the body that switches. */
const PRODUCT_SWITCHES = new Map([[201, 'climber'], [261, 'climber'], [401, 'parcel']]);

test('F1 pin 5: every resting pair not involving the switched body keeps its warm-start words bit for bit through the switch quanta 201, 261, and 401', (t) => {
  const init = productInit();
  const ids = init.bodies.map((body) => body.id);
  // build_world inserts the static colliders, then the heightfield, then the
  // bodies in record order, so a body's collider index is its record index
  // after those. The product scene removes and inserts nothing before 401.
  const statics = init.colliders.length + (init.heightfield ? 1 : 0);
  /** @param {string} id */
  const colliderOf = (id) => statics + ids.indexOf(id);
  const run = replayTo(PRODUCT, 0);
  /** @type {{ pairs: Pair[], asleep: Set<string> } | null} */
  let before = null;
  /** @type {string[]} */
  const failures = [];
  let checked = 0;
  while (run.tick < 401 && run.advance()) {
    if (PRODUCT_SWITCHES.has(run.tick + 1)) {
      before = { pairs: pairs(run.world), asleep: new Set(ids.filter((id) => !run.world.carriedByOf(id) && run.world.sleeping(id))) };
      continue;
    }
    const switched = PRODUCT_SWITCHES.get(run.tick);
    if (switched === undefined || !before) {
      continue;
    }
    const moving = colliderOf(switched);
    const asleep = before.asleep;
    /** @param {number} index */
    const resting = (index) => index < statics || asleep.has(ids[index - statics]);
    const after = new Map(pairs(run.world).map((pair) => [pair.key, pair]));
    /** @type {string[]} */
    const held = [];
    for (const pair of before.pairs) {
      if (pair.points === 0 || pair.first[0] === moving || pair.second[0] === moving || !resting(pair.first[0]) || !resting(pair.second[0])) {
        continue;
      }
      checked = checked + 1;
      const now = after.get(pair.key);
      if (!now) {
        failures.push(pair.key + ' is gone at ' + run.tick);
      } else if (!sameBytes(now.bytes, pair.bytes)) {
        failures.push(pair.key + ' at ' + run.tick + ': ' + pair.points + ' points summing ' + pair.impulse.toExponential(6) + ' became ' + now.points + ' summing ' + now.impulse.toExponential(6));
      } else {
        held.push(pair.key);
      }
    }
    const stack = colliderOf('lower') + '.0-' + colliderOf('upper') + '.0';
    const was = before.pairs.find((pair) => pair.key === stack);
    const is = after.get(stack);
    t.diagnostic(run.tick + ' (' + switched + ' switched): held ' + held.join(' ') + '; lower and upper ' + (was ? was.impulse.toExponential(6) : '-') + ' -> ' + (is ? is.impulse.toExponential(6) : '-'));
    before = null;
  }
  assert.ok(checked >= 12, 'only ' + checked + ' resting pairs were checked');
  assert.deepEqual(failures, []);
});

/**
 * Every run the fixtures hold that replays on the product law, and the
 * product scene. behavior-3d is the reference law, which loads no solver.
 * @returns {Array<{ name: string, spec: ReplaySpec, builds: number }>}
 */
function everyRun() {
  /** @type {Array<{ name: string, spec: ReplaySpec, builds: number }>} */
  const runs = [];
  for (const file of ['behavior-solver', 'behavior-rotation', 'behavior-ramp', 'shape-traversal']) {
    for (const spec of JSON.parse(readFileSync('fixtures/' + file + '.json', 'utf8')).cases) {
      runs.push({ name: file + ' ' + spec.name, spec: { seed: spec.seed, steps: spec.steps, driven: spec.driven, world: spec.world }, builds: 1 });
    }
  }
  for (const spec of JSON.parse(readFileSync('fixtures/behavior-verbs.json', 'utf8')).cases) {
    runs.push({ name: 'behavior-verbs ' + spec.name, spec: verbsCase(spec.name), builds: 1 });
  }
  runs.push({ name: 'behavior-minds', spec: mindsCase(), builds: 1 });
  const threeD = JSON.parse(readFileSync('fixtures/behavior-3d.json', 'utf8'));
  runs.push({ name: 'behavior-3d (reference law)', spec: { seed: threeD.seed, world: threeD.world, log: threeD.log, law: 'reference', retired: true }, builds: 0 });
  runs.push({ name: 'the product scene', spec: PRODUCT, builds: 1 });
  return runs;
}

test('F1 pin 5: solver_rebuilds() reads one after the load and stays there, through the product scene and every fixture', (t) => {
  /** @type {string[]} */
  const failures = [];
  for (const item of everyRun()) {
    const from = solverRebuilds();
    const run = replayTo(item.spec, 0);
    const atLoad = solverRebuilds() - from;
    while (run.advance()) {
      // to the end
    }
    const total = solverRebuilds() - from;
    t.diagnostic(item.name + ': ' + run.tick + ' quanta, ' + atLoad + ' build at load, ' + (total - atLoad) + ' after');
    if (atLoad !== item.builds || total !== item.builds) {
      failures.push(item.name + ': ' + atLoad + ' at load, ' + (total - atLoad) + ' after');
    }
  }
  assert.deepEqual(failures, []);
});

// ---------------------------------------------------------------------------
// Pin 3: the character's queries in the quantum of a switch.

let nextWorld = 0x60000000;
const STRIDE = 1 / 64;
const FLOOR = { id: 'floor', minX: -4, maxX: 8, minY: -1, maxY: 0, minZ: -2, maxZ: 2 };

/**
 * A body record with its own solver mode, for the binding's calls.
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @param {number} vx
 * @param {number} mode
 */
function box(id, x, y, vx, mode) {
  return { id, x, y, z: 0, vx, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, wx: 0, wy: 0, wz: 0, hx: 0.25, hy: 0.25, hz: 0.25, solverMode: mode };
}

/**
 * Loads the bodies and colliders as a new world and steps it `quanta` times.
 * Before quantum q, `before(q, bodies)` may change the records. Returns the
 * walker's (body 0's) travel along x in each quantum, index q - 1.
 * @param {ReturnType<typeof box>[]} bodies
 * @param {Array<typeof FLOOR>} colliders
 * @param {number} quanta
 * @param {(q: number, bodies: ReturnType<typeof box>[]) => void} before
 */
function drive(bodies, colliders, quanta, before) {
  nextWorld = nextWorld + 1;
  const id = nextWorld;
  assert.equal(loadSolver(id, bodies, colliders, null, new Set(), 0), true);
  /** @type {number[]} */
  const travel = [];
  for (let q = 1; q <= quanta; q = q + 1) {
    before(q, bodies);
    const x = bodies[0].x;
    assert.equal(stepSolver(id, bodies, colliders, null, new Set(), 0), true, 'quantum ' + q);
    travel.push(bodies[0].x - x);
  }
  return travel;
}

const PICK = 40;

/**
 * The walker, driven at one unit per second, pushes a crate against a wall
 * until it stands still; at quantum `pick` the crate is picked up (0: never).
 * @param {number} pick
 */
function pushRun(pick) {
  const wall = { id: 'wall', minX: 1, maxX: 1.5, minY: 0, maxY: 1, minZ: -2, maxZ: 2 };
  return drive([box('walker', 0, 0.26, 1, 1), box('crate', 0.74, 0.25, 0, 0)], [FLOOR, wall], PICK + 1, (q, bodies) => {
    if (q === pick) {
      bodies[1].solverMode = 3;
    }
  });
}

test('F1 pin 3: a picked-up body leaves the character\'s queries in the quantum it is picked up', (t) => {
  const held = pushRun(0);
  const picked = pushRun(PICK);
  t.diagnostic('travel in quantum ' + PICK + ': ' + held[PICK - 1].toExponential(3) + ' with the crate held against the wall, ' + picked[PICK - 1].toExponential(3) + ' with it picked up in that quantum; a stride is ' + STRIDE);
  assert.deepEqual(picked.slice(0, PICK - 1), held.slice(0, PICK - 1), 'the runs agree until the pick-up');
  assert.ok(held[PICK - 1] < 0.1 * STRIDE, 'the crate against the wall stops the walker: ' + held[PICK - 1]);
  assert.ok(picked[PICK - 1] > 0.9 * STRIDE, 'the walker was still stopped by a crate picked up in that quantum: ' + picked[PICK - 1]);
  assert.ok(picked[PICK] > 0.9 * STRIDE, 'and after it: ' + picked[PICK]);
});

const DROP = 24;

/**
 * The walker, driven at one unit per second on an open floor. A crate,
 * carried from the load, is put down at quantum `drop`, its back face 0.005
 * ahead of the walker's front face as the walker stood at the start of
 * quantum DROP, which is inside that quantum's stride.
 * @param {number} drop
 * @param {number} at the walker's x at the start of quantum DROP
 */
function dropRun(drop, at) {
  return drive([box('walker', 0, 0.26, 1, 1), box('crate', 6, 0.25, 0, 3)], [FLOOR], DROP + 1, (q, bodies) => {
    if (q === drop) {
      bodies[1].x = at + 0.25 + 0.005 + 0.25;
      bodies[1].solverMode = 0;
    }
  });
}

test('F1 pin 3: a dropped body is not in the character\'s queries until the step of its quantum has run', (t) => {
  // The walker alone, for where it stands at the start of quantum DROP.
  const alone = drive([box('walker', 0, 0.26, 1, 1)], [FLOOR], DROP + 1, () => {});
  const at = alone.slice(0, DROP - 1).reduce((sum, d) => sum + d, 0);
  assert.ok(alone[DROP - 1] > 0.9 * STRIDE, 'the walker alone keeps its stride in quantum ' + DROP);
  const dropped = dropRun(DROP, at);
  const earlier = dropRun(DROP - 1, at);
  t.diagnostic('travel in quantum ' + DROP + ': ' + dropped[DROP - 1].toExponential(3) + ' with the crate put down in that quantum, ' + earlier[DROP - 1].toExponential(3) + ' with it put down one quantum earlier; in quantum ' + (DROP + 1) + ': ' + dropped[DROP].toExponential(3) + '; a stride is ' + STRIDE);
  assert.ok(dropped[DROP - 1] > 0.9 * STRIDE, 'a crate put down in the walker\'s stride stopped it in its own quantum: ' + dropped[DROP - 1]);
  assert.ok(dropped[DROP] < 0.2 * STRIDE, 'the next quantum it stops the walker: ' + dropped[DROP]);
  assert.ok(earlier[DROP - 1] < 0.2 * STRIDE, 'a crate put down one quantum earlier stops the walker in quantum ' + DROP + ': ' + earlier[DROP - 1]);
});

// ---------------------------------------------------------------------------
// Pin 6: the contract.

test('F1 pin 6: the climber, switched back to dynamic at 261, keeps the 0.8 upward in its record and rises', () => {
  const run = replayTo(PRODUCT, 260);
  const was = /** @type {{ y: number, vy: number }} */ (run.world.body('climber'));
  const before = { y: was.y, vy: was.vy };
  assert.equal(before.vy, 0.8, 'the lifted climber\'s record carries its rise');
  assert.ok(run.advance());
  const climber = /** @type {{ y: number, vy: number, solverMode?: number }} */ (run.world.body('climber'));
  assert.equal(climber.solverMode, 0, 'the climber is dynamic at 261');
  assert.ok(Math.abs(climber.vy - (0.8 - 8 / 64)) < 1e-12, 'its first dynamic quantum began at 0.8 and took one quantum of gravity: ' + climber.vy);
  assert.ok(climber.y > before.y, 'it rose: ' + before.y + ' to ' + climber.y);
});

test('F1 pin 6: after the carry case\'s drop, the dropped crate\'s pair key in the snapshot carries generation 1', (t) => {
  const spec = verbsCase('carry');
  const switches = switchTicks(spec);
  const drop = switches.find((s) => s.bodies.includes('crate C>d'));
  const pick = switches.find((s) => s.bodies.includes('crate d>C'));
  assert.ok(drop && pick, JSON.stringify(switches));
  const run = replayTo(spec, 0);
  /** @type {string[]} */
  const early = [];
  /** @type {string | null} */
  let found = null;
  let foundAt = 0;
  while (run.advance()) {
    for (const pair of pairs(run.world)) {
      const generations = [pair.first[1], pair.second[1]];
      if (run.tick < pick.tick && generations.some((g) => g !== 0)) {
        early.push(pair.key + ' at ' + run.tick);
      }
      if (found === null && generations.includes(1)) {
        found = pair.key;
        foundAt = run.tick;
      }
    }
  }
  t.diagnostic('picked up at ' + pick.tick + ', put down at ' + drop.tick + '; first pair with generation 1: ' + found + ' at ' + foundAt);
  assert.deepEqual(early, [], 'a generation other than 0 before the pick-up');
  assert.ok(found !== null && foundAt >= drop.tick, 'no pair key carried generation 1 after the drop');
});

test('F1 pin 6: in the carry case in a capsule world the walker switches at every verb boundary, and stands on the floor as its box once it is dynamic again', (t) => {
  const spec = verbsCase('carry-capsule');
  const world = /** @type {{ shape?: string, colliders: unknown[] }} */ (spec.world);
  assert.equal(world.shape, 'capsule');
  const switches = switchTicks(spec);
  t.diagnostic('switches: ' + switches.map((s) => s.tick + ' ' + s.bodies.join(',')).join('; '));
  assert.deepEqual(switches.map((s) => s.bodies.join(',')), ['walker d>D', 'crate d>C', 'crate C>d', 'walker D>d']);
  const run = replayTo(spec, 0);
  while (run.advance()) {
    // to the end
  }
  // The walker is collider 2, after the two floors; the far floor is 1.
  const floor = pairs(run.world).find((pair) => pair.key === '1.0-2.0');
  t.diagnostic('the walker on the far floor at the end: ' + (floor ? floor.points + ' points' : 'no pair'));
  assert.ok(floor, 'the walker rests on the far floor');
  assert.equal(floor.points, 4, 'a box on a floor has four contact points; the capsule, a ball of radius 0.25 here, has one');
});

/**
 * Pose and quaternion bits of every body the tick holds, by id.
 * @param {Run} run
 */
function poses(run) {
  /** @type {Map<string, number[]>} */
  const out = new Map();
  for (const body of run.world.bodies) {
    out.set(body.id, [body.x, body.y, body.z, body.qx, body.qy, body.qz, body.qw]);
  }
  return out;
}

test('F1 pin 6: the minds fixture\'s quaternions keep their bits across its verb boundaries: no rebuild re-canonicalizes a sleeping body', (t) => {
  const spec = mindsCase();
  const switches = switchTicks(spec);
  assert.ok(switches.length >= 3, JSON.stringify(switches));
  const run = replayTo(spec, 0);
  /** @type {string[]} */
  const moved = [];
  let kept = 0;
  for (const s of switches) {
    while (run.tick < s.tick - 1 && run.advance()) {
      // to the quantum before the switch
    }
    const asleep = run.world.bodies.filter((body) => !run.world.carriedByOf(body.id) && run.world.sleeping(body.id)).map((body) => body.id);
    const before = poses(run);
    assert.ok(run.advance());
    const after = poses(run);
    const switched = s.bodies.map((b) => b.split(' ')[0]);
    for (const id of asleep) {
      if (switched.includes(id)) {
        continue;
      }
      const a = /** @type {number[]} */ (before.get(id));
      const b = /** @type {number[]} */ (after.get(id));
      if (a.some((v, i) => !Object.is(v, b[i]))) {
        moved.push(id + ' at ' + s.tick + ': ' + a.join(' ') + ' -> ' + b.join(' '));
      } else {
        kept = kept + 1;
      }
    }
    t.diagnostic('verb boundary at ' + s.tick + ' (' + s.bodies.join(', ') + '): asleep before it ' + asleep.join(', '));
  }
  assert.ok(kept >= 5, 'only ' + kept + ' sleeping bodies were compared');
  assert.deepEqual(moved, []);
});

// ---------------------------------------------------------------------------
// Pin 8: costs on record.

/** @param {number[]} values */
function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * What the solver's load does at one switch of a run, timed on the run's own
 * state: the records at the frame before the switch, whose world the solver
 * holds, with the modes of the frame before and of the frame after. Each
 * call is `solver_load`, which is `ensure` and the snapshot and nothing else.
 * A switch is the call with the modes changed and the world id kept; it is
 * timed both ways, there and back. A rebuild is the call with the world id
 * changed, which builds the world from the records as main did at every verb
 * boundary. A keep is the call with nothing changed: the signature check
 * every quantum makes.
 * @param {ReplaySpec} spec
 * @param {number} tick the frame the switch produces
 * @param {number} rounds
 */
function ensureTimes(spec, tick, rounds) {
  const after = replayTo(spec, tick).world.bodies.map((body) => /** @type {{ solverMode?: number }} */ (body).solverMode);
  const run = replayTo(spec, tick - 1);
  const bodies = /** @type {Array<import('../packages/frame/types.js').Body & { solverMode?: number }>} */ (run.world.bodies);
  const before = bodies.map((body) => body.solverMode);
  const worldId = run.world.save().worldId;
  const world = /** @type {{ shape?: string }} */ ('world' in spec && spec.world ? spec.world : {});
  const shape = world.shape === 'capsule' ? 1 : 0;
  /** @param {Array<number | undefined>} modes */
  const set = (modes) => {
    bodies.forEach((body, i) => {
      body.solverMode = modes[i];
    });
  };
  /** @param {number} id */
  const load = (id) => {
    const started = performance.now();
    assert.equal(loadSolver(id, bodies, run.world.colliders, run.world.heightfield, new Set(), shape), true);
    return (performance.now() - started) * 1000;
  };
  /** @type {{ there: number[], back: number[], rebuild: number[], keep: number[], builds: { switch: number, rebuild: number } }} */
  const out = { there: [], back: [], rebuild: [], keep: [], builds: { switch: 0, rebuild: 0 } };
  let from = solverRebuilds();
  for (let r = 0; r < rounds; r = r + 1) {
    set(before);
    out.keep.push(load(worldId));
    set(after);
    out.there.push(load(worldId));
    set(before);
    out.back.push(load(worldId));
  }
  out.builds.switch = solverRebuilds() - from;
  // The rebuilds last: each leaves the solver holding a world built under
  // another id, which the next alternates away from.
  from = solverRebuilds();
  set(after);
  for (let r = 0; r < rounds; r = r + 1) {
    out.rebuild.push(load(worldId + 0x1000000 + (r % 2)));
  }
  out.builds.rebuild = solverRebuilds() - from;
  return out;
}

test('F1 pin 8: the costs on record: a switch in place against a rebuild of the same world, on the product scene and the carry case', (t) => {
  const rounds = 41;
  /** @type {Array<[string, ReplaySpec]>} */
  const cases = [['the product scene', PRODUCT], ['the carry case', verbsCase('carry')]];
  for (const [name, spec] of cases) {
    for (const s of switchTicks(spec)) {
      const times = ensureTimes(spec, s.tick, rounds);
      const us = (/** @type {number[]} */ values) => median(values).toFixed(1);
      t.diagnostic(name + ' ' + s.tick + ' (' + s.bodies.join(', ') + '): median of ' + rounds + ' loads: switch ' + us(times.there) + ' us, and back ' + us(times.back) + ' us; rebuild ' + us(times.rebuild) + ' us; keep ' + us(times.keep) + ' us');
      assert.equal(times.builds.switch, 0, 'a switch built a world');
      assert.equal(times.builds.rebuild, rounds, 'a load under another world id did not build');
    }
  }
});
