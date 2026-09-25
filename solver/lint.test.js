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
 * One function of type () -> (), one memory, the given instructions, and any
 * of a table (4), a start (8), elements (9), a data count (12), and data (11),
 * each placed in the order the binary format requires.
 * @param {number[]} limits the memory's limits: [0x00, min] or [0x01, min, max]
 * @param {number[]} code the body's instructions, ending with 0x0b
 * @param {Partial<Record<4 | 8 | 9 | 11 | 12, number[]>>} [extra] section contents by id
 */
function module(limits, code, extra = {}) {
  const body = [0x00, ...code];
  /** @param {4 | 8 | 9 | 11 | 12} id */
  const opt = (id) => {
    const content = extra[id];
    return content ? section(id, content) : [];
  };
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, [0x01, 0x60, 0x00, 0x00]),
    ...section(3, [0x01, 0x00]),
    ...opt(4),
    ...section(5, [0x01, ...limits]),
    ...opt(8),
    ...opt(9),
    ...opt(12),
    ...section(10, [0x01, ...uleb(body.length), ...body]),
    ...opt(11),
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

test('the lint refuses every relaxed-SIMD opcode, 0x100 through 0x113, and only those', () => {
  // The rustc flag sets the default feature set only: a function marked
  // #[target_feature(enable = "relaxed-simd")] still emits these, so the scan
  // has to catch each one. The bodies are decoded, not validated, so each
  // opcode stands alone after its operands' v128.const.
  for (let op = 0x100; op <= 0x113; op = op + 1) {
    const lint = lintWasm(module(FIXED, [...V128_CONST, ...V128_CONST, ...V128_CONST, 0xfd, ...uleb(op), 0x1a, 0x0b]));
    assert.equal(lint.ok, false, 'opcode 0x' + op.toString(16));
    assert.equal(lint.reasons.length, 1);
    assert.match(lint.reasons[0], new RegExp('^relaxed-SIMD opcode 0xfd 0x' + op.toString(16) + ' at byte \\d+ in function body 0$'));
  }
  // 0xff, f64x2.convert_low_i32x4_u, the opcode just below the range, is not relaxed.
  const below = lintWasm(module(FIXED, [...V128_CONST, 0xfd, ...uleb(0xff), 0x1a, 0x0b]));
  assert.deepEqual(below.reasons, []);
  // 0x114 is past the range and unassigned: refused as undecodable, not as relaxed.
  const above = lintWasm(module(FIXED, [...V128_CONST, 0xfd, ...uleb(0x114), 0x1a, 0x0b]));
  assert.equal(above.ok, false);
  assert.match(above.reasons[0], /^opcode 0xfd 0x114 at byte \d+ in function body 0 is not one this lint decodes$/);
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

test('the pinned binary passes: 512 fixed pages, no growth, no relaxed SIMD, nothing passive', () => {
  const lint = lintWasm(pinned);
  assert.deepEqual(lint.reasons, []);
  assert.deepEqual(lint.memories, [{ initial: 512, maximum: 512, imported: false }]);
  assert.ok(lint.functions > 0 && lint.instructions > 0);
  assert.ok(lint.data > 0);
});

/**
 * The reasons with their byte offsets blanked.
 * @param {Uint8Array} bytes
 */
function reasons(bytes) {
  return lintWasm(bytes).reasons.map((reason) => reason.replace(/byte \d+/, 'byte N'));
}

// The knowledge base's three: an immediate that contains 0xfd, and the padded
// LEB128 encodings of a relaxed swizzle and of memory.grow.
const holds0xfd = module(FIXED, [0x41, 0xfd, 0x80, 0x02, 0x1a, 0x0b]);
const paddedSwizzle = module(FIXED, [...V128_CONST, ...V128_CONST, 0xfd, 0x80, 0x82, 0x80, 0x80, 0x00, 0x1a, 0x0b]);
const paddedGrow = module(FIXED, [0x41, 0x01, 0x40, 0x80, 0x00, 0x1a, 0x0b]);

test('i32.const 32893 (41 fd 80 02) passes: 0xfd inside an immediate is not an instruction', () => {
  assert.equal(WebAssembly.validate(holds0xfd), true);
  assert.deepEqual(reasons(holds0xfd), []);
});

test('the padded relaxed swizzle (fd 80 82 80 80 00) is refused as relaxed SIMD', () => {
  assert.equal(WebAssembly.validate(paddedSwizzle), true);
  assert.deepEqual(reasons(paddedSwizzle), ['relaxed-SIMD opcode 0xfd 0x100 at byte N in function body 0']);
});

test('the padded memory.grow (40 80 00) is refused', () => {
  assert.equal(WebAssembly.validate(paddedGrow), true);
  assert.deepEqual(reasons(paddedGrow), ['memory.grow at byte N in function body 0']);
});

test('an unassigned 0xfd sub-opcode below 0x100 is refused, not read as immediate-free', () => {
  assert.deepEqual(reasons(module(FIXED, [...V128_CONST, 0xfd, 0x9a, 0x01, 0x1a, 0x0b])), [
    'opcode 0xfd 0x9a at byte N in function body 0 is not one this lint decodes',
  ]);
});

test('select t* and block types decode multi-byte reference types', () => {
  // block (result (ref null func)) ref.null func end drop; then
  // ref.null func, ref.null func, i32.const 1, select (ref null func), drop.
  const typed = module(FIXED, [
    0x02, 0x63, 0x70, 0xd0, 0x70, 0x0b, 0x1a,
    0xd0, 0x70, 0xd0, 0x70, 0x41, 0x01, 0x1c, 0x01, 0x63, 0x70, 0x1a,
    0x0b,
  ]);
  assert.equal(WebAssembly.validate(typed), true);
  const lint = lintWasm(typed);
  assert.deepEqual(lint.reasons, []);
  assert.equal(lint.instructions, 10);
});

// One planted module per thing that would grow a table or put state outside
// the image of linear memory. Each is valid WebAssembly and refused alone.
const TABLE = [0x01, 0x70, 0x00, 0x01];
const ACTIVE_DATA = [0x01, 0x00, 0x41, 0x00, 0x0b, 0x01, 0xaa];
const ACTIVE_ELEM = [0x01, 0x00, 0x41, 0x00, 0x0b, 0x01, 0x00];
const ZERO3 = [0x41, 0x00, 0x41, 0x00, 0x41, 0x00];
const planted = [
  { what: 'table.grow', bytes: module(FIXED, [0xd0, 0x70, 0x41, 0x01, 0xfc, 0x0f, 0x00, 0x1a, 0x0b], { 4: TABLE }), reason: 'table.grow at byte N in function body 0' },
  { what: 'a start section', bytes: module(FIXED, QUIET, { 8: [0x00] }), reason: 'a start section runs function 0 at instantiation, outside any image' },
  { what: 'a passive data segment', bytes: module(FIXED, QUIET, { 12: [0x01], 11: [0x01, 0x01, 0x01, 0xaa] }), reason: 'data segment 0 is passive: only active segments may initialise the binary' },
  { what: 'a passive element segment', bytes: module(FIXED, QUIET, { 4: TABLE, 9: [0x01, 0x01, 0x00, 0x01, 0x00] }), reason: 'element segment 0 is passive: only active segments may initialise the binary' },
  { what: 'a declared element segment', bytes: module(FIXED, QUIET, { 9: [0x01, 0x03, 0x00, 0x01, 0x00] }), reason: 'element segment 0 is declared: only active segments may initialise the binary' },
  { what: 'memory.init', bytes: module(FIXED, [...ZERO3, 0xfc, 0x08, 0x00, 0x00, 0x0b], { 12: [0x01], 11: ACTIVE_DATA }), reason: 'memory.init at byte N in function body 0' },
  { what: 'data.drop', bytes: module(FIXED, [0xfc, 0x09, 0x00, 0x0b], { 12: [0x01], 11: ACTIVE_DATA }), reason: 'data.drop at byte N in function body 0' },
  { what: 'table.init', bytes: module(FIXED, [...ZERO3, 0xfc, 0x0c, 0x00, 0x00, 0x0b], { 4: TABLE, 9: ACTIVE_ELEM }), reason: 'table.init at byte N in function body 0' },
  { what: 'elem.drop', bytes: module(FIXED, [0xfc, 0x0d, 0x00, 0x0b], { 4: TABLE, 9: ACTIVE_ELEM }), reason: 'elem.drop at byte N in function body 0' },
];

for (const item of planted) {
  test('the lint refuses ' + item.what, () => {
    assert.equal(WebAssembly.validate(item.bytes), true, item.what + ' is valid WebAssembly');
    assert.deepEqual(reasons(item.bytes), [item.reason]);
  });
}

test('active data and element segments alone pass: the image already holds what they wrote', () => {
  const active = module(FIXED, QUIET, { 4: TABLE, 9: ACTIVE_ELEM, 11: ACTIVE_DATA });
  assert.equal(WebAssembly.validate(active), true);
  const lint = lintWasm(active);
  assert.deepEqual(lint.reasons, []);
  assert.equal(lint.data, 1);
  assert.equal(lint.elements, 1);
});
