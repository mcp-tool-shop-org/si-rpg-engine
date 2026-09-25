import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTick, settle } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { loadScene, reachedGoal, validateHeightfield, validateScene } from './scene.js';

const scene = JSON.parse(readFileSync('scenes/crate-and-door.json', 'utf8'));

/**
 * @param {Record<string, unknown>} patch
 */
function broken(patch) {
  return validateScene({ ...scene, ...patch });
}

test('the crate-and-door scene loads, and each malformed scene is refused', () => {
  const loaded = loadScene('scenes/crate-and-door.json');
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  assert.equal(loaded.scene.goal.actor, 'crate');
  assert.equal(reachedGoal(loaded.scene, {
    tick: 0,
    hash: '0',
    bodies: [{ id: 'crate', x: 3.65, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, wx: 0, wy: 0, wz: 0, hx: 0.3, hy: 0.3, hz: 0.3 }],
  }), true);
  assert.equal(reachedGoal(loaded.scene, {
    tick: 0,
    hash: '0',
    bodies: [{ id: 'crate', x: 2.4, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, wx: 0, wy: 0, wz: 0, hx: 0.3, hy: 0.3, hz: 0.3 }],
  }), false);
  assert.match(/** @type {{ reason: string }} */ (broken({ extra: true })).reason, /unknown field/);
  const overlapBody = structuredClone(scene);
  overlapBody.bodies[1].x = 0.8;
  overlapBody.bodies[1].y = 1;
  assert.match(/** @type {{ reason: string }} */ (validateScene(overlapBody)).reason, /overlaps/);
  const overlapWall = structuredClone(scene);
  overlapWall.bodies[0].x = -0.5;
  assert.match(/** @type {{ reason: string }} */ (validateScene(overlapWall)).reason, /overlaps/);
  assert.match(/** @type {{ reason: string }} */ (broken({ goal: { actor: 'door', zone: scene.goal.zone } })).reason, /not a body/);
  const outside = structuredClone(scene);
  outside.goal.zone = { minX: 3.3, maxX: 9, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 };
  assert.match(/** @type {{ reason: string }} */ (validateScene(outside)).reason, /outside/);
  const sloped = structuredClone(scene);
  sloped.heightfield = { rows: 2, cols: 2, cell: 1, heights: [0, 0.5, 0, 0.5] };
  const accepted = validateScene(sloped);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.scene.heightfield && accepted.scene.heightfield.heights.length, 4);
  }
  assert.match(/** @type {{ reason: string }} */ (validateHeightfield({ rows: 1, cols: 2, cell: 1, heights: [0, 0] })).reason, /rows/);
  assert.match(/** @type {{ reason: string }} */ (validateHeightfield({ rows: 2, cols: 2, cell: 1, heights: [0] })).reason, /heights/);
});

test('the oracle puts the crate in the door within eight moves', () => {
  const loaded = loadScene('scenes/crate-and-door.json');
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  const room = loaded.scene;
  const catalog = loadIntentRules();
  /** @type {Array<{ verb: string, actor: string, target: { x: number, z: number } | { body: string } }>} */
  const options = [{ verb: 'push', actor: 'walker', target: { body: 'crate' } }];
  for (let x = 1; x <= 3; x = x + 0.5) {
    options.push({ verb: 'move', actor: 'walker', target: { x, z: 0 } });
  }
  /**
   * @param {typeof options} seq
   */
  function solves(seq) {
    const tick = createTick({
      seed: room.seed,
      world: createWorld({ bodies: room.bodies, colliders: room.colliders }, 'reference'),
      rules: catalog.rules,
      retired: catalog.retired,
      memory: createMemory(),
    });
    for (const action of seq) {
      const admission = tick.submit({ kind: 'intent', ...action, frameHash: tick.frame().hash });
      if (!admission.admitted) {
        return false;
      }
      settle(tick);
      if (reachedGoal(room, tick.frame())) {
        return true;
      }
    }
    return false;
  }
  let minimum = 0;
  /**
   * @param {typeof options} prefix
   */
  function search(prefix) {
    if (minimum !== 0) {
      return;
    }
    for (const option of options) {
      const seq = prefix.concat([option]);
      if (solves(seq)) {
        minimum = seq.length;
        return;
      }
    }
    if (prefix.length >= 2) {
      return;
    }
    for (const option of options) {
      search(prefix.concat([option]));
      if (minimum !== 0) {
        return;
      }
    }
  }
  search([]);
  assert.ok(minimum >= 1 && minimum <= 8, 'oracle minimum ' + minimum);
  process.stdout.write('oracle minimum ' + minimum + '\n');
});
