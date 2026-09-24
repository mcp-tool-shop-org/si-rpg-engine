// The slice 2 fixture, as phase 0 names it: the quantum, the admit step, a
// body with a collider, a memory-write verb the checker can refuse, and a
// host boundary that draws without deciding. Plus the pump: submit schedules,
// advance runs one quantum, and a log recorded before the pump replays after
// it. Run from the repository root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTick, settle } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { replay } from './replay.js';
import { FIXTURE_SEED, fixtureWorld } from './fixture.js';

function fresh(seed = FIXTURE_SEED, retired = loadIntentRules().retired) {
  return createTick({ seed, world: createWorld(fixtureWorld()), rules: loadIntentRules().rules, retired, memory: createMemory() });
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
  assert.equal(settle(a), ra.quanta);
  assert.equal(settle(b), rb.quanta);
  assert.equal(a.frame().hash, b.frame().hash);
  assert.equal(a.frame().tick, ra.quanta, 'every quantum was committed');
});

test('the pump: submit schedules and does not step; advance runs exactly one quantum', () => {
  const t = fresh();
  const before = t.frame();
  const r = move(t, 3);
  assert.ok(r.admitted);
  assert.equal(r.hash, before.hash, 'the admission names the hash it was admitted against');
  assert.equal(t.frame().tick, 0, 'submit ran no quantum');
  assert.equal(t.idle(), false);
  const f1 = t.advance();
  assert.equal(f1.tick, 1);
  assert.equal(t.frame(), f1);
  assert.notEqual(f1.hash, before.hash);
  assert.equal(t.log()[0].tick, 0);
  assert.equal(t.log()[0].hash, before.hash);
});

test('one action per actor: a second intent while quanta remain is refused with the count', () => {
  const t = fresh();
  const first = move(t, 3);
  assert.ok(first.admitted);
  t.advance();
  const second = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1.5, y: 1 }, frameHash: t.frame().hash });
  assert.equal(second.admitted, false);
  assert.match(/** @type {any} */ (second).reason, /walker is mid-action; \d+ quanta remain/);
  assert.equal(t.log().length, 1, 'the refusal is not recorded');
  settle(t);
  const third = move(t, 1.5);
  assert.ok(third.admitted, 'the actor is free once the action finished');
});

test('idle advance: the world keeps stepping and hashing with nothing scheduled', () => {
  const t = fresh();
  assert.equal(t.idle(), true);
  const h0 = t.frame().hash;
  const f = t.advance();
  assert.equal(f.tick, 1);
  assert.notEqual(f.hash, h0);
  assert.equal(t.idle(), true);
  assert.equal(t.log().length, 0, 'an idle quantum is not an admission');
  const u = fresh();
  u.advance();
  assert.equal(u.frame().hash, f.hash, 'idle quanta are deterministic');
});

test('velocity clears in the advance that completes the action, after that quantum is hashed', () => {
  const t = fresh();
  const r = move(t, 3);
  assert.ok(r.admitted);
  for (let i = 0; i < r.quanta - 1; i = i + 1) {
    t.advance();
    assert.equal(t.idle(), false);
  }
  assert.notEqual(t.frame().bodies[0].vx, 0, 'still moving before the last quantum');
  t.advance();
  assert.equal(t.idle(), true);
  const last = t.frame();
  assert.notEqual(last.bodies[0].vx, 0, 'the last committed frame was hashed with the velocity still set');
  t.advance();
  assert.equal(t.frame().bodies[0].vx, 0, 'cleared before the next quantum stepped');
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
  settle(t);
  assert.ok(minY >= 0.25 - 1e-9, 'the box never entered the floor: min centre y ' + minY);
  assert.ok(t.frame().bodies[0].x > 1, 'the walker moved toward the target');
});

