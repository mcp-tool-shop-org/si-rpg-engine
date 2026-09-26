// F3 and F5, the character's push (docs/dispatch-f3-character-push.md,
// docs/dispatch-f5-push-mass.md).
//
// After a character moves, the law pushes the dynamic bodies it touched. It
// does so through the engine's copy of Rapier's impulse routine,
// solver/src/impulses.rs, with two changes. Each dynamic collider's contact
// manifolds are gathered into a vec of their own, as Rapier's #1004 does
// (F3): at rapier3d-f64 0.35.3 every collider in range shared one vec, and
// when two dynamic bodies were near the character the second overwrote the
// first's manifold. Each contact point's impulse is sized with the effective
// mass at the point, which counts the turn the impulse gives the body (F5):
// Rapier's ratio counts the body's linear mass alone (dimforge/rapier#1020),
// and a push off the centre of a light body overshoots.
//
// The red worlds, fixtures/push/. Red room A (F3 pin 5): on main at 5d6bbea
// the crate first exceeds 10 units a second at tick 53, at
// 26.06416630354704, with frame hash 375c78856a5a4b15. The thin box (F5 pin
// 3): on main at 29e1c52 the walker reaches the box at tick 29 and it leaves
// at 40.94123133916884, frame hash 8f201d064bb90bea. On main at 29e1c52 red
// room A's shade also moves at 2.0535 at tick 50. Here each run ends at the
// frame hash its file records.
//
// The room's bound. Every body of every fixture with a push is held, at
// every quantum, to ROOM_MULTIPLE times the push's speed. This is not the
// push guard. The push guard is PUSH_MULTIPLE in solver/src/rapier_law.rs,
// 1.5 times the speed of the character whose plan pushed the body, and it
// measures only the bodies a push changed, as the push leaves them and after
// the step, which only the law's own pass can see. The room's bound covers
// every body after every step, a body falling as it topples among them: the
// thin box, pushed until it tips over, falls at 1.5509 times the push's speed
// at tick 134. So it sits at two, above the push guard's multiple, and both
// reds on main exceed it.
//
// The law runs: fixtures/law-runs/ must be what the tick hands the solver,
// recorded again from this build by harness/law-runs.mjs. The native control
// test and the native guard replay those files, so this is what makes them
// measure the product's own runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { recordRun, withBundles } from './bundle.mjs';
import { pushFixtures, pushRun, staleLawRuns } from './law-runs.mjs';

/**
 * The room's bound: how many times the push's speed any body in a fixture
 * with a push may move at, at any quantum. Not the push guard (see above).
 */
const ROOM_MULTIPLE = 2;

/** The push verb's speed, which the tick gives the pushing actor. */
function pushSpeed() {
  const rule = loadIntentRules().rules.get('push');
  if (!rule) {
    throw new Error('no push rule');
  }
  return rule.speed;
}

test('the room\'s bound is its own: the thin box\'s room holds a fall faster than the push guard\'s multiple, PUSH_MULTIPLE in solver/src/rapier_law.rs, allows', () => {
  const source = readFileSync('solver/src/rapier_law.rs', 'utf8');
  const found = source.match(/const PUSH_MULTIPLE: f64 = ([0-9.]+);/);
  assert.ok(found, 'solver/src/rapier_law.rs states no PUSH_MULTIPLE');
  const guard = Number(found[1]);
  // Every pushed body is in the room after the step, so a room's bound under
  // the push guard's multiple would be the push guard, and it is not.
  assert.ok(ROOM_MULTIPLE > guard, 'the room\'s bound ' + ROOM_MULTIPLE + ' is not above the push guard\'s ' + guard);
  // The two bound different populations, so one constant cannot serve both.
  // The thin box, pushed until it tips over, falls at tick 134 faster than
  // the push guard allows, where no push touches it: the native guard passes
  // the run, and a room's bound at the push guard's multiple would fail it.
  const fixture = pushFixtures().find((f) => f.name === 'push-mass-thin-box');
  assert.ok(fixture, 'no thin box in fixtures/push/');
  if (!fixture) {
    return;
  }
  const run = pushRun(fixture);
  let fastest = { id: '', speed: 0, tick: 0 };
  for (let q = 0; q < fixture.quanta; q = q + 1) {
    const frame = run.advance();
    for (const body of run.world.bodies) {
      const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy + body.vz * body.vz);
      if (speed > fastest.speed) {
        fastest = { id: body.id, speed, tick: frame.tick };
      }
    }
  }
  assert.deepEqual({ id: fastest.id, tick: fastest.tick }, { id: 'box', tick: 134 }, 'the thin box\'s room is fastest elsewhere than the box\'s fall');
  assert.ok(fastest.speed > guard * pushSpeed(), 'the box falls at ' + fastest.speed + ', within the push guard\'s ' + guard + ' times the push\'s speed');
  assert.ok(fastest.speed <= ROOM_MULTIPLE * pushSpeed());
});

