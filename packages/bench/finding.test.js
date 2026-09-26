// The bench finds what a change does (T7b pin 9, "Anchors and reach" and "The
// report"): a rule narrowed, the same narrowing in the base, a comparison
// flipped at a boundary the sweep lands on, STEP_HEIGHT changed beside a
// hazard whose outcome changes, a push's speed changed, and a rule's flag with
// a verb retired and the catalog reordered. Each is a planted
// change with a known, measured effect, planted alone in a copy of the
// checkout, and each run is one bench run; the runs go together, in parallel,
// before the tests read their reports.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runBench } from './bench.js';
import { copyCheckout, plant, scratch, teardown } from './plant.js';
import { FINDING, HAZARD_FLIP, PUSH_FIRST, apply } from './plants.js';

const dir = scratch('finding');
const ROOM = [{ file: 'fixtures/bench/room.json' }];

/**
 * @typedef {{ report: any, records: any[], access: any, head: string, base: string, out: string }} Run
 */

/** @type {Record<string, Run>} */
const runs = {};

/**
 * One bench run with a plant in the head or the base.
 * @param {string} name
 * @param {import('./plants.js').Edit[]} edits
 * @param {{ inBase?: boolean, shared?: import('./plants.js').Edit[], ladder?: { quanta: number, restores: number }, mutants?: { enabled?: boolean, cap?: number } }} [options]
 * @returns {Promise<Run>}
 */
