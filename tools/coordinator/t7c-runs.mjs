#!/usr/bin/env node
// t7c-runs.mjs --out <dir> [--only <name>] [--dry-run] [--record]: T7c's two bars, run by
// hand by the coordinator (docs/dispatch-t7c-model.md, pin 12). It calls the
// pinned qwen2.5:7b through the local Ollama daemon, as the test-only copy
// fixtures/roles/instrument-copy.json names it. Run it from the repository
// root of a clean checkout of main. Every setting is fixed here, before any
// call, and nothing is chosen after the model answers.
//
// Safety: the five steering changes in fixtures/sessions/instrument-copy/, each
// one bench run on the room with one session stopped at 16 calls, beside a run
// with the model off on the same trees, world, and settings, so the sweep's
// and the grammar's verdicts can be compared. The change is the session's
// diff and its dispatch.txt the session's dispatch; neither tree applies it.
//
// Value: T7b's six planted changes on the room, and F2's law change on the
// product scene with the walker-stall bundle as a control input, as T7b ran it.
// Each is one bench run with the model on; the report holds both arms. A value
// run's dispatch is the bench's own line naming the anchors the change aims at.
//
// Each run writes <out>/<name>/ with report.json, report.md, records.jsonl,
// bundles, and sessions/<world>/, the recorded session. With --dry-run it
// prints each run's settings and diff and calls nothing. With --record, after
// the runs, each recorded session is copied into
// fixtures/sessions/instrument-copy/<change>/, beside a steering change's
// spec, where packages/propose/record.test.js verifies it, and each report
// into fixtures/t7c-runs/<run>/. Those files are the measurement pull request.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBench } from '../../packages/bench/bench.js';
import { PLANTS } from '../../packages/bench/measure.js';
import { copyCheckout, plant, removeScratch, scratch } from '../../packages/bench/plant.js';
import { apply } from '../../packages/bench/plants.js';

/** The grid's settings (T7c pin 9), used by every run. */
export const SETTINGS = {
  seed: 1,
  grammar: { share: 0.5, pitch: 0.5 },
  budgets: { sweep: { quanta: 6000, restores: 60 }, ladder: { quanta: 12000, restores: 120 } },
  proposers: { sweep: false, grammar: true },
  mutants: { enabled: true },
  catalog: 'fixtures/roles',
  role: 'instrument-copy',
};

/** The five steering changes, each stopped at 16 calls. */
export const SAFETY = ['class-body', 'verb-teleport', 'actor-ghost', 'target-missing', 'outcome-hash'];
export const SAFETY_CALLS = 16;

const ROOM = [{ file: 'fixtures/bench/room.json' }];

/** F2's law change: the base switches its branch off, as T7b planted it. */
export const F2 = {
  name: 'F2',
  base: [{ file: 'solver/src/kcc.rs', from: 'Controller::<true, true>(controller).move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| collisions.push(hit))', to: 'Controller::<false, true>(controller).move_shape(dt, queries, character_shape, character_pos, desired_translation, |hit| collisions.push(hit))' }],
  worlds: [{ productScene: true }],
  controls: [{ file: 'fixtures/corpus/walker-stall-flat-ground.bundle.json' }, { productScene: true }],
};

/**
 * Refuses to start unless the daemon serves the copy's model under its pinned
 * digest, so no call is made to another model.
 */
async function checkModel() {
  const copy = JSON.parse(readFileSync(join(SETTINGS.catalog, SETTINGS.role + '.json'), 'utf8'));
  const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(10000) });
  const tags = /** @type {{ models: Array<{ name: string, digest: string }> }} */ (await res.json());
  const served = tags.models.find((m) => m.name === copy.model.name);
  if (!served || served.digest !== copy.model.digest) {
    throw new Error('the daemon serves ' + copy.model.name + ' as ' + (served ? served.digest : 'nothing') + ', not the pin ' + copy.model.digest);
  }
}

/**
 * The unified diff of one edited file between two trees, with a/ and b/ paths.
 * @param {string} base
 * @param {string} head
 * @param {string} file
 */
function fileDiff(base, head, file) {
  const run = spawnSync('git', ['diff', '--no-index', '--no-color', '--', join(base, file), join(head, file)], { encoding: 'utf8' });
  if (run.status !== 0 && run.status !== 1) {
    throw new Error('git diff failed on ' + file + ': ' + run.stderr);
  }
  const lines = run.stdout.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((line) => line.startsWith('--- '));
  return ['--- a/' + file, '+++ b/' + file, ...lines.slice(at + 2)].join('\n');
}

/**
 * Every run, in order, with its trees built under `dir`.
 * @param {string} dir
 */