test('fixtures/push/ holds red room A and the thin box, and each fixture\'s log is its script as the tick admitted it', () => {
  const fixtures = pushFixtures();
  for (const name of ['red-room-a', 'push-mass-thin-box']) {
    assert.ok(fixtures.some((f) => f.name === name), 'no ' + name + ' in fixtures/push/');
  }
  for (const fixture of fixtures) {
    assert.equal(fixture.log.length, fixture.script.length, fixture.name);
    fixture.script.forEach((entry, i) => {
      const logged = fixture.log[i];
      const proposal = /** @type {{ kind: string, verb?: string, actor?: string, target?: unknown, frameHash?: string }} */ (/** @type {unknown} */ (logged.proposal));
      assert.equal(logged.tick, entry.tick, fixture.name + ' entry ' + i);
      assert.equal(proposal.frameHash, logged.hash, fixture.name + ' entry ' + i);
      assert.deepEqual(Object.keys(proposal).sort(), ['actor', 'frameHash', 'kind', 'target', 'verb'], fixture.name + ' entry ' + i);
      assert.deepEqual(
        { kind: proposal.kind, verb: proposal.verb, actor: proposal.actor, target: proposal.target },
        { kind: entry.kind, verb: entry.verb, actor: entry.actor, target: entry.target },
        fixture.name + ' entry ' + i,
      );
    });
    assert.ok(fixture.script.some((entry) => entry.verb === 'push'), fixture.name + ' has no push');
  }
});

for (const fixture of pushFixtures()) {
  const name = fixture.name + ': no body in the room moves faster than ' + ROOM_MULTIPLE + ' times the push\'s speed in ' + fixture.quanta + ' quanta, and the run ends at ' + fixture.hash;
  test(name, withBundles(name, (t) => {
    const bound = ROOM_MULTIPLE * pushSpeed();
    const run = pushRun(fixture);
    /** @type {Record<string, { speed: number, tick: number }>} */
    const peaks = {};
    let hash = run.tick.frame().hash;
    for (let q = 0; q < fixture.quanta; q = q + 1) {
      const frame = run.advance();
      hash = frame.hash;
      for (const body of run.world.bodies) {
        const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy + body.vz * body.vz);
        if (!peaks[body.id] || speed > peaks[body.id].speed) {
          peaks[body.id] = { speed, tick: frame.tick };
        }
        if (speed > bound) {
          recordRun({ seed: fixture.seed, world: fixture.world, log: fixture.log }, frame.tick);
          assert.fail(fixture.name + ': ' + body.id + ' moves at ' + speed + ' at tick ' + frame.tick + ', frame hash ' + frame.hash + ', above ' + ROOM_MULTIPLE + ' times the push\'s speed (' + bound + ')');
        }
      }
    }
    t.diagnostic(fixture.name + ', the fastest each body moves: ' + Object.entries(peaks).map(([id, p]) => id + ' ' + p.speed.toFixed(6) + ' at tick ' + p.tick).join(', '));
    assert.equal(hash, fixture.hash, fixture.name + ': the frame hash at tick ' + fixture.quanta);
  }));
}

test('the law runs in fixtures/law-runs/ are the tick\'s own, recorded again from this build', () => {
  const { runs, stale, extra } = staleLawRuns();
  assert.ok(runs.some((run) => run.name === 'product-scene') && runs.some((run) => run.name === 'red-room-a'));
  assert.deepEqual(stale, [], 'these law runs differ from the tick\'s; record them with node harness/law-runs.mjs --write and rerun the native tests');
  assert.deepEqual(extra, [], 'no run writes these files in fixtures/law-runs/');
});
