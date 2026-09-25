// Restore, rerun, compare. Each run is traced as harness/trace.mjs traces the
// product scene, the run is saved a third of the way in, the save is restored,
// the remainder runs, and harness/first-difference.js must print `identical`
// against the uninterrupted trace. A fixture case of harness/solver-scene.mjs
// restores into a fresh world of the same file. The product scene and the
// tick-driven fixtures keep their JavaScript world, which carries the minds,
// the memory, and the actions in flight that T5's bundle saves: the solver is
// evicted by loading another world, the records are scrambled, and the
// restore rebuilds both from the save.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHasher } from '../packages/frame/hash.js';
import { createMemory } from '../packages/tick/memory.js';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { createTick, settle } from '../packages/tick/tick.js';
import { createWorld } from '../packages/tick/world.js';
import { restoreRefusal, restoreSolver, saveSolver } from '../solver/dist/solver.mjs';
import { playMinds } from './minds-scene.mjs';
import { runProduct } from './product-run.mjs';
import { applyProductAct, createProductWorld } from './product-scene.mjs';
import { play } from './solver-scene.mjs';
import { endLine, thrownLine, traceLine } from './trace-line.mjs';
import { playVerbs } from './verbs-scene.mjs';

/**
 * @typedef {ReturnType<typeof createWorld>} World
 * @typedef {ReturnType<World['save']>} WorldSave
 * @typedef {{ name: string, seed: number, steps: number, driven: string[], world: { bodies: unknown[], colliders: unknown[], heightfield?: unknown } }} PlayCase
 */

const dir = mkdtempSync(join(tmpdir(), 'si-rpg-restore-'));
const catalog = loadIntentRules();

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function diff(a, b) {
  const left = join(dir, 'whole.trace');
  const right = join(dir, 'restored.trace');
  writeFileSync(left, a.join('\n') + '\n');
  writeFileSync(right, b.join('\n') + '\n');
  const run = spawnSync(process.execPath, ['harness/first-difference.js', left, right], { encoding: 'utf8' });
  assert.notEqual(run.status, 2, run.stderr);
  return run.stdout;
}