function plan(dir) {
  /** @type {Array<{ name: string, bar: string, base: string, head: string, diff: string, dispatch: string, worlds: any[], controls: any[], calls?: number, twin: boolean }>} */
  const runs = [];
  // The bench refuses one tree as both sides, so each side is its own copy.
  const cleanBase = copyCheckout(dir, 'clean-base');
  const cleanHead = copyCheckout(dir, 'clean-head');
  for (const name of SAFETY) {
    const from = join('fixtures', 'sessions', 'instrument-copy', name);
    runs.push({
      name: 'safety-' + name, bar: 'safety', base: cleanBase, head: cleanHead,
      diff: resolve(from, 'change.diff'), dispatch: readFileSync(join(from, 'dispatch.txt'), 'utf8').trim(),
      worlds: ROOM, controls: [], calls: SAFETY_CALLS, twin: true,
    });
  }
  for (const p of PLANTS) {
    const base = copyCheckout(dir, p.name + '-base');
    const head = copyCheckout(dir, p.name + '-head');
    apply(plant, p.inBase ? base : head, p.edits);
    if (p.shared) {
      apply(plant, base, p.shared);
      apply(plant, head, p.shared);
    }
    const files = [...new Set(p.edits.map((e) => e.file))];
    const diff = join(dir, p.name + '.diff');
    writeFileSync(diff, files.map((f) => fileDiff(base, head, f)).join('\n'));
    runs.push({ name: 'value-' + p.name, bar: 'value', base, head, diff, dispatch: '', worlds: ROOM, controls: [], twin: false });
  }
  const f2Base = copyCheckout(dir, 'F2-base', { built: false });
  const f2Head = copyCheckout(dir, 'F2-head');
  apply(plant, f2Base, F2.base);
  const f2Diff = join(dir, 'F2.diff');
  writeFileSync(f2Diff, fileDiff(f2Base, f2Head, 'solver/src/kcc.rs'));
  runs.push({ name: 'value-F2', bar: 'value', base: f2Base, head: f2Head, diff: f2Diff, dispatch: '', worlds: F2.worlds, controls: F2.controls, twin: false });
  return runs;
}

/**
 * @param {string[]} argv
 */
async function main(argv) {
  const at = (/** @type {string} */ flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const outArg = at('--out');
  if (!outArg) {
    process.stderr.write('usage: node tools/coordinator/t7c-runs.mjs --out <dir> [--only <name>] [--dry-run] [--record]\n');
    process.exit(2);
  }
  const out = resolve(outArg);
  const only = at('--only');
  const dry = argv.includes('--dry-run');
  const record = argv.includes('--record') && !dry;
  if (!dry) {
    await checkModel();
  }
  const dir = scratch('t7c');
  try {
    const runs = plan(dir).filter((r) => only === undefined || r.name === only);
    if (runs.length === 0) {
      throw new Error('no run named ' + only);
    }
    mkdirSync(out, { recursive: true });
    for (const r of runs) {
      const common = {
        base: r.base, head: r.head, seed: SETTINGS.seed, worlds: r.worlds, controls: r.controls,
        budgets: SETTINGS.budgets, proposers: SETTINGS.proposers, grammar: SETTINGS.grammar, mutants: SETTINGS.mutants,
      };
      const model = { enabled: true, catalog: SETTINGS.catalog, role: SETTINGS.role, diff: r.diff, dispatch: r.dispatch, ...(r.calls === undefined ? {} : { calls: r.calls }) };
      if (dry) {
        process.stdout.write('## ' + r.name + ' (' + r.bar + ')\n' + JSON.stringify({ ...common, base: relative(dir, r.base), head: relative(dir, r.head), model: { ...model, diff: relative(dir, r.diff) }, twin: r.twin }, null, 1) + '\n' + readFileSync(r.diff, 'utf8') + '\n');
        continue;
      }
      process.stdout.write(r.name + ': model on\n');
      const on = await runBench({ ...common, out: join(out, r.name), model, say: (line) => process.stderr.write(line + '\n') });
      process.stdout.write(r.name + ': ' + (on.refused ? 'refused: ' + on.refused : 'done') + '\n');
      if (r.twin) {
        process.stdout.write(r.name + ': model off\n');
        const off = await runBench({ ...common, out: join(out, r.name + '-off'), say: (line) => process.stderr.write(line + '\n') });
        process.stdout.write(r.name + '-off: ' + (off.refused ? 'refused: ' + off.refused : 'done') + '\n');
      }
      if (record) {
        for (const name of r.twin ? [r.name, r.name + '-off'] : [r.name]) {
          const into = join('fixtures', 't7c-runs', name);
          mkdirSync(into, { recursive: true });
          for (const file of ['report.json', 'report.md']) {
            cpSync(join(out, name, file), join(into, file));
          }
        }
        const sessions = join(out, r.name, 'sessions');
        if (existsSync(sessions)) {
          const change = r.bar === 'safety' ? r.name.slice('safety-'.length) : r.name;
          for (const world of readdirSync(sessions)) {
            cpSync(join(sessions, world), join('fixtures', 'sessions', 'instrument-copy', change), { recursive: true });
          }
        }
      }
    }
  } finally {
    removeScratch(dir);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
