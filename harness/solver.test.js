import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHasher } from '../packages/frame/hash.js';
import { createWorld } from '../packages/tick/world.js';
import { canonZero } from '../solver/dist/solver.mjs';
import { applyProductAct, createProductWorld } from './product-scene.mjs';
import { play } from './solver-scene.mjs';

const saved = JSON.parse(readFileSync('fixtures/behavior-solver.json', 'utf8'));
const rotation = JSON.parse(readFileSync('fixtures/behavior-rotation.json', 'utf8'));
const shapes = JSON.parse(readFileSync('fixtures/shape-traversal.json', 'utf8'));
const ramp = JSON.parse(readFileSync('fixtures/behavior-ramp.json', 'utf8'));

test('the E2 solver fixture first differs at tick 0', () => {
  for (const spec of saved.cases) {
    const played = play(spec);
    assert.deepEqual(played.behaviour, spec.behaviour, spec.name + ' behaviour');
    let first = null;
    for (let i = 0; i < spec.frames.length; i = i + 1) {
      if (played.frames[i].hash !== spec.frames[i].hash) {
        first = spec.frames[i].tick;
        break;
      }
    }
    assert.equal(first, 0, spec.name);
  }
});

test('the rotation fixture replays frame for frame', () => {
  for (const spec of rotation.cases) {
    const played = play(spec);
    assert.deepEqual(played.frames, spec.frames, spec.name);
    assert.deepEqual(played.behaviour, spec.behaviour, spec.name + ' behaviour');
  }
  const tip = play(rotation.cases.find((/** @type {{ name: string }} */ item) => item.name === 'tip')).bodies[0];
  assert.ok(tip.qw < 0.95, 'a box dropped on an edge tips');
  assert.ok(Math.abs(tip.wz) > 1, 'the tip has angular velocity');
  const tumbled = play(rotation.cases.find((/** @type {{ name: string }} */ item) => item.name === 'tumble')).bodies;
  const crate = tumbled.find((body) => body.id === 'crate');
  if (!crate) {
    throw new Error('crate');
  }
  assert.ok(crate.y < 0, 'the pushed box leaves the ledge');
  assert.ok(crate.qw < 0.95, 'the pushed box tumbles');
  const stack = play(rotation.cases.find((/** @type {{ name: string }} */ item) => item.name === 'stack')).bodies;
  assert.ok(stack[1].y > stack[0].y + 0.4, 'the stack still rests');
  assert.equal(stack[0].vy, 0);
  assert.equal(stack[1].vy, 0);
  assert.ok(stack[0].qw > 0.999 && stack[1].qw > 0.999, 'the stack has not tipped');
  assert.ok(Math.abs(stack[0].wx) + Math.abs(stack[0].wy) + Math.abs(stack[0].wz) < 1e-8);
  assert.ok(Math.abs(stack[1].wx) + Math.abs(stack[1].wy) + Math.abs(stack[1].wz) < 1e-8);
});

test('a body slides down a rotated ramp', () => {
  const spec = ramp.cases[0];
  const played = play(spec);
  assert.deepEqual(played.frames, spec.frames);
  assert.deepEqual(played.behaviour, spec.behaviour, 'slide behaviour');
  const body = played.bodies[0];
  const start = spec.world.bodies[0];
  assert.ok(body.x < start.x - 1, 'the box moves down the ramp');
  assert.ok(body.y > 0.119 && body.y < 0.121, 'the box rests on the floor');
  assert.equal(body.vx, 0);
  assert.equal(body.vy, 0);
  assert.ok(body.qw < 0.01, 'the box rotates while it slides');
  assert.throws(() => createWorld(spec.world, 'reference'), /a rotated collider is refused/);
});

test('the traversal frames keep the box', () => {
  /** @param {string} name */
  const endOf = (name) => {
    const spec = shapes.cases.find((/** @type {{ name: string }} */ item) => item.name === name);
    if (!spec) {
      throw new Error(name);
    }
    const played = play(spec);
    assert.deepEqual(played.frames, spec.frames, name);
    return played.bodies[0];
  };
  const stepBox = endOf('step-box');
  const stepCapsule = endOf('step-capsule');
  assert.ok(stepBox.y > 0.5, 'the box climbs a step of the maximum height');
  assert.ok(stepCapsule.y < 0.35, 'the capsule does not climb that step');
  const slopeBox = endOf('slope-box');
  const slopeCapsule = endOf('slope-capsule');
  assert.ok(slopeBox.y < 0.5, 'the box does not climb a slope exactly at the limit');
  assert.ok(slopeCapsule.y > 0.6, 'the capsule does climb that slope');
  const ledgeBox = endOf('ledge-box');
  const ledgeCapsule = endOf('ledge-capsule');
  assert.ok(ledgeBox.y > 0.25 && ledgeBox.y < 0.27, 'the box is still standing at the ledge');
  assert.ok(ledgeCapsule.y < ledgeBox.y, 'the capsule drops at the ledge while the box is still standing');
  const gapBox = endOf('gap-box');
  assert.ok(gapBox.y > 0.25, 'the box crosses the narrow gap at standing height');
});

