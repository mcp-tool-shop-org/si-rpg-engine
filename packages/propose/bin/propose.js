#!/usr/bin/env node
// propose: a pinned local model proposes into a fresh tick, ten runs.
//
//   propose [--budget N] [--runs N] [--model name] [--out report.json]
//
// Both conditions see the previous proposal and its verdict. Only one sees
// the checker's reason. Each attempt has its own sampling seed. Replay of
// an admitted log does not call the model.

import { readFileSync, writeFileSync } from 'node:fs';
import { chdir } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTick } from '../../tick/tick.js';
import { createWorld } from '../../tick/world.js';
import { createMemory } from '../../tick/memory.js';
import { loadIntentRules } from '../../tick/predicates.js';
import { FIXTURE_SEED } from '../../tick/fixture.js';
import { replay } from '../../tick/replay.js';
import { runSeat } from '../seat.js';
import { askOllama, pinnedRun } from '../ollama.js';
import { attemptsToGoal, proposeWorld } from '../scene.js';
import { oracleSearch } from '../oracle.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
chdir(root);

const args = process.argv.slice(2);
/**
 * @param {string} name
 * @param {number} fallback
 */
function flag(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? Number(args[index + 1]) : fallback;
}
const budget = flag('--budget', 8);
const runs = flag('--runs', 10);
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
const frozen = JSON.parse(readFileSync(new URL('../model.json', import.meta.url), 'utf8')).frozen;
if (typeof frozen === 'string' && !args.includes('--unfreeze')) {
  process.stderr.write('refusing to run: ' + frozen + '\n');
  process.exit(2);
}
const oracle = oracleSearch();
if (!oracle.solvable || oracle.minAttempts === null || oracle.minAttempts > budget) {
  process.stderr.write('refusing to run: oracle cannot solve the scene within the budget\n');
  process.exit(1);
}
const pin = pinnedRun();
const modelIndex = args.indexOf('--model');
const model = modelIndex >= 0 ? args[modelIndex + 1] : pin.model;
const catalog = loadIntentRules();
const verbs = [...catalog.rules.keys()];

function fresh() {
  return createTick({
    seed: FIXTURE_SEED,
    world: createWorld(proposeWorld()),
    rules: catalog.rules,
    retired: catalog.retired,
    memory: createMemory(),
  });
}

/**
 * @param {boolean} withReason
 * @param {number} run
 */
async function oneRun(withReason, run) {
  const seat = await runSeat({
    tick: fresh(),
    ask: (prompt, call) => askOllama(model, prompt, call),
    budget,
    withReason,
    verbs,
    seedBase: 1000 + run * 100,
    temperature: pin.temperature,
  });
  const checked = replay({
    seed: FIXTURE_SEED,
    world: proposeWorld(),
    rules: catalog.rules,
    retired: catalog.retired,
    log: seat.log,
  });
  if (!checked.ok) {
    process.stderr.write('replay failed on run ' + run + ': ' + checked.reason + '\n');
    process.exit(1);
  }
  return {
    seedBase: seat.seedBase,
    admitted: seat.admitted,
    rate: seat.rate,
    attemptsToGoal: attemptsToGoal(seat.attempts),
    attempts: seat.attempts,
  };
}

/** @type {Awaited<ReturnType<typeof oneRun>>[]} */
const withReason = [];
/** @type {Awaited<ReturnType<typeof oneRun>>[]} */
const blind = [];
for (let run = 0; run < runs; run = run + 1) {
  process.stderr.write('run ' + (run + 1) + ' of ' + runs + '\n');
  withReason.push(await oneRun(true, run));
  blind.push(await oneRun(false, run));
}

/**
 * @param {Array<{ rate: number }>} rows
 */
function mean(rows) {
  let sum = 0;
  for (const row of rows) {
    sum = sum + row.rate;
  }
  return sum / rows.length;
}

/**
 * @param {Array<{ attempts: Array<{ kind: string | null, admitted: boolean }> }>} rows
 * @param {string} kind
 */
function byKind(rows, kind) {
  let admitted = 0;
  let n = 0;
  for (const row of rows) {
    for (const attempt of row.attempts) {
      if (attempt.kind !== kind) {
        continue;
      }
      n = n + 1;
      if (attempt.admitted) {
        admitted = admitted + 1;
      }
    }
  }
  return { admitted, n };
}

/**
 * @param {Array<{ attempts: Array<{ prompt: string }> }>} rows
 */
function reasonsShown(rows) {
  let n = 0;
  for (const row of rows) {
    for (const attempt of row.attempts) {
      if (attempt.prompt.includes('Checker reason:')) {
        n = n + 1;
      }
    }
  }
  return n;
}

/**
 * @param {Array<{ attemptsToGoal: number | null }>} rows
 */
function goalSummary(rows) {
  /** @type {Array<number | null>} */
  const attempts = rows.map((row) => row.attemptsToGoal);
  let reached = 0;
  let sum = 0;
  for (const value of attempts) {
    if (value !== null) {
      reached = reached + 1;
      sum = sum + value;
    }
  }
  const meanAttempts = reached === 0 ? null : sum / reached;
  const aboveOracle = meanAttempts === null || oracle.minAttempts === null
    ? null
    : meanAttempts - oracle.minAttempts;
  return { reached, attempts, meanAttempts, aboveOracle };
}

const shown = reasonsShown(withReason);
const intent = {
  withReason: byKind(withReason, 'intent'),
  blind: byKind(blind, 'intent'),
};
const report = {
  model,
  temperature: pin.temperature,
  worldSeed: FIXTURE_SEED,
  runs,
  budget,
  oracleMin: oracle.minAttempts,
  reasonsShown: shown,
  goal: { withReason: goalSummary(withReason), blind: goalSummary(blind) },
  intent,
  belief: { withReason: byKind(withReason, 'belief'), blind: byKind(blind, 'belief') },
  body: { withReason: byKind(withReason, 'body'), blind: byKind(blind, 'body') },
  withReason: { meanRate: mean(withReason), runs: withReason },
  blind: { meanRate: mean(blind), runs: blind },
};
const text = JSON.stringify(report, null, 2) + '\n';
const summary = 'intent with-reason ' + intent.withReason.admitted + '/' + intent.withReason.n
  + ' blind ' + intent.blind.admitted + '/' + intent.blind.n
  + ' goal ' + report.goal.withReason.reached + '/' + runs
  + ' mean ' + report.goal.withReason.meanAttempts
  + ' above-oracle ' + report.goal.withReason.aboveOracle
  + ' blind ' + report.goal.blind.reached + '/' + runs
  + ' mean ' + report.goal.blind.meanAttempts
  + ' above-oracle ' + report.goal.blind.aboveOracle
  + ' oracle ' + oracle.minAttempts
  + ' reasons ' + shown + '\n';
process.stderr.write(summary);
if (shown === 0) {
  process.stderr.write('refusing to report: the reason condition showed zero checker reasons\n');
  process.exit(1);
}
process.stdout.write(summary);
if (outPath) {
  writeFileSync(outPath, text);
}
