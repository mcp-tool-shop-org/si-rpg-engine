// Each rung goes red (T7b pins 6 and 9, "Each rung goes red"): a restore that
// drops the hasher's lanes, in the head and then in the base; a predicate
// that admits on every other call; a throw after an admitted push; a body
// that leaves through a gap in the floor; and a world that does not settle.
// Each is one bench run on its own pair of trees, and the runs go together,
// in parallel, before the tests read their records.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBench } from './bench.js';
import { copyCheckout, plant, removeScratch, scratch } from './plant.js';
import { FINDING, apply } from './plants.js';

const dir = scratch('rungs');

/** @type {Record<string, { report: any, records: any[], out: string }>} */
const runs = {};

/**
 * @param {string} name
 * @param {import('./plants.js').Edit[]} edits
 * @param {{ inBase?: boolean, world: string }} o
 */
async function run(name, edits, o) {
  const head = copyCheckout(dir, name + '-head');
  const base = copyCheckout(dir, name + '-base');
  apply(plant, o.inBase ? base : head, edits);
  const out = join(dir, name + '-out');
  const report = await runBench({
    base, head, out, seed: 3, worlds: [{ file: o.world }],
    budgets: { sweep: { quanta: 6000, restores: 60 }, ladder: { quanta: 8000, restores: 80 } },
    proposers: { grammar: false }, mutants: { enabled: false },
  });
  const records = readFileSync(join(out, 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { report, records, out };
}

before(async () => {
  const names = ['dropHead', 'dropBase', 'alternate', 'throws', 'gap', 'pit'];
  const made = await Promise.all([
    run('drop-head', FINDING.dropLanes, { world: 'fixtures/bench/room.json' }),
    run('drop-base', FINDING.dropLanes, { inBase: true, world: 'fixtures/bench/room.json' }),
    run('alternate', FINDING.alternate, { world: 'fixtures/bench/room.json' }),
    run('throws', FINDING.throws, { world: 'fixtures/bench/room.json' }),
    run('gap', [], { world: 'fixtures/bench/gap.json' }),
    run('pit', [], { world: 'fixtures/bench/pit.json' }),
  ]);
  names.forEach((name, i) => { runs[name] = made[i]; });
});

after(() => removeScratch(dir));

test('a planted restore that drops one saved field, in the head, fails rung 0 on the head: the candidate is a finding of the tick or the restore, and none of its rungs 1 to 3 is recorded', () => {
  const r = runs.dropHead;
  assert.equal(r.report.refused, null);
  assert.ok(r.records.length > 0);
  for (const x of r.records) {
    assert.equal(x.rungs[0].head.ok, false);
    assert.match(x.rungs[0].head.detail, /^(a save and restore at tick \d+ does not trace identically|the candidate does not run twice to the same trace):\n/);
    assert.deepEqual(x.recorded, ['0']);
    assert.deepEqual([x.rungs[1], x.rungs[2], x.rungs[3]], [null, null, null]);
    assert.ok(x.notes.includes('rung 0 failed on the head: the candidate is not a test input, and none of its rungs 1 to 3 is recorded; a finding of the tick or the restore'));
  }
  assert.deepEqual(r.report.findings.head.map((/** @type {any} */ f) => f.id), r.records.map((x) => x.id));
  assert.deepEqual(r.report.findings.base, []);
  assert.deepEqual(r.report.proposers.sweep.differences, []);
});

test('the same restore planted in the base fails rung 0 on the base, a finding of the base and not a difference: rung 1 is recorded, and rungs 2 and 3 are not, with the reason', () => {
  const r = runs.dropBase;
  assert.ok(r.records.length > 0);
  for (const x of r.records) {
    assert.equal(x.rungs[0].head.ok, true);
    assert.equal(x.rungs[0].base.ok, false);
    assert.deepEqual(x.recorded, ['0', '1']);
    assert.equal(typeof x.rungs[1], 'boolean');
    assert.deepEqual([x.rungs[2], x.rungs[3]], [null, null]);
    assert.ok(x.notes.includes('rung 0 failed on the base: a finding of the base, not a difference; its run is no sound reference, so rungs 2 and 3 are not recorded'));
  }
  assert.deepEqual(r.report.findings.base.map((/** @type {any} */ f) => f.id), r.records.map((x) => x.id));
  assert.deepEqual(r.report.findings.head, []);
  assert.deepEqual(r.report.proposers.sweep.differences, []);
});

test('a predicate that admits on every other call, by a counter kept outside the tick, fails rung 0\'s second run', () => {
  const r = runs.alternate;
  // Rung 0's second run meets the counter at the other parity: it differs
  // from the first run, or its restored half from the half it repeats.
  const failed = r.records.filter((x) => !x.rungs[0].head.ok);
  assert.ok(failed.length > 0);
  for (const x of failed) {
    assert.match(x.rungs[0].head.detail, /^(the candidate does not run twice to the same trace|a save and restore at tick \d+ does not trace identically):\n/);
    assert.equal(x.rungs[0].base.ok, true);
  }
  assert.ok(failed.some((x) => /^the candidate does not run twice to the same trace:\n/.test(x.rungs[0].head.detail)));
});

test('a test-only plant that throws after an admitted push, as T6\'s does, fails rung 3 on the head, a catch since the base does not throw, written as a bundle', () => {
  const r = runs.throws;
  const thrown = r.records.filter((x) => x.rungs[3] && x.rungs[3].failures.head);
  assert.ok(thrown.length > 0);
  for (const x of thrown) {
    assert.equal(x.intent.proposal.verb, 'push');
    assert.equal(x.rungs[3].failures.head.kind, 'throws');
    assert.equal(x.rungs[3].failures.base, null);
    assert.equal(x.rungs[3].catch, true);
    assert.ok(x.bundle && existsSync(join(r.out, x.bundle)));
  }
  assert.equal(r.report.proposers.sweep.rungs.catches, thrown.length);
});

test('a candidate whose body leaves a test world through a gap in the floor fails rung 3 on the head; the base has the gap too, so it is not a catch', () => {
  const r = runs.gap;
  const left = r.records.filter((x) => x.rungs[3] && x.rungs[3].failures.head && x.rungs[3].failures.head.kind === 'leaves');
  assert.ok(left.length > 0);
  for (const x of left) {
    assert.match(x.rungs[3].failures.head.detail, /^walker leaves the world: its centre is at y -1\.\d+, below the lowest collider minimum -1, at tick \d+$/);
    assert.equal(x.rungs[3].failures.base.kind, 'leaves');
    assert.equal(x.rungs[3].catch, false);
    assert.equal(x.rungs[2], null);
  }
  assert.equal(r.report.proposers.sweep.rungs.catches, 0);
});

test('a test world that does not settle within 512 quanta after an action fails rung 3', () => {
  const r = runs.pit;
  const unsettled = r.records.filter((x) => x.rungs[3] && x.rungs[3].failures.head && x.rungs[3].failures.head.kind === 'unsettled');
  assert.ok(unsettled.length > 0);
  for (const x of unsettled) {
    assert.match(x.rungs[3].failures.head.detail, /^the world does not settle within 512 quanta after the action ends: walker still moving at tick \d+/);
    // Rung 0 holds: its second run, resumed from the midpoint, counts the 512
    // quanta from where the run fell idle, as the first run did.
    assert.equal(x.rungs[0].head.ok, true);
    assert.equal(x.rungs[3].catch, false);
  }
});