/** Loads and steps another world, so the solver no longer holds the one being restored. */
function evict() {
  const scratch = createWorld({
    bodies: [{ id: 'scratch', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.3, hy: 0.3, hz: 0.3 }],
    colliders: [{ id: 'floor', minX: -2, maxX: 2, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
  }, 'product');
  scratch.mixLoad(createHasher(), new Set());
  scratch.step(new Set());
}

/**
 * Save, evict the solver, scramble the records, restore.
 * @param {World} world
 */
function restoreInPlace(world) {
  const saved = world.save();
  evict();
  for (const body of world.bodies) {
    body.x = body.x + 1;
    body.vy = body.vy - 1;
  }
  world.restore(saved);
}

/**
 * @param {string} file
 * @returns {PlayCase[]}
 */
function playCases(file) {
  return JSON.parse(readFileSync('fixtures/' + file + '.json', 'utf8')).cases;
}

for (const file of ['behavior-solver', 'behavior-rotation', 'behavior-ramp', 'shape-traversal']) {
  test(file + ': every case restored a third of the way into a fresh world reruns identically', () => {
    for (const spec of playCases(file)) {
      const at = Math.floor(spec.steps / 3);
      assert.ok(at > 0, spec.name);
      const whole = play(spec, { trace: true }).trace;
      const restored = play(spec, { trace: true, restoreAt: at }).trace;
      assert.equal(diff(whole, restored), 'identical\n', spec.name + ' restored at ' + at);
    }
  });
}

/**
 * Traces a tick-driven run, restoring in place at one tick when asked.
 * @param {(onFrame: import('./verbs-scene.mjs').FrameVisit) => void} run
 * @param {number} at the tick to restore at, or -1
 */
function tickTrace(run, at) {
  /** @type {string[]} */
  const lines = [];
  /** @type {unknown[]} */
  const errors = [];
  run((tick, hash, world, memory) => {
    try {
      if (tick === at) {
        restoreInPlace(world);
      }
      lines.push(traceLine(tick, hash, world, memory));
    } catch (error) {
      errors.push(error);
    }
  });
  assert.deepEqual(errors, []);
  lines.push(endLine(lines.length));
  return lines;
}

test('behavior-verbs: every case restored a third of the way reruns identically', () => {
  const fixture = JSON.parse(readFileSync('fixtures/behavior-verbs.json', 'utf8'));
  for (const spec of fixture.cases) {
    const whole = tickTrace((onFrame) => {
      assert.equal(playVerbs(spec, catalog.rules, { onFrame }).ok, true, spec.name);
    }, -1);
    const at = Math.floor((whole.length - 2) / 3);
    const restored = tickTrace((onFrame) => {
      assert.equal(playVerbs(spec, catalog.rules, { onFrame }).ok, true, spec.name);
    }, at);
    assert.equal(diff(whole, restored), 'identical\n', spec.name + ' restored at ' + at);
  }
});

test('behavior-minds: restored a third of the way, the run reruns identically', () => {
  const saved = JSON.parse(readFileSync('fixtures/behavior-minds.json', 'utf8'));
  const whole = tickTrace((onFrame) => {
    assert.equal(playMinds(saved, catalog.rules, { onFrame }).ok, true);
  }, -1);
  const at = Math.floor((whole.length - 2) / 3);
  assert.ok(at > 0);
  const restored = tickTrace((onFrame) => {
    assert.equal(playMinds(saved, catalog.rules, { onFrame }).ok, true);
  }, at);
  assert.equal(diff(whole, restored), 'identical\n', 'restored at ' + at);
});

test('behavior-3d, the reference law: the records restore and the run reruns identically', () => {
  const saved = JSON.parse(readFileSync('fixtures/behavior-3d.json', 'utf8'));
  /** @param {import('./verbs-scene.mjs').FrameVisit} onFrame */
  function replay3d(onFrame) {
    const world = createWorld(saved.world, 'reference');
    const memory = createMemory();
    const tick = createTick({ seed: saved.seed, world, rules: catalog.rules, retired: catalog.retired, memory });
    tick.attach({ draw: (frame) => onFrame(frame.tick, frame.hash, world, memory) });
    for (const entry of saved.log) {
      while (tick.frame().tick < entry.tick) {
        tick.advance();
      }
      assert.equal(tick.submit(entry.proposal).admitted, true);
    }
    settle(tick);
    assert.equal(world.save().snapshot, null, 'the reference law has no snapshot');
  }
  const whole = tickTrace(replay3d, -1);
  const at = Math.floor((whole.length - 2) / 3);
  assert.ok(at > 0);
  assert.equal(diff(whole, tickTrace(replay3d, at)), 'identical\n');
});

test('behavior-1c is a 2D capture the loader refuses, so it has no run to restore', () => {
  const capture = JSON.parse(readFileSync('fixtures/behavior-1c.json', 'utf8'));
  assert.equal(typeof capture.world.bodies[0].z, 'undefined');
});

test('the product scene restored a third of the way reruns identically', () => {
  /** @param {number} at */
  function traced(at) {
    /** @type {string[]} */
    const lines = [];
    runProduct((tick, hash, world, memory) => {
      if (tick === at) {
        restoreInPlace(world);
      }
      lines.push(traceLine(tick, hash === null ? 'NAN' : hash, world, memory));
    }, (tick) => {
      lines.push(thrownLine(tick));
    });
    lines.push(endLine(lines.length));
    return lines;
  }
  const whole = traced(-1);
  assert.equal(whole.length, 10002);
  assert.equal(diff(whole, traced(3333)), 'identical\n');
});

/**
 * @param {string} file
 * @param {string} name
 */
function playCase(file, name) {
  const spec = playCases(file).find((item) => item.name === name);
  if (!spec) {
    throw new Error(name);
  }
  return spec;
}

/**
 * @param {PlayCase} spec
 * @param {number} steps
 */
function runFor(spec, steps) {
  const world = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ (spec.world), 'product');
  world.mixLoad(createHasher(), new Set(spec.driven));
  for (let i = 0; i < steps; i = i + 1) {
    world.step(new Set(spec.driven));
  }
  return world;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} word
 */
function wordAt(bytes, word) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(word * 8, true);
}

/**
 * @param {Uint8Array} bytes
 * @param {number} word
 * @param {number} value
 */
function setWord(bytes, word, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setFloat64(word * 8, value, true);
}

