#!/usr/bin/env node
// F2's law change, planted, by hand (T7b pin 9). It needs two law builds, so
// it is not in npm test:
//
//   node packages/bench/f2.js [--out <dir>]
//
// The head is this checkout. The base is a copy of it with F2's branch in the
// engine's copy of the controller switched off: the const parameter BRANCH
// false, and RETRY, F4's second cast, left on, so the base's copy computes
// what Rapier's controller does in decompose_hit, bit for bit. The bench runs
// the corpus's walker-stall bundle and the product scene as control inputs on
// both trees, each tree built from its own source, and the head's coverage
// build shows the lines of F2's branch counted in the bundle's run. The run
// prints both binaries' digests, each control input's first difference, the
// branch's counts, and its own time, and leaves its report in the out
// directory.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBench } from './bench.js';
import { coverageDir, llvmTools, productGlue } from './build.js';
import { copyCheckout, plant } from './plant.js';
import { startProcess } from './processes.js';
import { coverageInfo, lineStats, mapWindow, normalize } from './profile.js';

/** F2's branch off, F4's retry on: the base's one change. */
export const F2_OFF = [{ file: 'solver/src/kcc.rs', from: '        Controller::<true, true>(controller).move_shape(', to: '        Controller::<false, true>(controller).move_shape(' }];

const BUNDLE = 'fixtures/corpus/walker-stall-flat-ground.bundle.json';

/**
 * @param {string[]} argv
 */
async function main(argv) {
  const t0 = performance.now();
  const checkout = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const i = argv.indexOf('--out');
  // The base tree is scratch, removed when the run ends; the report stays.
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-bench-f2-'));
  const out = i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : mkdtempSync(join(tmpdir(), 'si-rpg-bench-f2-report-'));
  try {
    await run(checkout, dir, out, t0);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

/**
 * @param {string} checkout
 * @param {string} dir
 * @param {string} out
 * @param {number} t0
 */
async function run(checkout, dir, out, t0) {
  const base = copyCheckout(dir, 'base', { built: false });
  for (const e of F2_OFF) {
    plant(base, e.file, e.from, e.to);
  }
  const report = await runBench({
    base, head: checkout, out, seed: 1, worlds: [],
    controls: [{ file: BUNDLE }, { productScene: true }],
    proposers: { sweep: false, grammar: false },
  });
  const ms = performance.now() - t0;
  const say = (/** @type {string} */ line) => process.stdout.write(line + '\n');
  if (report.refused) {
    say('refused: ' + report.refused);
    process.exitCode = 1;
    return;
  }
  say('binaries: ' + report.binaries.mode);
  say('  head ' + report.environment.binaries.head);
  say('  base ' + report.environment.binaries.base);
  say('  ' + (report.environment.binaries.head !== report.environment.binaries.base ? 'they differ' : 'THEY ARE ONE BINARY'));
  for (const c of report.controls) {
    say('control ' + c.control.kind + ' ' + c.control.file + ': ' + (c.difference || 'no trace difference') + (c.notes.length ? ' (' + c.notes.join('; ') + ')' : ''));
    if (c.block) {
      say(c.block.trimEnd().split('\n').map((/** @type {string} */ l) => '    ' + l).join('\n'));
    }
  }
  for (const a of report.anchors) {
    say('anchor ' + a.id + ': ' + a.verdict + (a.reachedBy.length ? ' by ' + a.reachedBy.join(', ') : ''));
  }
  // The branch's own lines in the bundle's run, by the head's coverage build:
  // the `if BRANCH && ...` line and the two lines of its arm.
  const kcc = readFileSync(join(checkout, 'solver', 'src', 'kcc.rs'), 'utf8').split(/\r?\n/);
  const at = kcc.findIndex((l) => l.includes('if BRANCH && horizontal_tangent_dir == Vector::ZERO {')) + 1;
  const tools = llvmTools(checkout);
  if ('missing' in tools) {
    say('no llvm-tools: ' + tools.missing);
    process.exitCode = 1;
    return;
  }
  const wasm = join(coverageDir(checkout), 'wasm32-unknown-unknown', 'release', 'si_solver.wasm');
  const info = coverageInfo(wasm, join(dir, 'coverage'));
  const cov = await startProcess({ name: 'head coverage', tree: checkout, build: 'coverage', redirect: { from: productGlue(checkout), to: join(coverageDir(checkout), 'solver.mjs') }, counters: info.counters });
  try {
    const bundle = JSON.parse(readFileSync(join(checkout, BUNDLE), 'utf8'));
    const spec = { seed: bundle.seed, steps: bundle.steps, driven: bundle.driven, world: bundle.world };
    const got = await cov.call('control', { name: 'f2 bundle', spec, window: true, restoreCheck: false });
    const files = await mapWindow(info, tools, got.window.counters, [join(checkout, 'solver', 'src', 'kcc.rs')]);
    const segments = files.get(normalize(checkout.replace(/\\/g, '/') + '/solver/src/kcc.rs'));
    const stats = segments ? lineStats(segments) : new Map();
    say('F2\'s branch in the bundle\'s run, by the head\'s coverage build (' + got.window.quanta + ' quanta):');
    for (let l = at; l <= at + 2; l = l + 1) {
      say('  kcc.rs:' + l + ' ran ' + (stats.get(l) ?? 'no region') + ' times: ' + kcc[l - 1].trim());
    }
  } finally {
    await cov.close();
  }
  say('time ' + (ms / 1000).toFixed(1) + ' s for the bench run, ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s in all; builds ' + JSON.stringify({ product: report.environment.times['product builds'], coverage: report.environment.times['coverage build'] }) + ' ms');
  say('report: ' + join(out, 'report.md'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
