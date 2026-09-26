// The coverage seed (dispatch 113). A law tree's coverage target is a copy of
// the head's with file times kept, and every Cargo.lock package with no
// source left out. The only such package the filter allows is si-solver: it
// matches artifacts by name, so another path package is refused. Product
// targets are not copied. The compiling-unit gate and its control run in
// law.test.js, where the head's coverage target is already built.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildFailure, coverageDir, seedCoverage } from './build.js';
import { scratch, teardown } from './plant.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const dir = scratch('coverage');

after(async () => {
  await teardown(dir);
});

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