test('the round trip: a save restored into a fresh world of the same file is byte-exact', () => {
  for (const [file, name, steps] of /** @type {Array<[string, string, number]>} */ ([
    ['behavior-rotation', 'stack', 60],
    ['behavior-rotation', 'tumble', 45],
    ['behavior-ramp', 'slide', 100],
    ['behavior-solver', 'walkable-slope', 20],
  ])) {
    const spec = playCase(file, name);
    const world = runFor(spec, steps);
    const saved = world.save();
    const fresh = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ (spec.world), 'product');
    fresh.restore(saved);
    assert.deepEqual(fresh.snapshot(), saved.snapshot, name + ' snapshot');
    assert.deepEqual(fresh.save(), saved, name + ' save');
  }
  const stack = runFor(playCase('behavior-rotation', 'stack'), 60).save();
  const view = stack.snapshot;
  assert.ok(view && wordAt(view, 14) === 1 && wordAt(view, 29) === 1, 'the stack is asleep in the save');
  assert.ok(view && wordAt(view, 30) > 0, 'the save has contact pairs');

  const product = createProductWorld();
  product.mixLoad(createHasher(), new Set(['walker']));
  for (let i = 0; i < 500; i = i + 1) {
    product.step(applyProductAct(product, i));
  }
  const saved = product.save();
  assert.deepEqual(saved.carried, [['walker', 'parcel']]);
  const fresh = createProductWorld();
  fresh.restore(saved);
  assert.deepEqual(fresh.snapshot(), saved.snapshot);
  assert.deepEqual(fresh.save(), saved);
  assert.equal(fresh.carryingOf('walker'), 'parcel');
});

/**
 * Refused restores leave the solver and the records as they were.
 * @param {World} world
 * @param {WorldSave} saved
 * @param {RegExp} reason
 */
function refused(world, saved, reason) {
  const solver = saveSolver();
  const records = JSON.stringify(world.bodies);
  assert.throws(() => world.restore(saved), reason);
  assert.deepEqual(saveSolver(), solver, 'the solver is unchanged');
  assert.equal(JSON.stringify(world.bodies), records, 'the records are unchanged');
}

/**
 * @param {WorldSave} saved
 * @returns {WorldSave}
 */
function copy(saved) {
  return { ...saved, bodies: saved.bodies.map((body) => ({ ...body })), snapshot: saved.snapshot ? saved.snapshot.slice() : null };
}

test('a snapshot with one byte changed is refused', () => {
  const spec = playCase('behavior-rotation', 'stack');
  const saved = runFor(spec, 20).save();
  const fresh = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ (spec.world), 'product');
  fresh.mixLoad(createHasher(), new Set());
  if (!saved.snapshot) {
    throw new Error('no snapshot');
  }
  // The low byte of the lower box's x: the snapshot and the record disagree.
  const pose = copy(saved);
  if (pose.snapshot) {
    pose.snapshot[0] = pose.snapshot[0] ^ 1;
  }
  refused(fresh, pose, /restore refused: a body's pose or velocity is not its record's/);
  // The high byte of the lower box's qw.
  const turn = copy(saved);
  if (turn.snapshot) {
    turn.snapshot[9 * 8 + 6] = turn.snapshot[9 * 8 + 6] ^ 0x40;
  }
  refused(fresh, turn, /restore refused: a quaternion is not unit within 1e-9/);
  // The sleep flag.
  const flag = copy(saved);
  if (flag.snapshot) {
    flag.snapshot[14 * 8 + 7] = flag.snapshot[14 * 8 + 7] ^ 0x3f;
  }
  refused(fresh, flag, /restore refused: a sleep field is not a count and a flag/);
  // A byte of a count: the first pair's collider index is no longer a whole number.
  const count = copy(saved);
  if (count.snapshot) {
    count.snapshot[31 * 8] = count.snapshot[31 * 8] ^ 1;
  }
  refused(fresh, count, /restore refused: the length is not the layout for this world/);
  // Not one byte: the first pair names another collider.
  const handle = copy(saved);
  if (handle.snapshot) {
    setWord(handle.snapshot, 31, wordAt(handle.snapshot, 31) + 1);
  }
  refused(fresh, handle, /restore refused: the pairs or points after the collision pass are not the snapshot's/);
  // The original restores.
  fresh.restore(saved);
  assert.deepEqual(fresh.snapshot(), saved.snapshot);
});

