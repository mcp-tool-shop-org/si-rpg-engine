#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} harness
 * @param {string} goldenFile
 */
function match(harness, goldenFile) {
  const golden = readFileSync(join(root, goldenFile), 'utf8').trim();
  const run = spawnSync(process.execPath, [join(root, harness)], { encoding: 'utf8' });
  const got = (run.stdout || '').trim();
  if (run.status !== 0 || got !== golden) {
    process.stderr.write(harness + ' got ' + got + '\nexpected ' + golden + '\n');
    process.exit(1);
  }
  process.stdout.write(harness + ' matches ' + golden + '\n');
}

match('harness/sim.mjs', 'fixtures/golden.txt');
match('harness/arith.mjs', 'fixtures/golden-arith.txt');
