import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHasher } from '../frame/hash.js';
import { instantiate } from '../../solver/dist/solver.mjs';
import { createTick } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { loadScene, validateScene } from './scene.js';
import { playMinds, replayMinds } from '../../harness/minds-scene.mjs';

instantiate();

const scene = JSON.parse(readFileSync('worlds/crate-and-door.json', 'utf8'));

/**
 * @param {Record<string, unknown>} [patch]
 */
function minded(patch) {
  return validateScene({ ...scene, ...patch });
}

const mind = {
  body: 'walker',
  sight: 3,
  goals: [
    { kind: 'reach', zone: 'door' },
    { kind: 'use', target: 'crate' },
  ],
  beliefs: [{
    subject: { body: 'crate' },
    key: 'at',
    value: 'door',
    confidence: 1,
    source: 'e1',
  }],
};

/**
 * @param {unknown} value
 */
function reason(value) {
  const result = /** @type {{ ok: boolean, reason?: string }} */ (value);
  assert.equal(result.ok, false);
  return result.reason || '';
}

test('a mind loads from the file, and a world without one is unchanged', () => {
  const loaded = loadScene('worlds/crate-and-door.json');
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  assert.equal(loaded.scene.minds, undefined);
  const accepted = minded({ minds: [mind] });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) {
    return;
  }
  assert.equal(accepted.scene.minds && accepted.scene.minds.length, 1);
  /**
   * @param {ReturnType<typeof createWorld>} world
   */
  function hash(world) {
    const hasher = createHasher();
    world.mixLoad(hasher, new Set());
    return hasher.digest();
  }
  const bare = createWorld(loaded.scene);
  const empty = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ ({ ...loaded.scene, minds: [] }));
  const withMind = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ ({ ...loaded.scene, minds: [mind] }));
  assert.equal(hash(empty), hash(bare));
  assert.notEqual(hash(withMind), hash(bare));
  const catalog = loadIntentRules();
  const memory = createMemory();
  const fresh = createWorld(/** @type {Parameters<typeof createWorld>[0]} */ ({ ...loaded.scene, minds: [mind] }));
  createTick({ seed: loaded.scene.seed, world: fresh, rules: catalog.rules, memory });
  assert.equal(memory.episodes[0].detail, 'load crate-and-door');
  assert.equal(memory.mindBeliefs('walker')[0].source, memory.episodes[0].id);
  assert.equal(memory.mindBeliefs('walker')[0].key, 'at');
});

test('load refuses a mind, a belief, or a goal that the file did not earn', () => {
  const cases = [
    [{ ...mind, body: 'walker' }, { ...mind, body: 'walker' }],
    [{ ...mind, body: 'ghost' }],
    [{ ...mind, extra: true }],
    [{ ...mind, sight: 0 }],
    [{ ...mind, sight: Number.POSITIVE_INFINITY }],
    [{ ...mind, goals: 'north' }],
    [{ ...mind, beliefs: 'some' }],
    [{ ...mind, goals: [{ kind: 'fly', zone: 'door' }] }],
    [{ ...mind, goals: [{ kind: 'reach', zone: 'door', extra: 1 }] }],
    [{ ...mind, goals: [{ kind: 'reach', zone: 'attic' }] }],
    [{ ...mind, goals: [{ kind: 'use', target: 'bell' }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], source: 'e9' }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], key: 'mood' }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], subject: { zone: 'door' } }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], subject: { body: 'ghost' } }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], key: 'seen', value: 'yesterday' }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], key: 'holds', value: 'bell' }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], key: 'at', value: 'attic' }] }],
    [{ ...mind, beliefs: [{ subject: { zone: 'door' }, key: 'contains', value: 'ghost', confidence: 1, source: 'e1' }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], confidence: 2 }] }],
    [{ ...mind, beliefs: [{ ...mind.beliefs[0], note: 'free' }] }],
  ];
  const expected = [
    /a body has two minds: walker/,
    /mind names no body: ghost/,
    /unknown field: extra/,
    /sight must be a finite number above 0/,
    /sight must be a finite number above 0/,
    /goals must be a list/,
    /beliefs must be a list/,
    /unknown goal kind: fly/,
    /unknown field: extra/,
    /reach goal names no zone: attic/,
    /use goal names nothing: bell/,
    /authored belief source must be the load episode/,
    /unknown belief key: mood/,
    /belief at applies to a body/,
    /belief subject names no body: ghost/,
    /belief seen value must be a tick/,
    /belief holds value must be a body/,
    /belief at value must be a zone/,
    /belief contains value must be a body/,
    /confidence must be a number in \[0, 1\]/,
    /unknown field: note/,
  ];
  assert.equal(cases.length, expected.length);
  for (let i = 0; i < cases.length; i = i + 1) {
    assert.match(reason(minded({ minds: cases[i] })), expected[i], String(i));
  }
  assert.match(reason(minded({ minds: { body: 'walker' } })), /minds must be a list/);
});

