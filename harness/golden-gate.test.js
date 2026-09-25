// T4 pin 6: write-golden runs the character course and the outcome tests
// first and refuses to write when any fails, naming the failing test. A
// failing course is planted with --gate; the goldens must not change. This
// file itself runs under node --test, whose NODE_TEST_CONTEXT once made the
// gate's child runner exit 0 on a failure and write the golden anyway.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'si-rpg-gate-'));

test('write-golden refuses to write when a course test fails, and names it', () => {
  const planted = join(dir, 'broken-course.test.js');
  writeFileSync(planted, [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "test('course 9.1: a planted step the walker climbs', () => {});",
    "test('course 9.2: a planted step the walker cannot climb', () => { assert.ok(false, 'planted'); });",
    '',
  ].join('\n'));
  const golden = readFileSync('fixtures/golden.txt');
  const behaviour = readFileSync('fixtures/golden-behaviour.json');
  const run = spawnSync(process.execPath, ['harness/write-golden.js', '--gate', planted], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stderr, /^failed: course 9\.2: a planted step the walker cannot climb$/m);
  assert.doesNotMatch(run.stderr, /course 9\.1/);
  assert.match(run.stderr, /^refusing to write the golden: /m);
  assert.equal(run.stdout, '');
  assert.deepEqual(readFileSync('fixtures/golden.txt'), golden);
  assert.deepEqual(readFileSync('fixtures/golden-behaviour.json'), behaviour);
});

test('write-golden gates on the course and the outcome tests by default', () => {
  const source = readFileSync('harness/write-golden.js', 'utf8');
  assert.match(source, /\['harness\/course\.test\.js', 'harness\/outcome\.test\.js'\]/);
  // The gate runs before sim.mjs is spawned or anything is written.
  assert.ok(source.indexOf("'--test'") < source.indexOf("'harness/sim.mjs'"));
  assert.ok(source.indexOf("'--test'") < source.indexOf('writeFileSync('));
});
