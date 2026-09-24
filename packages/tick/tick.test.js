// The slice 2 fixture, as phase 0 names it: the quantum, the admit step, a
// body with a collider, a memory-write verb the checker can refuse, and a
// host boundary that draws without deciding. Run from the repository root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTick } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { replay } from './replay.js';
import { FIXTURE_SEED, fixtureWorld } from './fixture.js';

function fresh(seed = FIXTURE_SEED) {
  return createTick({ seed, world: createWorld(fixtureWorld()), rules: loadIntentRules(), memory: createMemory() });
}

/** @param {ReturnType<typeof fresh>} t @param {number} x */
function move(t, x) {
  return t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x, y: 1 }, frameHash: t.frame().hash });
}

test('the quantum: same seed and inputs give the same hash, a different seed does not', () => {
  const a = fresh();
  const b = fresh();
  const c = fresh(FIXTURE_SEED + 1);
  assert.equal(a.frame().hash, b.frame().hash);
  assert.notEqual(a.frame().hash, c.frame().hash);
  const ra = move(a, 3);
  const rb = move(b, 3);
  assert.ok(ra.admitted && rb.admitted);
  assert.equal(ra.hash, rb.hash);
  assert.ok(ra.quanta > 1, 'an action spans quanta');
  assert.equal(a.frame().tick, ra.quanta, 'every quantum was committed');
});

test('the admit step: the predicate refuses an unknown verb, a stale frame, and a path through a wall', () => {
  const t = fresh();
  const stale = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 3, y: 1 }, frameHash: 'not-the-frame' });
  assert.equal(stale.admitted, false);
  assert.match(/** @type {any} */ (stale).reason, /stale frame/);
  const unknown = t.submit({ kind: 'intent', verb: 'fly', actor: 'walker', target: { x: 3, y: 1 }, frameHash: t.frame().hash });
  assert.equal(unknown.admitted, false);
  assert.match(/** @type {any} */ (unknown).reason, /unknown verb/);
  const far = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 4.5, y: 1 }, frameHash: t.frame().hash });
  assert.equal(far.admitted, false);
  assert.match(/** @type {any} */ (far).reason, /beyond move range/);
  const through = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1, y: -0.5 }, frameHash: t.frame().hash });
  assert.equal(through.admitted, false);
  assert.match(/** @type {any} */ (through).reason, /path crosses collider floor/);
  assert.equal(t.log().length, 0, 'a refusal is not recorded');
});

test('a body with a collider: the walker settles on the floor and never passes it', () => {
  const t = fresh();
  let minY = Infinity;
  t.attach({
    draw(frame) {
      if (frame.bodies[0].y < minY) {
        minY = frame.bodies[0].y;
      }
    },
  });
  const r = move(t, 3);
  assert.ok(r.admitted);
  assert.ok(minY >= 0.25 - 1e-9, 'the box never entered the floor: min centre y ' + minY);
  assert.ok(t.frame().bodies[0].x > 1, 'the walker moved toward the target');
});

test('the memory-write verb: the checker refuses an uncited belief and admits a cited one', () => {
  const t = fresh();
  const uncited = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'wary', confidence: 0.7, source: 'e99' });
  assert.equal(uncited.admitted, false);
  assert.match(/** @type {any} */ (uncited).reason, /cite an admitted episode/);
  assert.ok(move(t, 2).admitted, 'an admitted intent is the episode');
  const cited = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'wary', confidence: 0.7, source: 'e1' });
  assert.ok(cited.admitted);
  const noWithdrawal = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'calm', confidence: 0.9, source: 'e1', supersedes: 'b1' });
  assert.equal(noWithdrawal.admitted, false);
  assert.match(/** @type {any} */ (noWithdrawal).reason, /withdrawing episode/);
  const withdrawn = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'calm', confidence: 0.9, source: 'e2', supersedes: 'b1', withdrawnBy: 'e2' });
  assert.ok(withdrawn.admitted);
  assert.equal(t.log().length, 3, 'three admissions were recorded');
});

