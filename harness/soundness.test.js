// S1, the soundness of the law, held through the pinned binary. Each test
// writes the input that went through before S1 and requires the refusal or
// the decision the pin names. The native tests at the end of
// solver/src/rapier_law.rs hold the same pins from inside the law, with the
// canon_quat cases and the reload decision itself; these hold them at the
// exports every engine calls.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHasher } from '../packages/frame/hash.js';
import { loadHash } from '../packages/tick/admit-world.js';
import { validateScene } from '../packages/tick/scene.js';
import { createWorld } from '../packages/tick/world.js';
import { loadSolver, snapshotBytes, stepBodies, stepSolver } from '../solver/dist/solver.mjs';
import { productDriven } from './product-scene.mjs';
import { replayTo } from './replay-to.mjs';

// World ids of their own, far above the ones createWorld hands out.
let nextId = 0x40000000;
function freshId() {
  nextId = nextId + 1;
  return nextId;
}

/**
 * @param {string} id
 * @param {number} x
 * @param {number} y
 * @param {number} [mode]
 * @param {number} [half]
 */
function box(id, x, y, mode, half) {
  const h = half === undefined ? 0.25 : half;
  /** @type {{ id: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, qx: number, qy: number, qz: number, qw: number, wx: number, wy: number, wz: number, hx: number, hy: number, hz: number, solverMode?: number }} */
  const body = { id, x, y, z: 0, vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, wx: 0, wy: 0, wz: 0, hx: h, hy: h, hz: h };
  if (typeof mode === 'number') {
    body.solverMode = mode;
  }
  return body;
}

function floor() {
  return { id: 'floor', minX: -4, maxX: 4, minY: -1, maxY: 0, minZ: -4, maxZ: 4, qx: 0, qy: 0, qz: 0, qw: 1 };
}

/** Two boxes resting on the floor, one on the other. */
function stack() {
  return [box('lower', 0, 0.26, 0), box('upper', 0, 0.77, 0)];
}

