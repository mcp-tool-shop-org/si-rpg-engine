// The coverage seed (dispatch 113). A law tree's coverage target is a copy of
// the head's with file times kept, and every Cargo.lock package with no
// source left out. The only such package the filter allows is si-solver: it
// matches artifacts by name, so another path package is refused. Product
// targets are not copied.
//
// The gate counts cargo's Compiling lines. A seeded coverage build compiles
// si-solver and nothing else. A build that compiles nothing has reused the
// head's law and fails the gate. The control follows the bench's own order:
// the base is checked out, the head is built after it, and the base is seeded
// unfiltered with file times kept. That build compiles no law unit. A law
// change planted after the head's build would be newer than the copied
// artifacts and would hide that reuse, so this file never plants one.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildFailure, buildCoverage, coverageDir, copyProduct, productGlue, seedCoverage } from './build.js';
import { scratch, teardown } from './plant.js';
import { makeWorktree, removeWorktree } from './trees.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dir = scratch('coverage');
/** @type {string[]} */
const worktrees = [];

/** @type {string} */
let head;
/** @type {string} */
let baseUnfiltered;
/** @type {string} */
let baseFiltered;
/** @type {{ compiling: string[], cfgWarnings: number, ms: number }} */
let cold;

after(async () => {
  for (const tree of worktrees) {
    removeWorktree(root, tree);
  }
  await teardown(dir);
});

/**
 * A coverage build compiles exactly one unit, si-solver. Nothing compiled has
 * reused the head's law.
 * @param {string[]} units
 */
function passesGate(units) {
  return units.length === 1 && units[0] === 'si-solver';
}

/**
 * The product glue a coverage build rewrites after cargo. The checkout's glue
 * is copied when pretest has built it; a stub stands in only so the rewrite
 * has an array to replace. Neither is a product target seed.
 * @param {string} tree
 */
function ensureGlue(tree) {
  if (existsSync(productGlue(tree))) {
    return;
  }
  if (existsSync(productGlue(root))) {
    copyProduct(root, tree);
    return;
  }
  mkdirSync(join(tree, 'solver', 'dist'), { recursive: true });
  writeFileSync(productGlue(tree), 'export const bytes = new Uint8Array([\n]);\n');
}

/**
 * @param {string} name
 */
function checkout(name) {
  const tree = makeWorktree(root, 'HEAD', join(dir, name));
  worktrees.push(tree);
  return tree;
}

test('a coverage seed keeps file times, leaves out every Cargo.lock package with no source, and does not copy a product target', () => {
  const from = join(dir, 'times-from');
  const to = join(dir, 'times-to');
  const source = coverageDir(from);
  mkdirSync(join(from, 'solver'), { recursive: true });
  copyFileSync(join(root, 'solver', 'Cargo.lock'), join(from, 'solver', 'Cargo.lock'));
  const kept = join(source, 'wasm32-unknown-unknown', 'release', 'deps', 'libapprox-aaa.rlib');
  const law = join(source, 'wasm32-unknown-unknown', 'release', 'si_solver.wasm');
  const nested = join(source, 'wasm32-unknown-unknown', 'release', '.fingerprint', 'si-solver-deadbeef', 'invoked.timestamp');
  const glue = join(source, 'solver.mjs');
  const product = join(from, 'solver', 'target', 'wasm32-unknown-unknown', 'release', 'si_solver.wasm');
  for (const path of [kept, law, nested, glue, product]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'x');
  }
  const past = new Date('2020-01-01T00:00:00Z');
  utimesSync(kept, past, past);
  assert.equal(seedCoverage(from, to), true);
  const copied = join(coverageDir(to), 'wasm32-unknown-unknown', 'release', 'deps', 'libapprox-aaa.rlib');
  assert.ok(existsSync(copied));
  assert.ok(Math.abs(statSync(copied).mtimeMs - statSync(kept).mtimeMs) < 2000);
  assert.equal(existsSync(join(coverageDir(to), 'wasm32-unknown-unknown', 'release', 'si_solver.wasm')), false);
  assert.equal(existsSync(join(coverageDir(to), 'wasm32-unknown-unknown', 'release', '.fingerprint', 'si-solver-deadbeef')), false);
  assert.equal(existsSync(join(coverageDir(to), 'solver.mjs')), false);
  assert.equal(existsSync(join(to, 'solver', 'target', 'wasm32-unknown-unknown')), false);
  assert.equal(seedCoverage(from, to), false);
});

