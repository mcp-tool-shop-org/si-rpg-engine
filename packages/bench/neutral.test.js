// The bench on a head of behaviour-neutral changes (T7b pin 9, "Anchors and
// reach"), each planted for one case: none of them changes what any run
// computes, so the bench must find no difference while it names each anchor,
// reaches it by the source the case names, and marks it. The same head
// carries one change of each kind pin 1 does not aim at that needs no build,
// and the base carries a fixture edited alone. One bench run; each test reads
// its report, its records, and its access map.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBench } from './bench.js';
import { copyCheckout, plant, removeScratch, scratch } from './plant.js';
import { BASE_FIXTURE, NEUTRAL, NOT_AIMED, apply } from './plants.js';
import { productGlue } from './build.js';

const dir = scratch('neutral');
/** @type {any} */
let report;
/** @type {any} */
let access;
/** @type {any[]} */
let records;
/** @type {string} */
let head;
/** @type {string} */
let base;

before(async () => {
  head = copyCheckout(dir, 'head');
  base = copyCheckout(dir, 'base');
  for (const edits of Object.values(NEUTRAL)) {
    apply(plant, head, edits);
  }
  for (const edits of Object.values(NOT_AIMED)) {
    apply(plant, head, edits);
  }
  apply(plant, base, BASE_FIXTURE);
  report = await runBench({
    base, head, out: join(dir, 'out'), seed: 3, worlds: [{ file: 'fixtures/bench/room.json' }],
    budgets: { sweep: { quanta: 12000, restores: 120 }, ladder: { quanta: 25000, restores: 250 } },
    mutants: { enabled: true, cap: 0 },
  });
  access = JSON.parse(readFileSync(join(dir, 'out', 'access.json'), 'utf8'));
  records = readFileSync(join(dir, 'out', 'records.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
});

after(() => removeScratch(dir));

/**
 * The report's anchor whose id starts with a prefix; exactly one.
 * @param {string} prefix
 */
function anchor(prefix) {
  const found = report.anchors.filter((/** @type {any} */ a) => a.id.startsWith(prefix));
  assert.equal(found.length, 1, prefix + ': ' + report.anchors.map((/** @type {any} */ a) => a.id).join(' | '));
  return found[0];
}

/**
 * @param {string} id
 */
function accessOf(id) {
  return access.anchors.find((/** @type {any} */ a) => a.id === id);
}

test('the neutral head runs through the ladder on both trees and differs nowhere: every verdict is "no trace difference"', () => {
  assert.equal(report.refused, null);
  assert.ok(records.length >= 40, records.length + ' records');
  for (const r of records) {
    assert.deepEqual(r.recorded, ['0', '1', '2', '3'], r.id);
    assert.equal(r.rungs[2], null, r.id + ' differs: ' + (r.rungs[2] && r.rungs[2].block));
    assert.equal(r.rungs[3].catch, false, r.id);
  }
  assert.ok(report.anchors.every((/** @type {any} */ a) => a.differences === 0));
  assert.ok(report.anchors.filter((/** @type {any} */ a) => a.reached).every((/** @type {any} */ a) => a.wording === 'no trace difference' || a.wording === 'reached and not observable'));
});

test('a comment inside a JS function is rewritten: the anchor is reached, marked no executable change, shows no trace difference, and is listed with no mutants, with that reason', () => {
  const a = anchor('js:packages/tick/tick.js:buildTick/submit:');
  assert.equal(a.noExecutableChange, true);
  assert.equal(a.reached, true);
  assert.ok(a.reachedBy.includes('window'));
  assert.equal(a.differences, 0);
  assert.ok(report.mutants.none.some((/** @type {any} */ n) => n.anchor === a.id && n.reason === 'no executable change'));
});

test('a function renamed with every caller: its anchors are reached, and there is no trace difference', () => {
  const renamed = anchor('js:packages/tick/predicates.js:nearestFace:');
  assert.equal(renamed.reached, true);
  assert.equal(renamed.noExecutableChange, true, 'a signature line alone is no executable change');
  for (const caller of ['admitCarry', 'admitEpisode', 'admitIntent:']) {
    const a = report.anchors.find((/** @type {any} */ x) => x.id.startsWith('js:packages/tick/predicates.js:' + caller));
    assert.ok(a && a.reached, caller);
    assert.equal(a.differences, 0);
  }
});

test('a refusal\'s reason text alone changed in a predicate gives no difference, in the ladder and in the hazard suite', () => {
  const a = anchor('js:packages/tick/predicates.js:admitEpisode:');
  assert.equal(a.reached, true);
  assert.equal(a.differences, 0);
  assert.ok(records.some((r) => r.anchors.includes(a.id) && r.admission.head.some((/** @type {any} */ x) => /outside zone/.test(x.reason))), 'a refusal with the new text ran');
  assert.ok(report.suite.reasonOnly.some((/** @type {any} */ r) => r.verb === 'use' && /outside zone/.test(r.reasons.head) && /not in zone/.test(r.reasons.base)));
});

test('the text of the use episode is changed: reached and not observable', () => {
  const a = anchor('js:packages/tick/tick.js:buildTick/recordUse:');
  assert.equal(a.reached, true);
  assert.equal(a.observable, 'not observable');
  assert.equal(a.wording, 'reached and not observable');
  assert.match(a.why, /recordEpisode\(\)/);
});

test('a function that runs only while its module loads is marked as running at load and is in neither notReached nor notSeenApproximate; a top-level expression with no identifier runs at load', () => {
  const fn = anchor('js:packages/tick/subject.js:plantedAtLoad:');
  assert.deepEqual(fn.reachedBy, ['load']);
  assert.equal(fn.runsAtLoad, true);
  assert.ok(access.runsAtLoad.includes(fn.id));
  assert.ok(!access.notReached.includes(fn.id) && !access.notSeenApproximate.includes(fn.id));
  const expression = report.anchors.find((/** @type {any} */ a) => a.id.startsWith('top-level:packages/tick/subject.js:(no identifier) line 7:'));
  assert.ok(expression, 'void 0 at line 7');
  assert.equal(expression.runsAtLoad, true);
  assert.deepEqual(expression.reachedBy, ['load']);
  assert.ok(report.notMeasured.runsAtLoad.includes(expression.id));
});

test('a line inside a multi-line top-level declaration takes the declaration\'s identifier', () => {
  const a = anchor('top-level:packages/tick/roles.js:SOURCES:');
  assert.deepEqual(a.identifiers, ['SOURCES']);
  assert.deepEqual(a.lines, [[44, 44]]);
});

test('a top-level constant that only an unreached function names is reported not seen reached (approximate), in the report and in the access map', () => {
  const a = anchor('top-level:packages/tick/replay.js:FRAME_HASH:');
  assert.equal(a.verdict, 'not seen reached (approximate)');
  assert.ok(access.notSeenApproximate.includes(a.id));
  assert.ok(!access.notReached.includes(a.id));
  assert.ok(report.notMeasured.notSeenApproximate.includes(a.id));
});

test('a top-level constant deleted with every use is reported removed, its reach not measurable', () => {
  const a = anchor('deletion:packages/tick/tick.js:48-49:');
  assert.equal(a.removed, true);
  assert.equal(a.verdict, 'removed; reach not measurable');
  assert.deepEqual(a.identifiers, ['FRAME_HASH']);
  assert.ok(report.notMeasured.removed.includes(a.id));
});

test('a line in the tick\'s restore is reached by the restore check, and the access map names that source', () => {
  const a = anchor('js:packages/tick/tick.js:buildTick/restore:');
  assert.deepEqual(a.reachedBy, ['restore']);
  const entries = accessOf(a.id).reachedBy;
  assert.ok(entries.length > 0 && entries.every((/** @type {any} */ e) => e.source === 'restore' && e.candidate && e.candidate.proposer));
});

test('two lines of one function changed, one under a branch no candidate takes: the anchor is reached, and its finer column shows one of its two changed lines reached', () => {
  const a = anchor('js:packages/tick/predicates.js:admitRelease:');
  assert.equal(a.reached, true);
  assert.equal(a.executable.length, 2);
  assert.equal(a.linesReached.length, 1);
  assert.equal(a.linesReached[0], a.executable[0], 'the carried check runs; the gone-body branch does not');
});

test('an imported binding renamed on its import line and in every use: the functions that name it reach the anchor, and the import line runs at load; an exported constant is reached through a function in the file that imports it, and its export line runs at load', () => {
  const imported = anchor('top-level:packages/tick/predicates.js:QUANTUM:');
  assert.deepEqual(imported.identifiers, ['QUANTUM']);
  assert.equal(imported.runsAtLoad, true);
  assert.ok(imported.reachedBy.includes('window'), 'quantaFor names QUANTUM and runs');
  const exported = anchor('top-level:packages/tick/world.js:DT:');
  assert.equal(exported.runsAtLoad, true);
  assert.ok(exported.reachedBy.includes('window'), 'predicates.js imports DT and quantaFor runs');
  assert.ok(accessOf(exported.id).reachedBy.some((/** @type {any} */ e) => e.source === 'load'));
});

test('a changed line no operator applies to, a call\'s two arguments swapped, is listed with no mutants, with that reason', () => {
  const a = anchor('js:packages/tick/predicates.js:admitClimb:');
  assert.equal(a.noExecutableChange, false);
  assert.ok(report.mutants.none.some((/** @type {any} */ n) => n.anchor === a.id && n.reason === 'a changed executable line no operator applies to'));
});

test('a function whose writes the rule cannot classify is marked unknown', () => {
  const a = anchor('js:packages/tick/memory.js:createMemory/mindBeliefs:');
  assert.equal(a.observable, 'unknown');
  assert.match(a.why, /cannot classify what it writes or calls: .*byMind\.set\(\)/);
});

test('a line deleted from a predicate: the deletion anchor\'s block is reached, and it is listed with no mutants', () => {
  const a = anchor('deletion:packages/tick/predicates.js:');
  assert.equal(a.reached, true);
  assert.equal(a.side, 'base');
  assert.ok(report.mutants.none.some((/** @type {any} */ n) => n.anchor === a.id && /deletion/.test(n.reason)));
});

test('a hazard\'s scenario changed: the suite\'s verdicts are compared between the trees, a reason whose text alone differs is no difference, and the anchor is reached by the suite with an entry naming the hazard and its world', () => {
  const a = anchor('hazard:predicates/hazards/beyond-wall.json:');
  assert.equal(report.suite.ran, true);
  assert.deepEqual(report.suite.differences, []);
  assert.ok(report.suite.reasonOnly.some((/** @type {any} */ r) => r.hazard === 'beyond-wall-refuses' && r.reasons.head !== r.reasons.base));
  assert.deepEqual(a.reachedBy, ['suite']);
  const entries = accessOf(a.id).reachedBy;
  assert.ok(entries.every((/** @type {any} */ e) => e.source === 'suite' && e.hazard.id === 'beyond-wall-refuses' && e.hazard.world === 'predicates/hazards/beyond-wall.json'));
  assert.ok(!access.notReached.includes(a.id));
});

test('each kind pin 1 does not aim at is reported not aimed, with its reason, and the candidates still run on both trees', () => {
  /** @type {Record<string, RegExp>} */
  const expected = {
    'not-aimed:predicates/beliefs/keys.json': /belief key/,
    'not-aimed:predicates/roles/npc-mind.json': /role manifest/,
    'not-aimed:packages/load/sweep.js': /packages\/load\/ runs at load or in the sweep/,
    'not-aimed:package.json': /dependency file/,
    'not-aimed:package-lock.json': /dependency file/,
    'not-aimed:harness/golden-gate.test.js': /^a test$/,
    'not-aimed:docs/PHASE-2.md': /^a doc$/,
    'not-aimed:atlas/README.md': /Atlas map/,
    'not-aimed:tools/prompt.js': /^a tool$/,
  };
  for (const [id, reason] of Object.entries(expected)) {
    const n = report.notAimed.find((/** @type {any} */ x) => x.id === id);
    assert.ok(n, id);
    assert.match(n.reason, reason);
    assert.ok(access.notAimed.some((/** @type {any} */ x) => x.id === id));
    assert.ok(!access.anchors.some((/** @type {any} */ x) => x.file === id.slice('not-aimed:'.length)), 'not aimed appears only in notAimed');
  }
  assert.ok(records.every((r) => r.recorded.includes('2')), 'every candidate ran on both trees');
});

test('a fixture edited in the base alone is reported as world differs, and never run from the base', () => {
  assert.deepEqual(report.worldsDiffer, [{ file: 'fixtures/sweep/walled.json', reason: 'world differs, not run' }]);
});

test('with solver/ unchanged, every tree runs the head\'s product binary file, the report says so, and no coverage build is made', () => {
  assert.match(report.binaries.mode, /^solver\/ has no diff: every tree runs the head's product binary file, copied byte for byte$/);
  assert.equal(report.environment.binaries.files.head, report.environment.binaries.files.base);
  assert.deepEqual(readFileSync(productGlue(base)), readFileSync(productGlue(head)));
  assert.equal(report.coverage.made, false);
  assert.equal(report.coverage.why, 'no law anchor');
  assert.equal(report.environment.binaries.coverage, undefined);
});

test('a run whose JS mutants reach the cap lists those left out, by anchor and operator', () => {
  assert.equal(report.mutants.cap, 0);
  assert.ok(report.mutants.leftOut.length > 0);
  assert.ok(report.mutants.leftOut.every((/** @type {any} */ m) => typeof m.anchor === 'string' && typeof m.operator === 'string'));
  assert.deepEqual(report.mutants.list, []);
});