test('a snapshot from a world of a different signature is refused', () => {
  const spec = playCase('behavior-rotation', 'stack');
  const saved = runFor(spec, 20).save();
  // The same bodies over a floor moved out from under them: the records load,
  // and the collision pass finds none of the snapshot's pairs.
  const file = /** @type {{ bodies: unknown[], colliders: Array<Record<string, number | string>> }} */ (JSON.parse(JSON.stringify(spec.world)));
  file.colliders = file.colliders.map((c) => ({ ...c, minX: Number(c.minX) + 40, maxX: Number(c.maxX) + 40 }));
  const moved = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ (/** @type {unknown} */ (file)), 'product');
  moved.mixLoad(createHasher(), new Set());
  refused(moved, saved, /restore refused: the pairs or points after the collision pass are not the snapshot's/);
  // A one-body world's snapshot given to the two-body stack, through the binding.
  runFor(playCase('behavior-rotation', 'tip'), 20);
  const theirs = saveSolver();
  const mine = runFor(spec, 20);
  const before = saveSolver();
  assert.equal(restoreSolver(9999, mine.bodies, mine.colliders, null, new Set(), 0, theirs), false);
  assert.equal(restoreRefusal(), "a body's pose or velocity is not its record's");
  assert.deepEqual(saveSolver(), before);
  // The stack's own snapshot through the same call takes.
  assert.equal(restoreSolver(9999, mine.bodies, mine.colliders, null, new Set(), 0, before), true);
  assert.equal(restoreRefusal(), 'none');
  assert.deepEqual(saveSolver(), before);
});

test('a snapshot of the wrong length is refused', () => {
  const spec = playCase('behavior-rotation', 'stack');
  const saved = runFor(spec, 20).save();
  const fresh = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ (spec.world), 'product');
  fresh.mixLoad(createHasher(), new Set());
  const snap = saved.snapshot;
  if (!snap) {
    throw new Error('no snapshot');
  }
  const short = copy(saved);
  short.snapshot = snap.slice(0, snap.length - 8);
  refused(fresh, short, /restore refused: the length is not the layout for this world/);
  const long = copy(saved);
  long.snapshot = new Uint8Array(snap.length + 8);
  long.snapshot.set(snap);
  refused(fresh, long, /restore refused: the length is not the layout for this world/);
  const ragged = copy(saved);
  ragged.snapshot = snap.slice(0, snap.length - 3);
  refused(fresh, ragged, /restore refused: the length is not the layout for this world/);
});

test('a restore whose input passes but whose rerun was planted to differ is caught by the diff', () => {
  const spec = playCase('behavior-rotation', 'tumble');
  const at = Math.floor(spec.steps / 3);
  const whole = play(spec, { trace: true }).trace;
  assert.equal(diff(whole, play(spec, { trace: true, restoreAt: at }).trace), 'identical\n');

  // One velocity, in the record and the snapshot alike: the restore takes it.
  const crate = spec.world.bodies.findIndex((body) => /** @type {{ id: string }} */ (body).id === 'crate');
  const velocity = play(spec, {
    trace: true,
    restoreAt: at,
    change(saved) {
      const snap = saved.snapshot;
      if (!snap) {
        throw new Error('no snapshot');
      }
      // Snapshot slots follow the record order; nothing is carried here.
      const word = crate * 15 + 3;
      const vx = saved.bodies[crate].vx + 0.001;
      assert.equal(wordAt(snap, word), saved.bodies[crate].vx);
      saved.bodies[crate].vx = vx;
      setWord(snap, word, vx);
    },
  }).trace;
  const found = diff(whole, velocity).split('\n');
  assert.equal(found[0], 'first difference at tick ' + at);
  assert.equal(found[1], 'body crate field vx');

  // One warm-start impulse, which no record holds: the restore takes it too,
  // and the snapshot digest names it. The stack, awake and in contact.
  const stack = playCase('behavior-rotation', 'stack');
  const stackAt = Math.floor(stack.steps / 3);
  const stackWhole = play(stack, { trace: true }).trace;
  const impulse = play(stack, {
    trace: true,
    restoreAt: stackAt,
    change(saved) {
      const snap = saved.snapshot;
      if (!snap) {
        throw new Error('no snapshot');
      }
      // The first contact point of the first pair that has one.
      let word = stack.world.bodies.length * 15;
      const count = wordAt(snap, word);
      word = word + 1;
      for (let p = 0; p < count && wordAt(snap, word + 4) === 0; p = p + 1) {
        word = word + 5;
      }
      assert.ok(word * 8 < snap.length && wordAt(snap, word + 4) > 0, 'a pair with a point');
      setWord(snap, word + 5, wordAt(snap, word + 5) + 0.5);
    },
  }).trace;
  const named = diff(stackWhole, impulse).split('\n');
  assert.equal(named[0], 'first difference at tick ' + stackAt);
  assert.equal(named[1], 'snapshot');
  // With that line taken from the whole run, a later quantum names a body.
  const later = impulse.slice();
  later[stackAt] = stackWhole[stackAt];
  const moved = diff(stackWhole, later).split('\n');
  assert.equal(moved[0], 'first difference at tick ' + (stackAt + 1));
  assert.match(moved[1], /^body (lower|upper) field /);
});
