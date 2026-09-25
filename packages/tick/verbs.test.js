import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileVerb } from '../load/compile.js';
import { considerDraft } from '../load/admit.js';
import { loadHazards } from '../load/suite.js';
import { createHasher } from '../frame/hash.js';
import { createWorld } from './world.js';
import { createTick, settle } from './tick.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { playVerbs } from '../../harness/verbs-scene.mjs';

const bare = { rules: ['move.json'], retired: [] };

test('a rule without an effect compiles as drive, and an unknown effect or an unused field is refused', () => {
  const drive = compileVerb({ verb: 'step', speed: 1, maxDistance: 2, requiresClearPath: true, maxQuanta: 64 });
  assert.equal(drive.ok, true);
  if (drive.ok) {
    assert.equal(drive.rule.effect, 'drive');
  }
  const unknown = compileVerb({ verb: 'step', effect: 'fly', speed: 1, maxDistance: 2, requiresClearPath: true, maxQuanta: 64 });
  assert.equal(unknown.ok, false);
  assert.match(unknown.ok ? '' : unknown.reason, /unknown effect/);
  const extra = compileVerb({ verb: 'step', speed: 1, maxDistance: 2, requiresClearPath: true, maxQuanta: 64, maxRise: 1 });
  assert.equal(extra.ok, false);
  assert.match(extra.ok ? '' : extra.reason, /unknown field/);
  assert.equal(readFileSync('predicates/intents/move.json', 'utf8').includes('effect'), false);
  assert.equal(readFileSync('predicates/intents/push.json', 'utf8').includes('effect'), false);
});

test('supportAt answers an axis-aligned box, a rotated slab, a heightfield cell, and a resting body', () => {
  const world = createWorld({
    bodies: [
      { id: 'rest', x: 3, y: 0.4, z: 1, vx: 0, vy: 0, vz: 0, hx: 0.2, hy: 0.2, hz: 0.2 },
      { id: 'moving', x: 5, y: 0.4, z: 1, vx: 0.2, vy: 0, vz: 0, hx: 0.2, hy: 0.2, hz: 0.2 },
    ],
    colliders: [
      { id: 'floor', minX: -2, maxX: 2, minY: -1, maxY: 0, minZ: -2, maxZ: 2 },
      { id: 'ramp', minX: 8, maxX: 10, minY: -0.3, maxY: 0.3, minZ: -0.5, maxZ: 0.5, qx: 0, qy: 0, qz: Math.sin(Math.PI / 8), qw: Math.cos(Math.PI / 8) },
    ],
    heightfield: { rows: 2, cols: 3, cell: 1, heights: [0, 0.25, 0.5, 0, 0.25, 0.5] },
  });
  assert.equal(world.supportAt(0, 1.5, 2), 0);
  assert.equal(world.supportAt(0, -0.5, 2), 0.25);
  const rest = world.supportAt(3, 1, 2);
  assert.ok(rest !== null && Math.abs(rest - 0.6) < 1e-12);
  assert.equal(world.supportAt(5, 1, 2), null);
  const ramp = world.supportAt(9, 0, 3);
  assert.equal(typeof ramp, 'number');
  assert.ok(ramp !== null && ramp > 0.3, 'the rotated top is above the unrotated max');
  assert.equal(world.supportAt(30, 30, 2), null);
});

