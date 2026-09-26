// The bench's process model and its runner (T7b pins 2, 5, and 9, "The
// process model"). Each test drives the runner's processes directly: one tree
// per process, a module outside the tree refused, one live world at a time, a
// save restored only where it was taken, a stored witness state that runs as
// the load does, the trace line built from the committed frame, and the
// grammar's draws. The trees are copies of the checkout in a scratch directory
// removed when the tests end.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runBench } from './bench.js';
import { copyCheckout, plant, scratch, teardown } from './plant.js';
import { oneTreePerProcess, startProcess } from './processes.js';
import { FOLD_CASE, inside, samePath } from './trees.js';

const dir = scratch('process');
/** @type {string} */
let head;
/** @type {string} */
let base;
/** @type {any} */
let room;
/** @type {any[]} */
let swept = [];

/** @type {import('./processes.js').Proc[]} */
const open = [];

/**
 * @param {Parameters<typeof startProcess>[0]} options
 */
async function proc(options) {
  const p = await startProcess(options);
  open.push(p);
  return p;
}

before(async () => {
  head = copyCheckout(dir, 'head');
  base = copyCheckout(dir, 'base');
  const sweeper = await proc({ name: 'sweep', tree: head, build: 'product', modules: ['sweep'] });
  room = (await sweeper.call('world-input', { file: 'fixtures/bench/room.json' })).input;
  const got = await sweeper.call('sweep', { input: room, budget: { quanta: 12000, restores: 120 } });
  swept = got.candidates;
  await sweeper.close();
});

after(async () => {
  await Promise.all(open.map((p) => p.close()));
  await teardown(dir);
});

/**
 * A swept candidate as the ladder hands it to a process.
 * @param {any} c
 * @param {string | null} key
 */
function args(c, key) {
  const strip = (/** @type {any} */ e) => {
    const proposal = { ...e.proposal };
    delete proposal.frameHash;
    return { tick: e.tick, proposal };
  };
  const witness = c.witness.map(strip);
  return { world: room.world, seed: room.seed, entries: witness.concat([strip(c.intent)]), witness: witness.length, witnessEnd: c.witnessEnd, key, restoreCheck: false, window: false };
}

