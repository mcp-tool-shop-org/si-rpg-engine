import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorld } from '../packages/tick/world.js';

const floor = {
  positions: [0, 0, 0, 4, 0, 0, 4, 0, 4, 0, 0, 4],
  indices: [0, 1, 2, 0, 2, 3],
};
const colliders = [{ id: 'post', minX: -2, maxX: -1.5, minY: 0, maxY: 1, minZ: -2, maxZ: -1.5 }];

function drop() {
  const world = createWorld({
    bodies: [{ id: 'box', x: 1, y: 1, z: 1, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }],
    colliders,
    mesh: floor,
  }, 'product');
  world.step();
  let guard = 1;
  while (!world.sleeping('box') && guard < 4000) {
    world.step();
    guard = guard + 1;
  }
  return world;
}

test('a box set on a triangle floor sleeps on it and does not fall through', () => {
  const world = drop();
  const box = world.body('box');
  assert.ok(box);
  if (!box) {
    return;
  }
  assert.equal(world.sleeping('box'), true, 'the box did not sleep, y ' + box.y);
  const bottom = box.y - box.hy;
  assert.ok(bottom >= -0.01 && bottom <= 0.01, 'bottom ' + bottom + ' at y ' + box.y);
  const again = drop();
  const other = again.body('box');
  assert.ok(other);
  if (!other) {
    return;
  }
  assert.equal(other.y, box.y);
  assert.equal(other.x, box.x);
  assert.equal(other.z, box.z);
  const saved = world.save();
  for (let i = 0; i < 30; i = i + 1) {
    world.step();
  }
  world.restore(saved);
  const back = world.body('box');
  assert.ok(back);
  if (!back) {
    return;
  }
  assert.equal(back.y, box.y);
  assert.equal(back.x, box.x);
  assert.equal(back.z, box.z);
});