async function run(name, edits, options) {
  const o = options || {};
  const head = copyCheckout(dir, name + '-head');
  const base = copyCheckout(dir, name + '-base');
  apply(plant, o.inBase ? base : head, edits);
  if (o.shared) {
    apply(plant, head, o.shared);
    apply(plant, base, o.shared);
  }
  const out = join(dir, name + '-out');
  const report = await runBench({
    base, head, out, seed: 3, worlds: ROOM,
    budgets: { sweep: { quanta: 12000, restores: 120 }, ladder: o.ladder || { quanta: 25000, restores: 250 } },
    mutants: o.mutants || { enabled: false },
  });
  const records = readFileSync(join(out, 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const access = JSON.parse(readFileSync(join(out, 'access.json'), 'utf8'));
  return { report, records, access, head, base, out };
}

before(async () => {
  const made = await Promise.all([
    run('rule', FINDING.rule, { mutants: { enabled: true, cap: 0 } }),
    run('rule-in-base', FINDING.rule, { inBase: true }),
    run('comparison', FINDING.comparison, { inBase: true, mutants: { enabled: true } }),
    run('step-height', FINDING.stepHeight.concat(HAZARD_FLIP)),
    run('push', FINDING.push, { shared: PUSH_FIRST }),
    run('rule-flag', FINDING.ruleFlag.concat(PUSH_FIRST), { mutants: { enabled: true, cap: 0 } }),
  ]);
  [runs.rule, runs.ruleInBase, runs.comparison, runs.stepHeight, runs.push, runs.ruleFlag] = made;
});

after(() => teardown(dir));

/**
 * @param {Run} r
 * @param {string} prefix
 */
function anchor(r, prefix) {
  const found = r.report.anchors.filter((/** @type {any} */ a) => a.id.startsWith(prefix));
  assert.equal(found.length, 1, prefix + ': ' + r.report.anchors.map((/** @type {any} */ a) => a.id).join(' | '));
  return found[0];
}

test('a verb\'s maxDistance narrowed in a copy of the head: the bench names the rule anchor and the verb, and finds an intent the base admits and the head refuses while the frames agree; bench replay shows the refusal on the head and the admission on the base', () => {
  const r = runs.rule;
  assert.equal(r.report.refused, null);
  const a = anchor(r, 'rule:predicates/intents/move.json:');
  assert.equal(a.kind, 'rule');
  assert.equal(a.verb, 'move');
  assert.equal(a.name, 'move');
  const differing = r.records.filter((x) => x.rungs[2] && x.rungs[2].kind === 'admission' && x.rungs[2].verb === 'move');
  assert.ok(differing.length > 0, 'an admission difference on move');
  const d = differing[0];
  assert.equal(d.rungs[2].refusing, 'head');
  assert.equal(d.rungs[2].reasons.base, 'admitted');
  assert.match(d.rungs[2].reasons.head, /^target is beyond move range 0\.0001$/);
  // While the frames agree: the traces are the same to the admission's tick.
  assert.match(d.rungs[2].block, new RegExp('^first difference at tick ' + d.rungs[2].tick + ': admission differs\\n'));
  assert.ok(d.bundle, 'the admission difference is written as a bundle');
  const bundle = JSON.parse(readFileSync(join(r.out, d.bundle), 'utf8'));
  assert.equal(bundle.failure.tick, d.rungs[2].tick);
  assert.deepEqual(bundle.failure.reasons, d.rungs[2].reasons);
  assert.equal(bundle.log.length, d.rungs[2].index, 'the log of every intent both trees admitted before the differing one');
  for (const [tree, said] of [[r.head, /: move walker .* refused: target is beyond move range 0\.0001\n$/], [r.base, /: move walker .* admitted\n$/]]) {
    const replayed = spawnSync(process.execPath, ['packages/bench/bin/bench.js', 'replay', join(r.out, d.bundle), '--tree', /** @type {string} */ (tree)], { encoding: 'utf8' });
    assert.equal(replayed.status, 0, replayed.stderr);
    assert.match(replayed.stdout, /** @type {RegExp} */ (said));
  }
});

test('bench anchors reads the diff between a base and a head and prints the anchors as JSON: each with its id, kind, file, name, and changed lines', () => {
  const r = runs.rule;
  const printed = spawnSync(process.execPath, ['packages/bench/bin/bench.js', 'anchors', '--base', r.base, '--head', r.head], { encoding: 'utf8' });
  assert.equal(printed.status, 0, printed.stderr);
  const set = JSON.parse(printed.stdout);
  const a = set.anchors.find((/** @type {any} */ x) => x.id.startsWith('rule:predicates/intents/move.json:'));
  assert.ok(a, printed.stdout.slice(0, 400));
  assert.deepEqual([a.kind, a.file, a.name], ['rule', 'predicates/intents/move.json', 'move']);
  assert.ok(Array.isArray(a.lines) && a.lines.length > 0 && a.lines.every((/** @type {number[]} */ range) => range.length === 2));
  assert.deepEqual(set.anchors.map((/** @type {any} */ x) => x.id), r.report.anchors.map((/** @type {any} */ x) => x.id));
});

test('the refusal tally counts a planted rule\'s refusals by reason', () => {
  const tally = runs.rule.report.proposers.sweep.refusals;
  assert.ok(tally['target is beyond move range 0.0001'] > 0, JSON.stringify(tally));
  const counted = Object.values(tally).reduce((sum, n) => /** @type {number} */ (sum) + /** @type {number} */ (n), 0);
  assert.equal(counted, runs.rule.report.proposers.sweep.refused);
});

test('a narrowed rule that refuses throughout shows the admission flood as one line, and the same narrowing in the base floods every candidate the head\'s sweep proposes', () => {
  const grammar = runs.rule.report.proposers.grammar;
  assert.ok(grammar.floods.some((/** @type {any} */ f) => /^admissions of move differ throughout: refused on the head in each of the \d+ candidates where either tree admits it$/.test(f.line)), JSON.stringify(grammar.floods));
  assert.ok(!grammar.differences.some((/** @type {any} */ d) => /move refused/.test(d.summary)), 'the flooded differences are one line, not a list');
  // An admission that differs on an intent of the witness is the candidate's
  // first difference like any other: the grammar's steps from cells a move
  // reached carry that move in their witness, and the base refuses it.
  const inWitness = runs.ruleInBase.records.find((x) => x.rungs[2] && x.rungs[2].kind === 'admission' && x.rungs[2].index < x.witness.length);
  assert.ok(inWitness, 'a witness intent\'s admission differs');
  assert.equal(inWitness.rungs[2].refusing, 'base');
  assert.equal(inWitness.witness[inWitness.rungs[2].index].proposal.verb, 'move');
  const sweep = runs.ruleInBase.report.proposers.sweep;
  assert.equal(sweep.floods.length, 1, JSON.stringify(sweep.floods));
  assert.match(sweep.floods[0].line, /^every one of the \d+ candidates compared differs the same way: admission of move differs, refused on the base$/);
  assert.equal(sweep.differences.length, 0);
});

test('a comparison in the checker flipped from < to <= at a boundary the sweep lands on: the bench names the JS anchor and the verbs and cells that reach it in the access map, a rung-2 difference with its bundle, the mutant lists over that anchor, and the mark observable', () => {
  const r = runs.comparison;
  const a = anchor(r, 'js:packages/tick/world.js:createWorld/segmentHitsBox:');
  assert.equal(a.observable, 'observable');
  assert.deepEqual(r.report.anchors.map((/** @type {any} */ x) => x.id), [a.id]);
  const entries = r.access.anchors.find((/** @type {any} */ x) => x.id === a.id).reachedBy;
  const verbs = new Set(entries.filter((/** @type {any} */ e) => e.candidate).map((/** @type {any} */ e) => e.candidate.verb));
  assert.ok(verbs.has('move'));
  assert.ok(entries.some((/** @type {any} */ e) => e.candidate && e.candidate.cell && Array.isArray(e.candidate.witness)), 'each entry names its cell and witness');
  // The sweep lands a move where the actor's box touches a collider's face:
  // the head admits it and the base, with the flip, refuses it.
  const d = r.records.find((x) => x.proposer === 'sweep' && x.rungs[2] && x.rungs[2].kind === 'admission');
  assert.ok(d, 'a sweep candidate differs');
  assert.equal(d.rungs[2].refusing, 'base');
  assert.equal(d.rungs[2].reasons.head, 'admitted');
  assert.match(d.rungs[2].reasons.base, /^path crosses collider /);
  assert.ok(d.anchors.includes(a.id));
  assert.ok(d.bundle);
  // The bundle is a T5 log bundle from the head, its failure block the
  // bench's own first-difference block.
  const bundle = JSON.parse(readFileSync(join(r.out, d.bundle), 'utf8'));
  assert.equal(bundle.run, 'log');
  assert.equal(bundle.failure.block, d.rungs[2].block);
  // The sweep's part of the report: the anchor among those it reached, with
  // its changed line reached and its mark, and its rungs counted from its
  // records.
  const sweep = r.report.proposers.sweep;
  assert.ok(sweep.anchorsReached.includes(a.id));
  assert.deepEqual(sweep.linesReached[a.id], a.lines.map((/** @type {number[]} */ range) => range[0]));
  assert.equal(sweep.observable[a.id], 'observable');
  const own = r.records.filter((x) => x.proposer === 'sweep');
  assert.deepEqual(sweep.rungs, {
    head0: own.filter((x) => !x.rungs[0].head.ok).length,
    base0: own.filter((x) => x.rungs[0].head.ok && !x.rungs[0].base.ok).length,
    reached: own.filter((x) => x.rungs[1]).length,
    differ: own.filter((x) => x.rungs[2]).length,
    fail: own.filter((x) => x.rungs[3] && Object.values(x.rungs[3].failures).some(Boolean)).length,
    catches: own.filter((x) => x.rungs[3] && x.rungs[3].catch).length,
  });
  const mutants = r.report.mutants.list.filter((/** @type {any} */ m) => m.anchor === a.id);
  assert.deepEqual(mutants.map((/** @type {any} */ m) => [m.operator, m.detail, m.verdict]), [['flipped comparison', '`<` to `<=`', 'marked']]);
});

test('STEP_HEIGHT\'s value changed: the top-level anchor exists, is reached through the climb\'s admission, and differs', () => {
  const r = runs.stepHeight;
  const a = anchor(r, 'top-level:packages/tick/predicates.js:STEP_HEIGHT:');
  assert.deepEqual(a.identifiers, ['STEP_HEIGHT']);
  assert.equal(a.approximate, true);
  assert.ok(a.reachedBy.includes('window'));
  const climbs = r.records.filter((x) => x.anchors.includes(a.id));
  assert.ok(climbs.length > 0 && climbs.every((x) => x.intent.proposal.verb === 'climb'), 'reached by climbs: admitClimb names it');
  const d = climbs.find((x) => x.rungs[2]);
  assert.ok(d, 'a climb that reached it differs');
  assert.equal(d.rungs[2].kind, 'admission');
  assert.equal(d.rungs[2].reasons.base, 'move steps it');
});

test('a push\'s speed changed: the sweep\'s candidates go through the ladder in two groups, those that reached an anchor and then the rest, each in archive order; a candidate that reaches no anchor still runs on both trees in the second group, and its difference, met inside its witness, is reported as a difference and not as a finding of the base; the budget ends inside the second group and names what it left unrun', () => {
  const r = runs.push;
  const a = anchor(r, 'rule:predicates/intents/push.json:');
  const sweep = r.records.filter((x) => x.proposer === 'sweep');
  const firstRest = sweep.findIndex((x) => x.group === 2);
  assert.ok(firstRest > 0, 'group 1 first');
  assert.ok(sweep.slice(0, firstRest).every((x) => x.group === 1 && x.anchors.includes(a.id)));
  assert.ok(sweep.slice(firstRest).every((x) => x.group === 2));
  // Archive order within each group: the candidates' ids, made in the sweep's
  // order, rise within each group.
  for (const group of [1, 2]) {
    const ids = sweep.filter((x) => x.group === group).map((x) => Number(x.id.slice(1)));
    assert.deepEqual(ids, ids.slice().sort((p, q) => p - q));
  }
  const late = sweep.find((x) => x.group === 2 && x.rungs[2] && x.witness.some((/** @type {any} */ e) => e.proposal.verb === 'push'));
  assert.ok(late, 'a second-group candidate with a push in its witness differs');
  assert.deepEqual(late.anchors, [], 'it reached no anchor in its window');
  assert.ok(late.recorded.includes('2'), 'it ran on both trees');
  // Each tree submits every intent citing its own newest frame, so none is
  // refused as stale on the base, though the base's frames part from the
  // head's inside the witness; an intent at the head's tick can still find
  // the base's walker mid-action, which is the base's own run.
  const differed = sweep.filter((x) => x.rungs[2] && x.witness.length > 0);
  assert.ok(differed.length > 0);
  for (const x of differed) {
    assert.equal(x.admission.base.length, x.witness.length + 1, 'every intent submitted on the base');
    assert.ok(x.admission.base.every((/** @type {any} */ a) => !/^stale frame/.test(a.reason)), JSON.stringify(x.admission.base));
  }
  assert.ok(late.rungs[2].tick <= late.witnessEnd, 'the first difference is inside the witness');
  assert.deepEqual(r.report.findings.base, [], 'never a finding of the base');
  assert.ok(r.report.notMeasured.unrun.some((/** @type {any} */ u) => u.id === 'sweep fixtures/bench/room.json group 2' && u.count > 0), JSON.stringify(r.report.notMeasured.unrun));
});

test('a rule\'s flag changed, not a number, is listed with no mutants, with that reason; a verb retired in the intent catalog: the catalog anchor is reached when that verb is submitted', () => {
  const r = runs.ruleFlag;
  const flag = anchor(r, 'rule:predicates/intents/climb.json:');
  assert.ok(r.report.mutants.none.some((/** @type {any} */ n) => n.anchor === flag.id && /^a rule change that is not a number/.test(n.reason)));
  const retired = anchor(r, 'catalog:predicates/intents/index.json:retire use');
  assert.equal(retired.verb, 'use');
  const uses = r.records.filter((x) => x.anchors.includes(retired.id));
  assert.ok(uses.length > 0, 'reached');
  assert.ok(uses.every((x) => x.intent.proposal.verb === 'use'), 'reached only when use is submitted');
  assert.ok(uses.some((x) => x.admission.head.some((/** @type {any} */ y) => y.reason === 'retired verb: use')));
  // The catalog reordered in the head: the lines that retire no verb are
  // reached by any intent submitted, since every submission looks its verb up.
  const catalog = anchor(r, 'catalog:predicates/intents/index.json:catalog');
  assert.ok(r.records.length > 0 && r.records.filter((x) => x.recorded.includes('1')).every((x) => x.anchors.includes(catalog.id)));
});

test('a hazard whose outcome changes: each tree\'s process runs the suite once before any candidate, and the verdict that differs is a rung-2 difference of the hazard\'s anchor', () => {
  const r = runs.stepHeight;
  const a = anchor(r, 'hazard:predicates/hazards/beyond-wall.json:');
  assert.equal(r.report.suite.ran, true);
  const d = r.report.suite.differences.filter((/** @type {any} */ x) => x.hazard === 'beyond-wall-refuses');
  assert.ok(d.length > 0, JSON.stringify(r.report.suite));
  assert.ok(d.every((/** @type {any} */ x) => x.anchors.includes(a.id) && x.head.outcome !== x.base.outcome));
  assert.equal(a.differences, d.length);
  assert.ok(a.reachedBy.includes('suite'));
});
