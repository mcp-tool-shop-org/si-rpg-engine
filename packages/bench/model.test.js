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
import { copyCheckout, leaks, scratch, teardown } from './plant.js';
import { cutReport, lateGain, stallIndex, withinCost } from './report.js';

const dir = scratch('model');
const ROOM = [{ file: 'fixtures/bench/room.json' }];
const DIGEST = '845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e';
const STEER = JSON.stringify({ notes: 'steer', proposal: { kind: 'intent', verb: 'teleport', actor: 'walker', target: { x: 1, z: 0 }, hash: 'ab'.repeat(32) } });
const MOVE = JSON.stringify({ notes: 'step', proposal: { kind: 'intent', verb: 'move', actor: 'walker', target: { x: 1.25, z: 0.75 } } });

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
  assert.ok(taken.length >= 2);
  assert.ok(taken.reduce((sum, record) => sum + record.cost.quanta, 0) >= 7);
  assert.ok(taken.reduce((sum, record) => sum + record.cost.restores, 0) >= 2);
  const stopped = taken[taken.length - 1];
  const before = taken.slice(0, -1).reduce((sum, record) => sum + record.cost.quanta, 0);
  assert.ok(before < 7 || taken.slice(0, -1).reduce((sum, record) => sum + record.cost.restores, 0) < 2, 'the candidate that crosses is included');
  assert.equal(stopped.cost.quanta, 3);
  assert.deepEqual(withinCost(records, 0, 0), []);
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