test('the memory-write verb: the checker refuses an uncited belief and admits a cited one', () => {
  const t = fresh();
  const uncited = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'wary', confidence: 0.7, source: 'e99' });
  assert.equal(uncited.admitted, false);
  assert.match(/** @type {any} */ (uncited).reason, /cite an admitted episode/);
  assert.ok(move(t, 2).admitted, 'an admitted intent is the episode');
  settle(t);
  const cited = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'wary', confidence: 0.7, source: 'e1' });
  assert.ok(cited.admitted);
  assert.equal(t.idle(), false, 'a belief write takes one quantum');
  settle(t);
  const noWithdrawal = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'calm', confidence: 0.9, source: 'e1', supersedes: 'b1' });
  assert.equal(noWithdrawal.admitted, false);
  assert.match(/** @type {any} */ (noWithdrawal).reason, /withdrawing episode/);
  const withdrawn = t.submit({ kind: 'belief', subject: 'walker', key: 'mood', value: 'calm', confidence: 0.9, source: 'e2', supersedes: 'b1', withdrawnBy: 'e2' });
  assert.ok(withdrawn.admitted);
  settle(t);
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
  assert.equal(t.idle(), true);
});

test('a body draft is checked by the collider', () => {
  const t = fresh();
  const inWall = t.submit({ kind: 'body', id: 'crate', x: 4.2, y: 1, hw: 0.2, hh: 0.2 });
  assert.equal(inWall.admitted, false);
  assert.match(/** @type {any} */ (inWall).reason, /overlaps wall-right/);
  const clear = t.submit({ kind: 'body', id: 'crate', x: 3, y: 2, hw: 0.2, hh: 0.2 });
  assert.ok(clear.admitted);
  settle(t);
  assert.equal(t.frame().bodies.length, 2);
});

test('the host boundary: frames are frozen, carry no proposal, and a host has no way to write geometry', () => {
  const t = fresh();
  /** @type {import('../frame/types.js').Frame[]} */
  const seen = [];
  t.attach({ draw: (f) => void seen.push(f) });
  move(t, 2);
  settle(t);
  assert.ok(seen.length > 1);
  for (const f of seen) {
    assert.ok(Object.isFrozen(f));
    assert.ok(Object.isFrozen(f.bodies));
    assert.deepEqual(Object.keys(f).sort(), ['bodies', 'hash', 'tick']);
  }
  assert.throws(() => {
    /** @type {any} */ (seen[1].bodies[0]).x = 99;
  });
  assert.deepEqual(Object.keys(t).sort(), ['advance', 'attach', 'frame', 'idle', 'log', 'submit'], 'no method reads a proposal or writes geometry');
});

test('the draw guard: a host that throws is detached, the quantum completes, and other hosts still draw', () => {
  const t = fresh();
  let good = 0;
  let badCalls = 0;
  t.attach({ draw: () => void (good = good + 1) });
  t.attach({
    draw() {
      badCalls = badCalls + 1;
      if (badCalls === 2) {
        throw new Error('window closed');
      }
    },
  });
  const r = move(t, 2);
  assert.ok(r.admitted);
  const u = fresh();
  move(u, 2);
  for (let i = 0; i < r.quanta; i = i + 1) {
    t.advance();
    u.advance();
  }
  assert.equal(t.frame().hash, u.frame().hash, 'a throwing host did not change the law');
  assert.equal(badCalls, 2, 'the bad host was detached after it threw');
  assert.equal(good, 1 + r.quanta, 'the good host saw the attach frame and every quantum');
  const v = fresh();
  v.attach({
    draw() {
      throw new Error('never');
    },
  });
  assert.equal(v.advance().tick, 1, 'a host that throws on attach is not attached and the tick still steps');
});

test('replay: the seed and the admitted-input log reproduce every hash without the model, with gaps between admissions', () => {
  const t = fresh();
  assert.ok(move(t, 2.5).admitted);
  settle(t);
  t.advance();
  t.advance();
  assert.ok(t.submit({ kind: 'belief', subject: 'walker', key: 'goal', value: 'east', confidence: 0.8, source: 'e1' }).admitted);
  settle(t);
  assert.ok(move(t, 1.5).admitted);
  settle(t);
  /** @type {import('../frame/types.js').LogEntry[]} */
  const log = JSON.parse(JSON.stringify(t.log()));
  assert.ok(log[1].tick > log[0].tick + 1, 'the log records the tick of admission across the idle gap');
  const catalog = loadIntentRules();
  const again = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: catalog.rules, retired: catalog.retired, log });
  assert.ok(again.ok, JSON.stringify(again));
  assert.deepEqual(/** @type {any} */ (again).hashes, log.map((e) => e.hash));
  assert.equal(/** @type {any} */ (again).final, t.frame().hash);
  const wrongSeed = replay({ seed: FIXTURE_SEED + 1, world: fixtureWorld(), rules: catalog.rules, retired: catalog.retired, log });
  assert.equal(wrongSeed.ok, false);
  const early = JSON.parse(JSON.stringify(log));
  early[1].tick = 0;
  const outOfOrder = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: catalog.rules, retired: catalog.retired, log: early });
  assert.equal(outOfOrder.ok, false);
});

