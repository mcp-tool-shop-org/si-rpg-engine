// S1 pin 1: no cast from a shared reference to a writable one, anywhere in
// the solver. The Rust knowledge base measured that rustc's deny-by-default
// `invalid_reference_casting` lint rejects the cast written as one expression
// but misses the split forms: a pointer from `ptr::from_ref` written through a
// field, and pointers parked in a vector before the write (docs/rust-kb-answers.md,
// answer 1). So the lint is not the gate; this is. It reads every Rust file
// under solver/ as source, comments stripped, and refuses the family:
//
//   - `from_ref`, in any form: the solver has no sound use for it;
//   - a cast to `*mut` (`as *mut`), which is how every form of the family
//     turns a shared pointer writable;
//   - `.cast_mut()`, the method spelling of the same cast;
//   - `transmute`, which can make `&mut T` from `&T` with no cast at all;
//   - a vector of raw pointers, the shape that hid the cast from the lint;
//   - `&mut *` over anything but a pointer made by `&raw mut` or
//     `addr_of_mut!`, the two places a writable pointer can soundly come from;
//   - `solver_clear_warmstart`, the export that wrote into Rapier through the
//     cast. It has no sound form at 0.35.3 (answer 1), so it may not return.
//
// One cast to `*mut` is allowed, by its exact text: the arena turns the
// linker's `__heap_base`, an address held as an integer, into its pointer. No
// reference is involved. The allowance is checked too, so it cannot outlive
// the line it names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'solver';

/** @type {Array<{ name: string, pattern: RegExp }>} */
export const FAMILY = [
  { name: 'from_ref', pattern: /\bfrom_ref\b/g },
  { name: 'a cast to *mut', pattern: /\bas\s*\*\s*mut\b/g },
  { name: 'cast_mut', pattern: /\.\s*cast_mut\s*\(/g },
  { name: 'transmute', pattern: /\btransmute\b/g },
  { name: 'a vector of raw pointers', pattern: /\bVec\s*<\s*\*\s*(?:mut|const)\b/g },
  { name: '&mut * over a pointer not made by &raw mut or addr_of_mut!', pattern: /&\s*mut\s*\*(?!\s*\(?\s*(?:&\s*raw\s+mut\b|(?:(?:core|std)\s*::\s*)?(?:ptr\s*::\s*)?addr_of_mut\s*!))/g },
  { name: 'solver_clear_warmstart', pattern: /\bsolver_clear_warmstart\b/g },
];

/** @type {Array<{ file: string, text: string, why: string }>} */
export const ALLOWED = [
  {
    file: 'solver/src/arena.rs',
    text: '(start as *mut u8, end - start, 0)',
    why: 'an address from the linker, held as an integer, becomes the arena pointer; no reference is involved',
  },
];

/**
 * The source with every comment replaced by spaces, so line and column stay
 * where they were. String literals are kept: none in the solver holds `//`.
 * @param {string} source
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  let depth = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (depth === 0 && two === '//') {
      while (i < source.length && source[i] !== '\n') {
        out = out + ' ';
        i = i + 1;
      }
      continue;
    }
    if (two === '/*') {
      depth = depth + 1;
      out = out + '  ';
      i = i + 2;
      continue;
    }
    if (depth > 0 && two === '*/') {
      depth = depth - 1;
      out = out + '  ';
      i = i + 2;
      continue;
    }
    if (depth > 0) {
      out = out + (source[i] === '\n' ? '\n' : ' ');
      i = i + 1;
      continue;
    }
    out = out + source[i];
    i = i + 1;
  }
  return out;
}

/**
 * Every member of the family in the source, as `<name> at <line>:<column>`.
 * @param {string} source
 * @param {string} [file] the path, for the allowance
 * @returns {string[]}
 */
export function casts(source, file) {
  const lines = stripComments(source).split('\n');
  /** @type {Array<{ line: number, column: number, name: string }>} */
  const found = [];
  for (let n = 0; n < lines.length; n = n + 1) {
    const line = lines[n];
    const allowed = ALLOWED.some((entry) => entry.file === file && line.includes(entry.text));
    for (const member of FAMILY) {
      for (const match of line.matchAll(member.pattern)) {
        if (allowed && member.name === 'a cast to *mut') {
          continue;
        }
        found.push({ line: n + 1, column: (match.index || 0) + 1, name: member.name });
      }
    }
  }
  found.sort((a, b) => a.line - b.line || a.column - b.column);
  return found.map((f) => f.name + ' at ' + f.line + ':' + f.column);
}