test('supersession is a tombstone, not a delete', () => {
  const memory = createMemory();
  memory.recordEpisode(0, 'intent', 'seed');
  memory.recordEpisode(1, 'intent', 'withdraw');
  const first = memory.admitBeliefWrite({ kind: 'belief', subject: 's', key: 'k', value: 'v1', confidence: 0.5, source: 'e1' });
  assert.ok(first.ok);
  const second = memory.admitBeliefWrite({ kind: 'belief', subject: 's', key: 'k', value: 'v2', confidence: 0.6, source: 'e2', supersedes: 'b1', withdrawnBy: 'e2' });
  assert.ok(second.ok);
  assert.equal(memory.beliefs.length, 2);
  assert.equal(memory.beliefs[0].supersededBy, 'b2');
  assert.equal(memory.beliefs[0].withdrawnBy, 'e2');
  const twice = memory.admitBeliefWrite({ kind: 'belief', subject: 's', key: 'k', value: 'v3', confidence: 0.6, source: 'e2', supersedes: 'b1', withdrawnBy: 'e2' });
  assert.equal(twice.ok, false);
});

test('a spoken line is refused: slice 2 has no gate, and the line is never hashed', () => {
  const t = fresh();
  const before = t.frame().hash;
  const r = t.submit({ kind: 'line', speaker: 'walker', text: 'I was never here.' });
  assert.equal(r.admitted, false);
  assert.equal(t.frame().hash, before);
});

test('a body draft is checked by the collider', () => {
  const t = fresh();
  const inWall = t.submit({ kind: 'body', id: 'crate', x: 4.2, y: 1, hw: 0.2, hh: 0.2 });
  assert.equal(inWall.admitted, false);
  assert.match(/** @type {any} */ (inWall).reason, /overlaps wall-right/);
  const clear = t.submit({ kind: 'body', id: 'crate', x: 3, y: 2, hw: 0.2, hh: 0.2 });
  assert.ok(clear.admitted);
  assert.equal(t.frame().bodies.length, 2);
});

test('the host boundary: frames are frozen, carry no proposal, and a host has no way to write geometry', () => {
  const t = fresh();
  /** @type {import('../frame/types.js').Frame[]} */
  const seen = [];
  t.attach({ draw: (f) => void seen.push(f) });
  move(t, 2);
  assert.ok(seen.length > 1);
  for (const f of seen) {
    assert.ok(Object.isFrozen(f));
    assert.ok(Object.isFrozen(f.bodies));
    assert.deepEqual(Object.keys(f).sort(), ['bodies', 'hash', 'tick']);
  }
  assert.throws(() => {
    /** @type {any} */ (seen[1].bodies[0]).x = 99;
  });
  assert.deepEqual(Object.keys(t).sort(), ['attach', 'frame', 'log', 'submit'], 'no method reads a proposal or writes geometry');
});

test('replay: the seed and the admitted-input log reproduce every hash without the model', () => {
  const t = fresh();
  assert.ok(move(t, 2.5).admitted);
  assert.ok(t.submit({ kind: 'belief', subject: 'walker', key: 'goal', value: 'east', confidence: 0.8, source: 'e1' }).admitted);
  assert.ok(move(t, 1.5).admitted);
  /** @type {import('../frame/types.js').LogEntry[]} */
  const log = JSON.parse(JSON.stringify(t.log()));
  const again = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: loadIntentRules(), log });
  assert.ok(again.ok, JSON.stringify(again));
  assert.deepEqual(/** @type {any} */ (again).hashes, log.map((e) => e.hash));
  const wrongSeed = replay({ seed: FIXTURE_SEED + 1, world: fixtureWorld(), rules: loadIntentRules(), log });
  assert.equal(wrongSeed.ok, false);
});
