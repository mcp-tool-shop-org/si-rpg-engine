// The law's cases (T7b pins 2, 3, 7, and 9, "Anchors and reach", "The process
// model", and "The coverage build"). One head carries the law's plants: an
// operator on a line the product scene runs, a const written again at its
// value, a comment, a deleted line, a const no code names, a comment in the
// controller copied from Rapier, a hazard's scenario, comment lines in
// solver/Cargo.toml and solver/Cargo.lock, and code under --cfg law_coverage
// that makes the coverage build compute differently in walled-open only, the
// one world of eight colliders. Each tree builds its own binary, so the two trees are
// built first, side by side, and every bench run after that finds its builds
// fresh: the room's run, walled-open's run, a planted read of the
// counters after a restore, a flag the compiler refuses, and last, a base
// whose solver/ does not compile.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANARY, runBench } from './bench.js';
import { buildCoverage, coverageDir, glueBytes, productGlue, sha256 } from './build.js';
import { copyCheckout, plant, removeScratch, scratch } from './plant.js';
import { BROKEN_LAW, LAW, NEUTRAL, NOT_AIMED_SOLVER, NO_SHIM, SKEW, apply } from './plants.js';
import { startProcess } from './processes.js';

const dir = scratch('law');
const ROOM = [{ file: 'fixtures/bench/room.json' }];
const WALLED_OPEN = [{ file: 'fixtures/sweep/walled-open.json' }];
const SMALL = { sweep: { quanta: 600, restores: 10 }, ladder: { quanta: 2000, restores: 20 } };

/** @type {string} */
let lawHead;
/** @type {string} */
let lawBase;
/** @type {string} */
let shared;
/** @type {string} */
let noShim;
/** @type {Record<string, any>} */
const runs = {};
/** @type {Record<string, any>} */
let access;
/** @type {any[]} */
let records;

/**
 * A tree's product build with its own build script, run beside the others.
 * @param {string} tree
 * @returns {Promise<void>}
 */
function build(tree) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CARGO_TARGET_DIR;
    delete env.RUSTFLAGS;
    delete env.CARGO_ENCODED_RUSTFLAGS;
    delete env.RUSTC_BOOTSTRAP;
    const child = spawn(process.execPath, ['solver/build.mjs'], { cwd: tree, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    /** @type {import('node:stream').Readable} */ (child.stderr).on('data', (d) => { err = (err + d).slice(-4000); });
    /** @type {import('node:stream').Readable} */ (child.stdout).on('data', () => {});
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('the build of ' + tree + ' failed: ' + err))));
  });
}