test('the solver fixture shows the six cases', () => {
  /** @param {string} name */
  const finalOf = (name) => {
    const spec = saved.cases.find((/** @type {{ name: string }} */ item) => item.name === name);
    if (!spec) {
      throw new Error(name);
    }
    return play(spec).bodies;
  };

  const stepped = finalOf('step-up')[0];
  assert.ok(stepped.y > 0.4, 'the body stands on the rise');
  assert.ok(stepped.x > 1.2, 'the body crossed onto the rise');
  assert.equal(stepped.vy, 0);

  const blocked = finalOf('blocked')[0];
  assert.ok(blocked.x + blocked.hx <= 1 + 1e-6, 'the tall rise stops the body');
  assert.ok(blocked.y < 0.35, 'the body does not climb the tall rise');

  const slope = finalOf('walkable-slope')[0];
  assert.ok(slope.y > 0.45, 'a walkable slope raises the body');
  assert.equal(slope.vy, 0);

  const steep = finalOf('steep-slope')[0];
  assert.ok(steep.y < 0.45, 'a slope past the limit does not raise the body');
  assert.ok(steep.x < -1.2, 'the body does not walk up the steep slope');

  const snapped = finalOf('snap')[0];
  assert.equal(snapped.vy, 0, 'ground contact does not reflect vertical velocity');
  assert.ok(snapped.y < 0.3 && snapped.y > 0.2, 'the body rests on the floor');

  const stack = finalOf('stack');
  const lower = stack[0];
  const upper = stack[1];
  assert.ok(upper.y > lower.y + 0.4, 'the upper box rests on the lower one');
  assert.ok(lower.y > 0.2, 'the lower box rests on the floor');
  assert.equal(lower.vy, 0);
  assert.equal(upper.vy, 0);
});

/**
 * The snapshot's contact section, parsed by its layout: fifteen floats per
 * solver body, a pair count, then per pair four handle parts, a point count,
 * and seven warm-start floats per point. Throws if the bytes are not exactly
 * that layout.
 * @param {Uint8Array} snap
 * @param {number} solverBodies
 */
function contactSection(snap, solverBodies) {
  assert.equal(snap.length % 8, 0, 'whole floats');
  const view = new DataView(snap.buffer, snap.byteOffset, snap.byteLength);
  const words = snap.length / 8;
  /** @param {number} w */
  const at = (w) => view.getFloat64(w * 8, true);
  let w = solverBodies * 15;
  const pairs = at(w);
  assert.ok(Number.isInteger(pairs) && pairs >= 0, 'a pair count');
  w = w + 1;
  /** @type {Array<{ word: number, points: number }>} */
  const out = [];
  for (let p = 0; p < pairs; p = p + 1) {
    const points = at(w + 4);
    assert.ok(Number.isInteger(points) && points >= 0, 'a point count');
    out.push({ word: w + 5, points });
    w = w + 5 + points * 7;
  }
  assert.equal(w, words, 'the pairs end where the snapshot ends');
  return out;
}

/** A two-box stack after it has settled, with its snapshot. */
function restingStack() {
  const floor = { id: 'floor', minX: -4, maxX: 4, minY: -1, maxY: 0, minZ: -2, maxZ: 2 };
  /**
   * @param {string} id
   * @param {number} y
   */
  const box = (id, y) => ({ id, x: 0, y, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 });
  const world = createWorld({ bodies: [box('lower', 0.3), box('upper', 0.85)], colliders: [floor] }, 'product');
  for (let i = 0; i < 40; i = i + 1) {
    world.step(new Set());
  }
  const snap = world.snapshot();
  if (!snap) {
    throw new Error('no snapshot');
  }
  return { world, snap };
}

/**
 * The digest a frame mixes a snapshot into.
 * @param {Uint8Array} snap
 */
function snapDigest(snap) {
  const hasher = createHasher();
  hasher.u32(snap.length);
  for (let i = 0; i < snap.length; i = i + 1) {
    hasher.u32(snap[i]);
  }
  return hasher.digest();
}

// This replaces the test that cleared the cache in place: that write went
// through a cast from a shared reference, which is undefined behaviour
// (docs/rust-kb-answers.md answer 1). Neither test here proves that the cache
// steers the next quantum; that needs a sound write in a test-only build.
test('a resting stack carries non-zero warm-start fields, and flipping them moves the hash', () => {
  const { snap } = restingStack();
  const pairs = contactSection(snap, 2);
  const view = new DataView(snap.buffer, snap.byteOffset, snap.byteLength);
  /** @type {number[]} */
  const nonZero = [];
  for (const pair of pairs) {
    for (let k = 0; k < pair.points * 7; k = k + 1) {
      if (view.getFloat64((pair.word + k) * 8, true) !== 0) {
        nonZero.push(pair.word + k);
      }
    }
  }
  assert.ok(nonZero.length > 0, 'the stack has a warm-start cache');
  const before = snapDigest(snap);
  for (const word of nonZero) {
    const copy = snap.slice();
    const flipped = new DataView(copy.buffer);
    flipped.setFloat64(word * 8, 0 - flipped.getFloat64(word * 8, true), true);
    assert.notEqual(snapDigest(copy), before, 'word ' + word);
  }
});

