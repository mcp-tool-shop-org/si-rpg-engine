import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHasher } from '../packages/frame/hash.js';
import { behaviourDifferences } from './behaviour.mjs';
import { snapshotDigest } from './trace-line.mjs';

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
    'snapshot bytes at the last quantum: expected ' + moved.snapshotBytes.last + ', got ' + saved.snapshotBytes.last + ': the snapshot length changed by -8 bytes (-1 double)',
  ]);
});

test('the snapshot digests are recorded at load and at the last quantum', () => {
  assert.match(saved.snapshotDigest.load, /^[0-9a-f]{16}$/);
  assert.match(saved.snapshotDigest.last, /^[0-9a-f]{16}$/);
  const run = check(saved);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, new RegExp('snapshot ' + saved.snapshotBytes.load + ' bytes ' + saved.snapshotDigest.load + ' then ' + saved.snapshotBytes.last + ' bytes ' + saved.snapshotDigest.last));
});

test('the snapshot digests carry 64 bits: their halves differ, where one byte per u32 made them equal', () => {
  for (const digest of [saved.snapshotDigest.load, saved.snapshotDigest.last]) {
    assert.notEqual(digest.slice(0, 8), digest.slice(8), digest);
  }
  const snap = new Uint8Array(64);
  for (let i = 0; i < snap.length; i = i + 1) {
    snap[i] = (i * 37 + 11) & 255;
  }
  const split = snapshotDigest(snap);
  assert.notEqual(split.slice(0, 8), split.slice(8));
  // The form before S1 pin 13 fed each byte to both lanes and carried 32 bits.
  const both = createHasher();
  both.u32(snap.length);
  for (let i = 0; i < snap.length; i = i + 1) {
    both.u32(snap[i]);
  }
  assert.equal(both.digest().slice(0, 8), both.digest().slice(8));
  // A byte in either half of a double moves the digest.
  for (const at of [0, 3, 4, 7, 60]) {
    const flipped = snap.slice();
    flipped[at] = flipped[at] ^ 1;
    assert.notEqual(snapshotDigest(flipped), split, 'byte ' + at);
  }
});

test('a same-length snapshot with a changed digest fails as changed values', () => {
  const moved = structuredClone(saved);
  moved.snapshotDigest.last = '0123456789abcdef';
  const run = check(moved);
  assert.equal(run.status, 1);
  assert.match(run.stderr, new RegExp('^snapshot digest at the last quantum: expected 0123456789abcdef, got ' + saved.snapshotDigest.last + ': same length, the values changed$', 'm'));
  assert.doesNotMatch(run.stderr, /the snapshot length changed/);
});

test('a changed snapshot length is named as a length change with its size, and the digest is not named twice', () => {
  const moved = structuredClone(saved);
  moved.snapshotBytes.load = moved.snapshotBytes.load - 8;
  moved.snapshotDigest.load = '0123456789abcdef';
  assert.deepEqual(behaviourDifferences(moved, saved), [
    'snapshot bytes at load: expected ' + moved.snapshotBytes.load + ', got ' + saved.snapshotBytes.load + ': the snapshot length changed by +8 bytes (+1 double)',
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
