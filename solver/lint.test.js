// The lint goes red. Three hand-written modules, each carrying one thing the
// build must exclude, and a fourth that carries none but does hold 0x40 bytes
// that are not memory.grow: an empty block type and the immediate of
// i32.const -64. Each is a valid WebAssembly module, so the refusal is the
// lint's and not a parse failure. Two more hold the edges: a maximum that is
// present but larger than the initial, and an opcode the lint cannot decode.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bytes as pinned } from './dist/solver.mjs';
import { lintWasm } from './lint.mjs';

/**
 * @param {number} id
 * @param {number[]} content
 */
function section(id, content) {
  return [id, ...uleb(content.length), ...content];
}

/** @param {number} n */
function uleb(n) {
  /** @type {number[]} */
  const out = [];
  do {
    let b = n & 0x7f;
    n = n >>> 7;
    if (n !== 0) {
      b = b | 0x80;
    }
    out.push(b);
  } while (n !== 0);
  return out;
}

/**
 * One function of type () -> (), one memory, the given instructions.
 * @param {number[]} limits the memory's limits: [0x00, min] or [0x01, min, max]
 * @param {number[]} code the body's instructions, ending with 0x0b
 */
function module(limits, code) {
  const body = [0x00, ...code];
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, [0x01, 0x60, 0x00, 0x00]),
    ...section(3, [0x01, 0x00]),
    ...section(5, [0x01, ...limits]),
    ...section(10, [0x01, ...uleb(body.length), ...body]),
  ]);
}

const FIXED = [0x01, 0x01, 0x01];
// block (empty) i32.const -64 drop end, then end: two 0x40 bytes, neither an instruction.
const QUIET = [0x02, 0x40, 0x41, 0x40, 0x1a, 0x0b, 0x0b];
const V128_CONST = [0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

const clean = module(FIXED, QUIET);
// f64x2.relaxed_madd is 0xfd 0x107; 0x107 is the LEB128 bytes 0x87 0x02.
const relaxed = module(FIXED, [...V128_CONST, ...V128_CONST, ...V128_CONST, 0xfd, 0x87, 0x02, 0x1a, 0x0b]);
const grows = module(FIXED, [0x41, 0x01, 0x40, 0x00, 0x1a, 0x0b]);
const growable = module([0x00, 0x01], QUIET);
const wider = module([0x01, 0x01, 0x02], QUIET);

test('the planted modules are valid WebAssembly', () => {
  for (const bytes of [clean, relaxed, grows, growable, wider]) {
    assert.equal(WebAssembly.validate(bytes), true);
  }
});

test('the lint accepts the clean module, 0x40 bytes and all', () => {
  const lint = lintWasm(clean);
  assert.deepEqual(lint.reasons, []);
  assert.equal(lint.ok, true);
  assert.deepEqual(lint.memories, [{ initial: 1, maximum: 1, imported: false }]);
});

test('the lint refuses a relaxed-SIMD instruction and names its opcode', () => {
  const lint = lintWasm(relaxed);
  assert.equal(lint.ok, false);
  assert.equal(lint.reasons.length, 1);
  assert.match(lint.reasons[0], /^relaxed-SIMD opcode 0xfd 0x107 at byte \d+ in function body 0$/);
});

test('the lint refuses memory.grow', () => {
  const lint = lintWasm(grows);
  assert.equal(lint.ok, false);
  assert.equal(lint.reasons.length, 1);
  assert.match(lint.reasons[0], /^memory\.grow at byte \d+ in function body 0$/);
});

test('the lint refuses a memory with no maximum, and one whose maximum is not its initial', () => {
  const none = lintWasm(growable);
  assert.equal(none.ok, false);
  assert.deepEqual(none.reasons, ['memory 0 has no maximum: initial 1 pages can grow']);
  const more = lintWasm(wider);
  assert.equal(more.ok, false);
  assert.deepEqual(more.reasons, ['memory 0 has maximum 2 pages, not its initial 1']);
});

test('an opcode the lint cannot decode is a refusal, not a pass', () => {
  // 0xfe is the threads prefix, which this build never emits.
  const lint = lintWasm(module(FIXED, [0xfe, 0x03, 0x00, 0x0b]));
  assert.equal(lint.ok, false);
  assert.match(lint.reasons[0], /^opcode 0xfe at byte \d+ in function body 0 is not one this lint decodes$/);
});

test('the command exits 1 with the reason, and 0 on the clean module', () => {
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-lint-'));
  const bad = join(dir, 'grows.wasm');
  const good = join(dir, 'clean.wasm');
  writeFileSync(bad, grows);
  writeFileSync(good, clean);
  const refused = spawnSync(process.execPath, ['solver/lint.mjs', bad], { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /lint refused .*grows\.wasm: memory\.grow at byte \d+/);
  const passed = spawnSync(process.execPath, ['solver/lint.mjs', good], { encoding: 'utf8' });
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /^lint clean: memory 1\/1 pages/);
});

test('the pinned binary passes: fixed memory, no memory.grow, no relaxed SIMD', () => {
  const lint = lintWasm(pinned);
  assert.deepEqual(lint.reasons, []);
  assert.equal(lint.memories.length, 1);
  assert.equal(lint.memories[0].initial, lint.memories[0].maximum);
  assert.ok(lint.functions > 0 && lint.instructions > 0);
});
