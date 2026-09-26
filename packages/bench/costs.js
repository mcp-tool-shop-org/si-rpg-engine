#!/usr/bin/env node
// Pin 10's costs, measured by hand for each planted change of pin 9:
//
//   node packages/bench/costs.js [--out <file.md>]
//
// Each planted change runs once, in fresh copies of this checkout, with the
// finding tests' budgets over the room, both proposers, and the mutants on:
//   - the sweep's time with the per-action reach, from the bench's own run,
//     and without it, a plain T6 sweep of the same world and budget in a
//     fresh process on the same tree;
//   - the grammar's candidates per second, over its ladder's time;
//   - the ladder's time per candidate on each tree, from each process's calls;
//   - the coverage build's cost per build, from scratch in a fresh tree, and
//     per quantum, its process's time per quantum beside the head's;
//   - the mutants' time, with the law tree's reference build and each rebuild
//     counted apart from the runs.
// It prints a markdown table and, with --out, writes it. The bench chooses no
// method by these times; they are reported, as pin 10 asks.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runBench } from './bench.js';
import { copyCheckout, plant } from './plant.js';
import { EARLY_RETURN, FINDING, HAZARD_FLIP, LAW, MUTANT_LINES, NEUTRAL, NOT_AIMED, NOT_AIMED_SOLVER, PUSH_FIRST, SKEW, apply } from './plants.js';

const WORLD = 'fixtures/bench/room.json';
const BUDGETS = { sweep: { quanta: 12000, restores: 120 }, ladder: { quanta: 25000, restores: 250 } };

/**
 * The planted changes, each as its test plants it.
 * @type {Array<{ name: string, edits: import('./plants.js').Edit[], inBase?: boolean, shared?: import('./plants.js').Edit[] }>}
 */
const PLANTS = [
  { name: 'neutral head', edits: Object.values(NEUTRAL).flat().concat(Object.values(NOT_AIMED).flat()) },
  { name: 'rule narrowed', edits: FINDING.rule },
  { name: 'comparison, in the base', edits: FINDING.comparison, inBase: true },
  { name: 'STEP_HEIGHT and a hazard', edits: FINDING.stepHeight.concat(HAZARD_FLIP) },
  { name: 'push speed', edits: FINDING.push, shared: PUSH_FIRST },
  { name: 'rule flag, verb retired', edits: FINDING.ruleFlag.concat(PUSH_FIRST) },
  { name: 'mutant lines', edits: MUTANT_LINES.concat(EARLY_RETURN) },
  { name: 'law head', edits: Object.values(LAW).flat().concat(NEUTRAL.hazard, Object.values(NOT_AIMED_SOLVER).flat(), SKEW) },
];

/**
 * A plain T6 sweep of a world on a tree, in a fresh process with the tree's
 * root as its working directory: its time in milliseconds.
 * @param {string} tree
 */
function plainSweep(tree) {
  const code = [
    'const { sweep, sceneInput } = await import(' + JSON.stringify(pathToFileURL(join(tree, 'packages', 'load', 'sweep.js')).href) + ');',
    'const { loadScene } = await import(' + JSON.stringify(pathToFileURL(join(tree, 'packages', 'tick', 'scene.js')).href) + ');',
    'const loaded = loadScene(' + JSON.stringify(WORLD) + ');',
    'const t0 = performance.now();',
    'const report = sweep(sceneInput(loaded.scene), { budget: ' + JSON.stringify(BUDGETS.sweep) + ', bundles: null });',
    'process.stdout.write(JSON.stringify({ ms: performance.now() - t0, admitted: report.admitted, tried: report.tried, quanta: report.quanta }));',
  ].join('\n');
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: tree, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (run.status !== 0) {
    throw new Error('the plain sweep failed: ' + run.stderr);
  }
  return JSON.parse(run.stdout);
}

/**
 * @param {number} n
 */
const s = (n) => (n / 1000).toFixed(1) + ' s';

/**
 * @param {string[]} argv
 */
async function main(argv) {
  const i = argv.indexOf('--out');
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-bench-costs-'));
  /** @type {string[]} */
  const rows = [];
  try {
    // One run at a time, so no other run shares the host while one is timed.
    /** @type {Array<{ p: typeof PLANTS[number], report: any, head: string }>} */
    const results = [];
    for (const p of PLANTS) {
      const built = !p.edits.some((e) => e.file.startsWith('solver/'));
      const head = copyCheckout(dir, p.name.replace(/\W+/g, '-') + '-head', { built });
      const base = copyCheckout(dir, p.name.replace(/\W+/g, '-') + '-base', { built });
      apply(plant, p.inBase ? base : head, p.edits);
      if (p.shared) {
        apply(plant, head, p.shared);
        apply(plant, base, p.shared);
      }
      const report = await runBench({ base, head, out: join(dir, p.name.replace(/\W+/g, '-') + '-out'), seed: 3, worlds: [{ file: WORLD }], budgets: BUDGETS });
      if (report.refused) {
        throw new Error(p.name + ' refused: ' + report.refused);
      }
      results.push({ p, report, head });
      process.stderr.write(p.name + ' ran\n');
    }
    rows.push('| planted change | sweep with reach | sweep without | grammar candidates per second | ladder per candidate: head, base, coverage | coverage build | coverage per quantum, beside the head\'s | mutants: runs, reference build, rebuilds |');
    rows.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const { p, report, head } of results) {
      const env = report.environment;
      const withReach = env.times['sweep ' + WORLD];
      const plain = plainSweep(head);
      const grammarRan = report.proposers.grammar.ran;
      const grammarMs = env.times['grammar ladder ' + WORLD];
      const per = (/** @type {string} */ name) => {
        const e = env.processes[name];
        return e && e.calls ? (e.ms / e.calls).toFixed(0) + ' ms' : '-';
      };
      const perQuantum = (/** @type {string} */ name) => {
        const e = env.processes[name];
        return e && e.quanta ? (1000 * e.ms / e.quanta).toFixed(1) + ' us' : '-';
      };
      const mutantRuns = Object.values(env.mutants || {}).reduce((sum, m) => sum + /** @type {any} */ (m).ms, 0);
      const rebuilds = Object.values(env.lawRebuilds || {});
      rows.push('| ' + [
        p.name,
        s(withReach) + ' (' + report.worlds[0].sweep.admitted + ' actions)',
        s(plain.ms),
        (grammarRan / (grammarMs / 1000)).toFixed(2) + ' (' + grammarRan + ' in ' + s(grammarMs) + ')',
        [per('head'), per('base'), per('head coverage')].join(', '),
        report.coverage.made ? s(env.times['coverage build']) + ' from scratch' : 'none: no law anchor',
        report.coverage.made ? perQuantum('head coverage') + ' beside ' + perQuantum('head') + '; mapping ' + (env.mapping.ms / env.mapping.windows).toFixed(0) + ' ms a window over ' + env.mapping.windows : '-',
        report.mutants.list.length + ' in ' + s(mutantRuns) + (env.lawReferenceMs !== undefined ? '; reference ' + s(env.lawReferenceMs) + '; rebuilds ' + rebuilds.length + ', ' + (rebuilds.reduce((a, b) => a + /** @type {number} */ (b), 0) / Math.max(1, rebuilds.length) / 1000).toFixed(1) + ' s each' : ''),
      ].join(' | ') + ' |');
    }
    const text = rows.join('\n') + '\n';
    process.stdout.write(text);
    if (i >= 0 && argv[i + 1]) {
      writeFileSync(resolve(argv[i + 1]), text);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
