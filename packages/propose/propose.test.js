import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTick } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { replay } from '../tick/replay.js';
import { FIXTURE_SEED, fixtureWorld } from '../tick/fixture.js';
import { proposalPrompt } from './prompt.js';
import { readProposal } from './parse.js';
import { proposalSchema } from './schema.js';
import { runSeat } from './seat.js';
import { proposeWorld } from './scene.js';
import { createWorld as worldWith } from '../tick/world.js';

function fresh() {
  const catalog = loadIntentRules();
  return createTick({
    seed: FIXTURE_SEED,
    world: createWorld(fixtureWorld()),
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
}

const verbs = ['move'];

test('both conditions see the previous proposal; only one sees the reason', () => {
  const shared = {
    tick: 3,
    bodies: [{ id: 'walker', x: 1, y: 1, hw: 0.25, hh: 0.25 }],
    episodes: [],
    goal: 'Goal: put the walker centre within 0.5 of x 3, y 1.',
    obstacle: 'A pillar occupies x 1.7 to 2.3, y 0.6 to 1.4.',
    previous: '{"kind":"intent","verb":"move"}',
    verdict: /** @type {'rejected'} */ ('rejected'),
  };
  const shown = proposalPrompt({ ...shared, lastReason: 'path crosses collider floor' });
  const hidden = proposalPrompt({ ...shared, lastReason: null });
  assert.match(shown, /Previous proposal:/);
  assert.match(hidden, /Previous proposal:/);
  assert.match(shown, /Verdict: rejected/);
  assert.match(hidden, /Verdict: rejected/);
  assert.match(shown, /path crosses collider floor/);
  assert.equal(hidden.includes('path crosses collider floor'), false);
  assert.match(shown, /Bodies on the frame: walker at x 1 y 1/);
  assert.match(shown, /Withdrawn episode e0 must not be cited/);
  assert.match(shown, /Goal:/);
  const bare = proposalPrompt({ ...shared, previous: null, verdict: null, lastReason: null });
  assert.equal(bare.includes('{"kind"'), false);
  assert.equal(bare.includes('mood'), false);
  const room = worldWith(proposeWorld());
  assert.equal(room.segmentHits(1, 1, 3, 1), 'pillar');
  assert.equal(room.segmentHits(1, 1, 1, 2.5), null);
});

test('the reason is the only difference, and an unreadable reply is split in two', async () => {
  /** @type {string[]} */
  const seen = [];
  const withReason = await runSeat({
    tick: fresh(),
    budget: 2,
    withReason: true,
    verbs,
    seedBase: 10,
    temperature: 0,
    ask: async (prompt) => {
      seen.push(prompt);
      if (seen.length === 1) {
        return '{"kind":"intent","verb":"fly","actor":"walker","target":{"x":2,"y":1}}';
      }
      return '{"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"y":1}}';
    },
  });
  assert.equal(withReason.admitted, 1);
  assert.match(seen[1], /Previous proposal:/);
  assert.match(seen[1], /unknown verb: fly/);
  assert.equal(withReason.attempts[0].verdict, 'ok');
  assert.equal(withReason.attempts[0].seed, 10);

  /** @type {string[]} */
  const blindSeen = [];
  const blind = await runSeat({
    tick: fresh(),
    budget: 2,
    withReason: false,
    verbs,
    seedBase: 10,
    temperature: 0,
    ask: async (prompt) => {
      blindSeen.push(prompt);
      return '{"kind":"intent","verb":"fly","actor":"walker","target":{"x":2,"y":1}}';
    },
  });
  assert.equal(blind.admitted, 0);
  assert.match(blindSeen[1], /Previous proposal:/);
  assert.match(blindSeen[1], /Verdict: rejected/);
  assert.equal(blindSeen[1].includes('unknown verb: fly'), false);
  assert.equal(blind.attempts[1].prompt, blindSeen[1]);
  assert.equal(blind.attempts[1].raw.includes('fly'), true);

  let step = 0;
  const broken = await runSeat({
    tick: fresh(),
    budget: 2,
    withReason: false,
    verbs,
    seedBase: 1,
    temperature: 0,
    ask: async () => {
      step = step + 1;
      return step === 1 ? 'not json' : '{"kind":"intent","verb":"move","actor":"walker"}';
    },
  });
  assert.equal(broken.attempts[0].verdict, 'not-json');
  assert.equal(broken.attempts[1].verdict, 'wrong-shape');
});

test('the schema enums are the catalog, and replay does not ask again', async () => {
  /** @type {object[]} */
  const schemas = [];
  let asks = 0;
  const seat = await runSeat({
    tick: fresh(),
    budget: 2,
    withReason: true,
    verbs,
    seedBase: 40,
    temperature: 0.2,
    ask: async (_prompt, call) => {
      asks = asks + 1;
      schemas.push(call.schema);
      assert.equal(call.seed, 39 + asks);
      assert.equal(call.temperature, 0.2);
      if (asks === 1) {
        return '{"kind":"line","speaker":"walker","text":"hello"}';
      }
      return '{"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"y":1}}';
    },
  });
  const schema = /** @type {{ oneOf: Array<{ properties: { verb: { enum: string[] }, kind: { const: string } } }> }} */ (schemas[0]);
  assert.deepEqual(schema.oneOf[0].properties.verb.enum, ['move']);
  assert.deepEqual(schema.oneOf.map((branch) => branch.properties.kind.const), ['intent', 'belief', 'body']);
  assert.equal(seat.attempts[0].admitted, false);
  assert.equal(seat.admitted, 1);
  const catalog = loadIntentRules();
  const again = replay({
    seed: FIXTURE_SEED,
    world: fixtureWorld(),
    rules: catalog.rules,
    retired: catalog.retired,
    log: seat.log,
  });
  assert.equal(again.ok, true);
  assert.equal(asks, 2);
  assert.equal(readProposal('nope', 'h', []).verdict, 'not-json');
  const bodyBranch = proposalSchema(['move'], ['walker']).oneOf[2];
  assert.equal(bodyBranch.required.includes('verb'), false);
  assert.equal(bodyBranch.required.includes('actor'), false);
  assert.equal(bodyBranch.required.includes('label'), true);
  const beliefBranch = proposalSchema(['move'], ['walker']).oneOf[1];
  assert.equal(beliefBranch.required.includes('verb'), false);
  assert.equal(readProposal('{"kind":"body","label":"walker","x":2,"y":1,"hw":0.2,"hh":0.2}', 'h', ['walker']).proposal && /** @type {any} */ (readProposal('{"kind":"body","label":"walker","x":2,"y":1,"hw":0.2,"hh":0.2}', 'h', ['walker']).proposal).id, 'walker-2');
});
