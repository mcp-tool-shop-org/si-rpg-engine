#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from '../packages/tool/guard.js';
import { behaviourDifferences, productBehaviour } from './behaviour.mjs';

guard('write-golden [--gate <test file> ...]');

// Rewrites fixtures/golden.txt from harness/sim.mjs, the product solver, and
// fixtures/golden-behaviour.json from the same scene, and names every
// behaviour number that moved so the commit can say which. It does not
// rewrite fixtures/golden-arith.txt. CI does not run this.
//
// The character course and the outcome tests run first, and a failure of
// either refuses the write with the failing test named (T4 pin 6): a golden
// may not move over a broken outcome. `--gate <file>` runs that test file in
// their place; the tests use it to plant a failing course.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
/** @type {string[]} */
const planted = [];
for (let i = 0; i < args.length; i = i + 1) {
  if (args[i] === '--gate' && args[i + 1]) {
    planted.push(args[i + 1]);
    i = i + 1;
  }
}
// The paths are written out so the map can see that this command runs them.
const gateFiles = planted.length > 0 ? planted : ['harness/course.test.js', 'harness/outcome.test.js'];
// Under a test runner the child inherits NODE_TEST_CONTEXT, reports to that
// runner instead, and exits 0 on a failure; the gate runs as its own runner.
const gateEnv = { ...process.env };
delete gateEnv.NODE_TEST_CONTEXT;
const gate = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...gateFiles], { cwd: root, encoding: 'utf8', env: gateEnv });
if (gate.status !== 0) {
  const failed = (gate.stdout || '').split(/\r?\n/)
    .map((row) => /^\s*not ok \d+ - (.+?)\s*$/.exec(row))
    .filter((found) => found !== null)
    .map((found) => /** @type {RegExpExecArray} */ (found)[1]);
  for (const name of failed) {
    process.stderr.write('failed: ' + name + '\n');
  }
  if (failed.length === 0) {
    process.stderr.write(gate.stderr || 'the gate did not run\n');
  }
  process.stderr.write('refusing to write the golden: ' + gateFiles.join(' and ') + ' did not pass\n');
  process.exit(1);
}
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