test('a coverage seed refuses a Cargo.lock that lists a path package other than si-solver', () => {
  const from = join(dir, 'refuse-from');
  const to = join(dir, 'refuse-to');
  mkdirSync(join(from, 'solver'), { recursive: true });
  writeFileSync(join(from, 'solver', 'Cargo.lock'), [
    'version = 4',
    '',
    '[[package]]',
    'name = "si-solver"',
    'version = "0.1.0"',
    '',
    '[[package]]',
    'name = "other-path"',
    'version = "0.1.0"',
    '',
  ].join('\n'));
  const marker = join(coverageDir(from), 'kept.txt');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, 'x');
  assert.throws(() => seedCoverage(from, to), (error) => {
    assert.ok(error instanceof BuildFailure);
    assert.match(/** @type {Error} */ (error).message, /path package other than si-solver/);
    assert.match(/** @type {Error} */ (error).message, /other-path/);
    return true;
  });
  assert.equal(existsSync(coverageDir(to)), false);
});

describe('a seeded coverage build\'s compiling units', { concurrency: 1 }, () => {
  before(() => {
    // The base trees are checked out first. The head is built after them, so
    // its artifacts are newer than the base sources. Nothing in the bases is
    // written after that build.
    baseUnfiltered = checkout('base-unfiltered');
    baseFiltered = checkout('base-filtered');
    head = checkout('head');
    const buildRs = join(root, 'solver', 'build.rs');
    for (const tree of [baseUnfiltered, baseFiltered, head]) {
      const dest = join(tree, 'solver', 'build.rs');
      if (readFileSync(buildRs, 'utf8').replace(/\r\n/g, '\n') !== readFileSync(dest, 'utf8').replace(/\r\n/g, '\n')) {
        copyFileSync(buildRs, dest);
      }
      ensureGlue(tree);
    }
    cold = buildCoverage(head, 'head');
  }, { timeout: 900_000 });

  test('an unfiltered seed of the base, with file times kept, compiles no law unit and fails the gate', { timeout: 900_000 }, (/** @type {import('node:test').TestContext} */ t) => {
    cpSync(coverageDir(head), coverageDir(baseUnfiltered), { recursive: true, preserveTimestamps: true });
    const built = buildCoverage(baseUnfiltered, 'base unfiltered');
    assert.ok(Array.isArray(built.compiling));
    assert.ok(Array.isArray(cold.compiling));
    assert.equal(built.compiling.includes('si-solver'), false);
    assert.equal(passesGate(built.compiling), false);
    t.diagnostic('cold coverage ' + Math.round(cold.ms) + ' ms, ' + cold.compiling.length + ' units');
    t.diagnostic('unfiltered ' + Math.round(built.ms) + ' ms, units: ' + (built.compiling.join(', ') || '(none)'));
    assert.equal(built.cfgWarnings, 0);
    assert.equal(cold.cfgWarnings, 0);
  });

  test('a seeded coverage build compiles exactly si-solver', { timeout: 900_000 }, (/** @type {import('node:test').TestContext} */ t) => {
    assert.equal(seedCoverage(head, baseFiltered), true);
    const built = buildCoverage(baseFiltered, 'base filtered');
    assert.deepEqual(built.compiling, ['si-solver']);
    t.diagnostic('filtered ' + Math.round(built.ms) + ' ms, units: ' + built.compiling.join(', '));
    assert.equal(passesGate(built.compiling), true);
    assert.equal(built.cfgWarnings, 0);
    assert.equal(existsSync(join(baseFiltered, 'solver', 'target', 'wasm32-unknown-unknown')), false);
  });
});
