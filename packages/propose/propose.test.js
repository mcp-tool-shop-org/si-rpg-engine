import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTick } from '../tick/tick.js';
import { createWorld } from '../tick/world.js';
import { createMemory } from '../tick/memory.js';
import { loadIntentRules } from '../tick/predicates.js';
import { replay } from '../tick/replay.js';
import { FIXTURE_SEED, fixtureWorld } from '../tick/fixture.js';
import { proposalPrompt } from './prompt.js';
import { runSeat } from './seat.js';

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

test('the prompt carries the checker reason only when the condition asks', () => {
  const shown = proposalPrompt({ tick: 0, x: 1, y: 1, episodes: [], lastReason: 'unknown verb: fly' });
  const hidden = proposalPrompt({ tick: 0, x: 1, y: 1, episodes: [], lastReason: null });
  assert.match(shown, /unknown verb: fly/);
  assert.equal(hidden.includes('unknown verb'), false);
});

test('returning the reason lets the next proposal answer it; hiding it does not', async () => {
  /** @type {string[]} */
  const seen = [];
  const withReason = await runSeat({
    tick: fresh(),
    budget: 2,
    withReason: true,
    ask: async (prompt) => {
      seen.push(prompt);
      if (seen.length === 1) {
        return '{"kind":"intent","verb":"fly","actor":"walker","target":{"x":2,"y":1}}';
      }
      return '{"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"y":1}}';
    },
  });
  assert.equal(withReason.admitted, 1);
  assert.match(seen[1], /unknown verb: fly/);

  /** @type {string[]} */
  const blindSeen = [];
  const blind = await runSeat({
    tick: fresh(),
    budget: 2,
    withReason: false,
    ask: async (prompt) => {
      blindSeen.push(prompt);
      return '{"kind":"intent","verb":"fly","actor":"walker","target":{"x":2,"y":1}}';
    },
  });
  assert.equal(blind.admitted, 0);
  assert.equal(blindSeen[1].includes('unknown verb'), false);
  assert.equal(blind.log.length, 0);
});

test('a line is refused by the tick, and replay of the admitted log does not ask again', async () => {
  let asks = 0;
  const seat = await runSeat({
    tick: fresh(),
    budget: 2,
    withReason: true,
    ask: async () => {
      asks = asks + 1;
      if (asks === 1) {
        return '{"kind":"line","speaker":"walker","text":"hello"}';
      }
      return '{"kind":"intent","verb":"move","actor":"walker","target":{"x":2,"y":1}}';
    },
  });
  assert.equal(seat.attempts[0].admitted, false);
  assert.match(seat.attempts[0].reason ?? '', /line gate/);
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
  assert.equal(asks, 2, 'replay did not call the model');
});
