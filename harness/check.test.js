import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { behaviourDifferences } from './behaviour.mjs';

const dir = mkdtempSync(join(tmpdir(), 'si-rpg-check-'));
const saved = JSON.parse(readFileSync('fixtures/golden-behaviour.json', 'utf8'));

/**
 * @param {unknown} behaviour
 */
function check(behaviour) {
  const file = join(dir, 'behaviour.json');
  writeFileSync(file, JSON.stringify(behaviour, null, 2) + '\n');
  return spawnSync(process.execPath, ['harness/check.js', '--behaviour', file], { encoding: 'utf8' });
}

test('the recorded behaviour passes the check', () => {
  const run = check(saved);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /behaviour matches/);
});

test('a moved sleep quantum fails the check with its body named', () => {
  const moved = structuredClone(saved);
  moved.sleep.tip = moved.sleep.tip + 1;
  const run = check(moved);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^body tip sleep quantum: expected 91, got 90$/m);
});

test('a final position moved in its last bit fails with its body named', () => {
  const moved = structuredClone(saved);
  const y = moved.final.slider.y;
  moved.final.slider.y = y + y * Number.EPSILON;
  assert.notEqual(moved.final.slider.y, y);
  const run = check(moved);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^body slider final y: expected /m);
  assert.doesNotMatch(run.stderr, /body walker/);
});

test('the snapshot length and the walker zone are compared too', () => {
  const moved = structuredClone(saved);
  moved.snapshotBytes.last = moved.snapshotBytes.last + 8;
  moved.walkerZone = 'west';
  assert.deepEqual(behaviourDifferences(moved, saved), [
    'body walker final zone: expected west, got east',
    'snapshot bytes at the last quantum: expected ' + moved.snapshotBytes.last + ', got ' + saved.snapshotBytes.last,
  ]);
});
