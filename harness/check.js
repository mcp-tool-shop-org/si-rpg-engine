#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { behaviourDifferences, productBehaviour } from './behaviour.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A failed golden check writes a bundle of the product scene as this build
 * runs it, to its last quantum with an image, and prints the path (T5 pin
 * 3). The arithmetic golden has no world, so it writes none.
 * @param {string} why
 */
async function bundleProduct(why) {
  process.chdir(root);
  const { bundleFailure } = await import('./bundle.mjs');
  bundleFailure('golden check', [{ spec: { scene: 'product' } }], why);
}

/**
 * @param {string} harness
 * @param {string} goldenFile
 */
async function match(harness, goldenFile) {
  const golden = readFileSync(join(root, goldenFile), 'utf8').trim();
  const run = spawnSync(process.execPath, [join(root, harness)], { encoding: 'utf8' });
  const got = (run.stdout || '').trim();
  if (run.status !== 0 || got !== golden) {
    process.stderr.write(harness + ' got ' + got + '\nexpected ' + golden + '\n');
    if (harness === 'harness/sim.mjs') {
      await bundleProduct(harness + ' got ' + got + ', expected ' + golden);
    }
    process.exit(1);
  }
  process.stdout.write(harness + ' matches ' + golden + '\n');
}

await match('harness/sim.mjs', 'fixtures/golden.txt');
await match('harness/arith.mjs', 'fixtures/golden-arith.txt');

// The behaviour numbers beside the golden. `--behaviour <file>` checks
// another file; the tests use it to plant a moved number.
const flag = process.argv.indexOf('--behaviour');
const behaviourFile = flag >= 0 && process.argv[flag + 1] ? resolve(process.argv[flag + 1]) : join(root, 'fixtures', 'golden-behaviour.json');
const expected = JSON.parse(readFileSync(behaviourFile, 'utf8'));
const actual = productBehaviour();
const golden = readFileSync(join(root, 'fixtures', 'golden.txt'), 'utf8').trim();
if (actual.hash !== golden) {
  process.stderr.write('the behaviour run hashed ' + actual.hash + ', not the golden ' + golden + '\n');
  await bundleProduct('the behaviour run hashed ' + actual.hash + ', not the golden ' + golden);
  process.exit(1);
}
const moved = behaviourDifferences(expected, actual);
if (moved.length > 0) {
  for (const line of moved) {
    process.stderr.write(line + '\n');
  }
  process.stderr.write(moved.length + ' behaviour number' + (moved.length === 1 ? '' : 's') + ' moved from ' + behaviourFile + '\n');
  await bundleProduct(moved.join('\n'));
  process.exit(1);
}
process.stdout.write('behaviour matches: ' + Object.keys(actual.sleep).length + ' sleep quanta, ' + Object.keys(actual.final).length + ' final positions, walker in ' + actual.walkerZone + ', snapshot ' + actual.snapshotBytes.load + ' bytes ' + actual.snapshotDigest.load + ' then ' + actual.snapshotBytes.last + ' bytes ' + actual.snapshotDigest.last + '\n');
