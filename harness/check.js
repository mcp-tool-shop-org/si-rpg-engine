#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const golden = readFileSync(join(root, 'fixtures', 'golden.txt'), 'utf8').trim();
const run = spawnSync(process.execPath, [join(root, 'harness', 'sim.js')], { encoding: 'utf8' });
const got = (run.stdout || '').trim();
if (run.status !== 0 || got !== golden) {
  process.stderr.write('got ' + got + '\nexpected ' + golden + '\n');
  process.exit(1);
}
process.stdout.write('matches ' + golden + '\n');
