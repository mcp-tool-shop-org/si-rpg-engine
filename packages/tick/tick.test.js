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
import { createRestorableTick, createTick, settle } from './tick.js';
import { createWorld } from './world.js';
import { createMemory } from './memory.js';
import { loadIntentRules } from './predicates.js';
import { replay } from './replay.js';
import { FIXTURE_SEED, fixtureWorld } from './fixture.js';
import { validateScene } from './scene.js';
import { AUTHORED } from './trust.js';
import { finalPositions } from '../../harness/behaviour.mjs';

function fresh(seed = FIXTURE_SEED, retired = loadIntentRules().retired) {
  return createTick({ seed, world: createWorld(fixtureWorld(), 'reference'), rules: loadIntentRules().rules, retired, memory: createMemory() });
}

/** @param {ReturnType<typeof fresh>} t @param {number} x */
function move(t, x) {
  return t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x, z: 0 }, frameHash: t.frame().hash });
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
  const second = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1.5, z: 0 }, frameHash: t.frame().hash });
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
  const stale = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 3, z: 0 }, frameHash: 'not-the-frame' });
  assert.equal(stale.admitted, false);
  assert.match(/** @type {any} */ (stale).reason, /stale frame/);
  const unknown = t.submit({ kind: 'intent', verb: 'fly', actor: 'walker', target: { x: 3, z: 0 }, frameHash: t.frame().hash });
  assert.equal(unknown.admitted, false);
  assert.match(/** @type {any} */ (unknown).reason, /unknown verb/);
  const far = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 4.5, z: 0 }, frameHash: t.frame().hash });
  assert.equal(far.admitted, false);
  assert.match(/** @type {any} */ (far).reason, /beyond move range/);
  const through = t.submit({ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 3.9, z: 0 }, frameHash: t.frame().hash });
  assert.equal(through.admitted, false);
  assert.match(/** @type {any} */ (through).reason, /path crosses collider wall-right/);
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
  const first = memory.admitBeliefWrite({ kind: 'belief', subject: 's', key: 'k', value: 'v1', confidence: 0.5, source: 'e1' }, AUTHORED);
  assert.ok(first.ok);
  const second = memory.admitBeliefWrite({ kind: 'belief', subject: 's', key: 'k', value: 'v2', confidence: 0.6, source: 'e2', supersedes: 'b1', withdrawnBy: 'e2' }, AUTHORED);
  assert.ok(second.ok);
  assert.equal(memory.beliefs.length, 2);
  assert.equal(memory.beliefs[0].supersededBy, 'b2');
  assert.equal(memory.beliefs[0].withdrawnBy, 'e2');
  const twice = memory.admitBeliefWrite({ kind: 'belief', subject: 's', key: 'k', value: 'v3', confidence: 0.6, source: 'e2', supersedes: 'b1', withdrawnBy: 'e2' }, AUTHORED);
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
  const inWall = t.submit({ kind: 'body', id: 'crate', x: 4.2, y: 1, z: 0, hx: 0.2, hy: 0.2, hz: 0.2 });
  assert.equal(inWall.admitted, false);
  assert.match(/** @type {any} */ (inWall).reason, /overlaps wall-right/);
  const clear = t.submit({ kind: 'body', id: 'crate', x: 3, y: 2, z: 0, hx: 0.2, hy: 0.2, hz: 0.2 });
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

test('save and restore are on the tick its maker asks for, never on the one a host is handed', () => {
  const restorable = createRestorableTick({ seed: FIXTURE_SEED, world: createWorld(fixtureWorld()), rules: loadIntentRules().rules, memory: createMemory() });
  assert.deepEqual(Object.keys(restorable).sort(), ['advance', 'attach', 'frame', 'idle', 'log', 'restore', 'save', 'submit']);
  assert.equal('restore' in fresh(), false, 'the tick a host is handed has no restore');
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
  const again = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: catalog.rules, retired: catalog.retired, log, law: 'reference' });
  assert.ok(again.ok, JSON.stringify(again));
  assert.deepEqual(/** @type {any} */ (again).hashes, log.map((e) => e.hash));
  assert.equal(/** @type {any} */ (again).final, t.frame().hash);
  const wrongSeed = replay({ seed: FIXTURE_SEED + 1, world: fixtureWorld(), rules: catalog.rules, retired: catalog.retired, log, law: 'reference' });
  assert.equal(wrongSeed.ok, false);
  const early = JSON.parse(JSON.stringify(log));
  early[1].tick = 0;
  const outOfOrder = replay({ seed: FIXTURE_SEED, world: fixtureWorld(), rules: catalog.rules, retired: catalog.retired, log: early, law: 'reference' });
  assert.equal(outOfOrder.ok, false);
});