before(async () => {
  lawHead = copyCheckout(dir, 'law-head');
  apply(plant, lawHead, [...LAW.operator, ...LAW.constant, ...LAW.comment, ...LAW.deleted, ...LAW.unused, ...LAW.copied, ...NEUTRAL.hazard, ...NOT_AIMED_SOLVER.cargoToml, ...NOT_AIMED_SOLVER.cargoLock, ...SKEW]);
  lawBase = copyCheckout(dir, 'law-base');
  noShim = copyCheckout(dir, 'no-shim');
  apply(plant, noShim, NO_SHIM);
  await Promise.all([
    build(lawHead).then(() => { buildCoverage(lawHead, 'law head'); }),
    build(lawBase).then(() => { buildCoverage(lawBase, 'law base'); }),
    build(noShim),
  ]);
  shared = join(dir, 'shared-target');
  mkdirSync(shared);
  const before = process.env.CARGO_TARGET_DIR;
  process.env.CARGO_TARGET_DIR = shared;
  try {
    [runs.law, runs.skew] = await Promise.all([
      runBench({
        base: lawBase, head: lawHead, out: join(dir, 'law-out'), seed: 5, worlds: ROOM,
        budgets: { sweep: { quanta: 3000, restores: 40 }, ladder: { quanta: 6000, restores: 60 } },
        proposers: { grammar: false }, mutants: { enabled: true, cap: 6 },
      }),
      runBench({ base: lawBase, head: lawHead, out: join(dir, 'skew-out'), seed: 5, worlds: WALLED_OPEN, budgets: SMALL, proposers: { grammar: false }, mutants: { enabled: false } }),
    ]);
  } finally {
    if (before === undefined) {
      delete process.env.CARGO_TARGET_DIR;
    } else {
      process.env.CARGO_TARGET_DIR = before;
    }
  }
  access = JSON.parse(readFileSync(join(dir, 'law-out', 'access.json'), 'utf8'));
  records = readFileSync(join(dir, 'law-out', 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  runs.readAfterRestore = await runBench({
    base: lawBase, head: lawHead, out: join(dir, 'restore-out'), seed: 5, worlds: ROOM, budgets: SMALL,
    proposers: { grammar: false }, mutants: { enabled: false }, plant: { runner: { coverage: { readAfterRestore: true } } },
  });
  // The checkout beside itself without the shim: two sources, one digest.
  runs.equal = await runBench({ base: noShim, head: lawBase, out: join(dir, 'equal-out'), seed: 5, worlds: ROOM, budgets: SMALL, proposers: { grammar: false }, mutants: { enabled: false } });
  runs.badFlag = await runBench({
    base: lawBase, head: lawHead, out: join(dir, 'flag-out'), seed: 5, worlds: ROOM, budgets: SMALL,
    proposers: { grammar: false }, mutants: { enabled: false }, plant: { coverageFlags: ['-C', 'no-such-option=1'] },
  });
});

after(() => removeScratch(dir));

/**
 * @param {string} prefix
 */
function anchor(prefix) {
  const found = runs.law.anchors.filter((/** @type {any} */ a) => a.id.startsWith(prefix));
  assert.equal(found.length, 1, prefix + ': ' + runs.law.anchors.map((/** @type {any} */ a) => a.id).join(' | '));
  return found[0];
}

test('a one-operator change in the law, on a line the product scene runs: the bench names the law anchor, reads its reach from the coverage build, shows the coverage build\'s product-scene trace equal to the head product build\'s frame for frame, and finds the difference', () => {
  const r = runs.law;
  assert.equal(r.refused, null);
  assert.equal(r.binaries.mode, 'solver/ differs: each tree built its own binary from its own source, in its own target directory');
  const a = anchor('law:solver/src/rapier_law.rs:rebuild_snapshot:');
  assert.equal(a.kind, 'law');
  assert.deepEqual(a.executable, [a.lines[0][0]]);
  assert.ok(a.reachedBy.includes('window'), 'reached in a candidate\'s window, by the coverage build\'s counters');
  assert.deepEqual(a.linesReached, [a.lines[0][0]]);
  const entries = access.anchors.find((/** @type {any} */ x) => x.id === a.id).reachedBy;
  assert.ok(entries.some((/** @type {any} */ e) => e.source === 'window' && e.candidate && e.candidate.proposer === 'sweep'));
  assert.equal(r.coverage.made, true);
  assert.match(r.coverage.productScene, /^its product-scene trace equals the head product build's, frame for frame, over \d+ quanta$/);
  // The head changes the law, so the sweep runs on its coverage build.
  assert.equal(r.environment.processes.sweep.build, 'coverage');
  assert.equal(r.environment.processes['head coverage'].build, 'coverage');
  // The operator is the head's one change of behaviour, and it shows in the
  // snapshot the hash mixes, the same way in every candidate compared.
  assert.ok(records.length > 0 && records.every((x) => x.recorded.includes('2')));
  assert.ok(records.every((x) => x.rungs[2] && x.rungs[2].kind === 'trace' && x.rungs[2].field === 'snapshot'), JSON.stringify(records.map((x) => x.rungs[2])));
  assert.match(r.proposers.sweep.floods[0].line, /^every one of the \d+ candidates compared differs the same way: at tick \d+ in the snapshot$/);
});

test('a const in the law, written again at its value: anchored through the functions that name it, its reach read from the coverage build; its four constant mutants are each compared with the head\'s coverage build, whose digest is in the environment block', () => {
  const r = runs.law;
  const a = anchor('law-top-level:solver/src/rapier_law.rs:G:');
  assert.deepEqual(a.identifiers, ['G']);
  assert.equal(a.why, 'the functions that name G');
  assert.equal(a.approximate, true);
  assert.ok(a.reachedBy.includes('window'));
  const mutants = r.mutants.list.filter((/** @type {any} */ m) => m.anchor === a.id);
  assert.deepEqual(mutants.map((/** @type {any} */ m) => m.detail), ['8.000 to 8.000000000000002, one unit in its last place up', '8.000 to 7.999999999999999, one unit in its last place down', '8.000 to 8.8, times 1.1', '8.000 to 7.2, times 0.9']);
  assert.match(r.environment.binaries.coverage, /^[0-9a-f]{64}$/);
  for (const m of mutants) {
    assert.equal(m.kind, 'law');
    assert.equal(m.build, 'the head\'s coverage build');
    assert.deepEqual(m.comparedWith, { build: 'head coverage', digest: r.environment.binaries.coverage });
    assert.equal(m.verdict, 'caught');
    assert.notEqual(r.environment.binaries.lawMutants[m.id], r.environment.binaries.lawReference);
  }
});

test('a comment in a law function is rewritten: marked no executable change, and listed with no mutants, with that reason', () => {
  const a = anchor('law:solver/src/rapier_law.rs:integrate:');
  assert.equal(a.noExecutableChange, true);
  assert.deepEqual(a.executable, []);
  assert.equal(a.reached, true);
  assert.ok(runs.law.mutants.none.some((/** @type {any} */ n) => n.anchor === a.id && n.reason === 'no executable change'));
  assert.ok(runs.law.notMeasured.noExecutableChange.includes(a.id));
});

test('a line deleted from a law function: the deletion anchor\'s region is read from the coverage build, and it is listed with no mutants', () => {
  const a = anchor('law-deletion:solver/src/rapier_law.rs:');
  assert.equal(a.side, 'base');
  assert.ok(a.region, 'a region read from the mapping');
  assert.equal(a.region.file, 'solver/src/rapier_law.rs');
  // Rust's mapping has no region between two statements, where the line left,
  // so the region is the first of the innermost block around the point.
  assert.equal(a.region.how, 'the first region of the innermost block around the point, which falls between regions');
  assert.ok(a.region.line < a.region.point.line);
  assert.equal(a.reached, true);
  assert.ok(runs.law.mutants.none.some((/** @type {any} */ n) => n.anchor === a.id && n.reason === 'a deletion: nothing is left to mutate'));
});

test('the canary\'s relation, pinned from the product scene, holds in a fixture world, in each candidate\'s window and in its restore check\'s', () => {
  const r = runs.law;
  assert.equal(CANARY, 'equal');
  assert.equal(r.coverage.canary.relation, CANARY);
  assert.equal(r.coverage.canary.measured.count, r.coverage.canary.measured.quanta);
  // Every window of every candidate was mapped and checked, and none refused.
  assert.equal(r.refused, null);
  assert.ok(records.every((x) => x.anchors.some((/** @type {string} */ id) => id.startsWith('law')) && x.restoreAnchors.some((/** @type {string} */ id) => id.startsWith('law'))));
});

test('law mutants are built in turn in the one law tree against the reference it built: one whose rebuild changes no byte is not scored, and a run whose law mutants reach the cap lists those left out, by anchor and operator', () => {
  const r = runs.law;
  const a = anchor('law-top-level:solver/src/rapier_law.rs:PLANTED_UNUSED:');
  assert.equal(a.verdict, 'not seen reached (approximate)');
  assert.match(r.environment.binaries.lawReference, /^[0-9a-f]{64}$/);
  const unused = r.mutants.list.filter((/** @type {any} */ m) => m.anchor === a.id);
  assert.equal(unused.length, 2);
  for (const m of unused) {
    assert.equal(m.verdict, 'not scored');
    assert.equal(m.why, 'its rebuild changed no byte: the binary equals the law tree\'s reference');
    assert.equal(r.environment.binaries.lawMutants[m.id], r.environment.binaries.lawReference);
  }
  // The fixed order runs by file, then the anchor's first line: G's four
  // come first, then this const's, and the cap of six leaves out its last
  // two and every mutant after them.
  assert.equal(r.mutants.cap, 6);
  assert.equal(r.mutants.list.length, 6);
  assert.deepEqual(r.mutants.leftOut.slice(0, 2).map((/** @type {any} */ m) => [m.anchor, m.operator]), [[a.id, 'numeric constant'], [a.id, 'numeric constant']]);
  assert.ok(r.mutants.leftOut.every((/** @type {any} */ m) => typeof m.anchor === 'string' && typeof m.operator === 'string'));
  assert.deepEqual(r.notMeasured.mutantsNotScored.map((/** @type {any} */ m) => m.id), unused.map((/** @type {any} */ m) => m.id));
});

test('the product binary\'s digest does not move with the shim in the source: the checkout\'s law, built with it and without it, is one binary', () => {
  // The base is the checkout, shim and all, built by its own build script; the
  // other tree is the checkout with the shim's lines taken out.
  assert.ok(!readFileSync(join(noShim, 'solver', 'src', 'lib.rs'), 'utf8').includes('__llvm_profile_runtime'));
  assert.equal(sha256(glueBytes(productGlue(noShim))), runs.law.environment.binaries.base);
});

test('the coverage build covers everything linked: a comment in the controller copied from Rapier, kcc.rs, is an anchor measured like any other', () => {
  const a = anchor('law:solver/src/kcc.rs:');
  assert.equal(a.noExecutableChange, true);
  assert.equal(a.reached, true);
  assert.ok(a.reachedBy.includes('window'));
});

test('the hazard suite runs in the coverage build\'s process too, when a hazard changes, and the law anchors it runs carry a suite entry naming the hazard and its world', () => {
  const r = runs.law;
  assert.equal(r.suite.ran, true);
  const a = anchor('law:solver/src/rapier_law.rs:rebuild_snapshot:');
  assert.ok(a.reachedBy.includes('suite'));
  const entries = access.anchors.find((/** @type {any} */ x) => x.id === a.id).reachedBy.filter((/** @type {any} */ e) => e.source === 'suite');
  assert.ok(entries.length > 0 && entries.every((/** @type {any} */ e) => typeof e.hazard.id === 'string' && typeof e.hazard.world === 'string'));
});

test('digest equality is never taken as the same law: two trees whose sources differ but whose builds share a digest are each built from their own source and run as two trees, each process on its own', () => {
  const r = runs.equal;
  assert.equal(r.refused, null);
  assert.equal(r.binaries.mode, 'solver/ differs: each tree built its own binary from its own source, in its own target directory');
  assert.equal(r.environment.binaries.head, r.environment.binaries.base, 'one digest');
  assert.equal(r.environment.processes.base.tree, noShim);
  assert.equal(r.environment.processes.head.tree, lawBase);
  // The head adds the shim: a law anchor, so its coverage build is made and
  // checked frame for frame, and nothing differs.
  assert.equal(r.coverage.made, true);
  const records = readFileSync(join(dir, 'equal-out', 'records.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(records.length > 0 && records.every((x) => x.recorded.includes('2') && x.rungs[2] === null));
});

test('the dependency files of solver/ are reported not aimed, with their reason, and every candidate still runs on both trees', () => {
  const r = runs.law;
  for (const file of ['solver/Cargo.toml', 'solver/Cargo.lock']) {
    const n = r.notAimed.find((/** @type {any} */ x) => x.id === 'not-aimed:' + file);
    assert.ok(n, file);
    assert.match(n.reason, /^a dependency file: every candidate still runs on every tree/);
  }
  assert.ok(records.every((x) => x.recorded.includes('2')));
});

test('two trees with CARGO_TARGET_DIR set to one directory still build into their own trees, and their binaries come from their own sources', () => {
  const r = runs.law;
  assert.deepEqual(readdirSync(shared), [], 'nothing was built in the shared directory');
  for (const [tree, side] of [[lawHead, 'head'], [lawBase, 'base']]) {
    const wasm = join(tree, 'solver', 'target', 'wasm32-unknown-unknown', 'release', 'si_solver.wasm');
    assert.ok(existsSync(wasm), side + ' built in its own tree');
    assert.equal(sha256(new Uint8Array(readFileSync(wasm))), r.environment.binaries[side], side + '\'s binary is its own build\'s');
    assert.equal(sha256(glueBytes(productGlue(tree))), r.environment.binaries[side]);
  }
  assert.notEqual(r.environment.binaries.head, r.environment.binaries.base);
});

test('a coverage build planted to compute differently only in a fixture world passes the product scene and is refused at that world\'s first candidate by its frame-for-frame check, though later frames undo the difference', () => {
  const r = runs.skew;
  assert.match(r.coverage.productScene, /^its product-scene trace equals the head product build's, frame for frame/);
  assert.match(r.refused, /^the coverage build computes differently from the product build at c1 in fixtures\/sweep\/walled-open\.json: the traces differ, frame for frame, first at tick 20; the states agree again from tick 21 to the last frame, tick \d+, and the running hash carries the difference on\n/);
  assert.match(r.refused, /\nbody walker field x\n/);
  // The room, a two-body world, never meets it: the law run over it stands.
  assert.equal(runs.law.refused, null);
});

test('a planted read of the counters after a restore trips the step-count canary, and the bench refuses with the reason', () => {
  assert.match(runs.readAfterRestore.refused, /^the canary refuses c\d+'s window: solver_step ran 0 times in a window of \d+ quanta, a lower count: the counters were read at the wrong address, or rewound by a restore the window does not account for$/);
});

test('a save the head\'s product process took is refused in the head\'s coverage process on the same tree, by its tag, before any restore', async () => {
  const product = await startProcess({ name: 'head', tree: lawHead, build: 'product', modules: ['sweep'] });
  const cov = await startProcess({ name: 'head coverage', tree: lawHead, build: 'coverage', redirect: { from: productGlue(lawHead), to: join(coverageDir(lawHead), 'solver.mjs') } });
  try {
    const room = (await product.call('world-input', { file: 'fixtures/bench/room.json' })).input;
    const c = records.find((x) => x.witness.length > 0) || records[0];
    const args = { world: room.world, seed: room.seed, entries: c.witness.concat([c.intent]), witness: c.witness.length, witnessEnd: c.witnessEnd, key: 'shared-key', restoreCheck: false, window: false };
    await product.call('candidate', args);
    const exported = await product.call('export-save', { key: 'shared-key' });
    assert.match(exported.save.tag.process, /^head#/);
    await assert.rejects(cov.call('import-save', { save: exported.save, world: room.world, seed: room.seed }), /the save was taken in process head#.* \(tree .*, build product\), and this is process head coverage#.* \(tree .*, build coverage\)/);
    const after = await cov.call('candidate', { ...args, key: null });
    assert.equal(after.failure, null, 'refused before any restore: the coverage process runs on');
  } finally {
    await product.close();
    await cov.close();
  }
});

test('a coverage build made to fail, by a flag the compiler refuses, stops the bench with the reason', () => {
  assert.match(runs.badFlag.refused, /^the head coverage build failed \(status \d+\): .*no-such-option/s);
});

test('a base whose solver/ does not compile stops the bench with the reason', async () => {
  apply(plant, lawBase, BROKEN_LAW);
  const r = await runBench({ base: lawBase, head: lawHead, out: join(dir, 'broken-out'), seed: 5, worlds: ROOM, budgets: SMALL, proposers: { grammar: false }, mutants: { enabled: false } });
  assert.match(r.refused, /^the base tree's own build of solver\/ failed \(status \d+\): .*mismatched types/s);
});
