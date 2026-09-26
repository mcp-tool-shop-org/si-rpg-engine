// The record and the report (T7b pins 4, 5, 8, and 9, "The report",
// "Swapped trees", and "Determinism"). A hasher changed in the head floods
// every candidate at tick 0 and makes the product scene, a control input,
// differ; a log bundle that run writes is then a control input for the head
// that recorded it and for another build; one more quantum for every action
// is run with the trees one way and then swapped; and two pairs of git
// worktrees at different paths run one seed. The stall's keys and the late
// gain are checked on records made here.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBench } from './bench.js';
import { copyProduct } from './build.js';
import { copyCheckout, plant, removeScratch, scratch } from './plant.js';
import { FINDING, apply } from './plants.js';
import { STALL_GRID, differenceKeys, lateGain } from './report.js';
import { makeWorktree, removeWorktree } from './trees.js';

const dir = scratch('report');
const checkout = process.cwd();
const ROOM = [{ file: 'fixtures/bench/room.json' }];
const SMALL = { sweep: { quanta: 1500, restores: 30 }, ladder: { quanta: 4000, restores: 40 } };

/** @type {Record<string, { report: any, records: any[], out: string }>} */
const runs = {};
/** @type {string[]} */
const worktrees = [];
/** @type {string} */
let logBundle;

/**
 * @param {string} name
 * @param {Omit<Parameters<typeof runBench>[0], 'out'>} options
 */
