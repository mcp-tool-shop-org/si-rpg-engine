import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTick, settle } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { createHasher } from '../frame/hash.js';
import { loadScene, reachedGoal, validateHeightfield, validateScene } from './scene.js';
import { indexReason, loadHash, settles } from './admit-world.js';

const scene = JSON.parse(readFileSync('worlds/crate-and-door.json', 'utf8'));

/**
 * @param {Record<string, unknown>} patch
 */
function broken(patch) {
  return validateScene({ ...scene, ...patch });
}

test('the crate-and-door scene loads, and each malformed scene is refused', () => {
  const loaded = loadScene('worlds/crate-and-door.json');
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  assert.equal(loaded.scene.goal && loaded.scene.goal.actor, 'walker');
  assert.equal(loaded.scene.goal && loaded.scene.goal.zone, 'door');
  const pose = { vx: 0, vy: 0, vz: 0, qx: 0, qy: 0, qz: 0, qw: 1, wx: 0, wy: 0, wz: 0, hx: 0.25, hy: 0.25, hz: 0.25 };
  assert.equal(reachedGoal(loaded.scene, {
    tick: 0,
    hash: '0',
    bodies: [{ id: 'walker', x: 3.6, y: 0.3, z: 0, ...pose }],
  }), true);
  assert.equal(reachedGoal(loaded.scene, {
    tick: 0,
    hash: '0',
    bodies: [{ id: 'walker', x: 2.4, y: 0.3, z: 0, ...pose }],
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
  outside.zones[0].maxX = 9;
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
  const loaded = loadScene('worlds/crate-and-door.json');
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
  options.push({ verb: 'move', actor: 'walker', target: { x: 3.6, z: 0 } });
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

test('a world file is refused for each load reason', () => {
  const base = structuredClone(scene);
  assert.match(/** @type {{ reason: string }} */ (broken({ extra: 1 })).reason, /unknown field/);
  const dup = structuredClone(base);
  dup.bodies[1].id = 'walker';
  assert.match(/** @type {{ reason: string }} */ (validateScene(dup)).reason, /duplicate id/);
  const missing = structuredClone(base);
  delete missing.bodies[0].x;
  assert.match(/** @type {{ reason: string }} */ (validateScene(missing)).reason, /finite x/);
  const nan = structuredClone(base);
  nan.bodies[0].z = Number.NaN;
  assert.match(/** @type {{ reason: string }} */ (validateScene(nan)).reason, /finite z/);
  const bodies = structuredClone(base);
  bodies.bodies[1].x = 0.8;
  bodies.bodies[1].y = 1;
  assert.match(/** @type {{ reason: string }} */ (validateScene(bodies)).reason, /overlaps/);
  const solid = structuredClone(base);
  solid.bodies[0].x = -0.5;
  assert.match(/** @type {{ reason: string }} */ (validateScene(solid)).reason, /overlaps/);
  const quat = structuredClone(base);
  quat.colliders[0].qx = 0.2;
  quat.colliders[0].qw = 1;
  assert.match(/** @type {{ reason: string }} */ (validateScene(quat)).reason, /not unit/);
  const degenerate = structuredClone(base);
  degenerate.zones[0].maxX = degenerate.zones[0].minX;
  assert.match(/** @type {{ reason: string }} */ (validateScene(degenerate)).reason, /degenerate/);
  const outside = structuredClone(base);
  outside.zones[0].maxX = 9;
  assert.match(/** @type {{ reason: string }} */ (validateScene(outside)).reason, /outside/);
  const inside = structuredClone(base);
  inside.zones[0] = { id: 'door', minX: -0.5, maxX: -0.2, minY: 1, maxY: 2, minZ: -0.2, maxZ: 0.2 };
  assert.match(/** @type {{ reason: string }} */ (validateScene(inside)).reason, /lies inside/);
  const overlap = structuredClone(base);
  overlap.zones.push({ id: 'hall', minX: 3.5, maxX: 3.8, minY: 0.2, maxY: 1, minZ: -0.2, maxZ: 0.2 });
  assert.match(/** @type {{ reason: string }} */ (validateScene(overlap)).reason, /zones overlap/);
  const actor = structuredClone(base);
  actor.goal.actor = 'nobody';
  assert.match(/** @type {{ reason: string }} */ (validateScene(actor)).reason, /goal actor/);
  const missingZone = structuredClone(base);
  missingZone.goal.zone = 'yard';
  assert.match(/** @type {{ reason: string }} */ (validateScene(missingZone)).reason, /goal zone/);
  const heights = structuredClone(base);
  heights.heightfield = { rows: 2, cols: 2, cell: 1, heights: [0, 1, 2] };
  assert.match(/** @type {{ reason: string }} */ (validateScene(heights)).reason, /rows \* cols/);
  const empty = structuredClone(base);
  empty.bodies[0].id = '';
  assert.match(/** @type {{ reason: string }} */ (validateScene(empty)).reason, /non-empty/);
});

test('zoneOf is one answer, and zone bounds move the quantum hash', () => {
  const colliders = [{ id: 'floor', minX: -2, maxX: 4, minY: -1, maxY: 2, minZ: -2, maxZ: 2 }];
  const body = { id: 'walker', x: 1, y: 0.5, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 };
  const zones = [
    { id: 'left', minX: 0, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 },
    { id: 'right', minX: 1, maxX: 2, minY: 0, maxY: 2, minZ: -1, maxZ: 1 },
  ];
  const world = createWorld({ bodies: [body], colliders, zones }, 'reference');
  assert.equal(world.zoneOf('walker'), 'right');
  world.bodies[0].x = 0.2;
  assert.equal(world.zoneOf('walker'), 'left');
  world.bodies[0].x = 1;
  assert.equal(world.zoneOf('walker'), 'right', 'a shared face belongs to the zone that starts there');
  world.bodies[0].x = 3;
  assert.equal(world.zoneOf('walker'), null);
  /**
   * @param {number} maxX
   */
  function quantum(maxX) {
    const zoned = createWorld({
      bodies: [{ ...body }],
      colliders,
      zones: [{ id: 'only', minX: 0, maxX, minY: 0, maxY: 2, minZ: -1, maxZ: 1 }],
    }, 'reference');
    const tick = createTick({ seed: 3, world: zoned, rules: loadIntentRules().rules, memory: createMemory() });
    tick.advance();
    return tick.frame().hash;
  }
  assert.notEqual(quantum(2), quantum(3));
  const bare = createHasher();
  bare.u32(3);
  const withZones = createHasher();
  withZones.u32(3);
  const zoned = createWorld({ bodies: [{ ...body }], colliders, zones }, 'reference');
  zoned.mixLoad(withZones, new Set());
  assert.notEqual(bare.digest(), withZones.digest());
});

test('a rotated wall is refused by the reference and admitted only where the slab hits', () => {
  const half = Math.sin(Math.PI / 4);
  const wall = {
    id: 'wall', minX: -0.1, maxX: 0.1, minY: 0, maxY: 2, minZ: -1, maxZ: 1,
    qx: 0, qy: half, qz: 0, qw: half,
  };
  const floor = { id: 'floor', minX: -3, maxX: 3, minY: -1, maxY: 0, minZ: -2, maxZ: 2 };
  const walker = { id: 'walker', x: -1, y: 1, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.2, hy: 0.2, hz: 0.2 };
  assert.throws(() => createWorld({ bodies: [walker], colliders: [floor, wall] }, 'reference'), /reference kernel does not grow/);
  const world = createWorld({ bodies: [walker], colliders: [floor, wall] }, 'product');
  const pad = { hx: 0.2, hy: 0.2, hz: 0.2 };
  assert.equal(world.segmentHits(-1, 1, 0, 1, 1, 0, pad), 'wall');
  assert.equal(world.segmentHits(-1, 1, 0.8, 1, 1, 0.8, pad), null);
});

test('load world admits crate-and-door and refuses a world that falls through', () => {
  const loaded = loadScene('worlds/crate-and-door.json');
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  assert.equal(settles(loaded.scene), true);
  assert.equal(loadHash(loaded.scene), loadHash(loaded.scene));
  const falling = structuredClone(loaded.scene);
  falling.colliders = [{ id: 'far', minX: 20, maxX: 21, minY: -1, maxY: 0, minZ: -1, maxZ: 1 }];
  falling.zones = [];
  delete falling.goal;
  assert.equal(settles(falling), false);
  assert.equal(indexReason(loaded.scene, { worlds: {} }), 'world is not listed');
  assert.equal(indexReason(loaded.scene, { worlds: { 'crate-and-door': '0000000000000000' } }), 'world does not match the index');
  assert.equal(indexReason(loaded.scene, { worlds: { 'crate-and-door': loadHash(loaded.scene) } }), null);
});
