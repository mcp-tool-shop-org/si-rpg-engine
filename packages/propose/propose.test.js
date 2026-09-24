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
import { goalText, obstacleText, proposeWorld } from './scene.js';
import { oracleSearch } from './oracle.js';

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
    bodies: [{ id: 'walker', x: 1, y: 1, z: 0, hx: 0.25, hy: 0.25, hz: 0.25 }],
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
  assert.match(shown, /Bodies on the frame: walker at x 1 y 1 z 0/);
  assert.match(shown, /Withdrawn episode e0 must not be cited/);
  assert.match(shown, /Goal:/);
  const bare = proposalPrompt({ ...shared, previous: null, verdict: null, lastReason: null });
  assert.equal(bare.includes('{"kind"'), false);
  assert.equal(bare.includes('mood'), false);
  assert.equal(bare.includes('belief'), false);
  assert.equal(bare.includes('refused'), false);
  const room = createWorld(proposeWorld());
  assert.equal(room.segmentHits(1, 1, 0, 3, 1, 0), 'pillar');
  assert.equal(room.segmentHits(1, 1, 0, 1, 2.5, 0), null);
  assert.equal(goalText(), 'Goal: put the walker centre within 0.5 of x 3, y 0.35, z 0.');
  assert.equal(obstacleText(), 'A pillar occupies x 1.8 to 2.2, y 0.72 to 2.2, z -0.35 to 0.35.');
  assert.equal(obstacleText().includes('refused'), false);
  const oracle = oracleSearch();
  assert.equal(oracle.solvable, true);
  assert.ok(oracle.minAttempts !== null && oracle.minAttempts <= 8);
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
        return '{"kind":"intent","verb":"fly","actor":"walker","target":{"x":2,"z":0}}';
      }
      return '{"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"z":0}}';
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
      return '{"kind":"intent","verb":"fly","actor":"walker","target":{"x":2,"z":0}}';
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
      return '{"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"z":0}}';
    },
  });
  const schema = /** @type {{ oneOf: import('./schema.js').ProposalBranch[] }} */ (schemas[0]);
  const verbField = schema.oneOf[0].properties.verb;
  assert.ok(verbField);
  assert.deepEqual(verbField.enum, ['move']);
  assert.deepEqual(schema.oneOf.map((branch) => branch.properties.kind.const), ['intent', 'body']);
  const withSource = proposalSchema(['move'], ['walker'], ['e1']);
  const belief = withSource.oneOf.find((branch) => branch.properties.kind.const === 'belief');
  assert.ok(belief);
  assert.ok(belief.properties.source);
  assert.deepEqual(belief.properties.source.enum, ['e1']);
  assert.equal(belief.required.includes('verb'), false);
  assert.equal(belief.required.includes('source'), true);
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
  const bodyBranch = proposalSchema(['move'], ['walker']).oneOf.find((branch) => branch.properties.kind.const === 'body');
  if (!bodyBranch) {
    throw new Error('body branch missing');
  }
  assert.equal(bodyBranch.required.includes('verb'), false);
  assert.equal(bodyBranch.required.includes('actor'), false);
  assert.equal(bodyBranch.required.includes('label'), true);
  const closed = proposalSchema(['move'], ['walker']);
  assert.equal(closed.oneOf.some((branch) => branch.properties.kind.const === 'belief'), false);
  assert.equal(readProposal('{"kind":"body","label":"walker","x":2,"y":1,"z":0,"hx":0.2,"hy":0.2,"hz":0.2}', 'h', ['walker']).proposal && /** @type {any} */ (readProposal('{"kind":"body","label":"walker","x":2,"y":1,"z":0,"hx":0.2,"hy":0.2,"hz":0.2}', 'h', ['walker']).proposal).id, 'walker-2');
});