async function bench(name, options) {
  const out = join(dir, name + '-out');
  const report = await runBench({ ...options, out });
  const records = readFileSync(join(out, 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { report, records, out };
}

before(async () => {
  const hasherHead = copyCheckout(dir, 'hasher-head');
  apply(plant, hasherHead, FINDING.hasher);
  const clean = copyCheckout(dir, 'clean');
  const cleanToo = copyCheckout(dir, 'clean-too');
  runs.hasher = await bench('hasher', {
    base: clean, head: hasherHead, seed: 3, worlds: ROOM, budgets: SMALL,
    proposers: { grammar: false }, mutants: { enabled: false }, controls: [{ productScene: true }],
  });
  const candidateBundles = readdirSync(join(runs.hasher.out, 'bundles')).filter((f) => /^c\d+\.bundle\.json$/.test(f) && f !== runs.hasher.report.controls[0].bundle.replace('bundles/', ''));
  logBundle = join(runs.hasher.out, 'bundles', candidateBundles[0]);

  const quantaHead = copyCheckout(dir, 'quanta-head');
  apply(plant, quantaHead, FINDING.quanta);
  const quantaBase = copyCheckout(dir, 'quanta-base');
  apply(plant, quantaBase, FINDING.quanta);
  // Two pairs of worktrees of this commit, at paths of different lengths, the
  // same change planted in each head, and the head's product binary beside it.
  /** @type {string[][]} */
  const pairs = [];
  for (const at of ['determinism-a', 'determinism-bb']) {
    const base = makeWorktree(checkout, 'HEAD', join(dir, at, 'base'));
    const head = makeWorktree(checkout, 'HEAD', join(dir, at, 'head'));
    worktrees.push(base, head);
    apply(plant, head, FINDING.rule);
    copyProduct(checkout, head);
    pairs.push([base, head]);
  }
  const made = await Promise.all([
    bench('match', { base: clean, head: hasherHead, seed: 3, worlds: [], proposers: { grammar: false }, mutants: { enabled: false }, controls: [{ file: logBundle }] }),
    bench('mismatch', { base: cleanToo, head: clean, seed: 3, worlds: [], proposers: { grammar: false }, mutants: { enabled: false }, controls: [{ file: logBundle }] }),
    bench('swap-one-way', { base: cleanToo, head: quantaHead, seed: 3, worlds: ROOM, budgets: SMALL, proposers: { grammar: false }, mutants: { enabled: false } }),
    bench('swap-other-way', { base: quantaBase, head: clean, seed: 3, worlds: ROOM, budgets: SMALL, proposers: { grammar: false }, mutants: { enabled: false } }),
    bench('determinism-a', { base: pairs[0][0], head: pairs[0][1], seed: 11, worlds: ROOM, budgets: SMALL, mutants: { enabled: true, cap: 2 } }),
    bench('determinism-bb', { base: pairs[1][0], head: pairs[1][1], seed: 11, worlds: ROOM, budgets: SMALL, mutants: { enabled: true, cap: 2 } }),
  ]);
  [runs.match, runs.mismatch, runs.swapOne, runs.swapOther, runs.detA, runs.detB] = made;
});

after(() => {
  for (const tree of worktrees) {
    removeWorktree(checkout, tree);
  }
  removeScratch(dir);
});

test('a change to the hasher makes every candidate differ at tick 0, in the snapshot digest the hasher also makes, and the report shows one flood line in place of the list', () => {
  const r = runs.hasher;
  assert.equal(r.report.refused, null);
  const sweep = r.records.filter((x) => x.proposer === 'sweep');
  assert.ok(sweep.length >= 2);
  assert.ok(sweep.every((x) => x.rungs[2] && x.rungs[2].kind === 'trace' && x.rungs[2].tick === 0 && x.rungs[2].field === 'snapshot'));
  assert.deepEqual(r.report.proposers.sweep.floods.map((/** @type {any} */ f) => f.line), ['every one of the ' + sweep.length + ' candidates compared differs the same way: at tick 0 in the snapshot']);
  assert.deepEqual(r.report.proposers.sweep.differences, []);
  assert.match(readFileSync(join(r.out, 'report.md'), 'utf8'), /\nFlood: every one of the \d+ candidates compared differs the same way: at tick 0 in the snapshot\n/);
});

test('a finding on a control input is written as the input\'s own bundle, with the bench\'s first-difference block in its failure block', () => {
  const r = runs.hasher;
  const control = r.report.controls[0];
  assert.deepEqual(control.control, { kind: 'product', file: 'product scene' });
  // T1's comparison names the snapshot's digest, which the hasher also makes,
  // before the frame hash.
  assert.match(control.block, /^first difference at tick 0\nsnapshot\n/);
  const bundle = JSON.parse(readFileSync(join(r.out, control.bundle), 'utf8'));
  assert.equal(bundle.run, 'product');
  assert.deepEqual(bundle.failure, { test: 'bench', block: control.block });
  const record = r.records.find((x) => x.id === control.id);
  assert.equal(record.proposer, 'control');
  assert.deepEqual(record.control, { kind: 'product', file: 'product scene' });
  // A control input has no witness, so its window is its whole run from the
  // load, and it reaches the hasher.
  assert.ok(record.anchors.some((/** @type {string} */ id) => id.startsWith('js:packages/frame/hash.js:')), JSON.stringify(record.anchors));
});

test('a log control input runs on both trees, and its recorded hashes match the head that recorded it; from another build it is reported as a mismatch', () => {
  const match = runs.match.records[0];
  assert.deepEqual(match.control, { kind: 'log', file: logBundle });
  assert.ok(match.recorded.includes('2'), 'compared: it ran on both trees');
  assert.ok(match.notes.includes('its recorded hashes match the head\'s run'));
  const other = runs.mismatch.records[0];
  assert.ok(other.recorded.includes('2'));
  // Rung 2 compares the trees' runs with each other, never with the
  // recording: the two clean trees agree though the recording does not.
  assert.equal(other.rungs[2], null);
  assert.ok(other.notes.some((/** @type {string} */ n) => /^its recorded hashes do not match the head's run, first at tick 0: the bundle is from another build$/.test(n)), JSON.stringify(other.notes));
});

test('a run of known length is reported with its exact quanta and restores', () => {
  // The log bundle's run is n quanta. Rung 0 runs it again from the load,
  // saves at the midpoint, runs on to the end, restores, and runs the second
  // half again (pin 6): n + n + (n - floor(n / 2)) quanta and one restore.
  const n = JSON.parse(readFileSync(logBundle, 'utf8')).quanta;
  assert.deepEqual(runs.match.report.spent, { quanta: 3 * n - Math.floor(n / 2), restores: 1 });
  assert.deepEqual(runs.match.records[0].cost, runs.match.report.spent);
});

test('the late gain is reported for each n of 8, 16, 32, 64, and 128', () => {
  for (const proposer of ['sweep', 'grammar']) {
    assert.deepEqual(runs.detA.report.proposers[proposer].lateGain.map((/** @type {any} */ g) => g.n), [8, 16, 32, 64, 128]);
  }
  assert.deepEqual(STALL_GRID, [8, 16, 32, 64, 128]);
});

test('a candidate\'s record holds every field pin 8 names: its witness and intent, its proposer, its anchors reached, its admission on each tree with reasons, its rungs, and its first-difference block', () => {
  const x = runs.detA.records.find((r) => r.proposer === 'grammar' && r.rungs[2]);
  assert.ok(x, 'a grammar candidate that differs');
  for (const field of ['witness', 'intent', 'proposer', 'anchors', 'admission', 'rungs']) {
    assert.ok(field in x, field);
  }
  assert.ok(Array.isArray(x.witness) && x.witness.every((/** @type {any} */ e) => typeof e.tick === 'number' && e.proposal));
  assert.equal(typeof x.intent.tick, 'number');
  assert.ok(Array.isArray(x.anchors));
  for (const tree of ['head', 'base']) {
    assert.ok(x.admission[tree].every((/** @type {any} */ a) => typeof a.admitted === 'boolean' && typeof a.reason === 'string' && (a.admitted || a.reason.length > 0)));
  }
  assert.deepEqual(Object.keys(x.rungs).sort(), ['0', '1', '2', '3']);
  assert.match(x.rungs[2].block, /^first difference at tick \d+/);
});

test('the report\'s mutant section says the mutants measure the candidates\' sensitivity at the change, not the aim', () => {
  const note = 'The mutants measure the candidates\' sensitivity at the change, not the aim, which is the access map\'s to measure.';
  assert.equal(runs.detA.report.mutants.note, note);
  assert.ok(readFileSync(join(runs.detA.out, 'report.md'), 'utf8').includes('## Mutants\n\n' + note + '\n'));
});

test('with its base and head swapped, the bench reports the same differences, with the sides named the other way', () => {
  /**
   * The load's own candidates: the one set both sweeps make, since the plant
   * changes no admission and the load settles before any action.
   * @param {any[]} records
   */
  const fromLoad = (records) => new Map(records.filter((x) => x.witness.length === 0 && x.rungs[2]).map((x) => [JSON.stringify(x.intent), x.rungs[2]]));
  const one = fromLoad(runs.swapOne.records);
  const other = fromLoad(runs.swapOther.records);
  assert.ok(one.size >= 2, 'differences from the load');
  assert.deepEqual(Array.from(other.keys()).sort(), Array.from(one.keys()).sort());
  for (const [key, d] of one) {
    const e = other.get(key);
    assert.equal(e.kind, d.kind);
    assert.equal(e.tick, d.tick);
    if (d.kind === 'trace') {
      assert.deepEqual([e.body, e.field], [d.body, d.field]);
      // The block names each side by the tree it ran on: the head's value in
      // one run is the base's in the other.
      const [, , headOne, baseOne] = d.block.split('\n');
      const [, , headOther, baseOther] = e.block.split('\n');
      assert.equal(headOne.replace(/^ {2}head/, ''), baseOther.replace(/^ {2}base/, ''));
      assert.equal(baseOne.replace(/^ {2}base/, ''), headOther.replace(/^ {2}head/, ''));
    } else if (d.kind === 'admission') {
      assert.equal(e.refusing, d.refusing === 'head' ? 'base' : 'head');
      assert.deepEqual(e.reasons, { head: d.reasons.base, base: d.reasons.head });
    }
  }
});

test('two runs with one seed, from git worktrees at different paths, give equal reports outside the environment block, and the report names the seed', () => {
  const a = runs.detA.report;
  const b = runs.detB.report;
  assert.equal(a.refused, null);
  assert.equal(a.seed, 11);
  assert.notEqual(a.environment.trees.head.path, b.environment.trees.head.path);
  assert.match(a.environment.trees.head.commit, /^[0-9a-f]{40}$/);
  // The environment block holds the paths, the digests, the host, and the times.
  for (const key of ['trees', 'binaries', 'host', 'times', 'paths', 'processes']) {
    assert.ok(key in a.environment, key);
  }
  assert.match(a.environment.trees.head.digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(a.environment.host).sort(), ['arch', 'cpus', 'node', 'platform']);
  const outside = (/** @type {any} */ r) => {
    const copy = { ...r };
    delete copy.environment;
    return copy;
  };
  assert.deepEqual(outside(a), outside(b));
  assert.ok(a.proposers.grammar.ran > 0 && a.mutants.list.length > 0, 'the grammar and the mutants ran, and agree too');
});

test('two admission differences on one verb, refused on the same tree, count as one new difference for the stall, and one on another verb as a second', () => {
  /**
   * @param {string} id
   * @param {string} verb
   * @param {string} refusing
   */
  const record = (id, verb, refusing) => /** @type {any} */ ({
    id, anchors: ['rule:predicates/intents/move.json:move:1'], lines: {}, admittedOnHead: true,
    rungs: { 0: {}, 1: true, 2: { kind: 'admission', tick: 40, index: 0, verb, refusing, reasons: {}, block: '' }, 3: null },
  });
  const records = [record('c1', 'move', 'head'), record('c2', 'move', 'head'), record('c3', 'climb', 'head')];
  assert.deepEqual(differenceKeys(records[0]), differenceKeys(records[1]));
  assert.notDeepEqual(differenceKeys(records[2]), differenceKeys(records[0]));
  // After c1, c2 is no gain and c3 is one: with n = 1 the grammar would stall
  // at c2. The grid starts at 8, so eight more records with no gain follow.
  const quiet = Array.from({ length: 8 }, (_, i) => record('q' + i, 'move', 'head'));
  const grid = lateGain(records.concat(quiet));
  assert.equal(grid[0].n, 8);
  assert.equal(grid[0].stalledAt, 'q7', 'two new differences in three records, then eight with none');
});

test('an anchor reached only after the grammar\'s stall shows a late gain above zero', () => {
  /**
   * @param {string} id
   * @param {Record<string, number[]>} lines
   */
  const record = (id, lines) => /** @type {any} */ ({ id, anchors: Object.keys(lines), lines, admittedOnHead: true, rungs: { 0: {}, 1: true, 2: null, 3: null } });
  const records = [record('c1', { 'js:a:f:1': [3] })];
  for (let i = 0; i < 8; i = i + 1) {
    records.push(record('q' + i, { 'js:a:f:1': [3] }));
  }
  records.push(record('late', { 'js:b:g:9': [12] }));
  const grid = lateGain(records);
  assert.equal(grid[0].stalledAt, 'q7');
  assert.deepEqual(grid[0].lateGain, { lines: 1, differences: 0 });
  assert.equal(grid[1].stalledAt, null, 'no stall of 16');
});