/**
 * @param {string} label
 * @param {unknown[]} bodies
 */
function refusedRecord(label, bodies) {
  const result = validateScene({
    name: label,
    seed: 1,
    bodies,
    colliders: [{ id: 'floor', minX: -1, maxX: 5, minY: -1, maxY: 0, minZ: -1, maxZ: 1 }],
    zones: [],
    goal: {
      actor: 'walker',
      zone: { minX: -1, maxX: 1, minY: -1, maxY: 0, minZ: -1, maxZ: 1 },
    },
  });
  assert.equal(result.ok, false, label);
  if (!result.ok) {
    assert.equal(result.reason, 'a body record is three-dimensional', label);
  }
}

test('the 2D captures stay, and the loader refuses each body record', () => {
  const legacy = JSON.parse(readFileSync('fixtures/legacy-play-log.json', 'utf8'));
  const legacyBody = legacy.entries.map((/** @type {any} */ entry) => entry.proposal).find((/** @type {any} */ proposal) => proposal.kind === 'body');
  refusedRecord('legacy-play-log', [legacyBody]);
  const behavior = JSON.parse(readFileSync('fixtures/behavior-1c.json', 'utf8'));
  refusedRecord('behavior-1c', behavior.world.bodies);
  const pushed = JSON.parse(readFileSync('fixtures/push-play-log.json', 'utf8'));
  refusedRecord('push-play-log', pushed.world.bodies);
  const played = JSON.parse(readFileSync('fixtures/first-scene-played.json', 'utf8'));
  refusedRecord('first-scene-played', played.scene.bodies);
});

/**
 * @param {{ id: string, x: number, y: number, z: number, vx: number, vy: number, vz: number, hx: number, hy: number, hz: number }} crate
 */
function pushWorld(crate) {
  return {
    bodies: [
      { id: 'walker', x: 1, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 },
      crate,
    ],
    colliders: [
      { id: 'floor', minX: -1, maxX: 8, minY: -1, maxY: 0, minZ: -2, maxZ: 4 },
      { id: 'wall-left', minX: -1, maxX: 0, minY: 0, maxY: 4, minZ: -2, maxZ: 4 },
      { id: 'wall-right', minX: 6, maxX: 7, minY: 0, maxY: 4, minZ: -2, maxZ: 4 },
    ],
  };
}

test('push moves the crate at least one unit on x and on z, then the crate rests', () => {
  const catalog = loadIntentRules();
  const alongX = createWorld(pushWorld({ id: 'crate', x: 1.6, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }), 'reference');
  const tick = createTick({ seed: FIXTURE_SEED, world: alongX, rules: catalog.rules, retired: catalog.retired, memory: createMemory() });
  const crateBefore = alongX.body('crate');
  if (!crateBefore) {
    throw new Error('crate');
  }
  const startX = crateBefore.x;
  assert.equal(tick.submit({ kind: 'intent', verb: 'push', actor: 'walker', target: { body: 'crate' }, frameHash: tick.frame().hash }).admitted, true);
  settle(tick);
  const crateX = alongX.body('crate');
  if (!crateX) {
    throw new Error('crate');
  }
  assert.ok(crateX.x - startX >= 1);
  const rested = crateX.x;
  tick.advance();
  assert.equal(crateX.vx, 0);
  assert.equal(crateX.x, rested);

  const alongZ = createWorld(pushWorld({ id: 'crate', x: 1, y: 0.25, z: 0.6, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }), 'reference');
  const zed = createTick({ seed: FIXTURE_SEED, world: alongZ, rules: catalog.rules, retired: catalog.retired, memory: createMemory() });
  const crateZBefore = alongZ.body('crate');
  if (!crateZBefore) {
    throw new Error('crate');
  }
  const startZ = crateZBefore.z;
  assert.equal(zed.submit({ kind: 'intent', verb: 'push', actor: 'walker', target: { body: 'crate' }, frameHash: zed.frame().hash }).admitted, true);
  settle(zed);
  const crateZ = alongZ.body('crate');
  if (!crateZ) {
    throw new Error('crate');
  }
  assert.ok(crateZ.z - startZ >= 1);

  const busy = createTick({
    seed: FIXTURE_SEED,
    world: createWorld(pushWorld({ id: 'crate', x: 1.6, y: 0.25, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 }), 'reference'),
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
  assert.equal(busy.submit({ kind: 'intent', verb: 'move', actor: 'crate', target: { x: 2.5, z: 0 }, frameHash: busy.frame().hash }).admitted, true);
  const pushed = busy.submit({ kind: 'intent', verb: 'push', actor: 'walker', target: { body: 'crate' }, frameHash: busy.frame().hash });
  assert.equal(pushed.admitted, false);
  assert.equal(/** @type {{ reason: string }} */ (pushed).reason, 'target is mid-action');
});

test('an undriven body yields to a driven one, and two undriven bodies split', () => {
  const world = createWorld({
    bodies: [
      { id: 'walker', x: 0, y: 3, z: 0, vx: 1, vy: 0, vz: 0, hx: 0.5, hy: 0.5, hz: 0.5 },
      { id: 'crate', x: 0.8, y: 3, z: 0, vx: 0.4, vy: 0, vz: 0, hx: 0.5, hy: 0.5, hz: 0.5 },
    ],
    colliders: [],
  }, 'reference');
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
      { id: 'a', x: 0, y: 3, z: 0, vx: 0.2, vy: 0, vz: 0, hx: 0.5, hy: 0.5, hz: 0.5 },
      { id: 'b', x: 0.8, y: 3, z: 0, vx: 0.3, vy: 0, vz: 0, hx: 0.5, hy: 0.5, hz: 0.5 },
    ],
    colliders: [],
  }, 'reference');
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
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-'));
  const script = join(dir, 'script.json');
  const log = join(dir, 'log.json');
  writeFileSync(script, JSON.stringify([{ kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2, z: 0 }, frameHash: '@drawn' }]));
  const played = spawnSync(process.execPath, ['packages/tick/bin/play.js', script, '--log', log], { encoding: 'utf8' });
  assert.equal(played.status, 0, played.stderr);
  const saved = JSON.parse(readFileSync(log, 'utf8'));
  assert.ok(Array.isArray(saved.world.bodies) && Array.isArray(saved.world.colliders), 'play wrote its world into the log');
  const again = spawnSync(process.execPath, ['packages/tick/bin/replay.js', log], { encoding: 'utf8' });
  assert.equal(again.status, 0, again.stderr);
  const notALog = spawnSync(process.execPath, ['packages/tick/bin/replay.js', 'fixtures/legacy-play-log.json'], { encoding: 'utf8' });
  assert.equal(notALog.status, 2, 'a capture fixture is refused as not a play log');
});

