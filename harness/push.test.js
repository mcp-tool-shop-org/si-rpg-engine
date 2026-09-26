// F3, the character's push (docs/dispatch-f3-character-push.md).
//
// After a character moves, the law pushes the dynamic bodies it touched. It
// does so through the engine's copy of Rapier's impulse routine,
// solver/src/impulses.rs, which gathers each dynamic collider's contact
// manifolds into a vec of their own, as Rapier's #1004 does. At rapier3d-f64
// 0.35.3 every collider in range shared one vec, and when two dynamic bodies
// were near the character the second overwrote the first's manifold.
//
// Pin 5: red room A, fixtures/push/red-room-a.json. On main at 5d6bbea the
// crate first exceeds 10 units a second at tick 53, at 26.06416630354704,
// with frame hash 375c78856a5a4b15, and the frame hash at tick 200 is
// 8936cf832bc642ab. Here no body in the room exceeds the guard's bound in 200
// quanta. The bound is eight times the push's speed, the multiple the native
// guard states (PUSH_MULTIPLE in solver/src/rapier_law.rs, which this file
// reads): above the 6.375 an ordinary push of the smallest crate reaches
// through Rapier's linear-only mass ratio, and below main's launch. Every
// fixture with a push in fixtures/push/ is held to the same bound, with every
// body in it, at every quantum.
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

/** The guard's multiple of the pusher's speed, as the native guard states it. */
const MULTIPLE = 8;

/** The push verb's speed, which the tick gives the pushing actor. */
function pushSpeed() {
  const rule = loadIntentRules().rules.get('push');
  if (!rule) {
    throw new Error('no push rule');
  }
  return rule.speed;
}

test('the bound here is the native guard\'s multiple, PUSH_MULTIPLE in solver/src/rapier_law.rs', () => {
  const source = readFileSync('solver/src/rapier_law.rs', 'utf8');
  const found = source.match(/const PUSH_MULTIPLE: f64 = ([0-9.]+);/);
  assert.ok(found, 'solver/src/rapier_law.rs states no PUSH_MULTIPLE');
  assert.equal(Number(found[1]), MULTIPLE);
});

test('fixtures/push/ holds red room A, and each fixture\'s log is its script as the tick admitted it', () => {
  const fixtures = pushFixtures();
  assert.ok(fixtures.some((f) => f.name === 'red-room-a'), 'no red room A in fixtures/push/');
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
  const name = fixture.name + ': no body in the room moves faster than ' + MULTIPLE + ' times the push\'s speed in ' + fixture.quanta + ' quanta, and the run ends at ' + fixture.hash;
  test(name, withBundles(name, (t) => {
    const bound = MULTIPLE * pushSpeed();
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
          assert.fail(fixture.name + ': ' + body.id + ' moves at ' + speed + ' at tick ' + frame.tick + ', frame hash ' + frame.hash + ', above ' + MULTIPLE + ' times the push\'s speed (' + bound + ')');
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