test('sleeping is the solver flag, and a carried body leaves the solver', () => {
  const world = createWorld({
    bodies: [
      { id: 'walker', x: 0.5, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'crate', x: 1.8, y: 0.36, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.3, hy: 0.3, hz: 0.3 },
    ],
    colliders: [{ id: 'floor', minX: -2, maxX: 6, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
  });
  // Never loaded, the binary does not hold it (T5 pin 7).
  assert.throws(() => world.sleeping('crate'), /sleeping refused: world \d+ is not the world the binary holds/);
  world.step(new Set());
  assert.equal(world.sleeping('crate'), false);
  for (let i = 0; i < 128 && !world.sleeping('crate'); i = i + 1) {
    world.step(new Set());
  }
  assert.equal(world.sleeping('crate'), true);
  const snap = world.snapshot();
  assert.ok(snap);
  const before = snap ? snap.length : 0;
  assert.equal(world.carry('walker', 'crate'), true);
  assert.equal(world.carry('walker', 'crate'), false);
  world.step(new Set(['walker']));
  const walker = world.body('walker');
  const crate = world.body('crate');
  assert.ok(walker && crate);
  if (!walker || !crate) {
    return;
  }
  assert.equal(crate.x, walker.x);
  assert.equal(crate.y, walker.y + walker.hy + crate.hy);
  assert.equal(crate.qw, 1);
  const after = world.snapshot();
  assert.ok(after && after.length < before);
  assert.equal(world.anyCarried(), true);
});

test('sleeping on a product world the binary does not hold refuses with a reason instead of answering for another (T5 pin 7)', () => {
  const floor = [{ id: 'floor', minX: -2, maxX: 6, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }];
  // A: a walker beside a crate that settles until it sleeps. B: the same
  // bodies with the crate in the air, awake. Same ids, so a read of the
  // wrong snapshot finds a crate either way.
  /** @param {string} name @param {number} crateY */
  const world = (name, crateY) => createWorld({
    name,
    bodies: [
      { id: 'walker', x: 0, y: 0.26, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'crate', x: 1, y: crateY, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.3, hy: 0.3, hz: 0.3 },
    ],
    colliders: floor,
  });
  const a = world('a', 0.31);
  const b = world('b', 3);
  const rules = loadIntentRules();
  const tick = createTick({ seed: 1, world: a, rules: rules.rules, retired: rules.retired, memory: createMemory() });
  for (let i = 0; i < 128 && !a.sleeping('crate'); i = i + 1) {
    tick.advance();
  }
  assert.equal(a.sleeping('crate'), true);
  assert.equal(a.holds(), true);
  const saved = a.save();
  // B has loaded and not stepped. Before the fix, B read A's snapshot and
  // said its crate in the air was asleep.
  b.mixLoad(createHasher(), new Set());
  assert.equal(b.holds(), true);
  assert.equal(a.holds(), false);
  assert.throws(() => a.sleeping('crate'), /^Error: sleeping refused: world \d+ \(a\) is not the world the binary holds; the solver holds world \d+\. Load, step, or restore this world first\.$/);
  // The checker refuses a verb aimed at a body of a world it cannot read,
  // with that reason and not 'body is awake'.
  const pick = tick.submit({ kind: 'intent', verb: 'pick-up', actor: 'walker', target: { body: 'crate' }, frameHash: tick.frame().hash });
  assert.deepEqual(pick.admitted ? 'admitted' : pick.reason, 'the solver does not hold this world');
  // A restore puts A back in the binary, and it reads its own snapshot again.
  a.restore(saved);
  assert.equal(a.holds(), true);
  assert.equal(b.holds(), false);
  assert.equal(a.sleeping('crate'), true);
  assert.throws(() => b.sleeping('crate'), /sleeping refused: world \d+ \(b\) is not the world the binary holds/);
  const again = tick.submit({ kind: 'intent', verb: 'pick-up', actor: 'walker', target: { body: 'crate' }, frameHash: tick.frame().hash });
  assert.equal(again.admitted, true, again.admitted ? '' : again.reason);
});

test('each draft admits from its file, and one broken variant of each is refused', () => {
  const scenarios = loadHazards();
  for (const file of ['climb-draft.json', 'pick-up-draft.json', 'drop-draft.json', 'use-draft.json']) {
    const draft = JSON.parse(readFileSync('fixtures/' + file, 'utf8'));
    const admitted = considerDraft(draft, scenarios, bare);
    assert.equal(admitted.ok, true, file + ' ' + (admitted.ok ? '' : admitted.reason));
    const broken = { ...draft, maxRise: 1, effect: draft.effect === 'climb' ? 'drive' : draft.effect };
    if (draft.effect === 'climb') {
      broken.effect = 'climb';
      broken.speed = 9;
    }
    const refused = considerDraft(broken, scenarios, bare);
    assert.equal(refused.ok, false, file);
  }
});

test('a climb reaches a ledge move cannot walk through', () => {
  const rule = compileVerb(JSON.parse(readFileSync('fixtures/climb-draft.json', 'utf8')));
  assert.equal(rule.ok, true);
  if (!rule.ok) {
    return;
  }
  const init = {
    bodies: [{ id: 'walker', x: 0.5, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }],
    colliders: [
      { id: 'floor', minX: -2, maxX: 8, minY: -1, maxY: 0, minZ: -2, maxZ: 2 },
      { id: 'ledge', minX: 1.6, maxX: 4, minY: 0, maxY: 0.8, minZ: -1, maxZ: 1 },
    ],
  };
  const world = createWorld(init);
  const tick = createTick({ seed: 1, world, rules: new Map([['climb', rule.rule], ['move', { verb: 'move', effect: 'drive', speed: 1, maxDistance: 3, requiresClearPath: true, maxQuanta: 256 }]]), memory: createMemory() });
  const blocked = tick.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2.4, z: 0 }, frameHash: tick.frame().hash });
  assert.equal(blocked.admitted, false);
  assert.match(blocked.admitted ? '' : blocked.reason, /ledge/);
  const climb = tick.submit({ kind: 'intent', verb: 'climb', actor: 'walker', target: { x: 2.4, z: 0 }, frameHash: tick.frame().hash });
  assert.equal(climb.admitted, true);
  settle(tick);
  const walker = world.body('walker');
  assert.ok(walker);
  if (!walker) {
    return;
  }
  assert.ok(walker.y > 1, 'the walker stands on the ledge');
  assert.ok(Math.abs(walker.x - 2.4) < 0.05);
});

