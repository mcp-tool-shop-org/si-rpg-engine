#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from '../packages/tool/guard.js';
import { behaviourDifferences, productBehaviour } from './behaviour.mjs';

guard('write-golden');

// Rewrites fixtures/golden.txt from harness/sim.mjs, the product solver, and
// fixtures/golden-behaviour.json from the same scene, and names every
// behaviour number that moved so the commit can say which. It does not
// rewrite fixtures/golden-arith.txt. CI does not run this.
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
const { hash, ...behaviour } = productBehaviour();
if (hash !== line) {
  process.stderr.write('the behaviour run hashed ' + hash + ', not ' + line + '\n');
  process.exit(1);
}
const behaviourFile = join(root, 'fixtures', 'golden-behaviour.json');
const before = existsSync(behaviourFile) ? JSON.parse(readFileSync(behaviourFile, 'utf8')) : {};
const moved = behaviourDifferences(before, behaviour);
writeFileSync(join(root, 'fixtures', 'golden.txt'), line + '\n');
writeFileSync(behaviourFile, JSON.stringify(behaviour, null, 2) + '\n');
process.stdout.write(line + '\n');
if (moved.length === 0) {
  process.stdout.write('no behaviour number moved\n');
} else {
  for (const change of moved) {
    process.stdout.write('moved ' + change + '\n');
  }
}
