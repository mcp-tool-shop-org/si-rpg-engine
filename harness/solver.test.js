import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHasher } from '../packages/frame/hash.js';
import { createWorld } from '../packages/tick/world.js';
import { canonZero } from '../solver/dist/solver.mjs';
import { play } from './solver-scene.mjs';

const saved = JSON.parse(readFileSync('fixtures/behavior-solver.json', 'utf8'));

test('the solver fixture replays frame for frame under the binary', () => {
  for (const spec of saved.cases) {
    const played = play(spec);
    assert.deepEqual(played.frames, spec.frames, spec.name);
  }
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

test('clearing the warm-start cache changes the next quantum hash', () => {
  const floor = { id: 'floor', minX: -4, maxX: 4, minY: -1, maxY: 0, minZ: -2, maxZ: 2 };
  /**
   * @param {string} id
   * @param {number} y
   */
  const box = (id, y) => ({ id, x: 0, y, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 });
  /**
   * @param {boolean} clear
   */
  function digest(clear) {
    const world = createWorld({ bodies: [box('lower', 0.3), box('upper', 0.85)], colliders: [floor] }, 'product');
    for (let i = 0; i < 40; i = i + 1) {
      world.step(new Set());
    }
    const cleared = clear ? world.clearWarmstart() : 0;
    world.step(new Set());
    const hasher = createHasher();
    for (const body of world.bodies) {
      hasher.float(body.x);
      hasher.float(body.y);
      hasher.float(body.z);
      hasher.float(body.vx);
      hasher.float(body.vy);
      hasher.float(body.vz);
    }
    const snap = world.snapshot();
    if (!snap) {
      throw new Error('no snapshot');
    }
    hasher.u32(snap.length);
    for (let i = 0; i < snap.length; i = i + 1) {
      hasher.u32(snap[i]);
    }
    return { digest: hasher.digest(), cleared };
  }
  const kept = digest(false);
  const wiped = digest(true);
  assert.ok(wiped.cleared > 0, 'the stack had a warm-start cache');
  assert.notEqual(kept.digest, wiped.digest);
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
