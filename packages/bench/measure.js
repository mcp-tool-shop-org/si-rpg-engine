#!/usr/bin/env node
// The grammar's measured defaults (T7b pin 5), run by hand:
//
//   node packages/bench/measure.js [--seeds 3] [--out fixtures/bench/grammar.json]
//
// For each planted change of pin 9 that a draw of the grammar can meet, each
// share of draws that take a verb that reached an anchor (1/2, 3/4, and all)
// and each pitch of its grid (1/2 and 1/4 of the sweep's), and each seed, the
// bench runs the room with the sweep proposing nothing: the sweep still runs,
// since the grammar draws from the states it archived and splits its verbs by
// its reach. The measure is the grammar's own quanta, counted as its budget
// counts them, from its first candidate to the first that shows a difference;
// a run that finds none within the budget counts the whole budget. The pair
// with the lowest total is the default, the earlier pair in the order above
// on a tie. The file this writes holds every run, and the grammar's defaults
// in packages/bench/bench.js are checked against it by the report's tests.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBench } from './bench.js';
import { copyCheckout, plant } from './plant.js';
import { FINDING, PUSH_FIRST, apply } from './plants.js';

/** The shares and pitches pin 5 names, in the order a tie is broken by. */
export const SHARES = [0.5, 0.75, 1];
export const PITCHES = [0.5, 0.25];
/** The grammar's budget in each run, in quanta and restores. */
export const BUDGET = { quanta: 12000, restores: 120 };

/**
 * The planted changes a grammar draw can meet, each as its test plants it.
 * @type {Array<{ name: string, edits: import('./plants.js').Edit[], inBase?: boolean, shared?: import('./plants.js').Edit[] }>}
 */
export const PLANTS = [
  { name: 'rule', edits: FINDING.rule },
  { name: 'comparison', edits: FINDING.comparison, inBase: true },
  { name: 'stepHeight', edits: FINDING.stepHeight },
  { name: 'push', edits: FINDING.push, shared: PUSH_FIRST },
  { name: 'quanta', edits: FINDING.quanta },
  { name: 'ruleFlag', edits: FINDING.ruleFlag },
];

/**
 * The pair a measurement chooses: the lowest total of quanta to the first
 * difference, the earlier pair on a tie.
 * @param {Array<{ share: number, pitch: number, total: number }>} pairs in the order of SHARES, then PITCHES
 */
export function choose(pairs) {
  let best = pairs[0];
  for (const p of pairs) {
    if (p.total < best.total) {
      best = p;
    }
  }
  return { share: best.share, pitch: best.pitch };
}

/**
 * @param {string[]} argv
 */
async function main(argv) {
  const at = (/** @type {string} */ flag, /** @type {string} */ fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const seeds = Array.from({ length: Number(at('--seeds', '3')) }, (_, i) => i + 1);
  const outFile = at('--out', 'fixtures/bench/grammar.json');
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-bench-measure-'));
  const t0 = performance.now();
  try {
    /** @type {Record<string, Record<string, number | null>>} */
    const found = {};
    await Promise.all(PLANTS.map(async (p) => {
      const head = copyCheckout(dir, p.name + '-head');
      const base = copyCheckout(dir, p.name + '-base');
      apply(plant, p.inBase ? base : head, p.edits);
      if (p.shared) {
        apply(plant, head, p.shared);
        apply(plant, base, p.shared);
      }
      for (const share of SHARES) {
        for (const pitch of PITCHES) {
          for (const seed of seeds) {
            const out = join(dir, p.name + '-' + share + '-' + pitch + '-' + seed);
            const report = await runBench({
              base, head, out, seed, worlds: [{ file: 'fixtures/bench/room.json' }],
              budgets: { sweep: { quanta: 6000, restores: 60 }, ladder: BUDGET },
              proposers: { sweep: false, grammar: true }, grammar: { share, pitch }, mutants: { enabled: false },
            });
            if (report.refused) {
              throw new Error(p.name + ' refused: ' + report.refused);
            }
            const records = readFileSync(join(out, 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.proposer === 'grammar');
            let spent = 0;
            /** @type {number | null} */
            let at2 = null;
            for (const r of records) {
              spent = spent + r.cost.quanta;
              if (r.rungs[2]) {
                at2 = spent;
                break;
              }
            }
            const key = share + ' ' + pitch;
            found[key] = found[key] || {};
            found[key][p.name + ' ' + seed] = at2;
            rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            process.stdout.write(p.name + ' share ' + share + ' pitch ' + pitch + ' seed ' + seed + ': ' + (at2 === null ? 'none within ' + BUDGET.quanta : at2) + '\n');
          }
        }
      }
    }));
    const pairs = [];
    for (const share of SHARES) {
      for (const pitch of PITCHES) {
        const runs = found[share + ' ' + pitch];
        const keys = Object.keys(runs).sort();
        const total = keys.reduce((sum, k) => sum + (runs[k] === null ? BUDGET.quanta : /** @type {number} */ (runs[k])), 0);
        pairs.push({ share, pitch, total, found: keys.filter((k) => runs[k] !== null).length, of: keys.length, runs: Object.fromEntries(keys.map((k) => [k, runs[k]])) });
      }
    }
    const chosen = choose(pairs);
    const file = {
      what: 'The grammar\'s quanta, counted as its budget counts them, from its first candidate to the first that shows a difference, for each planted change, seed, share, and pitch; a run with none counts the whole budget. The default is the pair with the lowest total, the earlier pair on a tie.',
      world: 'fixtures/bench/room.json',
      budget: BUDGET,
      sweepBudget: { quanta: 6000, restores: 60 },
      seeds,
      plants: PLANTS.map((p) => p.name),
      pairs,
      chosen,
      minutes: Math.round((performance.now() - t0) / 600) / 100,
    };
    writeFileSync(outFile, JSON.stringify(file, null, 1) + '\n');
    process.stdout.write('chosen ' + JSON.stringify(chosen) + ', written to ' + outFile + '\n');
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
