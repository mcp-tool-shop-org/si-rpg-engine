// The model proposer (T7c). No test starts Ollama or opens a socket: a run
// that names --model is handed outputs, or a cut-off, and the sweep process
// builds the client. The eighty real calls are not here.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBench } from './bench.js';
import { copyCheckout, leaks, plant, scratch, teardown } from './plant.js';
import { FINDING, apply } from './plants.js';
import { cutReport, differenceKeys, lateGain, newFindings, stallIndex, withinCost } from './report.js';

const dir = scratch('model');
const ROOM = [{ file: 'fixtures/bench/room.json' }];
const DIGEST = '845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e';
const STEER = JSON.stringify({ notes: 'steer', proposal: { kind: 'intent', verb: 'teleport', actor: 'walker', target: { x: 1, z: 0 }, hash: 'ab'.repeat(32) } });
const MOVE = JSON.stringify({ notes: 'step', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1.25, z: 0.75 } } });
const PUSH = JSON.stringify({ notes: 'shove', proposal: { kind: 'intent', verb: 'push', actor: 'walker', target: { body: 'crate' } } });
const NORTH = JSON.stringify({ notes: 'step', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 0.75, z: 1.25 } } });

/** @type {string} */
let head;
/** @type {string} */
let base;
/** @type {string} */
let diff;

/**
 * @param {string} name
 * @param {Omit<Parameters<typeof runBench>[0], 'out'>} options
 */
async function bench(name, options) {
  const out = join(dir, name + '-out');
  const report = await runBench({ ...options, out });
  const text = readFileSync(join(out, 'records.jsonl'), 'utf8').trim();
  const records = text.length === 0 ? [] : text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { report, records, out };
}

/**
 * @param {any} options
 */
function model(options) {
  return {
    enabled: true,
    catalog: 'fixtures/roles',
    role: 'instrument-copy',
    diff: options.diff === undefined ? diff : options.diff,
    calls: options.calls,
    outputs: /** @type {string[] | null} */ (options.outputs === undefined ? [STEER] : options.outputs),
    cutOff: options.cutOff === true,
  };
}

before(async () => {
  head = copyCheckout(dir, 'head');
  base = copyCheckout(dir, 'base');
  diff = join(dir, 'change.diff');
  writeFileSync(diff, '--- a/predicates/intents/move.json\n+++ b/predicates/intents/move.json\n');
});

after(async () => {
  await teardown(dir);
});

test('the test catalog holds a copy of test-instrument, thawed, and probe is a different role', () => {
  const real = JSON.parse(readFileSync('predicates/roles/test-instrument.json', 'utf8'));
  const copy = JSON.parse(readFileSync('fixtures/roles/instrument-copy.json', 'utf8'));
  const probe = JSON.parse(readFileSync('fixtures/roles/probe.json', 'utf8'));
  for (const key of Object.keys(real)) {
    if (key === 'role' || key === 'status' || key === 'decision' || key === 'adversarialRun') {
      continue;
    }
    assert.deepEqual(copy[key], real[key], key);
  }
  assert.equal(copy.role, 'instrument-copy');
  assert.equal(copy.status, 'thawed');
  assert.deepEqual(copy.decision, { by: 'the coordinator', on: '2026-09-26' });
  assert.equal(copy.adversarialRun, 'fixtures/sessions/instrument-copy');
  assert.equal(copy.budget.callsPerSession, 64);
  assert.equal(copy.model.name, 'qwen2.5:7b');
  assert.equal(copy.model.digest, DIGEST);
  assert.equal(probe.role, 'probe');
  assert.notEqual(probe.purpose, copy.purpose);
  assert.equal(readFileSync('fixtures/roles/test-instrument.txt', 'utf8'), readFileSync('predicates/roles/test-instrument.txt', 'utf8'));
});

