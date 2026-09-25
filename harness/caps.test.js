// The solver at its caps. The memory is fixed at 512 pages, and a world that
// needs more traps, the same way on every host; this test is the tripwire for
// a law change that raises the peak. 64 bodies in contact, packed so every
// neighbour overlaps, and 64 static colliders, the buffer caps, run for
// CAPS_QUANTA quanta and must not trap. The heap's high-water mark is printed
// once in pages, with the image size and its copy times at this memory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHasher } from '../packages/frame/hash.js';
import { createWorld } from '../packages/tick/world.js';
import { heapHighWater, imageSolver, instantiate, restoreImage } from '../solver/dist/solver.mjs';

export const CAPS_QUANTA = 1000;
const SIDE = 4;
const HALF = 0.25;
// Centres 0.25 apart: each box overlaps each face neighbour by half its width,
// and its second neighbours too, so every body starts in several contacts.
const PITCH = 0.25;

export function capsWorld() {
  const bodies = [];
  for (let i = 0; i < SIDE; i = i + 1) {
    for (let j = 0; j < SIDE; j = j + 1) {
      for (let k = 0; k < SIDE; k = k + 1) {
        bodies.push({
          id: 'b' + i + '-' + j + '-' + k,
          x: 10 + i * PITCH, y: 0.25 + j * PITCH, z: k * PITCH,
          vx: 0, vy: 0, vz: 0, hx: HALF, hy: HALF, hz: HALF,
        });
      }
    }
  }
  const colliders = [{ id: 'floor', minX: 0, maxX: 24, minY: -1, maxY: 0, minZ: -6, maxZ: 8 }];
  // 63 posts, 7 rows of 9 around the pile, each standing on the floor,
  // close enough that the pile spreads into them.
  for (let p = 0; p < 63; p = p + 1) {
    const ring = Math.floor(p / 9);
    const at = p % 9;
    const x = 8 + at * 0.6;
    const z = -2 + ring * 0.8;
    colliders.push({ id: 'post' + p, minX: x, maxX: x + 0.2, minY: 0, maxY: 0.6, minZ: z, maxZ: z + 0.2 });
  }
  return { bodies, colliders };
}

test('64 bodies in contact and 64 static colliders run ' + CAPS_QUANTA + ' quanta without a trap', (t) => {
  instantiate();
  const scene = capsWorld();
  assert.equal(scene.bodies.length, 64);
  assert.equal(scene.colliders.length, 64);
  const world = createWorld(scene, 'product');
  world.mixLoad(createHasher(), new Set());
  let contacts = 0;
  for (let q = 0; q < CAPS_QUANTA; q = q + 1) {
    world.step(new Set());
    const snap = world.snapshot();
    assert.ok(snap && snap.length > 0, 'a snapshot at quantum ' + (q + 1));
    if (q === 0) {
      contacts = snap.length;
    }
  }
  for (const body of world.bodies) {
    assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y) && Number.isFinite(body.z), body.id + ' is finite');
  }
  const high = heapHighWater();
  assert.ok(high.pages > 0 && high.pages < high.of, 'the heap stayed inside the fixed memory');
  // Twice, both printed. These are the first images in this process, so the
  // digest loop has not been optimised yet; harness/restore.test.js prints the
  // same image after many, which is the steady cost.
  /** @type {string[]} */
  const rounds = [];
  /** @type {ReturnType<typeof imageSolver>} */
  let image = null;
  for (let round = 0; round < 2; round = round + 1) {
    const out0 = performance.now();
    image = imageSolver();
    const outMs = performance.now() - out0;
    assert.ok(image, 'an image between calls');
    const in0 = performance.now();
    assert.equal(restoreImage(image), true);
    const inMs = performance.now() - in0;
    rounds.push('out ' + outMs.toFixed(1) + ' ms, in ' + inMs.toFixed(1) + ' ms');
  }
  const bytes = /** @type {NonNullable<typeof image>} */ (image).bytes;
  assert.equal(bytes.length, high.of * 65536);
  const copy0 = performance.now();
  new Uint8Array(bytes.length).set(bytes);
  const copyMs = performance.now() - copy0;
  t.diagnostic('caps: heap peak ' + high.pages + ' of ' + high.of + ' pages (' + high.bytes + ' bytes) over ' + CAPS_QUANTA + ' quanta, snapshot ' + contacts + ' bytes after the first');
  t.diagnostic('caps: image ' + bytes.length + ' bytes; with its digest and checks, first ' + rounds[0] + '; second ' + rounds[1] + '; a bare copy ' + copyMs.toFixed(1) + ' ms');
});

// The tripwire goes red. Every body on one spot over a full heightfield small
// enough that each body touches all 450 of its triangles needs more heap than
// 512 pages hold, and the allocator's failure is a trap, not a grown memory.
// It runs last: a trapped instance is not used again in this file.
test('a world denser than the fixed memory traps instead of growing', () => {
  instantiate();
  const bodies = [];
  for (let i = 0; i < 64; i = i + 1) {
    bodies.push({ id: 'c' + i, x: 0.225, y: 0.2, z: 0.225, vx: 0, vy: 0, vz: 0, hx: HALF, hy: HALF, hz: HALF });
  }
  const heights = [];
  for (let i = 0; i < 256; i = i + 1) {
    heights.push((i % 3) * 0.01);
  }
  const world = createWorld({
    bodies,
    colliders: capsWorld().colliders,
    heightfield: { rows: 16, cols: 16, cell: 0.03, heights },
  }, 'product');
  assert.throws(() => {
    world.mixLoad(createHasher(), new Set());
    for (let q = 0; q < 10; q = q + 1) {
      world.step(new Set());
    }
  }, (/** @type {unknown} */ err) => err instanceof WebAssembly.RuntimeError);
  assert.equal(instantiate().exports.memory.buffer.byteLength, 512 * 65536, 'the memory did not grow');
  // The trap is the heap running out: it had passed 400 of the 512 pages, and
  // the request that failed did not fit in what was left.
  assert.ok(heapHighWater().pages > 400, 'the heap reached ' + heapHighWater().pages + ' pages before the trap');
});
