// The bench's source rules (T7b pins 1, 2, 3, 11, and 12): it calls no model
// and imports nothing from packages/propose, it adds no runtime dependency,
// the law's one change is the coverage build's shim, which nothing but the
// bench's coverage build sets, and a tree's digest covers its files, tracked
// and untracked but not ignored.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAMMAR_PITCH, GRAMMAR_SHARE } from './bench.js';
import { COVERAGE_FLAGS } from './build.js';
import { PITCHES, PLANTS, SHARES, choose } from './measure.js';
import { scratch, teardown } from './plant.js';
import { listFiles, makeWorktree, removeWorktree, treeCommit, treeDigest } from './trees.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dir = scratch('source');
/** @type {string[]} */
const worktrees = [];

after(async () => {
  for (const tree of worktrees) {
    removeWorktree(root, tree);
  }
  await teardown(dir);
});

/**
 * Every module a directory's JS files import, with the file that imports it:
 * static imports and exports from, and dynamic imports of a string.
 * @param {string} at
 * @returns {Array<{ file: string, specifier: string }>}
 */
function importsOf(at) {
  /** @type {Array<{ file: string, specifier: string }>} */
  const out = [];
  for (const name of readdirSync(at).filter((f) => f.endsWith('.js')).sort()) {
    const text = readFileSync(join(at, name), 'utf8');
    const patterns = [/^\s*import\s[^;]*?from\s*'([^']+)'/gm, /^\s*import\s*'([^']+)'/gm, /^\s*export\s[^;]*?from\s*'([^']+)'/gm, /\bimport\(\s*'([^']+)'\s*\)/g];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        out.push({ file: name, specifier: m[1] });
      }
    }
  }
  return out;
}

/**
 * The imports the bench may not make: anything under packages/propose, which
 * holds the model's seat; any module that reaches a network; and any package
 * from outside the engine and node.
 * @param {string} at the bench's directory
 */
function forbidden(at) {
  return importsOf(at).filter(({ specifier }) => {
    const target = specifier.startsWith('.') ? resolve(at, specifier).replace(/\\/g, '/') : specifier;
    return /\/packages\/propose(\/|$)/.test(target) || /^(node:)?(http|https|http2|net|tls|dgram|dns)$/.test(specifier) || (!specifier.startsWith('.') && !specifier.startsWith('node:'));
  });
}

test('the bench imports nothing from packages/propose, reaches no network, and takes no module from outside the engine and node', () => {
  assert.deepEqual(forbidden(here), []);
  // The rule goes red on a planted import.
  const copy = join(dir, 'packages', 'bench');
  mkdirSync(copy, { recursive: true });
  for (const name of readdirSync(here).filter((f) => f.endsWith('.js'))) {
    writeFileSync(join(copy, name), readFileSync(join(here, name), 'utf8'));
  }
  writeFileSync(join(copy, 'reach.js'), 'import { seat } from \'../propose/seat.js\';\n' + readFileSync(join(here, 'reach.js'), 'utf8'));
  writeFileSync(join(copy, 'report.js'), 'const planted = await import(\'node:https\');\n' + readFileSync(join(here, 'report.js'), 'utf8'));
  const found = forbidden(copy).map((f) => f.file + ' ' + f.specifier);
  assert.deepEqual(found, ['reach.js ../propose/seat.js', 'report.js node:https']);
});

test('the engine has no runtime dependency, so no tree installs one for the bench, and the bench runs as the engine\'s own bin', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.bin.bench, './packages/bench/bin/bench.js');
  for (const { specifier } of importsOf(here).concat(importsOf(join(here, 'bin')))) {
    assert.ok(specifier.startsWith('.') || specifier.startsWith('node:'), specifier);
  }
});