test('the model starts after eight admitted candidates with nothing new, and arm G takes the quanta and restores arm M spent', () => {
  /** @param {string} id */
  const quiet = (id) => ({ id, admittedOnHead: true, lines: {}, anchors: [], rungs: { 2: null, 3: null }, cost: { quanta: 3, restores: 1 } });
  const records = /** @type {any[]} */ (Array.from({ length: 10 }, (_, i) => quiet('g' + i)));
  assert.equal(stallIndex(records), 7, 'the eighth admitted candidate, n of 8');
  assert.equal(stallIndex(records.slice(0, 7)), null);
  const taken = withinCost(records, 7, 2);
  assert.equal(taken.length, 2, 'the restores are reached at the second candidate, before the quanta');
  assert.ok(taken.reduce((sum, record) => sum + record.cost.quanta, 0) >= 7 || taken.reduce((sum, record) => sum + record.cost.restores, 0) >= 2);
  const stopped = taken[taken.length - 1];
  const before = taken.slice(0, -1).reduce((sum, record) => sum + record.cost.quanta, 0);
  assert.ok(before < 7 && taken.slice(0, -1).reduce((sum, record) => sum + record.cost.restores, 0) < 2, 'the candidate that crosses is included');
  assert.equal(stopped.cost.quanta, 3);
  assert.deepEqual(withinCost(records, 0, 0), []);
});

test('arm G stops at whichever of arm M\'s limits it reaches first, keeps the candidate that crosses, and ignores a limit arm M spent nothing on', () => {
  /** @param {string} id */
  const candidate = (id) => ({ id, admittedOnHead: true, lines: {}, anchors: [], rungs: { 2: null, 3: null }, cost: { quanta: 500, restores: 1 } });
  const grammar = /** @type {any[]} */ (Array.from({ length: 20 }, (_, i) => candidate('g' + i)));
  assert.deepEqual(withinCost(grammar, 1000, 10).map((record) => record.id), ['g0', 'g1'], 'the quanta are reached at the second candidate, not the restores at the tenth');
  assert.deepEqual(withinCost(grammar, 1200, 0).map((record) => record.id), ['g0', 'g1', 'g2'], 'no restore spent: the quanta alone stop it, at the candidate that crosses');
  assert.deepEqual(withinCost(grammar, 0, 3).map((record) => record.id), ['g0', 'g1', 'g2'], 'no quanta spent: the restores alone stop it');
});

test('an arm\'s new findings are the lines and difference keys its admitted candidates reached that nothing before the start point did, each counted once', () => {
  /**
   * @param {string} id
   * @param {boolean} admitted
   * @param {Record<string, number[]>} lines
   * @param {any} difference
   */
  const rec = (id, admitted, lines, difference) => ({
    id, admittedOnHead: admitted, lines, anchors: ['js:packages/tick/predicates.js:admitMove:'],
    rungs: { 2: difference, 3: null }, cost: { quanta: 1, restores: 0 },
  });
  const trace = { kind: 'trace', body: 'crate', field: 'y' };
  const before = /** @type {any[]} */ ([rec('g0', true, { a: [10, 11] }, null)]);
  const arm = /** @type {any[]} */ ([
    rec('m0', false, { a: [99] }, trace),
    rec('m1', true, { a: [10] }, null),
    rec('m2', true, { a: [12] }, trace),
    rec('m3', true, { a: [12] }, trace),
  ]);
  const found = newFindings(before, arm);
  assert.deepEqual(found.lines, ['a:12'], 'a refused candidate counts nothing, and a line reached before the start point is not new');
  assert.deepEqual(found.differences, ['trace|js:packages/tick/predicates.js:admitMove:|crate|y']);
  assert.deepEqual(newFindings(arm.slice(2), arm.slice(3)), { lines: [], differences: [] }, 'what the records before the start point reached is not new');
});

test('a line after the environment section is refused by the cut and by leaks', () => {
  const out = join(dir, 'tail');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'report.json'), JSON.stringify({ environment: { paths: { out } } }) + '\n');
  const text = '# Report\n\n## Environment\n\n```\n{}\n```\n\na line after\n';
  writeFileSync(join(out, 'report.md'), text);
  const cut = cutReport(text);
  assert.equal(cut.ok, false);
  if (!cut.ok) {
    assert.match(cut.reason, /environment section/);
  }
  const found = leaks(out);
  assert.ok(found.found.some((line) => /environment section/.test(line)), found.found.join('\n'));
});

