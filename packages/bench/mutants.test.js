// Mutants measure the bench (T7b pins 7 and 9, "Mutants"). Each operator
// makes its mutant on a planted line of its form, and a numeric constant its
// four; the order is fixed; every planted change's mutants fall under the
// cap; and one bench run over the planted mutant lines reports each verdict:
// caught by a trace difference, by a rung-3 failure, and at rung 0; survived;
// not reached; not scored, for a mutant that does not load and one that fails
// before any candidate acts; and marked, for a mutant whose text is the
// base's, one of which separates the trees.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAnchors } from './anchors.js';
import { runBench } from './bench.js';
import { MUTANT_CAP, OPERATORS, makeMutants, numberMutants } from './mutants.js';
import { copyCheckout, plant, scratch, teardown } from './plant.js';
import { EARLY_RETURN, EVERY_PLANT, MUTANT_LINES, SKEW, apply } from './plants.js';

const dir = scratch('mutants');
/** @type {string} */
let base;
/** @type {Record<string, number>} */
const counts = {};
/** @type {Record<string, any[]>} */
const made = {};
/** @type {any[]} */
let forms = [];
/** @type {any[]} */
let lineForms = [];
/** @type {any} */
let report;
/** @type {any[]} */
let records;

before(async () => {
  base = copyCheckout(dir, 'base');
  const scratchHead = copyCheckout(dir, 'counts');
  // Every plant in one copy, one at a time, each file put back after.
  for (const [name, edits] of Object.entries(EVERY_PLANT)) {
    const files = Array.from(new Set(edits.map((e) => e.file)));
    const originals = new Map(files.map((f) => [f, readFileSync(join(scratchHead, f), 'utf8')]));
    apply(plant, scratchHead, edits);
    const set = readAnchors(base, scratchHead);
    made[name] = makeMutants(set.anchors, scratchHead, base, null).mutants;
    counts[name] = made[name].length;
    if (name === 'mutantLines') {
      lineForms = makeMutants(set.anchors, scratchHead, base, null).mutants;
    }
    for (const [f, text] of originals) {
      writeFileSync(join(scratchHead, f), text);
    }
  }
  const lawForms = copyCheckout(dir, 'law-forms');
  apply(plant, lawForms, SKEW);
  forms = lineForms.concat(makeMutants(readAnchors(base, lawForms).anchors, lawForms, base, null).mutants);
  const head = copyCheckout(dir, 'head');
  apply(plant, head, MUTANT_LINES.concat(EARLY_RETURN));
  const out = join(dir, 'out');
  report = await runBench({
    base, head, out, seed: 3, worlds: [{ file: 'fixtures/bench/room.json' }],
    budgets: { sweep: { quanta: 1500, restores: 30 }, ladder: { quanta: 3000, restores: 30 } },
    proposers: { grammar: false },
  });
  records = readFileSync(join(out, 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
});

after(() => teardown(dir));

/**
 * The mutants made on the line that reads a text, in order.
 * @param {string} text
 */
function on(text) {
  return forms.filter((m) => m.lineText.includes(text));
}

test('each operator of pin 7 makes its mutant on a planted line of its form, in JS and in the law', () => {
  const guard = on('if (actions.size > 1) {');
  assert.deepEqual(guard.map((m) => [m.operator, m.mutatedLine.trim()]), [
    ['flipped comparison', 'if (actions.size >= 1) {'],
    ['condition negated', 'if (!(actions.size > 1)) {'],
    ['numeric constant', 'if (actions.size > 1.0000000000000002) {'],
    ['numeric constant', 'if (actions.size > 0.9999999999999999) {'],
    ['numeric constant', 'if (actions.size > 1.1) {'],
    ['numeric constant', 'if (actions.size > 0.9) {'],
  ]);
  assert.deepEqual(on('carried.y = actor.y + actor.hy - carried.hy;').map((m) => [m.operator, m.mutatedLine.trim()]), [
    ['+ and - swapped', 'carried.y = actor.y - actor.hy - carried.hy;'],
    ['+ and - swapped', 'carried.y = actor.y + actor.hy + carried.hy;'],
  ]);
  assert.deepEqual(on('return { ok: false, reason: \'target is the actor\', };').map((m) => [m.operator, m.mutatedLine.trim()]), [['early return dropped', '']]);
  // The law: a comparison, a condition, an early return, and integer and
  // float literals, whose products are rounded, or dropped when equal.
  assert.deepEqual(on('if loaded.signature.n_colliders != 8 {').map((m) => [m.operator, m.mutatedLine.trim()]), [
    ['flipped comparison', 'if loaded.signature.n_colliders == 8 {'],
    ['condition negated', 'if !(loaded.signature.n_colliders != 8) {'],
    ['numeric constant', 'if loaded.signature.n_colliders != 9 {'],
    ['numeric constant', 'if loaded.signature.n_colliders != 7 {'],
    ['numeric constant', 'if loaded.signature.n_colliders != 9 {'],
    ['numeric constant', 'if loaded.signature.n_colliders != 7 {'],
  ]);
  assert.ok(on('        return;').some((m) => m.operator === 'early return dropped' && m.file === 'solver/src/rapier_law.rs'));
  // An integer index's four: one up, one down, and its products, which round
  // to itself and are not made.
  assert.deepEqual(on('BODIES[0] = BODIES[0] + 1.0e-9;').map((m) => [m.operator, m.mutatedLine.trim()]), [
    ['+ and - swapped', 'BODIES[0] = BODIES[0] - 1.0e-9;'],
    ['numeric constant', 'BODIES[1] = BODIES[0] + 1.0e-9;'],
    ['numeric constant', 'BODIES[-1] = BODIES[0] + 1.0e-9;'],
    ['numeric constant', 'BODIES[0] = BODIES[1] + 1.0e-9;'],
    ['numeric constant', 'BODIES[0] = BODIES[-1] + 1.0e-9;'],
    ['numeric constant', 'BODIES[0] = BODIES[0] + 1.0000000000000003e-9;'],
    ['numeric constant', 'BODIES[0] = BODIES[0] + 9.999999999999999e-10;'],
    ['numeric constant', 'BODIES[0] = BODIES[0] + 1.1000000000000001e-9;'],
    ['numeric constant', 'BODIES[0] = BODIES[0] + 9.000000000000001e-10;'],
  ]);
  for (const op of OPERATORS) {
    assert.ok(forms.some((m) => m.operator === op), op);
  }
});

test('a changed top-level constant and a rule\'s number take the four constant mutants', () => {
  assert.deepEqual(made['finding stepHeight'].filter((m) => m.file === 'packages/tick/predicates.js').map((m) => m.mutatedLine.trim()), [
    'const STEP_HEIGHT = 0.20000000000000004;',
    'const STEP_HEIGHT = 0.19999999999999998;',
    'const STEP_HEIGHT = 0.22000000000000003;',
    'const STEP_HEIGHT = 0.18000000000000002;',
  ]);
  assert.deepEqual(made['finding rule'].map((m) => [m.operator, m.mutatedLine.trim()]), [
    ['numeric constant', '"maxDistance": 0.00010000000000000002,'],
    ['numeric constant', '"maxDistance": 0.00009999999999999999,'],
    ['numeric constant', '"maxDistance": 0.00011000000000000002,'],
    ['numeric constant', '"maxDistance": 0.00009,'],
  ]);
});

test('a numeric constant makes four mutants: one unit in its last place up and down, times 1.1, and times 0.9', () => {
  assert.deepEqual(numberMutants('8.0', 'js').map((m) => m.text), ['8.000000000000002', '7.999999999999999', '8.8', '7.2']);
  assert.deepEqual(numberMutants('8.000', 'rust').map((m) => m.text), ['8.000000000000002', '7.999999999999999', '8.8', '7.2']);
  assert.deepEqual(numberMutants('20', 'rust').map((m) => m.text), ['21', '19', '22', '18']);
  assert.deepEqual(numberMutants('0.5', 'rust').map((m) => m.text), ['0.5000000000000001', '0.49999999999999994', '0.55', '0.45']);
  assert.deepEqual(on('const buf = new ArrayBuffer(8.0);').map((m) => m.detail), [
    '8.0 to 8.000000000000002, one unit in its last place up',
    '8.0 to 7.999999999999999, one unit in its last place down',
    '8.0 to 8.8, times 1.1',
    '8.0 to 7.2, times 0.9',
  ]);
});

test('mutants are made in a fixed order: by the anchor\'s file, then its first line, then the changed line, then the operator', () => {
  const js = lineForms;
  const keys = js.map((m) => [m.file, m.line, OPERATORS.indexOf(m.operator)]);
  const sorted = keys.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (/** @type {number} */ (a[1]) - /** @type {number} */ (b[1])) || (/** @type {number} */ (a[2]) - /** @type {number} */ (b[2]))));
  assert.deepEqual(keys, sorted);
  assert.deepEqual(js.map((m) => m.id), js.map((_, i) => 'm' + (i + 1)));
});