test('a crate does not cross the carry gap on its own', () => {
  const world = createWorld({
    bodies: [{ id: 'crate', x: 1.725, y: 0.4, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.1, hy: 0.2, hz: 0.1 }],
    colliders: [
      { id: 'near', minX: -2, maxX: 1.6, minY: -1, maxY: 0, minZ: -1, maxZ: 1 },
      { id: 'far', minX: 1.85, maxX: 6, minY: -1, maxY: 0, minZ: -1, maxZ: 1 },
    ],
  });
  for (let i = 0; i < 200; i = i + 1) {
    world.step(new Set());
  }
  const crate = world.body('crate');
  assert.ok(crate);
  if (!crate) {
    return;
  }
  assert.ok(crate.y < 0, 'the crate falls through the gap');
});

test('the verb fixture replays frame for frame', () => {
  const saved = JSON.parse(readFileSync('fixtures/behavior-verbs.json', 'utf8'));
  const catalog = loadIntentRules();
  for (const spec of saved.cases) {
    const played = playVerbs(spec, catalog.rules);
    assert.equal(played.ok, true, spec.name + ' ' + (played.ok ? '' : played.reason));
    if (!played.ok) {
      return;
    }
    assert.deepEqual(played.frames, spec.frames, spec.name);
    assert.deepEqual(played.episodes, spec.episodes, spec.name);
    assert.deepEqual(played.behaviour, spec.behaviour, spec.name + ' behaviour');
  }
  const carryCase = saved.cases.find((/** @type {{ name: string }} */ item) => item.name === 'carry');
  const carry = playVerbs(carryCase, catalog.rules);
  const crate = carry.bodies.find((body) => body.id === 'crate');
  const walker = carry.bodies.find((body) => body.id === 'walker');
  assert.ok(crate && walker);
  if (!crate || !walker) {
    return;
  }
  assert.ok(crate.x > 2 && walker.x > 2, 'the carry finishes on the far side of the gap');
  assert.ok(crate.y > 0.2, 'the crate is set down on the far floor');
});