test('a process runs one tree: another tree\'s modules, a working directory that is not its tree\'s root, and two trees run as one process are each refused', async () => {
  const p = await proc({ name: 'head', tree: head, build: 'product' });
  await assert.rejects(p.call('import-tree', { tree: base }), /refused: .* lies outside this process's tree/);
  // The working directory, changed after init: the next message refuses.
  const q = await proc({ name: 'head', tree: head, build: 'product' });
  await q.call('chdir', { dir: base });
  await assert.rejects(q.call('candidate', args(swept[0], null)), /is not this process's tree .*never by its working directory/);
  // A process started in another tree's directory refuses at init.
  await assert.rejects(startProcess({ name: 'base', tree: base, build: 'product', cwd: head }), /is not this process's tree/);
  // The rule plant of pin 9, run as two trees in one process, is refused.
  const planted = copyCheckout(dir, 'rule-one-process');
  plant(planted, 'predicates/intents/move.json', '"maxDistance": 3', '"maxDistance": 0.1');
  const report = await runBench({ base, head: planted, out: join(dir, 'one-process'), worlds: [{ file: 'fixtures/bench/room.json' }], plant: { oneProcess: true }, mutants: { enabled: false } });
  assert.match(String(report.refused), /2 trees in one process; each tree runs in a fresh process of its own/);
});

test('two runs interleaved in one process are refused: a run begins only when the last has finished or been restored', async () => {
  const p = await proc({ name: 'head', tree: head, build: 'product' });
  await p.call('open-run', { name: 'a run left live' });
  await assert.rejects(p.call('candidate', args(swept[0], null)), /a run is live in this process \(a run left live\); candidate .* may begin only when it has finished or been restored: one live world at a time/);
});

test('a module planted to resolve from outside its tree, by a bare import a parent directory\'s node_modules satisfies, is refused', async () => {
  const outer = join(dir, 'outer');
  const tree = copyCheckout(outer, 'tree');
  mkdirSync(join(outer, 'node_modules', 'bench-plant'), { recursive: true });
  writeFileSync(join(outer, 'node_modules', 'bench-plant', 'package.json'), JSON.stringify({ name: 'bench-plant', version: '1.0.0', type: 'module', main: 'index.js' }));
  writeFileSync(join(outer, 'node_modules', 'bench-plant', 'index.js'), 'export const planted = 1;\n');
  plant(tree, 'packages/tick/canonical.js', '\nexport function canonical(', '\nimport \'bench-plant\';\nexport function canonical(');
  await assert.rejects(startProcess({ name: 'planted', tree, build: 'product' }), /refused: file:.*node_modules\/bench-plant\/index\.js lies outside this process's tree/);
});

test('a save is restored only in the process that took it: the head\'s save is refused in the base\'s process by its tag before any restore, though both run one binary file', async () => {
  const h = await proc({ name: 'head', tree: head, build: 'product' });
  const b = await proc({ name: 'base', tree: base, build: 'product' });
  assert.equal(h.init.binary, b.init.binary, 'solver/ unchanged: both run one binary');
  const c = swept.find((x) => x.witness.length > 0) || swept[0];
  await h.call('candidate', args(c, 'shared-key'));
  const exported = await h.call('export-save', { key: 'shared-key' });
  assert.ok(exported.save, 'the head stored the witness state');
  assert.match(exported.save.tag.process, /^head#/);
  await assert.rejects(b.call('import-save', { save: exported.save, world: room.world, seed: room.seed }), /the save was taken in process head#.* \(tree .*, build product\), and this is process base#.* a save is restored only in the process that took it, even when both run one binary file/);
  // Refused before any restore: the base runs on as before.
  const after = await b.call('candidate', args(c, null));
  assert.equal(after.failure, null);
});

test('two candidates from one witness: the second starts from the process\'s own stored save, and its trace, the stored prefix prepended, equals a run from the load', async () => {
  const p = await proc({ name: 'head', tree: head, build: 'product' });
  /** @type {Map<string, any[]>} */
  const byCell = new Map();
  for (const c of swept) {
    byCell.set(c.cell, (byCell.get(c.cell) || []).concat([c]));
  }
  const pair = Array.from(byCell.values()).find((list) => list.length >= 2 && list[0].witness.length > 0);
  assert.ok(pair, 'a swept cell with a witness and two actions');
  const [first, second] = /** @type {any[]} */ (pair);
  const one = await p.call('candidate', args(first, 'witness'));
  assert.equal(one.restoredWitness, false, 'the first reaches the witness from the load');
  const two = await p.call('candidate', args(second, 'witness'));
  assert.equal(two.restoredWitness, true, 'the second restores the stored save');
  const fromLoad = await p.call('candidate', args(second, null));
  assert.equal(fromLoad.restoredWitness, false);
  assert.deepEqual(two.digests, fromLoad.digests, 'the stored prefix and the rest trace as a run from the load');
  assert.deepEqual(two.hashes, fromLoad.hashes);
  assert.ok(two.witnessQuanta < fromLoad.witnessQuanta, 'the restore spared the witness\'s quanta');
});

test('a candidate whose intent the base refuses is followed by one that needs the solver to hold its world, and the second\'s admissions agree on both trees', async () => {
  const narrow = copyCheckout(dir, 'narrow-base');
  plant(narrow, 'predicates/intents/move.json', '"maxDistance": 3', '"maxDistance": 0.1');
  const h = await proc({ name: 'head', tree: head, build: 'product' });
  const b = await proc({ name: 'base', tree: narrow, build: 'product' });
  const move = swept.find((c) => c.witness.length === 0 && c.intent.proposal.verb === 'move');
  const pick = swept.find((c) => c.intent.proposal.verb === 'pick-up' && c.witness.every((/** @type {any} */ e) => e.proposal.verb !== 'move'));
  assert.ok(move && pick, 'a move from the load and a pick-up with no move before it');
  const [hm, bm] = await Promise.all([h.call('candidate', { ...args(move, null), restoreCheck: true }), b.call('candidate', { ...args(move, null), restoreCheck: true })]);
  assert.equal(hm.admissions[0].admitted, true);
  assert.equal(bm.admissions[0].admitted, false);
  assert.match(bm.admissions[0].reason, /target is beyond move range 0\.1/);
  const [hp, bp] = await Promise.all([h.call('candidate', args(pick, null)), b.call('candidate', args(pick, null))]);
  assert.deepEqual(bp.admissions.map((/** @type {any} */ a) => [a.admitted, a.reason]), hp.admissions.map((/** @type {any} */ a) => [a.admitted, a.reason]));
  assert.ok(hp.admissions.every((/** @type {any} */ a) => a.admitted), 'the pick-up is admitted: the solver holds the world it asks about');
});

test('each trace line is checked against its committed frame, and a runner planted to read the line from the live bodies after a submission goes red', async () => {
  const move = swept.find((c) => c.intent.proposal.verb === 'move');
  const clean = await proc({ name: 'head', tree: head, build: 'product' });
  const ran = await clean.call('candidate', args(move, null));
  assert.equal(ran.failure, null);
  const planted = await proc({ name: 'head', tree: head, build: 'product', plant: { liveLine: true } });
  await assert.rejects(planted.call('candidate', args(move, null)), /the trace line at tick \d+ disagrees with the committed frame: body walker field v[xz] is [0-9a-f]{16} in the line and [0-9a-f]{16} in the frame/);
});

test('the grammar draws from the verbs that reached an anchor at its share, only from them when every verb did and only from the others when none did, at points on a grid that refines the sweep\'s, and a sequence\'s third step runs from the load as the grammar ran it', async () => {
  const p = await proc({ name: 'sweep', tree: head, build: 'product', modules: ['sweep'] });
  const cell = swept.find((c) => c.witness.length === 0);
  const cells = [{ key: cell.cell, actor: 'walker', tick: cell.witnessEnd, witness: [] }];
  /**
   * @param {string[]} reachedVerbs
   * @param {number} n
   */
  const draw = async (reachedVerbs, n) => {
    const init = await p.call('grammar-init', { seed: 3, share: 0.75, pitch: 0.5, steps: 3, cells, input: room, reachedVerbs });
    /** @type {any[]} */
    const made = [];
    for (let i = 0; i < n; i = i + 1) {
      const next = await p.call('grammar-next', {});
      made.push(next.candidate);
    }
    return { init, made };
  };
  const all = await draw(['move', 'push', 'climb', 'pick-up', 'drop', 'use'], 24);
  assert.deepEqual(all.init.unreached, []);
  assert.ok(all.made.every((c) => c.pool === 'reached'), 'every verb reached: every draw from them');
  const none = await draw([], 24);
  assert.ok(none.made.every((c) => c.pool === 'other'), 'no verb reached: every draw from the others');
  const some = await draw(['move'], 60);
  const fromReached = some.made.filter((c) => c.pool === 'reached');
  assert.ok(fromReached.every((c) => c.intent.proposal.verb === 'move'));
  assert.ok(fromReached.length > 30 && fromReached.length < 60, 'about three quarters from move: ' + fromReached.length + ' of 60');
  // Points: multiples of a quarter, the sweep's pitch of a half halved, which
  // hold the sweep's centres and the points between them.
  const points = some.made.map((c) => c.intent.proposal.target).filter((t) => typeof t.x === 'number');
  assert.ok(points.length > 10);
  assert.ok(points.every((t) => Number.isInteger(t.x / 0.25) && Number.isInteger(t.z / 0.25)));
  assert.ok(points.some((t) => !Number.isInteger((t.x - 0.25) / 0.5) || !Number.isInteger((t.z - 0.25) / 0.5)), 'a point between the sweep\'s grid points');
  // A sequence of three steps: the third step's witness is the cell's, then
  // the sequence's first two admitted steps, and its run from the load
  // reproduces the grammar's own trace.
  await p.call('grammar-init', { seed: 11, share: 1, pitch: 0.5, steps: 3, cells, input: room, reachedVerbs: ['move'] });
  /** @type {any[]} */
  let seq = [];
  for (let tries = 0; tries < 200 && !(seq.length === 3 && seq[0].admittedOnHead && seq[1].admittedOnHead); tries = tries + 1) {
    const next = (await p.call('grammar-next', {})).candidate;
    seq = next.step === 0 ? [next] : seq.concat([next]);
  }
  assert.equal(seq.length, 3, 'a sequence of three steps whose first two were admitted');
  const third = seq[2];
  assert.deepEqual(third.witness.map((/** @type {any} */ e) => e.proposal), [seq[0].intent.proposal, seq[1].intent.proposal]);
  const h = await proc({ name: 'head', tree: head, build: 'product' });
  const ran = await h.call('candidate', { world: room.world, seed: room.seed, entries: third.witness.concat([third.intent]), witness: third.witness.length, witnessEnd: third.witnessEnd, key: null, restoreCheck: false, window: false });
  assert.deepEqual(ran.hashes, third.hashes, 'the run from the load hashes as the grammar\'s did');
});

test('two worlds whose first cells share an empty witness do not share a save', async () => {
  const p = await proc({ name: 'sweep', tree: head, build: 'product', modules: ['sweep'] });
  const otherWorld = JSON.parse(JSON.stringify(room.world));
  const crate = otherWorld.bodies.find((/** @type {{ id: string, x: number }} */ body) => body.id === 'crate');
  crate.x = crate.x + 0.1;
  const other = { ...room, name: room.name + '-other', world: otherWorld };
  const cell = { key: 'load', actor: 'walker', tick: 0, witness: [] };
  /**
   * @param {any} input
   */
  const draw = async (input) => {
    await p.call('grammar-init', { seed: 1, share: 1, pitch: 0.5, steps: 1, cells: [cell], input, reachedVerbs: ['move'] });
    const made = await p.call('grammar-next', {});
    assert.ok(made && made.candidate, JSON.stringify(made));
    return made.candidate;
  };
  await draw(room);
  const second = await draw(other);
  const h = await proc({ name: 'head', tree: head, build: 'product' });
  const fresh = await h.call('candidate', {
    world: other.world, seed: other.seed,
    entries: second.witness.concat([second.intent]),
    witness: second.witness.length, witnessEnd: second.witnessEnd,
    key: null, restoreCheck: false, window: false,
  });
  assert.deepEqual(fresh.hashes, second.hashes, 'the second world is drawn from its own load, not restored from the first world\'s save');
});

test('paths compare without case on Windows and macOS and by case elsewhere, in the bench and in each process\'s working-directory check and resolve hook alike', async () => {
  assert.equal(FOLD_CASE, process.platform === 'win32' || process.platform === 'darwin');
  // The rule, each way, on any platform.
  const upper = resolve(dir, 'Tree');
  const lower = resolve(dir, 'tree');
  assert.equal(samePath(upper, lower, false), false);
  assert.equal(samePath(upper, lower, true), true);
  assert.equal(inside(upper, join(lower, 'x.js'), false), false);
  assert.equal(inside(upper, join(lower, 'x.js'), true), true);
  assert.throws(() => oneTreePerProcess([upper, lower], false), /refused: 2 trees in one process/);
  oneTreePerProcess([upper, lower], true);
  // A process takes the bench's rule at init and applies it.
  const p = await proc({ name: 'head', tree: head, build: 'product' });
  assert.equal(p.init.foldCase, FOLD_CASE);
  if (FOLD_CASE) {
    // Here a tree named in another case is the same tree: a process whose
    // working directory has the tree's own case starts, and one handed the
    // other rule refuses that working directory as another tree's.
    const shouted = head.toUpperCase();
    assert.notEqual(shouted, head);
    const q = await proc({ name: 'shouted', tree: shouted, cwd: head, build: 'product' });
    assert.equal(q.init.foldCase, true);
    await assert.rejects(proc({ name: 'shouted', tree: shouted, cwd: head, build: 'product', foldCase: false }), /is not this process's tree/);
  } else {
    // Here a directory beside the tree, named as the tree but for case, is
    // outside it: a module there is refused, and a process handed the other
    // rule would take it as the tree's own.
    const cased = copyCheckout(dir, 'Cased');
    mkdirSync(join(dir, 'cased'), { recursive: true });
    writeFileSync(join(dir, 'cased', 'planted.js'), 'export const planted = 1;\n');
    plant(cased, 'packages/tick/canonical.js', '\nexport function canonical(', '\nimport \'../../../cased/planted.js\';\nexport function canonical(');
    await assert.rejects(proc({ name: 'cased', tree: cased, build: 'product' }), /cased\/planted\.js lies outside this process's tree/);
    const q = await proc({ name: 'cased', tree: cased, build: 'product', foldCase: true });
    assert.ok(q.init.loaded.some((/** @type {string} */ url) => url.endsWith('/cased/planted.js')));
  }
});