test('every planted change\'s mutants fall under the cap, and the largest is the cap\'s basis', () => {
  for (const [name, n] of Object.entries(counts)) {
    assert.ok(n <= MUTANT_CAP, name + ' makes ' + n);
  }
  // The basis the pull request states: the law head makes the most, 34, and
  // the cap holds it with room for a real change of a few functions.
  const most = Math.max(...Object.values(counts));
  assert.equal(most, counts.law, JSON.stringify(counts));
  assert.equal(most, 34, JSON.stringify(counts));
  assert.ok(MUTANT_CAP >= most + 24, 'the cap holds the largest plant with room: ' + most);
});

test('the planted mutant lines take every verdict, each in its order: caught by a trace difference, by a rung-3 failure, and at rung 0; survived; not reached; not scored, not loading and failing before any candidate acts; and marked, one of them separating the trees', () => {
  assert.equal(report.refused, null);
  const list = report.mutants.list;
  /**
   * @param {string} text
   * @param {string} detail
   */
  const one = (text, detail) => {
    // The bench made the same mutants, with the same ids, from the same plant.
    const found = list.filter((/** @type {any} */ m) => lineForms.some((f) => f.id === m.id && f.lineText.includes(text) && f.detail === detail));
    assert.equal(found.length, 1, text + ' ' + detail);
    return found[0];
  };
  assert.match(one('carried.y = actor.y + actor.hy - carried.hy;', '`+` to `-`').why, /^separated by a trace difference at tick \d+ on c\d+$/);
  assert.equal(one('carried.y = actor.y + actor.hy - carried.hy;', '`+` to `-`').verdict, 'caught');
  const rung3 = one('if (actions.size > 1) {', '`>` to `>=`');
  assert.equal(rung3.verdict, 'caught');
  assert.equal(rung3.separatedBy.rung, 'rung 3');
  const rung0 = one('tick = saved.tick * 1;', '1 to 1.0000000000000002, one unit in its last place up');
  assert.equal(rung0.verdict, 'caught');
  assert.equal(rung0.separatedBy.rung, 'rung 0');
  assert.equal(one('if (actions.size > 1) {', '1 to 1.1, times 1.1').verdict, 'survived');
  assert.equal(one('b.vy = (b.vy + G * DT);', '`+` to `-`').verdict, 'not reached');
  const unloaded = one('const buf = new ArrayBuffer(8.0);', '8.0 to 7.999999999999999, one unit in its last place down');
  assert.equal(unloaded.verdict, 'not scored');
  assert.match(unloaded.why, /^does not load: /);
  const early = one('if (actions.size > 1) {', '`if` condition negated');
  assert.equal(early.verdict, 'not scored');
  assert.match(early.why, /^fails before any candidate acts: /);
  const marked = one('if (speed2 >= MAX_SPEED * MAX_SPEED) {', '`>=` to `>`');
  assert.equal(marked.verdict, 'marked');
  assert.equal(marked.separatedBy, null);
  const markedApart = one('carried.y = actor.y + actor.hy - carried.hy;', '`-` to `+`');
  assert.equal(markedApart.verdict, 'marked');
  assert.ok(markedApart.separatedBy, 'it separates the trees, and is marked, not caught');
  assert.match(markedApart.why, /\(it separates the trees\)$/);
  assert.deepEqual(Object.keys(report.mutants.byVerdict).sort(), ['caught', 'marked', 'not reached', 'not scored', 'survived']);
});

test('each mutant runs in a process of its own, and each proposer\'s report lists the mutants its inputs caught', () => {
  const loaded = Object.values(report.environment.mutants);
  assert.ok(loaded.length > 0);
  const pids = loaded.map((/** @type {any} */ m) => m.pid);
  assert.equal(new Set(pids).size, pids.length, 'no two mutants share a process');
  for (const p of Object.values(report.environment.processes)) {
    assert.ok(!pids.includes(/** @type {any} */ (p).pid), 'and none is a tree\'s own process');
  }
  const caught = report.mutants.list.filter((/** @type {any} */ m) => m.verdict === 'caught').map((/** @type {any} */ m) => m.id).sort();
  assert.deepEqual(report.proposers.sweep.mutants.caught.slice().sort(), caught, 'the sweep\'s inputs caught them all: the grammar ran none');
});

test('a JS mutant tree runs the head\'s product binary file, byte for byte', () => {
  const files = report.environment.binaries.jsMutants;
  assert.ok(Object.keys(files).length > 0);
  for (const digest of Object.values(files)) {
    assert.equal(digest, report.environment.binaries.files.head);
  }
  assert.ok(records.length > 0);
});