/**
 * Every .rs file under the directory, skipping build output.
 * @param {string} dir
 * @returns {string[]}
 */
function rustFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === 'target' || name === 'dist' || name === 'node_modules') {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...rustFiles(path));
    } else if (name.endsWith('.rs')) {
      out.push(relative('.', path).split('\\').join('/'));
    }
  }
  return out;
}

test('no Rust file under solver/ casts a shared reference to a writable one', () => {
  const files = rustFiles(ROOT);
  assert.ok(files.includes('solver/src/rapier_law.rs'), 'the law was not read: ' + files.join(' '));
  assert.ok(files.includes('solver/src/lib.rs'));
  for (const file of files) {
    assert.deepEqual(casts(readFileSync(file, 'utf8'), file), [], file);
  }
});

test('each allowance still names a line that exists', () => {
  for (const entry of ALLOWED) {
    const source = stripComments(readFileSync(entry.file, 'utf8'));
    assert.ok(source.includes(entry.text), entry.file + ' no longer holds ' + entry.text + '; remove the allowance');
  }
});

test('the source test goes red on each planted form, the split ones included', () => {
  const planted = [
    // The one-expression form, which the lint also catches.
    'let pair = unsafe { &mut *(core::ptr::from_ref(pair) as *mut ContactPair) };',
    // The field-write form: the pointer is made on one line and written on another.
    'let p = core::ptr::from_ref(pair).cast_mut();',
    'unsafe { (*p).solver_contacts = Vec::new(); }',
    // The vector-of-pointers form.
    'let ptrs: Vec<*mut ContactPair> = narrow.contact_pairs().map(|p| p as *const ContactPair as *mut ContactPair).collect();',
    // A reborrow through a pointer that came from a shared reference.
    'let shared = &data; let w = unsafe { &mut *ptr };',
    'let w: &mut Data = unsafe { core::mem::transmute(&data) };',
    '#[unsafe(no_mangle)] pub extern "C" fn solver_clear_warmstart() {}',
  ].join('\n');
  assert.deepEqual(casts(planted), [
    '&mut * over a pointer not made by &raw mut or addr_of_mut! at 1:21',
    'from_ref at 1:39',
    'a cast to *mut at 1:54',
    'from_ref at 2:20',
    'cast_mut at 2:34',
    'a vector of raw pointers at 4:11',
    'a cast to *mut at 4:90',
    '&mut * over a pointer not made by &raw mut or addr_of_mut! at 5:38',
    'transmute at 6:40',
    'solver_clear_warmstart at 7:40',
  ]);
  // The law itself with one split cast planted at its end goes red there.
  const law = 'solver/src/rapier_law.rs';
  const source = readFileSync(law, 'utf8');
  const end = source.split('\n').length + 1;
  const found = casts(source + '\nfn clear(pair: &ContactPair) { let p = core::ptr::from_ref(pair); let q = p as *mut ContactPair; }\n', law);
  assert.deepEqual(found, ['from_ref at ' + end + ':51', 'a cast to *mut at ' + end + ':77']);
});

test('the sound shapes the law uses pass, and so does the family inside a comment', () => {
  const clean = [
    'let solver = unsafe { &mut *core::ptr::addr_of_mut!(SOLVER) };',
    'let bodies = unsafe { &mut *(&raw mut BODIES) };',
    'let b = unsafe { &mut *&raw mut BODIES };',
    'let base = unsafe { (&raw mut BODIES).cast::<f64>() };',
    'controller.move_shape(DT, &query, &*shape, &pos, desired, |hit| collisions.push(hit));',
    '// core::ptr::from_ref(pair) as *mut ContactPair was undefined behaviour',
    '/* solver_clear_warmstart */ let x = 1;',
  ].join('\n');
  assert.deepEqual(casts(clean), []);
  // The allowance covers its own file and line only.
  assert.deepEqual(casts('(start as *mut u8, end - start, 0)', 'solver/src/arena.rs'), []);
  assert.deepEqual(casts('(start as *mut u8, end - start, 0)', 'solver/src/lib.rs'), ['a cast to *mut at 1:8']);
});
