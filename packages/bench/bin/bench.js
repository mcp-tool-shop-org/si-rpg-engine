#!/usr/bin/env node
// bench: the instrument's bench (T7b, docs/dispatch-t7b-instrument-bench.md).
// The coordinator runs it locally, on demand; no workflow runs it.
//
//   bench trees <repo> <base-rev> <head-rev> <dir>
//       makes the two trees as git worktrees at <dir>/base and <dir>/head and
//       builds the head's product binary in its own tree
//   bench anchors --base <tree> --head <tree>
//       prints the anchors of the change as JSON (pin 1)
//   bench run --base <tree> --head <tree> --out <dir> [options]
//       runs the bench and writes out/report.json, out/report.md,
//       out/records.jsonl, out/access.json, and out/bundles/; exit 0 when it
//       ran, 1 when it refused, with the reason
//         --seed <n>                          the run's seed (1)
//         --world <file>                      a scratch world of the head, repeatable
//         --product-scene                     the product scene's world, with its three actors
//         --control <bundle | product-scene>  a control input, repeatable
//         --sweep-quanta <n> --sweep-restores <n>    the sweep's budget per world
//         --ladder-quanta <n> --ladder-restores <n>  each proposer's budget per world
//         --no-sweep --no-grammar --no-mutants --cap <n>
//         --model --diff <file> [--role <name>] [--catalog <dir>] [--model-calls <n>]
//   bench replay <bundle> --tree <dir>
//       submits an admission difference's log by tick on a tree, then the
//       differing intent citing that tree's frame, and prints the tree's
//       admission or refusal (pin 6)

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { anchorsView, readAnchors } from '../anchors.js';
import { buildProduct } from '../build.js';
import { runBench } from '../bench.js';
import { startProcess } from '../processes.js';
import { makeWorktree } from '../trees.js';
import { guard } from '../../tool/guard.js';

guard('bench trees <repo> <base-rev> <head-rev> <dir> | bench anchors --base <tree> --head <tree> | bench run --base <tree> --head <tree> --out <dir> [--seed n] [--world file]... [--product-scene] [--control bundle|product-scene]... [--sweep-quanta n] [--sweep-restores n] [--ladder-quanta n] [--ladder-restores n] [--no-sweep] [--no-grammar] [--no-mutants] [--cap n] [--model] [--diff file] [--role name] [--catalog dir] [--model-calls n] | bench replay <bundle> --tree <dir>');

const args = process.argv.slice(2);
const command = args[0];

/**
 * The value after a flag, or null.
 * @param {string} flag
 */
function value(flag) {
  const at = args.indexOf(flag);
  return at >= 0 && at + 1 < args.length ? args[at + 1] : null;
}

/**
 * Every value after a repeatable flag.
 * @param {string} flag
 */
function values(flag) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < args.length - 1; i = i + 1) {
    if (args[i] === flag) {
      out.push(args[i + 1]);
    }
  }
  return out;
}

/**
 * @param {string} flag
 */
function number(flag) {
  const v = value(flag);
  if (v === null) {
    return undefined;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    process.stderr.write(flag + ' takes a number, not ' + v + '\n');
    process.exit(2);
  }
  return n;
}