test('the 3D behavior fixture replays frame for frame', () => {
  const saved = JSON.parse(readFileSync('fixtures/behavior-3d.json', 'utf8'));
  const catalog = loadIntentRules();
  /** @type {{ tick: number; hash: string }[]} */
  const frames = [];
  /** @type {ReadonlyArray<import('../frame/types.js').Body>} */
  let bodies = [];
  const result = replay({
    seed: saved.seed,
    world: saved.world,
    rules: catalog.rules,
    retired: catalog.retired,
    log: saved.log,
    law: 'reference',
    onFrame: (f) => {
      frames.push({ tick: f.tick, hash: f.hash });
      bodies = f.bodies;
    },
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.deepEqual(/** @type {any} */ (result).hashes, saved.log.map((/** @type {any} */ entry) => entry.hash));
  assert.deepEqual(frames, saved.frames, 'every committed frame, quantum for quantum');
  // The reference law has no solver, so no body sleeps; the final positions are the last frame's.
  const reference = createWorld(saved.world, 'reference');
  /** @type {Record<string, null>} */
  const sleep = {};
  for (const body of reference.bodies) {
    assert.equal(reference.sleeping(body.id), false);
    sleep[body.id] = null;
  }
  assert.deepEqual({ sleep, final: finalPositions(bodies) }, saved.behaviour, 'behaviour');
});

test('the replay command replays a host log, which carries a scene instead of a world', () => {
  const scene = JSON.parse(readFileSync('worlds/crate-and-door.json', 'utf8'));
  const catalog = loadIntentRules();
  const t = createTick({ seed: scene.seed, world: createWorld({ bodies: scene.bodies, colliders: scene.colliders }, 'reference'), rules: catalog.rules, retired: catalog.retired, memory: createMemory() });
  for (let i = 0; i < 30; i = i + 1) {
    t.advance();
  }
  assert.ok(t.submit({ kind: 'intent', verb: 'push', actor: 'walker', target: { body: 'crate' }, frameHash: t.frame().hash }).admitted);
  settle(t);
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-'));
  const path = join(dir, 'host-log.json');
  writeFileSync(path, JSON.stringify({ seed: scene.seed, scene, law: 'reference', when: 'goal', log: t.log() }));
  const ran = spawnSync(process.execPath, ['packages/tick/bin/replay.js', path], { encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(ran.stdout, /replay ok: 1 hashes/);
});

test('a walker resting on the floor can still move and push: touching a swept face is not a crossing', () => {
  const scene = JSON.parse(readFileSync('worlds/crate-and-door.json', 'utf8'));
  const world = createWorld({ bodies: scene.bodies, colliders: scene.colliders });
  const pad = { hx: 0.25, hy: 0.25, hz: 0.25 };
  assert.equal(world.segmentHits(1.7, 0.25, 0, 2.7, 0.25, 0, pad), null, 'along the floor at rest');
  assert.equal(world.segmentHits(1.7, 0.25, 0, 2.1, 0.3, 0, pad), null, 'to the near face of the crate at rest');
  assert.equal(world.segmentHits(1.7, 0.25, 0, 1.7, -0.5, 0, pad), 'floor', 'into the floor still crosses');
  assert.equal(world.segmentHits(1.7, 1, 0, 4, 1, 0, pad), 'wall-right', 'into the wall still crosses');
  assert.equal(world.segmentHits(1.7, 1, 0, 3.75, 1, 0, pad), null, 'ending exactly on the swept wall face is touching');
  const catalog = loadIntentRules();
  const t = createTick({ seed: scene.seed, world: createWorld({ bodies: scene.bodies, colliders: scene.colliders }, 'reference'), rules: catalog.rules, retired: catalog.retired, memory: createMemory() });
  let rested = false;
  for (let i = 0; i < 60000 && !rested; i = i + 1) {
    rested = t.advance().bodies[0].y === 0.25;
  }
  assert.ok(rested, 'the walker came fully to rest on the floor');
  const push = t.submit({ kind: 'intent', verb: 'push', actor: 'walker', target: { body: 'crate' }, frameHash: t.frame().hash });
  assert.ok(push.admitted, JSON.stringify(push));
});

test('a body falls and lands on the floor', () => {
  const t = fresh();
  let minY = Infinity;
  let landed = false;
  for (let i = 0; i < 400; i = i + 1) {
    const frame = t.advance();
    const body = frame.bodies[0];
    if (body.y < minY) {
      minY = body.y;
    }
    if (body.y === 0.25 && body.vy > 0) {
      landed = true;
    }
  }
  assert.ok(minY >= 0.25 - 1e-9, 'the box never entered the floor');
  assert.equal(landed, true, 'the centre reached the floor and the landing reflected vy');
});

test('a body slides in x and in z', () => {
  /**
   * @param {ReturnType<typeof fresh>} tick
   */
  function land(tick) {
    for (let i = 0; i < 400; i = i + 1) {
      if (tick.advance().bodies[0].y === 0.25) {
        return;
      }
    }
    throw new Error('the walker did not reach the floor');
  }

  const across = fresh();
  land(across);
  const z0 = across.frame().bodies[0].z;
  assert.equal(across.submit({
    kind: 'intent', verb: 'move', actor: 'walker', target: { x: 2.5, z: 0 }, frameHash: across.frame().hash,
  }).admitted, true);
  settle(across);
  assert.ok(across.frame().bodies[0].x > 2);
  assert.equal(across.frame().bodies[0].z, z0);

  const depth = fresh();
  land(depth);
  const x0 = depth.frame().bodies[0].x;
  assert.equal(depth.submit({
    kind: 'intent', verb: 'move', actor: 'walker', target: { x: x0, z: 1.5 }, frameHash: depth.frame().hash,
  }).admitted, true);
  settle(depth);
  assert.equal(depth.frame().bodies[0].x, x0);
  assert.ok(depth.frame().bodies[0].z > 1);
});

test('a wall stops a body on each ground axis', () => {
  /**
   * @param {'x' | 'z'} axis
   */
  function hit(axis) {
    const body = { id: 'walker', x: 1, y: 3, z: 0, vx: 0, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 };
    /** @type {import('../frame/types.js').StaticCollider} */
    let wall;
    if (axis === 'x') {
      body.x = 1.75;
      body.vx = 2;
      wall = { id: 'wall', minX: 2, maxX: 3, minY: 0, maxY: 4, minZ: -2, maxZ: 2 };
    } else {
      body.z = 1.75;
      body.vz = 2;
      wall = { id: 'wall', minX: -2, maxX: 4, minY: 0, maxY: 4, minZ: 2, maxZ: 3 };
    }
    const world = createWorld({ bodies: [body], colliders: [wall] }, 'reference');
    world.step(new Set(['walker']));
    const after = world.body('walker');
    if (!after) {
      throw new Error('walker');
    }
    if (axis === 'x') {
      assert.ok(after.vx < 0, 'the wall reflected x');
      assert.ok(after.x + after.hx <= 2 + 1e-9, 'the box does not enter the wall');
    } else {
      assert.ok(after.vz < 0, 'the wall reflected z');
      assert.ok(after.z + after.hz <= 2 + 1e-9, 'the box does not enter the wall');
    }
  }
  hit('x');
  hit('z');
});
