import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileVerb } from './compile.js';
import { loadHazards, runHazards } from './suite.js';
import { considerDraft, retireVerb } from './admit.js';
import { createTick } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { FIXTURE_SEED, fixtureWorld } from '../tick/fixture.js';

const index = { rules: ['move.json'], retired: [] };

test('the shipped move rule passes the hazard suite', () => {
  const rule = JSON.parse(readFileSync('predicates/intents/move.json', 'utf8'));
  const scenarios = loadHazards();
  assert.equal(scenarios.length, 4);
  assert.deepEqual(runHazards(rule, scenarios), []);
});

test('push passes the four hazards', () => {
  const rule = JSON.parse(readFileSync('predicates/intents/push.json', 'utf8'));
  assert.equal(rule.targetKind, 'body');
  const scenarios = loadHazards();
  assert.equal(scenarios.length, 4);
  assert.deepEqual(runHazards(rule, scenarios), []);
  const missing = scenarios.map((scenario) => ({ ...scenario, targetBody: undefined }));
  const failures = runHazards(rule, missing);
  assert.equal(failures.length, 4);
  assert.match(failures[0], /no targetBody/);
});

test('the corner clip is a path the centre line clears and the swept body does not', () => {
  const scenario = JSON.parse(readFileSync('predicates/hazards/corner-clip.json', 'utf8'));
  const world = createWorld({ bodies: scenario.bodies, colliders: scenario.colliders });
  const actor = scenario.bodies[0];
  assert.equal(world.segmentHits(actor.x, actor.y, actor.z, scenario.target.x, actor.y, scenario.target.z), null);
  assert.equal(
    world.segmentHits(actor.x, actor.y, actor.z, scenario.target.x, actor.y, scenario.target.z, {
      hx: actor.hx, hy: actor.hy, hz: actor.hz,
    }),
    'pillar',
  );
});

test('compile refuses an extra field and a speed the integrator will not keep', () => {
  const extra = compileVerb({ verb: 'dash', speed: 1, maxDistance: 2, requiresClearPath: true, maxQuanta: 32, code: 'while(1){}' });
  assert.equal(extra.ok, false);
  assert.match(extra.ok ? '' : extra.reason, /unknown field/);
  const fast = compileVerb({ verb: 'dash', speed: 9, maxDistance: 2, requiresClearPath: true, maxQuanta: 32 });
  assert.equal(fast.ok, false);
  assert.match(fast.ok ? '' : fast.reason, /speed/);
});

test('a draft that walks through a collider is not admitted', () => {
  const result = considerDraft(
    { verb: 'phase', speed: 1, maxDistance: 4, requiresClearPath: false, maxQuanta: 64 },
    loadHazards(),
    index,
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? '' : result.reason, /path-through-collider-refuses was admitted/);
  assert.deepEqual(JSON.parse(readFileSync('predicates/intents/index.json', 'utf8')).rules, ['move.json', 'push.json']);
});

test('a draft that keeps the invariants is admitted, and retire takes it back out', () => {
  const result = considerDraft(
    { verb: 'step', speed: 1, maxDistance: 2, requiresClearPath: true, maxQuanta: 64 },
    loadHazards(),
    index,
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.index.rules, ['move.json', 'step.json']);
  const retired = retireVerb(result.index, 'step');
  assert.equal(retired.ok, true);
  if (!retired.ok) {
    return;
  }
  assert.deepEqual(retired.index.rules, ['move.json']);
  assert.deepEqual(retired.index.retired, ['step']);
});

test('play refuses a verb draft, and a retired verb is not a move', () => {
  const catalog = loadIntentRules();
  const tick = createTick({
    seed: FIXTURE_SEED,
    world: createWorld(fixtureWorld()),
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
  const during = tick.submit({
    kind: 'verb',
    rule: { verb: 'step', speed: 1, maxDistance: 2, requiresClearPath: true, maxQuanta: 64 },
  });
  assert.equal(during.admitted, false);
  assert.match(during.admitted ? '' : during.reason, /admitted at load/);
  assert.equal(tick.log().length, 0);

  const later = createTick({
    seed: FIXTURE_SEED,
    world: createWorld(fixtureWorld()),
    rules: catalog.rules,
    retired: new Set(['move']),
    memory: createMemory(),
  });
  const refused = later.submit({
    kind: 'intent',
    verb: 'move',
    actor: 'walker',
    target: { x: 2, z: 0 },
    frameHash: later.frame().hash,
  });
  assert.equal(refused.admitted, false);
  assert.match(refused.admitted ? '' : refused.reason, /retired verb/);
});

test('the tick does not import the hazard suite', () => {
  const tick = readFileSync('packages/tick/tick.js', 'utf8');
  const predicates = readFileSync('packages/tick/predicates.js', 'utf8');
  assert.equal(tick.includes('hazards'), false);
  assert.equal(predicates.includes('hazards'), false);
});
