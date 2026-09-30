import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createWorld } from '../packages/tick/world.js';
import { instantiate, lawStatus, loadSolver, runLaw, stepSolver } from '../solver/dist/solver.mjs';

const floor = { id: 'floor', minX: -4, maxX: 4, minY: -1, maxY: 0, minZ: -4, maxZ: 4 };
const tri = {
  positions: [0, 0, 0, 4, 0, 0, 0, 0, 4],
  indices: [0, 1, 2],
};

function box(vx = 0) {
  return { id: 'box', x: 0, y: 1, z: 0, vx, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 };
}

/** @returns {ReturnType<typeof box> & { qx: number, qy: number, qz: number, qw: number, wx: number, wy: number, wz: number }} */
function record(vx = 0) {
  return { ...box(vx), qx: 0, qy: 0, qz: 0, qw: 1, wx: 0, wy: 0, wz: 0 };
}

test('createWorld throws the mesh reason and a later good world still steps', () => {
  assert.throws(
    () => createWorld({ bodies: [box()], colliders: [floor], mesh: { positions: tri.positions, indices: [0, 1, 9] } }),
    /an index is out of range/,
  );
  assert.throws(
    () => createWorld({ bodies: [box()], colliders: [floor], mesh: { positions: tri.positions, indices: [0, 1, 1] } }),
    /a triangle repeats an index/,
  );
  assert.throws(
    () => createWorld({ bodies: [box()], colliders: [floor], mesh: { positions: [0, NaN, 0, 4, 0, 0, 0, 0, 4], indices: [0, 1, 2] } }),
    /a position is not finite/,
  );
  const world = createWorld({ bodies: [box()], colliders: [floor], mesh: tri });
  world.step();
  const body = world.body('box');
  assert.ok(body);
  assert.equal(Number.isFinite(body.y), true);
});

test('loadSolver returns false for a bad index and a good mesh then loads and steps', () => {
  const bad = record();
  assert.equal(loadSolver(880001, [bad], [floor], null, new Set(), 0, { positions: tri.positions, indices: [0, 1, 9] }), false);
  assert.equal(lawStatus(), 'none');
  const good = record();
  assert.equal(loadSolver(880002, [good], [floor], null, new Set(), 0, tri), true);
  assert.equal(stepSolver(880002, [good], [floor], null, new Set(), 0, tri), true);
  assert.equal(Number.isFinite(good.y), true);
});

test('a trapped law call drops the cached module and a good world still steps', () => {
  const glue = readFileSync(new URL('../solver/build.mjs', import.meta.url), 'utf8');
  assert.match(glue, /runExport\(\(\) => exp\.solver_load/);
  assert.match(glue, /runExport\(\(\) => exp\.solver_step/);
  const before = instantiate();
  const value = runLaw(() => {
    throw new WebAssembly.RuntimeError('probe');
  });
  assert.equal(value, undefined);
  assert.equal(lawStatus(), 'trapped');
  assert.notEqual(instantiate(), before);
  const world = createWorld({ bodies: [box()], colliders: [floor], mesh: tri });
  world.step();
  assert.equal(lawStatus(), 'none');
  const body = world.body('box');
  assert.ok(body);
  assert.equal(Number.isFinite(body.y), true);
});

test('a refused step does not hold that world, and the message for a non-finite body stays NaN', () => {
  const good = createWorld({ bodies: [box()], colliders: [floor] });
  good.step();
  assert.doesNotThrow(() => good.sleeping('box'));
  const poisoned = createWorld({ bodies: [box(NaN)], colliders: [floor] });
  /** @type {unknown} */
  let caught;
  try {
    poisoned.step();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, /NaN/);
  assert.doesNotMatch(caught.message, /trapped/);
  const stayed = poisoned.body('box');
  assert.ok(stayed);
  assert.equal(stayed.y, 1);
  assert.throws(() => poisoned.sleeping('box'), /sleeping refused/);
  assert.doesNotThrow(() => good.sleeping('box'));
  good.step();
  assert.doesNotThrow(() => good.sleeping('box'));
});
