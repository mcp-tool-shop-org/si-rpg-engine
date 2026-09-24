import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductWorld, productDriven } from './product-scene.mjs';

test('the product scene fires every branch of the solver on the first quantum', () => {
  const world = createProductWorld();
  assert.ok(world.bodies.length >= 2);
  const before = world.bodies.map((body) => ({ ...body }));
  world.step(new Set(productDriven));
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

  const floor = now('on-floor');
  assert.equal(floor.vx, was('on-floor').vx);
  assert.ok(floor.vy > 0);
  assert.equal(floor.y, floor.hh);

  const left = now('into-left');
  assert.ok(left.vx > 0);
  assert.ok(left.x > was('into-left').x);
  assert.ok(left.vy < 0);

  const right = now('into-right');
  assert.ok(right.vx < 0);
  assert.ok(right.x < was('into-right').x);

  const cornerX = now('corner-x');
  assert.ok(cornerX.vx < 0);
  assert.ok(cornerX.vy < 0);
  assert.ok(cornerX.x < was('corner-x').x);

  const cornerY = now('corner-y');
  assert.equal(cornerY.vx, was('corner-y').vx);
  assert.ok(cornerY.vy > 0);
  assert.ok(cornerY.y < was('corner-y').y);

  const fast = now('fast');
  assert.ok(Math.abs(Math.hypot(fast.vx, fast.vy) - 2) < 1e-12);

  const yields = now('yields');
  const pusher = now('pusher');
  assert.ok(yields.x > was('yields').x);
  assert.equal(pusher.x, was('pusher').x + was('pusher').vx / 64);
  assert.equal(yields.vx, pusher.vx);

  for (const body of world.bodies) {
    const prior = was(body.id);
    assert.ok(body.x !== prior.x || body.y !== prior.y || body.vx !== prior.vx || body.vy !== prior.vy);
  }
});
