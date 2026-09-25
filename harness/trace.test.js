import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleFailure, traceHashes } from './bundle.mjs';
import { play } from './solver-scene.mjs';

const dir = mkdtempSync(join(tmpdir(), 'si-rpg-trace-'));
const golden = readFileSync('fixtures/golden.txt', 'utf8').trim();

function trace() {
  const run = spawnSync(process.execPath, ['harness/trace.mjs'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

/**
 * @param {string} a
 * @param {string} b
 */
function diff(a, b) {
  const left = join(dir, 'a.trace');
  const right = join(dir, 'b.trace');
  writeFileSync(left, a);
  writeFileSync(right, b);
  return spawnSync(process.execPath, ['harness/first-difference.js', left, right], { encoding: 'utf8' });
}

const first = trace();
const lines = first.split('\n');

/**
 * One line changed. Tick 5000 is mid-run: the parcel is carried and every body has moved.
 * @param {number} tick
 * @param {(tokens: string[]) => void} change
 */
function planted(tick, change) {
  const copy = lines.slice();
  const tokens = copy[tick].split(' ');
  change(tokens);
  copy[tick] = tokens.join(' ');
  return copy.join('\n');
}

test('two traces of one run are byte-identical, and the last quantum is the golden', () => {
  const second = trace();
  try {
    assert.equal(second, first);
    assert.equal(lines[lines.length - 1], '');
    assert.equal(lines[lines.length - 2], 'end 10001');
    assert.equal(lines[10000].split(' ')[1], golden, 'the trace hashes as harness/sim.mjs does');
    const same = diff(first, second);
    assert.equal(same.status, 0, same.stderr);
    assert.equal(same.stdout, 'identical\n');
  } catch (error) {
    // A bundle of the product scene carrying the first trace's hashes (T5
    // pin 3): `replay` names the first tick at which this build differs.
    const hashes = traceHashes(first);
    bundleFailure('trace comparison', [{ spec: { scene: 'product' }, tick: hashes.length - 1, hashes, image: false }], diff(first, second).stdout || String(error));
    throw error;
  }
});

test('one hex digit changed in one field is located to its tick, body, and field', () => {
  let was = '';
  const changed = planted(5000, (tokens) => {
    const at = tokens.indexOf('parcel');
    // x y z: y is the second field after the id.
    was = tokens[at + 2];
    const digit = was[15] === '0' ? '1' : '0';
    tokens[at + 2] = was.slice(0, 15) + digit;
  });
  const found = diff(first, changed);
  assert.equal(found.status, 1, found.stderr);
  const out = found.stdout.split('\n');
  assert.equal(out[0], 'first difference at tick 5000');
  assert.equal(out[1], 'body parcel field y');
  assert.match(out[2], new RegExp('a\\.trace ' + was + ' [0-9.e-]+$'));
  assert.match(out[3], /b\.trace [0-9a-f]{16} [0-9.e-]+$/);
});

test('a changed snapshot digest is reported as snapshot', () => {
  const changed = planted(700, (tokens) => {
    const at = tokens.indexOf('snap');
    tokens[at + 2] = tokens[at + 2] === '0000000000000000' ? '0000000000000001' : '0000000000000000';
  });
  const found = diff(first, changed);
  assert.equal(found.status, 1, found.stderr);
  const out = found.stdout.split('\n');
  assert.equal(out[0], 'first difference at tick 700');
  assert.equal(out[1], 'snapshot');
  assert.match(out[2], /a\.trace \d+ bytes [0-9a-f]{16}$/);
});

test('a changed hash with every field equal is reported as hash', () => {
  const changed = planted(42, (tokens) => {
    tokens[1] = tokens[1] === '0000000000000000' ? '0000000000000001' : '0000000000000000';
  });
  const found = diff(first, changed);
  assert.equal(found.status, 1, found.stderr);
  assert.deepEqual(found.stdout.split('\n').slice(0, 2), ['first difference at tick 42', 'hash']);
});

test('a truncated trace exits 2', () => {
  const atLine = diff(first, lines.slice(0, 3000).join('\n') + '\n');
  assert.equal(atLine.status, 2, atLine.stdout);
  assert.match(atLine.stderr, /without an end line/);
  const midLine = diff(first, first.slice(0, Math.floor(first.length / 2)));
  assert.equal(midLine.status, 2, midLine.stdout);
  assert.match(midLine.stderr, /malformed/);
});

test('a fixture case traces in the same format and diffs the same way', () => {
  const ramp = JSON.parse(readFileSync('fixtures/behavior-ramp.json', 'utf8'));
  const spec = ramp.cases[0];
  const once = play(spec, { trace: true });
  const twice = play(spec, { trace: true });
  assert.equal(once.trace.length, spec.frames.length + 1);
  assert.deepEqual(once.trace.map((line) => line.split(' ')[1]).slice(0, -1), spec.frames.map((/** @type {{ hash: string }} */ frame) => frame.hash));
  const same = diff(once.trace.join('\n') + '\n', twice.trace.join('\n') + '\n');
  assert.equal(same.stdout, 'identical\n');
  const moved = once.trace.slice();
  const tokens = moved[150].split(' ');
  tokens[tokens.indexOf('slider') + 1] = '0000000000000000';
  moved[150] = tokens.join(' ');
  const found = diff(once.trace.join('\n') + '\n', moved.join('\n') + '\n');
  assert.equal(found.status, 1);
  assert.deepEqual(found.stdout.split('\n').slice(0, 2), ['first difference at tick 150', 'body slider field x']);
});
