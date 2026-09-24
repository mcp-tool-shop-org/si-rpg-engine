#!/usr/bin/env node
// propose: a pinned local model proposes into a fresh tick.
//
//   propose [--budget N] [--out report.json]
//
// Two conditions, same seed, same budget. One returns the checker's reason.
// The other does not. Replay of either log does not call the model.

import { writeFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTick } from '../../tick/tick.js';
import { createWorld } from '../../tick/world.js';
import { createMemory } from '../../tick/memory.js';
import { loadIntentRules } from '../../tick/predicates.js';
import { FIXTURE_SEED, fixtureWorld } from '../../tick/fixture.js';
import { replay } from '../../tick/replay.js';
import { runSeat } from '../seat.js';
import { askOllama, pinnedModel } from '../ollama.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
chdir(root);

const args = process.argv.slice(2);
const budgetIndex = args.indexOf('--budget');
const budget = budgetIndex >= 0 ? Number(args[budgetIndex + 1]) : 4;
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
const model = pinnedModel();

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

const withReason = await runSeat({
  tick: fresh(),
  ask: (prompt) => askOllama(model, prompt),
  budget,
  withReason: true,
});
const blind = await runSeat({
  tick: fresh(),
  ask: (prompt) => askOllama(model, prompt),
  budget,
  withReason: false,
});

const catalog = loadIntentRules();
for (const seat of [withReason, blind]) {
  const checked = replay({
    seed: FIXTURE_SEED,
    world: fixtureWorld(),
    rules: catalog.rules,
    retired: catalog.retired,
    log: seat.log,
  });
  if (!checked.ok) {
    process.stderr.write('replay of admitted log failed: ' + checked.reason + '\n');
    process.exit(1);
  }
}

const report = {
  model,
  seed: FIXTURE_SEED,
  budget,
  withReason: { admitted: withReason.admitted, rate: withReason.rate, attempts: withReason.attempts },
  blind: { admitted: blind.admitted, rate: blind.rate, attempts: blind.attempts },
};
const text = JSON.stringify(report, null, 2) + '\n';
process.stdout.write(text);
if (outPath) {
  writeFileSync(outPath, text);
}
