#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sim = join(root, 'harness', 'sim.mjs');
const run = spawnSync(process.execPath, [sim], { encoding: 'utf8' });
if (run.status !== 0) {
  process.stderr.write(run.stderr || 'sim failed\n');
  process.exit(run.status || 1);
}
const line = run.stdout.trim();
if (!/^[0-9a-f]{16}$/.test(line)) {
  process.stderr.write('refusing to write a line that is not 16 hex digits\n');
  process.exit(1);
}
writeFileSync(join(root, 'fixtures', 'golden.txt'), line + '\n');
process.stdout.write(line + '\n');