test('a named belief uses the key table, and a missing mind is refused', () => {
  const catalog = loadIntentRules();
  const world = createWorld({
    name: 'pair',
    bodies: [
      { id: 'watcher', x: 0, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      { id: 'walker', x: 1, y: 0.3, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
    ],
    colliders: [{ id: 'floor', minX: -2, maxX: 4, minY: -1, maxY: 0, minZ: -2, maxZ: 2 }],
    minds: [{ body: 'watcher', sight: 5, goals: [], beliefs: [] }],
  });
  const memory = createMemory();
  const tick = createTick({ seed: 3, world, rules: catalog.rules, memory });
  tick.advance();
  const before = memory.episodes.length;
  tick.advance();
  assert.equal(memory.episodes.length, before, 'nothing changes, so nothing is written');
  const sees = memory.episodes.filter((episode) => episode.detail.startsWith('see watcher walker'));
  assert.equal(sees.length, 1);
  const missing = tick.submit({
    kind: 'belief', mind: 'ghost', subject: { body: 'walker' }, key: 'at', value: 'none', confidence: 1, source: 'e1',
  });
  assert.equal(missing.admitted, false);
  assert.match(missing.admitted ? '' : missing.reason, /no mind named ghost/);
  const unknown = tick.submit({
    kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'mood', value: 'wary', confidence: 1, source: 'e1',
  });
  assert.equal(unknown.admitted, false);
  assert.match(unknown.admitted ? '' : unknown.reason, /unknown belief key: mood/);
  const typed = tick.submit({
    kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'seen', value: 'yesterday', confidence: 1, source: 'e1',
  });
  assert.equal(typed.admitted, false);
  assert.match(typed.admitted ? '' : typed.reason, /belief seen value must be a tick/);
  const at = memory.mindBeliefs('watcher').find((item) => item.key === 'at' && !item.supersededBy);
  assert.ok(at);
  if (!at) {
    return;
  }
  const stale = tick.submit({
    kind: 'belief', mind: 'watcher', subject: { body: 'walker' }, key: 'at', value: 'none', confidence: 1,
    source: 'e1', supersedes: at.id, withdrawnBy: 'e1',
  });
  assert.equal(stale.admitted, false);
  assert.match(stale.admitted ? '' : stale.reason, /stale: e1 is older than /);
  assert.match(stale.admitted ? '' : stale.reason, new RegExp(at.source));
});

test('older evidence cannot replace a newer unscoped belief', () => {
  const memory = createMemory();
  memory.recordEpisode(2, 'intent', 'newer');
  memory.recordEpisode(0, 'intent', 'older');
  const first = memory.admitBeliefWrite({ kind: 'belief', subject: 's', key: 'k', value: 'v1', confidence: 0.5, source: 'e1' });
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  const stale = memory.admitBeliefWrite({
    kind: 'belief', subject: 's', key: 'k', value: 'v2', confidence: 0.6, source: 'e2', supersedes: first.belief.id, withdrawnBy: 'e2',
  });
  assert.equal(stale.ok, false);
  if (stale.ok) {
    return;
  }
  assert.match(stale.reason, /stale: e2 is older than e1/);
  assert.equal(memory.beliefs.length, 1);
});

test('the minds fixture replays frame for frame, and the log rebuilds the record', () => {
  const saved = JSON.parse(readFileSync('fixtures/behavior-minds.json', 'utf8'));
  const catalog = loadIntentRules();
  const played = playMinds(saved, catalog.rules);
  if (!played.ok) {
    throw new Error(played.reason);
  }
  assert.deepEqual(played.frames, saved.frames);
  assert.deepEqual(played.episodes, saved.episodes);
  assert.deepEqual(played.beliefs, saved.beliefs);
  assert.deepEqual(played.goals, saved.goals);
  assert.deepEqual(played.reasons, saved.reasons);
  const walker = played.episodes.filter((episode) => episode.detail.startsWith('see watcher walker'));
  assert.deepEqual(walker.map((episode) => episode.detail), [
    'see watcher walker west',
    'see watcher walker east',
    'see watcher walker none',
  ]);
  const crate = played.episodes.filter((episode) => episode.detail.startsWith('see watcher crate'));
  assert.deepEqual(crate.map((episode) => episode.detail), [
    'see watcher crate west',
    'see watcher crate east',
    'see watcher crate none',
  ]);
  assert.equal(played.episodes.filter((episode) => episode.detail === 'goal-met watcher 0').length, 1);
  assert.equal(played.episodes.filter((episode) => episode.detail === 'goal-met watcher 1').length, 1);
  assert.equal(played.episodes.some((episode) => episode.detail.includes('shade')), false);
  const left = crate[crate.length - 1];
  assert.equal(played.episodes.some((episode) => episode.tick > left.tick && episode.detail.startsWith('see ')), false);
  const live = played.beliefs[0].beliefs.find((item) => item.subject === 'body:crate' && item.key === 'seen' && item.supersededBy === null);
  assert.ok(live);
  if (!live) {
    return;
  }
  assert.equal(live.value, left.tick);
  assert.equal(live.source, left.id);
  /** @type {Set<string>} */
  const once = new Set();
  for (const episode of played.episodes) {
    if (!episode.detail.startsWith('see ')) {
      continue;
    }
    const parts = episode.detail.split(' ');
    const key = episode.tick + ' ' + parts[1] + ' ' + parts[2];
    assert.equal(once.has(key), false, key);
    once.add(key);
  }
  const rebuilt = replayMinds(saved, catalog.rules, saved.log);
  if (!rebuilt.ok) {
    throw new Error(rebuilt.reason);
  }
  assert.deepEqual(rebuilt.episodes, played.episodes);
  assert.deepEqual(rebuilt.beliefs, played.beliefs);
  assert.deepEqual(rebuilt.goals, played.goals);
});