test('the law\'s one change is the coverage build\'s shim: one static under --cfg law_coverage, a cfg only the bench\'s coverage build sets', () => {
  const lib = readFileSync(join(root, 'solver', 'src', 'lib.rs'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(lib.includes('#[cfg(law_coverage)]\n#[unsafe(no_mangle)]\npub static __llvm_profile_runtime: i32 = 0;\n'));
  for (const name of readdirSync(join(root, 'solver', 'src'))) {
    const text = readFileSync(join(root, 'solver', 'src', name), 'utf8');
    assert.equal((text.match(/law_coverage/g) || []).length, name === 'lib.rs' ? 2 : 0, name);
  }
  // Nothing the product build reads names the cfg: its build script, its
  // manifest, its cargo config, and the script that sets its flags.
  for (const file of ['solver/build.rs', 'solver/Cargo.toml', 'solver/.cargo/config.toml', 'solver/build.mjs']) {
    assert.ok(!readFileSync(join(root, file), 'utf8').includes('law_coverage'), file);
  }
  assert.deepEqual(COVERAGE_FLAGS, ['-C', 'instrument-coverage', '-Z', 'no-profiler-runtime', '--cfg', 'law_coverage', '-C', 'link-arg=--no-gc-sections']);
});

test('the grammar\'s share and pitch are set from their measurement: the pair the measurement\'s own rule chooses from every run it records', () => {
  const measured = JSON.parse(readFileSync(join(root, 'fixtures', 'bench', 'grammar.json'), 'utf8'));
  assert.deepEqual(measured.pairs.map((/** @type {any} */ p) => [p.share, p.pitch]), SHARES.flatMap((s) => PITCHES.map((p) => [s, p])));
  assert.deepEqual(measured.plants, PLANTS.map((p) => p.name));
  for (const p of measured.pairs) {
    const runs = Object.values(p.runs);
    assert.equal(runs.length, measured.plants.length * measured.seeds.length);
    assert.equal(p.found, runs.filter((n) => n !== null).length);
    assert.equal(p.total, runs.reduce((/** @type {number} */ sum, n) => sum + (n === null ? measured.budget.quanta : /** @type {number} */ (n)), 0));
  }
  assert.deepEqual(choose(measured.pairs), measured.chosen);
  assert.deepEqual({ share: GRAMMAR_SHARE, pitch: GRAMMAR_PITCH }, measured.chosen);
});

test('a planted copy\'s tree digest differs from its commit\'s, for an edited file and for a new untracked one, and an ignored file does not count', () => {
  const tree = makeWorktree(root, 'HEAD', join(dir, 'tree'));
  worktrees.push(tree);
  const commit = treeCommit(tree);
  assert.match(String(commit), /^[0-9a-f]{40}$/);
  const clean = treeDigest(tree);
  // An ignored file is not the tree's.
  mkdirSync(join(tree, 'solver', 'target'), { recursive: true });
  writeFileSync(join(tree, 'solver', 'target', 'planted.txt'), 'ignored\n');
  assert.equal(treeDigest(tree), clean);
  assert.ok(!listFiles(tree).includes('solver/target/planted.txt'));
  // An edited file.
  const file = join(tree, 'predicates', 'intents', 'move.json');
  const original = readFileSync(file, 'utf8');
  writeFileSync(file, original.replace('"maxDistance": 3,', '"maxDistance": 2,'));
  const edited = treeDigest(tree);
  assert.notEqual(edited, clean);
  writeFileSync(file, original);
  assert.equal(treeDigest(tree), clean);
  // A new untracked file.
  writeFileSync(join(tree, 'fixtures', 'planted.json'), '{}\n');
  assert.ok(listFiles(tree).includes('fixtures/planted.json'));
  const untracked = treeDigest(tree);
  assert.notEqual(untracked, clean);
  assert.notEqual(untracked, edited);
  rmSync(join(tree, 'fixtures', 'planted.json'));
  assert.equal(treeDigest(tree), clean);
  assert.equal(treeCommit(tree), commit, 'the commit is the worktree\'s, edited or not');
  assert.ok(existsSync(join(tree, '.git')));
});