test('--model without --diff is refused, and --model-calls may not exceed callsPerSession', async () => {
  const bare = await bench('no-diff', {
    base, head, worlds: [], proposers: { sweep: false, grammar: false }, mutants: { enabled: false },
    model: { enabled: true, catalog: 'fixtures/roles', role: 'instrument-copy' },
  });
  assert.match(String(bare.report.refused), /--model without --diff is refused/);
  const over = await bench('over-calls', {
    base, head, worlds: [], proposers: { sweep: false, grammar: false }, mutants: { enabled: false },
    model: model({ calls: 65, outputs: [STEER] }),
  });
  assert.match(String(over.report.refused), /--model-calls 65 exceeds role instrument-copy's callsPerSession of 64/);
  const cli = spawnSync(process.execPath, ['packages/bench/bin/bench.js', 'run', '--base', base, '--head', head, '--out', join(dir, 'cli-out'), '--model'], { encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stderr, /--model without --diff is refused/);
});

test('the frozen default role is refused before a call, and sixteen calls are within the copy\'s budget', async () => {
  const frozen = await bench('frozen', {
    base, head, worlds: ROOM, proposers: { sweep: false, grammar: false }, mutants: { enabled: false },
    model: { enabled: true, diff },
  });
  assert.equal(frozen.report.refused, null, frozen.report.refused);
  assert.equal(frozen.report.proposers.model.proposed, 0);
  assert.equal(frozen.report.proposers.model.refused, 1);
  assert.match(JSON.stringify(frozen.report.proposers.model.refusals), /is frozen/);
  assert.equal(frozen.report.arms[0].M.calls, 0);
  assert.equal(frozen.report.arms[0].M.quanta, 0);
  const sixteen = await bench('sixteen', {
    base, head, seed: 1, worlds: ROOM, proposers: { sweep: false, grammar: false }, mutants: { enabled: false },
    grammar: { share: 0.5, pitch: 0.5 },
    model: model({ calls: 16, outputs: [STEER] }),
  });
  assert.equal(sixteen.report.refused, null, sixteen.report.refused);
  assert.equal(sixteen.report.seed, 1);
  assert.equal(sixteen.report.grammar.share, 0.5);
  assert.equal(sixteen.report.grammar.pitch, 0.5);
  assert.equal(sixteen.report.arms[0].M.calls, 16);
  assert.equal(sixteen.report.arms[0].M.quanta, 0);
  assert.equal(sixteen.report.proposers.model.refused, 16);
  assert.equal(JSON.stringify(sixteen.report.arms).includes('"ms"'), false);
});

test('the bench does not load packages/propose while the model proposer is off', async () => {
  const hooks = registerHooks({
    /** @type {any} */
    resolve(specifier, context, next) {
      if (String(specifier).includes('propose')) {
        throw new Error('the parent loaded ' + specifier);
      }
      return next(specifier, context);
    },
  });
  try {
    const report = await runBench({
      base, head, out: join(dir, 'hook-out'), worlds: [], mutants: { enabled: false },
      proposers: { sweep: false, grammar: false },
    });
    assert.equal(report.refused, null, report.refused);
    assert.equal(report.proposers.model, undefined);
  } finally {
    hooks.deregister();
  }
});

test('a steered proposal is refused with the parser\'s reason, costs a call and no quanta, and the sweep and grammar rungs match the model-off run', async () => {
  const budgets = { sweep: { quanta: 2000, restores: 40 }, ladder: { quanta: 8000, restores: 80 } };
  const shared = { base, head, seed: 1, worlds: ROOM, budgets, mutants: { enabled: false }, grammar: { share: 0.5, pitch: 0.5 } };
  const on = await bench('steered', { ...shared, model: model({ calls: 1, outputs: [STEER] }) });
  const off = await bench('plain', shared);
  assert.equal(on.report.refused, null, on.report.refused);
  assert.equal(off.report.refused, null, off.report.refused);
  assert.equal(off.report.proposers.model, undefined);
  assert.equal(on.report.arms[0].M.calls, 1);
  assert.equal(on.report.arms[0].M.quanta, 0);
  assert.equal(on.report.arms[0].M.restores, 0);
  assert.equal(on.report.arms[0].G.extended, false);
  assert.match(JSON.stringify(on.report.proposers.model.refusals), /unknown field: hash/);
  const grammar = on.records.filter((record) => record.proposer === 'grammar');
  const at = stallIndex(grammar);
  assert.equal(on.report.arms[0].start.index, at === null ? grammar.length : at + 1);
  /**
   * @param {any} record
   */
  const identity = (record) => JSON.stringify([record.world, record.witness, record.intent]);
  for (const proposer of ['sweep', 'grammar']) {
    const left = on.records.filter((record) => record.proposer === proposer);
    const right = off.records.filter((record) => record.proposer === proposer);
    assert.equal(left.length, right.length, proposer);
    for (const record of left) {
      const other = right.find((item) => identity(item) === identity(record));
      assert.ok(other, proposer + ' ' + record.id);
      assert.deepEqual(record.rungs, other.rungs);
    }
  }
  assert.deepEqual(on.report.proposers.grammar.lateGain, off.report.proposers.grammar.lateGain);
});

test('arm G is the grammar extended by exactly what arm M spent, and a timeout is counted only in the environment', async () => {
  const admitted = await bench('extend', {
    base, head, seed: 1, worlds: ROOM, mutants: { enabled: false },
    budgets: { sweep: { quanta: 1500, restores: 30 }, ladder: { quanta: 40, restores: 4 } },
    grammar: { share: 0.5, pitch: 0.5 },
    model: model({ calls: 2, outputs: [MOVE, STEER] }),
  });
  assert.equal(admitted.report.refused, null, admitted.report.refused);
  const arm = admitted.report.arms[0];
  assert.ok(arm.M.quanta > 0, JSON.stringify(admitted.report.proposers.model));
  assert.equal(arm.M.calls, 1, 'the one admitted call spends the ladder budget');
  assert.equal(arm.G.extended, true);
  assert.ok(arm.G.quanta >= arm.M.quanta, JSON.stringify(arm.G));
  assert.ok(arm.G.restores >= arm.M.restores);
  const own = admitted.records.filter((record) => record.proposer === 'grammar' && !(record.notes || []).includes('arm G'));
  const extra = admitted.records.filter((record) => (record.notes || []).includes('arm G'));
  assert.equal(admitted.report.proposers.grammar.ran, own.length);
  assert.ok(extra.length > 0, 'the grammar is extended past its budget');
  assert.deepEqual(admitted.report.proposers.grammar.lateGain, lateGain(own));
  const counted = admitted.records.filter((record) => !(record.notes || []).includes('arm G')).reduce((sum, record) => sum + record.cost.quanta, 0);
  assert.equal(admitted.report.spent.quanta, counted);
  assert.ok(Array.isArray(arm.M.findings.lines) && Array.isArray(arm.M.findings.differences) && Array.isArray(arm.M.findings.mutants));
  const noted = await bench('noted', {
    base, head, worlds: ROOM, proposers: { sweep: false, grammar: false }, mutants: { enabled: false },
    budgets: { ladder: { quanta: 12000, restores: 120 } },
    model: model({ calls: 2, outputs: [MOVE, STEER] }),
  });
  assert.equal(noted.report.refused, null, noted.report.refused);
  assert.equal(noted.report.arms[0].M.calls, 2);
  const sessionDir = join(noted.out, 'sessions', 'fixtures-bench-room-json');
  const checker = join(dir, 'check-session.mjs');
  const recordUrl = pathToFileURL(resolve('packages/propose/record.js')).href;
  writeFileSync(checker, 'import { verifySession } from ' + JSON.stringify(recordUrl) + ';\nconst failures = verifySession(' + JSON.stringify(sessionDir) + ').failures;\nif (failures.length) { process.stderr.write(failures.join("\\n") + "\\n"); process.exit(1); }\n');
  const checkedRun = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  assert.equal(checkedRun.status, 0, checkedRun.stderr);
  /** @type {any[]} */
  const calls = readdirSync(join(sessionDir, 'records')).map((file) => JSON.parse(readFileSync(join(sessionDir, 'records', file), 'utf8')));
  calls.sort((a, b) => a.call - b.call);
  assert.equal(calls.length, 2);
  assert.match(calls[1].request.messages[0].content, /rungs /);

  const cut = await bench('cutoff', {
    base, head, worlds: ROOM, proposers: { sweep: false, grammar: false }, mutants: { enabled: false },
    model: model({ calls: 1, outputs: null, cutOff: true }),
  });
  const again = await bench('cutoff-again', {
    base, head, worlds: ROOM, proposers: { sweep: false, grammar: false }, mutants: { enabled: false },
    model: model({ calls: 1, outputs: null, cutOff: true }),
  });
  assert.equal(cut.report.refused, null, cut.report.refused);
  assert.equal(cut.report.environment.model.timeouts, 1);
  assert.equal(cut.report.environment.model.calls[0].timedOut, true);
  const left = cutReport(readFileSync(join(cut.out, 'report.md'), 'utf8'));
  const right = cutReport(readFileSync(join(again.out, 'report.md'), 'utf8'));
  assert.equal(left.ok, true);
  assert.equal(right.ok, true);
  if (left.ok && right.ok) {
    assert.equal(left.summary, right.summary);
    assert.equal(left.summary.includes('timedOut'), false);
  }
});

test('on a planted push speed with mutants on, each arm\'s new lines, differences, and mutants come from its own candidates\' records, and arm G overshoots arm M by at most one candidate in each limit', async () => {
  const pushHead = copyCheckout(dir, 'push-head');
  apply(plant, pushHead, FINDING.push);
  const pushDiff = join(dir, 'push.diff');
  writeFileSync(pushDiff, '--- a/predicates/intents/push.json\n+++ b/predicates/intents/push.json\n');
  const ran = await bench('arms', {
    base, head: pushHead, seed: 3, worlds: ROOM, proposers: { sweep: false },
    budgets: { sweep: { quanta: 1000, restores: 20 }, ladder: { quanta: 1000, restores: 2 } },
    grammar: { share: 0.5, pitch: 0.5 },
    mutants: { enabled: true, cap: 2 },
    model: model({ calls: 2, outputs: [PUSH, NORTH], diff: pushDiff }),
  });
  assert.equal(ran.report.refused, null, ran.report.refused);
  const arm = ran.report.arms[0];
  const anchor = 'rule:predicates/intents/push.json:push';
  const before = ran.records.filter((record) => record.proposer === 'grammar' && !record.notes.includes('arm G'));
  const mRecords = ran.records.filter((record) => record.proposer === 'model');
  const gRecords = ran.records.filter((record) => record.notes.includes('arm G'));
  assert.equal(arm.start.index, before.length);
  assert.equal(arm.G.extended, true);
  assert.equal(arm.M.calls, 2);
  assert.equal(mRecords.length, 2);
  assert.ok(mRecords.every((record) => record.admittedOnHead), JSON.stringify(ran.report.proposers.model.refusals));
  assert.ok(gRecords.length > 0);
  /**
   * @param {any[]} records
   * @param {'quanta' | 'restores'} limit
   */
  const spent = (records, limit) => records.reduce((sum, record) => sum + record.cost[limit], 0);
  for (const limit of /** @type {Array<'quanta' | 'restores'>} */ (['quanta', 'restores'])) {
    assert.equal(arm.M[limit], spent(mRecords, limit), 'arm M\'s ' + limit);
    assert.equal(arm.G[limit], spent(gRecords, limit), 'arm G\'s ' + limit);
    assert.ok(arm.M[limit] > 0);
    assert.ok(spent(gRecords.slice(0, -1), limit) < arm.M[limit], 'arm G\'s ' + limit + ' overshoot arm M\'s by at most its last candidate: ' + JSON.stringify(gRecords.map((record) => record.cost)) + ' against ' + JSON.stringify([arm.M.quanta, arm.M.restores]));
  }
  assert.ok(arm.G.quanta >= arm.M.quanta || arm.G.restores >= arm.M.restores, 'arm G reaches one of arm M\'s limits');

  const push = mRecords.find((record) => record.intent.proposal.verb === 'push');
  assert.ok(push && push.anchors.includes(anchor), 'the model\'s push reaches the change');
  assert.ok(before.every((record) => !record.anchors.includes(anchor)), 'nothing before the start point reached it');
  /**
   * The changed lines and difference keys a proposer's records reached, in
   * order and each once; from admitted records alone when asked.
   * @param {any[]} records
   * @param {boolean} admittedOnly
   */
  const reached = (records, admittedOnly) => {
    /** @type {Set<string>} */
    const lines = new Set();
    /** @type {Set<string>} */
    const keys = new Set();
    for (const record of records.filter((r) => !admittedOnly || r.admittedOnHead)) {
      for (const [id, list] of Object.entries(record.lines)) {
        for (const line of /** @type {number[]} */ (list)) {
          lines.add(id + ':' + line);
        }
      }
      for (const key of differenceKeys(record)) {
        keys.add(key);
      }
    }
    return { lines: Array.from(lines), keys: Array.from(keys) };
  };
  const old = reached(before, false);
  for (const [side, records] of /** @type {Array<['M' | 'G', any[]]>} */ ([['M', mRecords], ['G', gRecords]])) {
    const own = reached(records, true);
    assert.deepEqual(arm[side].findings.lines, own.lines.filter((line) => !old.lines.includes(line)), 'arm ' + side + '\'s new lines');
    assert.deepEqual(arm[side].findings.differences, own.keys.filter((key) => !old.keys.includes(key)), 'arm ' + side + '\'s new differences');
  }
  assert.ok(arm.M.findings.lines.includes(anchor + ':' + push.lines[anchor][0]));
  assert.ok(differenceKeys(push).length > 0 && differenceKeys(push).every((key) => arm.M.findings.differences.includes(key)));

  // The main mutant pass runs only the inputs before the start point, in the
  // order the arm pass runs them first: a mutant it leaves unseparated is
  // first separated, in an arm's pass, by one of that arm's candidates.
  const list = ran.report.mutants.list;
  const beforeIds = new Set(before.map((record) => record.id));
  assert.ok(list.length > 0);
  assert.ok(list.every((/** @type {any} */ m) => m.separatedBy === null || beforeIds.has(m.separatedBy.input)));
  for (const [side, records] of /** @type {Array<['M' | 'G', any[]]>} */ ([['M', mRecords], ['G', gRecords]])) {
    for (const id of arm[side].findings.mutants) {
      const m = list.find((/** @type {any} */ x) => x.id === id);
      assert.ok(m, id);
      assert.equal(m.separatedBy, null, id + ' is separated by no input before the start point');
      assert.ok(records.some((record) => (record.lines[m.anchor] || []).includes(m.line)), id + ' is on a line arm ' + side + '\'s candidates reached');
    }
  }
  assert.deepEqual(arm.M.findings.mutants, list.filter((/** @type {any} */ m) => m.anchor === anchor && push.lines[anchor].includes(m.line)).map((/** @type {any} */ m) => m.id), 'the push separates every mutant on the line it reached');
  assert.ok(arm.G.findings.mutants.length > 0);
});

test('a control path outside the four roots is not written into the record', async () => {
  const scene = JSON.parse(readFileSync('fixtures/bench/room.json', 'utf8'));
  const bundle = {
    run: 'log', seed: scene.seed, law: 'product', quanta: 1, log: [],
    world: { bodies: scene.bodies, colliders: scene.colliders, zones: scene.zones, name: scene.name },
  };
  const file = join(tmpdir(), 'si-rpg-t7c-control.json');
  writeFileSync(file, JSON.stringify(bundle));
  const ran = await bench('control', {
    base, head, worlds: [], mutants: { enabled: false }, proposers: { sweep: false, grammar: false },
    controls: [{ file }],
  });
  assert.equal(ran.report.refused, null, ran.report.refused);
  const record = ran.records[0];
  assert.equal(record.world.includes(file), false);
  assert.equal(JSON.stringify(ran.report.controls).includes(file), false);
  assert.ok(ran.report.environment.paths.controls.includes(resolve(file)));
  assert.match(record.world, /^<control \d+>$/);
});