test('every manifold point in the snapshot carries all seven warm-start floats', () => {
  const { snap } = restingStack();
  const pairs = contactSection(snap, 2);
  assert.ok(pairs.reduce((n, pair) => n + pair.points, 0) > 0, 'the stack has contact points');
  // One float short of the layout does not parse.
  assert.throws(() => contactSection(snap.slice(0, snap.length - 8), 2));
  // The same holds on the product scene after the carry, with a heightfield and a rotated slab.
  const product = createProductWorld();
  product.mixLoad(createHasher(), new Set(['walker']));
  for (let i = 0; i < 600; i = i + 1) {
    product.step(applyProductAct(product, i));
  }
  const productSnap = product.snapshot();
  if (!productSnap) {
    throw new Error('no snapshot');
  }
  const solverBodies = product.bodies.filter((body) => !product.carriedByOf(body.id)).length;
  assert.ok(contactSection(productSnap, solverBodies).length > 0);
});

test('signed zero mixes to one digest and NaN aborts', () => {
  assert.equal(Object.is(canonZero(-0), 0), true);
  assert.equal(Object.is(canonZero(0), 0), true);
  const floor = { id: 'floor', minX: -2, maxX: 2, minY: -1, maxY: 0, minZ: -2, maxZ: 2 };
  /**
   * @param {number} vx
   */
  function digest(vx) {
    const world = createWorld({
      bodies: [{ id: 'a', x: 0, y: 1, z: 0, vx, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }],
      colliders: [floor],
    }, 'product');
    world.step(new Set());
    const hasher = createHasher();
    const snap = world.snapshot();
    if (!snap) {
      throw new Error('no snapshot');
    }
    hasher.u32(snap.length);
    for (let i = 0; i < snap.length; i = i + 1) {
      hasher.u32(snap[i]);
    }
    hasher.float(world.bodies[0].vx);
    return hasher.digest();
  }
  assert.equal(digest(-0), digest(0));
  const poisoned = createWorld({
    bodies: [{ id: 'a', x: 0, y: 1, z: 0, vx: NaN, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }],
    colliders: [floor],
  }, 'product');
  assert.throws(() => poisoned.step(new Set()), /NaN/);
});

test('a quaternion and its negation hash to one digest, and a NaN angular field aborts', () => {
  const floor = { id: 'floor', minX: -2, maxX: 2, minY: -1, maxY: 0, minZ: -2, maxZ: 2 };
  /**
   * @param {number} qw
   */
  function digest(qw) {
    const world = createWorld({
      bodies: [{ id: 'a', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw, wx: 0, wy: 0, wz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }],
      colliders: [floor],
    }, 'product');
    world.step(new Set());
    const hasher = createHasher();
    const body = world.bodies[0];
    hasher.float(body.qx);
    hasher.float(body.qy);
    hasher.float(body.qz);
    hasher.float(body.qw);
    assert.equal(body.qw, 1);
    return hasher.digest();
  }
  assert.equal(digest(1), digest(-1));
  const poisoned = createWorld({
    bodies: [{ id: 'a', x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, wx: NaN, hx: 0.25, hy: 0.25, hz: 0.25 }],
    colliders: [floor],
  }, 'product');
  assert.throws(() => poisoned.step(new Set()), /NaN/);
});

test('a body dropped anywhere along a rotated ramp slides down it', () => {
  // Warming the broad phase by hand and discarding its pair events left pairs
  // unregistered: a box dropped above the centre of this slab passed through it,
  // and on a longer slab almost every drop point did. The load pass now runs
  // through Rapier's collision pipeline.
  const cx = 22;
  const cy = 0.8924621202458748;
  const q = { qx: 0, qy: 0, qz: 0.3826834323650898, qw: 0.9238795325112867 };
  for (const [hx, dx] of [[1.4, 0], [3.0, 0.5], [3.0, 1.5]]) {
    const surface = cy + dx + 0.35 * Math.SQRT2;
    const spec = {
      name: 'ramp-' + hx + '-' + dx,
      seed: 1,
      steps: 300,
      driven: [],
      world: {
        bodies: [{ id: 'slider', x: cx + dx, y: surface + 0.4, z: 4, vx: 0, vy: 0, vz: 0, hx: 0.12, hy: 0.12, hz: 0.12 }],
        colliders: [
          { id: 'floor', minX: 4, maxX: 80, minY: -1, maxY: 0, minZ: -2, maxZ: 6 },
          { id: 'ramp', minX: cx - hx, maxX: cx + hx, minY: cy - 0.35, maxY: cy + 0.35, minZ: 3.5, maxZ: 4.5, ...q },
        ],
      },
    };
    const body = play(spec).bodies[0];
    assert.ok(body.x < cx + dx - 0.5, 'half-length ' + hx + ' drop ' + dx + ' slid: x ' + body.x);
    assert.ok(Math.abs(body.y - 0.12) < 1e-3, 'half-length ' + hx + ' drop ' + dx + ' rests on the floor: y ' + body.y);
  }
});