if (command === 'trees' && args.length >= 5) {
  const [repo, baseRev, headRev, dir] = args.slice(1, 5);
  const base = makeWorktree(repo, baseRev, join(dir, 'base'));
  const head = makeWorktree(repo, headRev, join(dir, 'head'));
  buildProduct(head, 'head');
  process.stdout.write('base ' + base + '\nhead ' + head + '\n');
} else if (command === 'anchors' && value('--base') && value('--head')) {
  const set = readAnchors(resolve(/** @type {string} */ (value('--base'))), resolve(/** @type {string} */ (value('--head'))));
  process.stdout.write(JSON.stringify(anchorsView(set), null, 1) + '\n');
} else if (command === 'run' && value('--base') && value('--head') && value('--out')) {
  if (args.includes('--model') && value('--diff') === null) {
    process.stderr.write('refused: --model without --diff is refused\n');
    process.exit(1);
  }
  const worlds = values('--world').map((file) => ({ file }));
  if (args.includes('--product-scene')) {
    worlds.push(/** @type {any} */ ({ productScene: true }));
  }
  const controls = values('--control').map((c) => (c === 'product-scene' ? { productScene: true } : { file: c }));
  const sweep = { quanta: number('--sweep-quanta'), restores: number('--sweep-restores') };
  const ladder = { quanta: number('--ladder-quanta'), restores: number('--ladder-restores') };
  const report = await runBench({
    base: /** @type {string} */ (value('--base')),
    head: /** @type {string} */ (value('--head')),
    out: /** @type {string} */ (value('--out')),
    seed: number('--seed'),
    worlds,
    controls,
    budgets: {
      sweep: /** @type {any} */ (Object.fromEntries(Object.entries(sweep).filter(([, v]) => v !== undefined))),
      ladder: /** @type {any} */ (Object.fromEntries(Object.entries(ladder).filter(([, v]) => v !== undefined))),
    },
    proposers: { sweep: !args.includes('--no-sweep'), grammar: !args.includes('--no-grammar') },
    mutants: { enabled: !args.includes('--no-mutants'), cap: number('--cap') },
    model: args.includes('--model') ? {
      enabled: true,
      diff: /** @type {string} */ (value('--diff')),
      role: value('--role') || undefined,
      catalog: value('--catalog') || undefined,
      calls: number('--model-calls'),
    } : undefined,
    say: (line) => process.stderr.write(line + '\n'),
  });
  process.stdout.write(join(resolve(/** @type {string} */ (value('--out'))), 'report.md') + '\n');
  if (report.refused) {
    process.stderr.write('refused: ' + report.refused + '\n');
    process.exit(1);
  }
} else if (command === 'replay' && args[1] && value('--tree')) {
  const bundle = JSON.parse(readFileSync(args[1], 'utf8'));
  const failure = bundle.failure;
  if (!failure || !failure.intent || typeof failure.tick !== 'number') {
    process.stderr.write('not an admission difference: ' + args[1] + ' has no differing intent in its failure block\n');
    process.exit(2);
  }
  const tree = resolve(/** @type {string} */ (value('--tree')));
  if (!existsSync(join(tree, 'solver', 'dist', 'solver.mjs'))) {
    process.stderr.write('the tree ' + tree + ' has no built solver\n');
    process.exit(2);
  }
  const proc = await startProcess({ name: 'replay', tree, build: 'product' });
  try {
    const log = bundle.log.map((/** @type {any} */ e) => ({ tick: e.tick, proposal: e.proposal })).concat([{ tick: failure.tick, proposal: failure.intent.proposal }]);
    const got = await proc.call('control', { name: 'replay', spec: { seed: bundle.seed, world: bundle.world, log, law: bundle.law, retired: bundle.retired, quanta: failure.tick }, window: false, restoreCheck: false });
    const last = got.admissions.find((/** @type {any} */ a) => a.index === log.length - 1);
    const earlier = got.admissions.filter((/** @type {any} */ a) => a.index < log.length - 1 && !a.admitted);
    for (const a of earlier) {
      process.stdout.write('intent ' + a.index + ' at tick ' + a.tick + ' refused: ' + a.reason + '\n');
    }
    const p = failure.intent.proposal;
    const said = last ? (last.admitted ? 'admitted' : 'refused: ' + last.reason) : 'not submitted: the run ended at tick ' + got.end;
    process.stdout.write(tree + ': ' + p.verb + ' ' + p.actor + ' ' + JSON.stringify(p.target) + ' at tick ' + failure.tick + ' ' + said + '\n');
  } finally {
    await proc.close();
  }
} else {
  process.stderr.write('usage: bench trees <repo> <base-rev> <head-rev> <dir> | bench anchors --base <tree> --head <tree> | bench run --base <tree> --head <tree> --out <dir> [options] | bench replay <bundle> --tree <dir>\n');
  process.exit(2);
}
