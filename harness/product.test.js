import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../packages/tick/world.js';
import { createBoxProductWorld, boxDriven } from './product-scene.mjs';

test('the binary matches the reference box step on the product scene', () => {
  const seeded = createBoxProductWorld();
  const init = {
    bodies: seeded.bodies.map((body) => ({ ...body })),
    colliders: seeded.colliders.map((box) => ({ ...box })),
  };
  const binary = createWorld(init, 'box');
  const reference = createWorld({
    bodies: init.bodies.map((body) => ({ ...body })),
    colliders: init.colliders.map((box) => ({ ...box })),
  }, 'reference');
  const driven = new Set(boxDriven);
  for (let i = 0; i < 10000; i = i + 1) {
    binary.step(driven);
    reference.step(driven);
  }
  for (let i = 0; i < binary.bodies.length; i = i + 1) {
    const left = binary.bodies[i];
    const right = reference.bodies[i];
    assert.equal(Object.is(left.x, right.x), true, left.id + ' x');
    assert.equal(Object.is(left.y, right.y), true, left.id + ' y');
    assert.equal(Object.is(left.z, right.z), true, left.id + ' z');
    assert.equal(Object.is(left.vx, right.vx), true, left.id + ' vx');
    assert.equal(Object.is(left.vy, right.vy), true, left.id + ' vy');
    assert.equal(Object.is(left.vz, right.vz), true, left.id + ' vz');
  }
});

test('the product scene fires every branch of the solver on the first quantum', () => {
  const world = createBoxProductWorld();
  const before = world.bodies.map((body) => ({ ...body }));
  world.step(new Set(boxDriven));
  /** @param {string} id */
  const now = (id) => {
    const body = world.bodies.find((item) => item.id === id);
    if (!body) {
      throw new Error('missing ' + id);
    }
    return body;
  };
  /** @param {string} id */
  const was = (id) => {
    const body = before.find((item) => item.id === id);
    if (!body) {
      throw new Error('missing ' + id);
    }
    return body;
  };

  const xMin = now('face-x-min');
  assert.ok(xMin.vx > 0);
  assert.ok(xMin.vy < 0);
  assert.equal(xMin.vz, 0);
  assert.ok(xMin.x < was('face-x-min').x);

  const xMax = now('face-x-max');
  assert.ok(xMax.vx < 0);
  assert.ok(xMax.vy < 0);
  assert.equal(xMax.vz, 0);
  assert.ok(xMax.x > was('face-x-max').x);

  const yMin = now('face-y-min');
  assert.ok(yMin.vy > 0);
  assert.equal(yMin.vx, 0);
  assert.equal(yMin.vz, 0);
  assert.ok(yMin.y < was('face-y-min').y);

  const yMax = now('face-y-max');
  assert.ok(yMax.vy < 0);
  assert.equal(yMax.vx, 0);
  assert.equal(yMax.vz, 0);
  assert.ok(yMax.y > was('face-y-max').y);

  const zMin = now('face-z-min');
  assert.ok(zMin.vz > 0);
  assert.ok(zMin.vy < 0);
  assert.equal(zMin.vx, 0);
  assert.ok(zMin.z < was('face-z-min').z);

  const zMax = now('face-z-max');
  assert.ok(zMax.vz < 0);
  assert.ok(zMax.vy < 0);
  assert.equal(zMax.vx, 0);
  assert.ok(zMax.z > was('face-z-max').z);

  const cornerX = now('corner-x');
  assert.ok(cornerX.vx < 0);
  assert.ok(cornerX.vy < 0);
  assert.equal(cornerX.vz, 0);
  assert.ok(cornerX.x < was('corner-x').x);

  const cornerY = now('corner-y');
  assert.equal(cornerY.vx, 0);
  assert.ok(cornerY.vy < 0);
  assert.equal(cornerY.vz, 0);
  assert.ok(cornerY.y < was('corner-y').y);

  const cornerZ = now('corner-z');
  assert.equal(cornerZ.vx, 0);
  assert.ok(cornerZ.vy < 0);
  assert.ok(cornerZ.vz < 0);
  assert.ok(cornerZ.z < was('corner-z').z);

  const fast = now('fast');
  assert.ok(Math.abs(Math.hypot(fast.vx, fast.vy, fast.vz) - 2) < 1e-12);

  const pushX = now('push-x');
  const yieldX = now('yield-x');
  assert.equal(yieldX.vx, pushX.vx);
  assert.ok(yieldX.x > was('yield-x').x);
  assert.equal(pushX.x, was('push-x').x + was('push-x').vx / 64);

  const pushY = now('push-y');
  const yieldY = now('yield-y');
  assert.equal(yieldY.vy, pushY.vy);
  assert.ok(yieldY.y > was('yield-y').y);

  const pushZ = now('push-z');
  const yieldZ = now('yield-z');
  assert.equal(yieldZ.vz, pushZ.vz);
  assert.ok(yieldZ.z > was('yield-z').z);
  assert.equal(pushZ.z, was('push-z').z + was('push-z').vz / 64);

  for (const body of world.bodies) {
    const prior = was(body.id);
    assert.ok(
      body.x !== prior.x || body.y !== prior.y || body.z !== prior.z
      || body.vx !== prior.vx || body.vy !== prior.vy || body.vz !== prior.vz,
    );
  }
});
