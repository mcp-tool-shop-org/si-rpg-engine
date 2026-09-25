#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from '../packages/tool/guard.js';

guard('write-golden');

// Rewrites fixtures/golden.txt from harness/sim.mjs, the product solver.
// It does not rewrite fixtures/golden-arith.txt. CI does not run this.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The path is written out so the map can see that this command runs the
// product harness; the command runs from the repository root.
const run = spawnSync(process.execPath, ['harness/sim.mjs'], { cwd: root, encoding: 'utf8' });
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