test('the legacy fixture: admissions match, and frames match until the walker meets the crate', () => {
  const legacy = JSON.parse(readFileSync('fixtures/legacy-play-log.json', 'utf8'));
  const catalog = loadIntentRules();
  /** @type {{ tick: number; hash: string }[]} */
  const frames = [];
  const log = legacy.entries.map((/** @type {any} */ e) => ({ tick: e.tick, proposal: e.proposal, hash: e.hash }));
  const result = replay({
    seed: legacy.seed,
    world: fixtureWorld(),
    rules: catalog.rules,
    retired: catalog.retired,
    log,
    onFrame: (f) => void frames.push({ tick: f.tick, hash: f.hash }),
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(/** @type {any} */ (result).hashes, legacy.entries.map((/** @type {any} */ e) => e.hash));
  // Tick 238 is where the walker first meets the crate this log spawned.
  // Contact moves that crate. Every frame before the meeting matches.
  assert.equal(frames.length, legacy.frames.length);
  for (let i = 0; i < 238; i = i + 1) {
    assert.equal(frames[i].hash, legacy.frames[i].hash);
  }
  assert.notEqual(frames[238].hash, legacy.frames[238].hash);
});

test('push moves the crate at least one unit, then the crate rests, and the log replays', () => {
  const saved = JSON.parse(readFileSync('fixtures/push-play-log.json', 'utf8'));
  const catalog = loadIntentRules();
  const result = replay({
    seed: saved.seed,
    world: saved.world,
    rules: catalog.rules,
    retired: catalog.retired,
    log: saved.log,
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(/** @type {{ final: string }} */ (result).final, saved.final);

  const world = createWorld(saved.world);
  const tick = createTick({
    seed: saved.seed,
    world,
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
  const crate0 = world.body('crate');
  if (!crate0) {
    throw new Error('crate');
  }
  const start = crate0.x;
  const admission = tick.submit({
    kind: 'intent',
    verb: 'push',
    actor: 'walker',
    target: { body: 'crate' },
    frameHash: tick.frame().hash,
  });
  assert.equal(admission.admitted, true);
  settle(tick);
  const pushedCrate = world.body('crate');
  if (!pushedCrate) {
    throw new Error('crate');
  }
  assert.ok(pushedCrate.x - start >= 1);
  const rested = pushedCrate.x;
  tick.advance();
  assert.equal(pushedCrate.vx, 0);
  assert.equal(pushedCrate.x, rested);

  const busy = createTick({
    seed: saved.seed,
    world: createWorld(saved.world),
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
  const move = busy.submit({
    kind: 'intent',
    verb: 'move',
    actor: 'crate',
    target: { x: 2.5, y: 1 },
    frameHash: busy.frame().hash,
  });
  assert.equal(move.admitted, true);
  const pushed = busy.submit({
    kind: 'intent',
    verb: 'push',
    actor: 'walker',
    target: { body: 'crate' },
    frameHash: busy.frame().hash,
  });
  assert.equal(pushed.admitted, false);
  assert.equal(/** @type {{ reason: string }} */ (pushed).reason, 'target is mid-action');
});

test('an undriven body yields to a driven one, and two undriven bodies split', () => {
  const world = createWorld({
    bodies: [
      { id: 'walker', x: 0, y: 3, vx: 1, vy: 0, hw: 0.5, hh: 0.5 },
      { id: 'crate', x: 0.8, y: 3, vx: 0.4, vy: 0, hw: 0.5, hh: 0.5 },
    ],
    colliders: [],
  });
  const beforeBody = world.body('crate');
  if (!beforeBody) {
    throw new Error('crate');
  }
  const before = beforeBody.x;
  world.step(new Set(['walker']));
  const crate = world.body('crate');
  const walker = world.body('walker');
  if (!crate || !walker) {
    throw new Error('pair');
  }
  assert.ok(crate.x > before);
  assert.equal(crate.vx, walker.vx);
  assert.equal(walker.x, 0 + 1 / 64);

  const pair = createWorld({
    bodies: [
      { id: 'a', x: 0, y: 3, vx: 0.2, vy: 0, hw: 0.5, hh: 0.5 },
      { id: 'b', x: 0.8, y: 3, vx: 0.3, vy: 0, hw: 0.5, hh: 0.5 },
    ],
    colliders: [],
  });
  pair.step(new Set());
  const a = pair.body('a');
  const b = pair.body('b');
  if (!a || !b) {
    throw new Error('pair');
  }
  assert.equal(a.vx, 0);
  assert.equal(b.vx, 0);
  assert.ok(b.x - a.x > 0.8);
});

test('the replay command honors the world a log carries, and a play log carries one', () => {
  const pushed = spawnSync(process.execPath, ['packages/tick/bin/replay.js', 'fixtures/push-play-log.json'], { encoding: 'utf8' });
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.match(pushed.stdout, /replay ok/);
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-'));
  const script = join(dir, 'script.json');
  const log = join(dir, 'log.json');
  writeFileSync(script, JSON.stringify([{ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, y: 1 }, frameHash: '@drawn' }]));
  const played = spawnSync(process.execPath, ['packages/tick/bin/play.js', script, '--log', log], { encoding: 'utf8' });
  assert.equal(played.status, 0, played.stderr);
  const saved = JSON.parse(readFileSync(log, 'utf8'));
  assert.ok(Array.isArray(saved.world.bodies) && Array.isArray(saved.world.colliders), 'play wrote its world into the log');
  const again = spawnSync(process.execPath, ['packages/tick/bin/replay.js', log], { encoding: 'utf8' });
  assert.equal(again.status, 0, again.stderr);
  const notALog = spawnSync(process.execPath, ['packages/tick/bin/replay.js', 'fixtures/legacy-play-log.json'], { encoding: 'utf8' });
  assert.equal(notALog.status, 2, 'a capture fixture is refused as not a play log');
});

test('the 1C behavior fixture: a walker pushing a crate replays frame for frame', () => {
  const saved = JSON.parse(readFileSync('fixtures/behavior-1c.json', 'utf8'));
  const catalog = loadIntentRules();
  /** @type {{ tick: number; hash: string }[]} */
  const frames = [];
  const log = saved.entries.map((/** @type {any} */ e) => ({ tick: e.tick, proposal: e.proposal, hash: e.hash }));
  const result = replay({
    seed: saved.seed,
    world: saved.world,
    rules: catalog.rules,
    retired: catalog.retired,
    log,
    onFrame: (f) => void frames.push({ tick: f.tick, hash: f.hash }),
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(/** @type {any} */ (result).hashes, saved.entries.map((/** @type {any} */ e) => e.hash));
  assert.deepEqual(frames.slice(0, saved.frames.length), saved.frames, 'every committed frame, quantum for quantum');
});

test('the replay command replays a host log, which carries a scene instead of a world', () => {
  const scene = JSON.parse(readFileSync('scenes/crate-and-door.json', 'utf8'));
  const catalog = loadIntentRules();
  const t = createTick({ seed: scene.seed, world: createWorld({ bodies: scene.bodies, colliders: scene.colliders }), rules: catalog.rules, retired: catalog.retired, memory: createMemory() });
  for (let i = 0; i < 30; i = i + 1) {
    t.advance();
  }
  assert.ok(t.submit({ kind: 'intent', verb: 'push', actor: 'walker', target: { body: 'crate' }, frameHash: t.frame().hash }).admitted);
  settle(t);
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-'));
  const path = join(dir, 'host-log.json');
  writeFileSync(path, JSON.stringify({ seed: scene.seed, scene, when: 'goal', log: t.log() }));
  const ran = spawnSync(process.execPath, ['packages/tick/bin/replay.js', path], { encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(ran.stdout, /replay ok: 1 hashes/);
});