/** @param {Uint8Array} a @param {Uint8Array} b */
function same(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

test('S1 pin 2: a mode outside 0 to 3 is refused by the box step and the product step alike', () => {
  for (const mode of [0, 1, 2, 3]) {
    const bodies = stack();
    bodies[1].solverMode = mode;
    assert.equal(loadSolver(freshId(), bodies, [floor()], null, new Set(), 0), true, 'mode ' + mode);
  }
  for (const mode of [1.5, 4, NaN, -1, 0.5, 2.5, Infinity]) {
    const bodies = stack();
    bodies[1].solverMode = mode;
    // Before S1 the box step read these as driven and stepped.
    assert.equal(stepBodies(bodies, [floor()], new Set()), false, 'box step, mode ' + mode);
    assert.equal(bodies[0].y, 0.26, 'the box step moved a body before refusing mode ' + mode);
    // And the product step read them as dynamic and stepped.
    const id = freshId();
    assert.equal(loadSolver(id, bodies, [floor()], null, new Set(), 0), false, 'load, mode ' + mode);
    assert.equal(stepSolver(id, bodies, [floor()], null, new Set(), 0), false, 'product step, mode ' + mode);
  }
});

test('S1 pin 10: an infinity in a pose or a velocity is refused, at load and on a running world', () => {
  for (const [field, value] of /** @type {Array<[string, number]>} */ ([['x', Infinity], ['y', -Infinity], ['vx', Infinity], ['vy', -Infinity], ['wz', Infinity]])) {
    const bodies = stack();
    /** @type {Record<string, number>} */ (/** @type {unknown} */ (bodies[0]))[field] = value;
    const id = freshId();
    assert.equal(loadSolver(id, bodies, [floor()], null, new Set(), 0), false, 'load, ' + field + ' ' + value);
    assert.equal(stepSolver(id, bodies, [floor()], null, new Set(), 0), false, 'step, ' + field + ' ' + value);
  }
  // Before S1 an infinite velocity reached Rapier, which disabled the body,
  // kept its state finite, and the step returned 1.
  const bodies = stack();
  const id = freshId();
  assert.equal(stepSolver(id, bodies, [floor()], null, new Set(), 0), true);
  bodies[1].vx = Infinity;
  assert.equal(stepSolver(id, bodies, [floor()], null, new Set(), 0), false);
});

test('S1 pin 4: -0.0 in a bound is one load hash and no reload', () => {
  // One load hash, through the world-file path.
  const raw = JSON.parse(readFileSync('worlds/crate-and-door.json', 'utf8'));
  const plus = validateScene(raw);
  raw.colliders[0].maxY = -0;
  const minus = validateScene(raw);
  assert.ok(plus.ok && minus.ok);
  if (!plus.ok || !minus.ok) {
    return;
  }
  assert.ok(Object.is(minus.scene.colliders[0].maxY, -0), 'the scene kept the -0.0');
  assert.equal(loadHash(minus.scene), loadHash(plus.scene));

  // No reload: a running world whose floor top turns to -0.0 halfway runs on
  // as the world that kept +0.0 does. A reload would rebuild it from the
  // records and lose the warm start and the sleep timers.
  /** @param {boolean} flip */
  function run(flip) {
    const bodies = stack();
    const colliders = [floor()];
    const id = freshId();
    assert.equal(loadSolver(id, bodies, colliders, null, new Set(), 0), true);
    for (let q = 0; q < 64; q = q + 1) {
      if (flip && q === 32) {
        colliders[0].maxY = -0;
      }
      assert.equal(stepSolver(id, bodies, colliders, null, new Set(), 0), true);
    }
    return snapshotBytes();
  }
  const whole = run(false);
  const flipped = run(true);
  assert.ok(whole.length > 0);
  assert.ok(same(flipped, whole), 'the world was rebuilt when the bound turned to -0.0');
});

test('S1 pin 15: half-extents whose old signature collided rebuild the world', () => {
  const a = { hx: 0.5, hy: 0.5 };
  const b = { hx: 0.5000000000000001, hy: 0.49993896484372585 };
  assert.notEqual(a.hx, b.hx);
  /** @param {{ hx: number, hy: number }} half */
  const bodiesOf = (half) => {
    const body = box('box', 0, 1, 0);
    body.hx = half.hx;
    body.hy = half.hy;
    return [body];
  };
  // What a fresh load of b holds.
  assert.equal(loadSolver(freshId(), bodiesOf(b), [floor()], null, new Set(), 0), true);
  const fresh = snapshotBytes();

  // a, stepped so its world is no longer a fresh one, then b under the same
  // world id. Before S1 the signature's fold of (0.5, 0.5) and of b was the
  // same word, so the world of a was kept and b stepped on it.
  const id = freshId();
  assert.equal(loadSolver(id, bodiesOf(a), [floor()], null, new Set(), 0), true);
  for (let q = 0; q < 16; q = q + 1) {
    assert.equal(stepSolver(id, bodiesOf(a), [floor()], null, new Set(), 0), true);
  }
  assert.ok(!same(snapshotBytes(), fresh));
  assert.equal(loadSolver(id, bodiesOf(b), [floor()], null, new Set(), 0), true);
  assert.ok(same(snapshotBytes(), fresh), 'the world of a was kept for the geometry of b');
});

/** Loads and steps another world, so the solver no longer holds the one under test. */
function evict() {
  const scratch = createWorld({
    bodies: [{ id: 'scratch', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.3, hy: 0.3, hz: 0.3 }],
    colliders: [{ id: 'floor', minX: -2, maxX: 2, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
  }, 'product');
  scratch.mixLoad(createHasher(), new Set());
  scratch.step(new Set());
}

/**
 * Loads the run's world from its own records, as a restore that reloaded
 * would, and returns the solver's snapshot after. A reload rebuilds Rapier
 * from the records, canonicalizing each quaternion once more and resetting
 * the warm start and the sleep timers, so the snapshot is the witness.
 * @param {import('./replay-to.mjs').Run} run
 */
function loadFromRecords(run) {
  run.world.mixLoad(createHasher(), new Set(productDriven));
  const after = run.world.snapshot();
  assert.ok(after && after.length > 0);
  return /** @type {Uint8Array} */ (after);
}

test('S1 pin 11: the replay and image restores do not reload, and a reload from records would show', () => {
  const spec = /** @type {const} */ ({ scene: 'product' });
  const at = 600;

  // Replay: the continued run's own records load as the same world.
  const replayed = replayTo(spec, at);
  const whole = /** @type {Uint8Array} */ (replayed.world.snapshot());
  assert.ok(whole.length > 0);
  assert.ok(same(loadFromRecords(replayed), whole), 'loading the replayed run from its records rebuilt the world');

  // Image: a save from a second run, restored into a third whose solver was
  // evicted, is the same world, and its records load as that world.
  const saved = replayTo(spec, at).world.save();
  const target = replayTo(spec, 10);
  evict();
  target.world.restore(saved);
  const restored = /** @type {Uint8Array} */ (target.world.snapshot());
  assert.ok(same(restored, whole), 'the image restore is not the uninterrupted world');
  assert.ok(same(loadFromRecords(target), whole), 'loading the image-restored run from its records rebuilt the world');

  // The witness goes red: with the solver evicted, the same load has to
  // rebuild from the records, and the snapshot is not the running world's.
  evict();
  assert.ok(!same(loadFromRecords(target), whole), 'a rebuild from the records gave the running world back');
});
