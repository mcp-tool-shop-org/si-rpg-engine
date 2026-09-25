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
  assert.match(run.stderr, new RegExp('^body tip sleep quantum: expected ' + moved.sleep.tip + ', got ' + saved.sleep.tip + '$', 'm'));
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
    'snapshot bytes at the last quantum: expected ' + moved.snapshotBytes.last + ', got ' + saved.snapshotBytes.last + ': the encoding changed',
  ]);
});

test('the snapshot digests are recorded at load and at the last quantum', () => {
  assert.match(saved.snapshotDigest.load, /^[0-9a-f]{16}$/);
  assert.match(saved.snapshotDigest.last, /^[0-9a-f]{16}$/);
  const run = check(saved);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, new RegExp('snapshot ' + saved.snapshotBytes.load + ' bytes ' + saved.snapshotDigest.load + ' then ' + saved.snapshotBytes.last + ' bytes ' + saved.snapshotDigest.last));
});

test('a same-length snapshot with a changed digest fails as changed values', () => {
  const moved = structuredClone(saved);
  moved.snapshotDigest.last = '0123456789abcdef';
  const run = check(moved);
  assert.equal(run.status, 1);
  assert.match(run.stderr, new RegExp('^snapshot digest at the last quantum: expected 0123456789abcdef, got ' + saved.snapshotDigest.last + ': same length, the values changed$', 'm'));
  assert.doesNotMatch(run.stderr, /the encoding changed/);
});

test('a changed snapshot length fails as a changed encoding, and the digest is not named twice', () => {
  const moved = structuredClone(saved);
  moved.snapshotBytes.load = moved.snapshotBytes.load - 8;
  moved.snapshotDigest.load = '0123456789abcdef';
  assert.deepEqual(behaviourDifferences(moved, saved), [
    'snapshot bytes at load: expected ' + moved.snapshotBytes.load + ', got ' + saved.snapshotBytes.load + ': the encoding changed',
  ]);
});

test('write-golden names which: a digest that was never recorded is new, not moved', () => {
  const old = structuredClone(saved);
  delete old.snapshotDigest;
  assert.deepEqual(behaviourDifferences(old, saved), [
    'snapshot digest at load: expected null, got ' + saved.snapshotDigest.load + ': not recorded before',
    'snapshot digest at the last quantum: expected null, got ' + saved.snapshotDigest.last + ': not recorded before',
  ]);
});
