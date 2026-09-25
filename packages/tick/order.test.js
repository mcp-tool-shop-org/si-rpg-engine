// Insertion order is part of the record. The same bodies in a different order
// are a different world: the load hash and the first quantum's hash both move,
// so a loader that reorders content cannot pass silently. The world-file
// loader keeps file order, and these tests hold both.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTick } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { loadScene, validateScene } from './scene.js';
import { loadHash } from './admit-world.js';

const FILE = 'worlds/crate-and-door.json';
const text = readFileSync(FILE, 'utf8');

/**
 * @param {(raw: Record<string, any>) => void} change
 */
function authored(change) {
  const raw = JSON.parse(text);
  change(raw);
  const checked = validateScene(raw);
  if (!checked.ok) {
    throw new Error('the authored scene is refused: ' + checked.reason);
  }
  return checked.scene;
}

/**
 * The frame hash at load and after one quantum, under the product law.
 * @param {import('./scene.js').Scene} scene
 */
function firstHashes(scene) {
  const world = createWorld({ bodies: scene.bodies, colliders: scene.colliders, zones: scene.zones }, 'product');
  const tick = createTick({ seed: scene.seed, world, rules: loadIntentRules().rules, memory: createMemory() });
  const load = tick.frame().hash;
  tick.advance();
  return { load, first: tick.frame().hash };
}

test('the world-file loader keeps file order for bodies, colliders, and zones', () => {
  const loaded = loadScene(FILE);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  const raw = JSON.parse(text);
  assert.deepEqual(loaded.scene.bodies.map((body) => body.id), raw.bodies.map((/** @type {{ id: string }} */ body) => body.id));
  assert.deepEqual(loaded.scene.colliders.map((box) => box.id), raw.colliders.map((/** @type {{ id: string }} */ box) => box.id));
  // walker is listed before crate: file order, not sorted order.
  assert.deepEqual(loaded.scene.bodies.map((body) => body.id), ['walker', 'crate']);
  const reversed = authored((scene) => {
    scene.bodies.reverse();
    scene.colliders.reverse();
    scene.zones.push({ id: 'aisle', minX: 0.2, maxX: 1.2, minY: 0, maxY: 2, minZ: -0.5, maxZ: 0.5 });
  });
  assert.deepEqual(reversed.bodies.map((body) => body.id), ['crate', 'walker']);
  assert.deepEqual(reversed.colliders.map((box) => box.id), ['wall-right', 'wall-left', 'floor']);
  assert.deepEqual(reversed.zones.map((zone) => zone.id), ['door', 'aisle']);
});

test('the same bodies in another order move the load hash and the first quantum hash', () => {
  const filed = authored(() => {});
  const swapped = authored((scene) => {
    scene.bodies.reverse();
  });
  assert.deepEqual(swapped.bodies.map((body) => body.id), ['crate', 'walker']);
  assert.deepEqual([...swapped.bodies].reverse(), filed.bodies);

  // The same order twice is the same run, so the difference below is the order's.
  assert.deepEqual(firstHashes(filed), firstHashes(authored(() => {})));
  assert.equal(loadHash(filed), loadHash(authored(() => {})));

  assert.notEqual(loadHash(swapped), loadHash(filed));
  const a = firstHashes(filed);
  const b = firstHashes(swapped);
  assert.notEqual(b.load, a.load);
  assert.notEqual(b.first, a.first);
});
