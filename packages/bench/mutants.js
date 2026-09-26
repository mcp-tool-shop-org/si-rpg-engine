// Mutants measure the bench (T7b pin 7): planted one at a time on the changed
// executable lines of JS and law anchors, with these operators, in this order:
//   1. a flipped comparison: < and <=, > and >=, == and !=, === and !==;
//   2. + and - swapped, as binary operators and in += and -=;
//   3. a condition negated: an if's or a while's condition, whole on its line;
//   4. an early return dropped: a return statement, whole on its line, inside
//      a block within its function;
//   5. a numeric constant, as four mutants: one unit in its last place up, one
//      down, times 1.1, and times 0.9. A number in JavaScript or JSON is a
//      double, and so is a Rust float literal; a Rust integer literal's last
//      place is one, and its products are rounded.
// A changed top-level constant, or a rule's number, takes the four constant
// mutants. A rule change that is not a number takes none, and is listed with
// that reason, as are deletion anchors, "no executable change" anchors, a
// changed executable line no operator applies to, and the kinds pin 1 does not
// aim at. A mutant whose text equals the base's at its line is marked, so a
// difference it shows is the base's own and is not counted twice.
//
// Mutants are made in a fixed order, the same on every run and every machine:
// by the anchor's file path, then its first line, then the changed line, then
// the operator in the order above, then the token's place on the line. They
// are capped at MUTANT_CAP; a run that reaches the cap lists the mutants left
// out, by anchor and operator. Nothing about the cap depends on time.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffLines, splitLines } from './diff.js';
import { lineStarts, scanJs } from './scan-js.js';
import { scanRust } from './scan-rust.js';

/**
 * The most mutants a run makes. Every planted change of pin 9 makes at most
 * 29 (harness/bench-law.test.js's one-operator line in rapier_law.rs, and the
 * multi-operator lines of packages/bench/bench.test.js; bench.test.js checks
 * each plant against this number), so 64 holds them all with room for a real
 * change of a few functions. Measured in the pull request that set it.
 */
export const MUTANT_CAP = 64;

export const OPERATORS = ['flipped comparison', '+ and - swapped', 'condition negated', 'early return dropped', 'numeric constant'];

/**
 * @typedef {import('./anchors.js').Anchor} Anchor
 * @typedef {{
 *   id: string, anchor: string, file: string, line: number, operator: string, detail: string,
 *   kind: 'js' | 'law' | 'data', text: string, lineText: string, mutatedLine: string, marked: boolean
 * }} Mutant
 * @typedef {{ anchor: string, file: string, line: number | null, reason: string }} NoMutant
 */

const FLIP = /** @type {Record<string, string>} */ ({ '<': '<=', '<=': '<', '>': '>=', '>=': '>', '==': '!=', '!=': '==', '===': '!==', '!==': '===' });

/**
 * The double one unit in the last place above or below.
 * @param {number} value
 * @param {1 | -1} direction
 */
export function nextDouble(value, direction) {
  if (Number.isNaN(value)) {
    return value;
  }
  if (value === 0) {
    return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  }
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  let bits = view.getBigUint64(0);
  if ((value > 0) === (direction > 0)) {
    bits = bits + 1n;
  } else {
    bits = bits - 1n;
  }
  view.setBigUint64(0, bits);
  return view.getFloat64(0);
}

/**
 * The four numeric mutants of a literal's text, each as text, in the stated
 * order: up, down, times 1.1, times 0.9.
 * @param {string} text
 * @param {'js' | 'rust' | 'json'} language
 * @returns {Array<{ detail: string, text: string }>}
 */
export function numberMutants(text, language) {
  let body = text.replace(/_/g, '');
  let suffix = '';
  if (language === 'rust') {
    const m = /^(.*?)((?:f32|f64|u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize))?$/.exec(body);
    if (m) {
      body = m[1];
      suffix = m[2] || '';
    }
  }
  if (/^0[xob]/i.test(body)) {
    return [];
  }
  const value = Number(body);
  if (!Number.isFinite(value)) {
    return [];
  }
  const integer = language === 'rust' && !/[.eE]/.test(body) && !/^f/.test(suffix);
  /** @param {number} v */
  const write = (v) => {
    if (integer) {
      return String(v) + suffix;
    }
    let s = String(v);
    if (language === 'rust' && !/[.eE]/.test(s)) {
      s = s + '.0';
    }
    return s + suffix;
  };
  const up = integer ? value + 1 : nextDouble(value, 1);
  const down = integer ? value - 1 : nextDouble(value, -1);
  const more = integer ? Math.round(value * 1.1) : value * 1.1;
  const less = integer ? Math.round(value * 0.9) : value * 0.9;
  return [
    { detail: 'one unit in its last place up', text: write(up) },
    { detail: 'one unit in its last place down', text: write(down) },
    { detail: 'times 1.1', text: write(more) },
    { detail: 'times 0.9', text: write(less) },
  ].map((m) => ({ detail: text + ' to ' + m.text + ', ' + m.detail, text: m.text }));
}

/**
 * The line's text in a file.
 * @param {string} text
 * @param {number[]} starts
 * @param {number} line
 */
function lineText(text, starts, line) {
  const from = starts[line - 1];
  const to = line < starts.length ? starts[line] : text.length;
  return text.slice(from, to).replace(/\r?\n$/, '');
}

/**
 * The base's text at the head line a hunk maps it to, or null.
 * @param {import('./diff.js').Hunk[]} hunks
 * @param {string[]} baseLines
 * @param {number} line 1-based, in the head
 */
function baseLineOf(hunks, baseLines, line) {
  for (const h of hunks) {
    if (line - 1 >= h.head[0] && line - 1 < h.head[1]) {
      const at = h.base[0] + (line - 1 - h.head[0]);
      return at < h.base[1] ? baseLines[at] : null;
    }
  }
  return null;
}

/**
 * @typedef {{ start: number, end: number, line: number, type: string, value: string }} AnyToken
 */

/**
 * Every mutant of one line, in the operators' order.
 * @param {string} text the file
 * @param {AnyToken[]} tokens the line's tokens
 * @param {'js' | 'rust' | 'json'} language
 * @param {{ constantsOnly: boolean, nested: (offset: number) => boolean }} how
 * @returns {Array<{ operator: string, detail: string, edits: Array<{ start: number, end: number, text: string }> }>}
 */
function lineMutants(text, tokens, language, how) {
  /** @type {Array<{ operator: string, detail: string, edits: Array<{ start: number, end: number, text: string }> }>} */
  const out = [];
  if (!how.constantsOnly && language !== 'json') {
    for (const t of tokens) {
      if (t.type !== 'punct' || !(t.value in FLIP)) {
        continue;
      }
      if (language === 'rust' && (t.value === '<' || t.value === '>')) {
        if (!(text[t.start - 1] === ' ' && text[t.end] === ' ')) {
          continue;
        }
      }
      out.push({ operator: OPERATORS[0], detail: '`' + t.value + '` to `' + FLIP[t.value] + '`', edits: [{ start: t.start, end: t.end, text: FLIP[t.value] }] });
    }
    for (let i = 0; i < tokens.length; i = i + 1) {
      const t = tokens[i];
      if (t.type !== 'punct' || !['+', '-', '+=', '-='].includes(t.value)) {
        continue;
      }
      const prev = tokens[i - 1];
      const operand = prev && (prev.type === 'number' || prev.type === 'string' || (prev.type === 'ident' && !['return', 'typeof', 'in', 'of', 'case', 'let', 'mut', 'as', 'else', 'if', 'while', 'match'].includes(prev.value))
        || (prev.type === 'punct' && (prev.value === ')' || prev.value === ']')));
      if (t.value.length === 1 && !operand) {
        continue;
      }
      const swapped = t.value.replace(/[+-]/, (c) => (c === '+' ? '-' : '+'));
      out.push({ operator: OPERATORS[1], detail: '`' + t.value + '` to `' + swapped + '`', edits: [{ start: t.start, end: t.end, text: swapped }] });
    }
    for (let i = 0; i < tokens.length; i = i + 1) {
      const t = tokens[i];
      if (t.type !== 'ident' || (t.value !== 'if' && t.value !== 'while')) {
        continue;
      }
      if (language === 'js') {
        const open = tokens[i + 1];
        if (!open || open.value !== '(') {
          continue;
        }
        let depth = 0;
        let close = -1;
        for (let j = i + 1; j < tokens.length; j = j + 1) {
          if (tokens[j].value === '(') {
            depth = depth + 1;
          } else if (tokens[j].value === ')') {
            depth = depth - 1;
            if (depth === 0) {
              close = j;
              break;
            }
          }
        }
        if (close < 0) {
          continue;
        }
        out.push({ operator: OPERATORS[2], detail: '`' + t.value + '` condition negated', edits: [{ start: open.end, end: open.end, text: '!(' }, { start: tokens[close].start, end: tokens[close].start, text: ')' }] });
      } else {
        const first = tokens[i + 1];
        if (!first || (first.type === 'ident' && first.value === 'let')) {
          continue;
        }
        let depth = 0;
        let brace = -1;
        for (let j = i + 1; j < tokens.length; j = j + 1) {
          const v = tokens[j].value;
          if (v === '(' || v === '[') {
            depth = depth + 1;
          } else if (v === ')' || v === ']') {
            depth = depth - 1;
          } else if (v === '{' && depth === 0) {
            brace = j;
            break;
          }
        }
        if (brace < 0 || brace === i + 1) {
          continue;
        }
        out.push({ operator: OPERATORS[2], detail: '`' + t.value + '` condition negated', edits: [{ start: first.start, end: first.start, text: '!(' }, { start: tokens[brace - 1].end, end: tokens[brace - 1].end, text: ')' }] });
      }
    }
    const first = tokens[0];
    if (first && first.type === 'ident' && first.value === 'return' && how.nested(first.start)) {
      const last = tokens[tokens.length - 1];
      if (last && last.value === ';') {
        out.push({ operator: OPERATORS[3], detail: 'the early `return` dropped', edits: [{ start: first.start, end: last.end, text: '' }] });
      }
    }
  }
  for (const t of tokens) {
    if (t.type !== 'number') {
      continue;
    }
    for (const m of numberMutants(t.value, language)) {
      if (m.text === t.value) {
        continue;
      }
      out.push({ operator: OPERATORS[4], detail: m.detail, edits: [{ start: t.start, end: t.end, text: m.text }] });
    }
  }
  return out;
}

/**
 * Applies edits to a text, the last first.
 * @param {string} text
 * @param {Array<{ start: number, end: number, text: string }>} edits
 */
export function applyEdits(text, edits) {
  let out = text;
  for (const e of edits.slice().sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

/**
 * JSON's number and string tokens on a line, enough for a rule's numbers.
 * @param {string} text
 * @param {number[]} starts
 * @param {number} line
 * @returns {AnyToken[]}
 */
function jsonTokens(text, starts, line) {
  const from = starts[line - 1];
  const to = line < starts.length ? starts[line] : text.length;
  /** @type {AnyToken[]} */
  const out = [];
  const body = text.slice(from, to);
  for (const m of body.matchAll(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)) {
    const value = m[0];
    const start = from + /** @type {number} */ (m.index);
    out.push({ start, end: start + value.length, line, type: value.startsWith('"') ? 'string' : /^[-\d]/.test(value) ? 'number' : 'ident', value: value.startsWith('-') ? value.slice(1) : value });
    if (value.startsWith('-')) {
      out[out.length - 1].start = start + 1;
    }
  }
  return out;
}

/**
 * The mutants of a change, in their fixed order, and every changed line or
 * anchor that takes none, with the reason.
 * @param {Anchor[]} anchors
 * @param {string} headTree
 * @param {string} baseTree
 * @param {Map<string, Set<number>> | null} lawMapped the law's lines in a region, by file, from the coverage build's mapping
 * @returns {{ mutants: Mutant[], none: NoMutant[] }}
 */
export function makeMutants(anchors, headTree, baseTree, lawMapped) {
  /** @type {Mutant[]} */
  const mutants = [];
  /** @type {NoMutant[]} */
  const none = [];
  const ordered = anchors.slice().sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.lines[0][0] - b.lines[0][0]));
  /** @type {Map<string, { text: string, starts: number[], tokens: AnyToken[], hunks: import('./diff.js').Hunk[], baseLines: string[], scan: any }>} */
  const files = new Map();
  /** @param {string} file */
  const fileOf = (file) => {
    const known = files.get(file);
    if (known) {
      return known;
    }
    const text = readFileSync(join(headTree, file), 'utf8');
    let baseText = '';
    try {
      baseText = readFileSync(join(baseTree, file), 'utf8');
    } catch {
      baseText = '';
    }
    const baseLines = splitLines(baseText);
    const hunks = diffLines(baseLines, splitLines(text));
    const scan = file.endsWith('.rs') ? scanRust(text) : file.endsWith('.json') ? null : scanJs(text);
    const starts = scan ? scan.lineStarts : lineStarts(text);
    const made = { text, starts, tokens: scan ? /** @type {AnyToken[]} */ (scan.tokens) : [], hunks, baseLines, scan };
    files.set(file, made);
    return made;
  };
  for (const a of ordered) {
    if (a.kind === 'deletion' || a.kind === 'law-deletion') {
      none.push({ anchor: a.id, file: a.file, line: null, reason: 'a deletion: nothing is left to mutate' });
      continue;
    }
    if (a.kind === 'catalog') {
      none.push({ anchor: a.id, file: a.file, line: null, reason: 'a catalog line is not a number' });
      continue;
    }
    if (a.kind === 'hazard') {
      none.push({ anchor: a.id, file: a.file, line: null, reason: 'a hazard scenario is neither code nor a rule\'s number' });
      continue;
    }
    const f = fileOf(a.file);
    const law = a.kind === 'law' || a.kind === 'law-top-level';
    /** @type {number[]} */
    let lines;
    if (law) {
      const mapped = lawMapped ? lawMapped.get(a.file) : null;
      lines = mapped ? a.changed.filter((l) => mapped.has(l)) : a.executable;
    } else {
      lines = a.executable;
    }
    if (lines.length === 0) {
      none.push({ anchor: a.id, file: a.file, line: null, reason: 'no executable change' });
      continue;
    }
    const language = a.file.endsWith('.rs') ? 'rust' : a.file.endsWith('.json') ? 'json' : 'js';
    const constantsOnly = a.kind === 'top-level' || a.kind === 'law-top-level' || a.kind === 'rule';
    for (const line of lines) {
      const tokens = language === 'json' ? jsonTokens(f.text, f.starts, line) : f.tokens.filter((t) => t.line === line);
      const nested = (/** @type {number} */ offset) => {
        let depth = 0;
        const scan = f.scan;
        const fn = scan.functions.filter((/** @type {any} */ g) => g.start <= offset && offset < g.end).sort((/** @type {any} */ x, /** @type {any} */ y) => (x.end - x.start) - (y.end - y.start))[0];
        if (!fn) {
          return false;
        }
        for (const t of f.tokens) {
          if (t.start <= fn.bodyStart || t.start >= offset) {
            continue;
          }
          if (t.value === '{') {
            depth = depth + 1;
          } else if (t.value === '}') {
            depth = depth - 1;
          }
        }
        return depth > 0;
      };
      const made = lineMutants(f.text, tokens, language, { constantsOnly, nested });
      if (made.length === 0) {
        none.push({ anchor: a.id, file: a.file, line, reason: constantsOnly ? (a.kind === 'rule' ? 'a rule change that is not a number' : 'a top-level line with no numeric constant') : 'a changed executable line no operator applies to' });
        continue;
      }
      const original = lineText(f.text, f.starts, line);
      const base = baseLineOf(f.hunks, f.baseLines, line);
      for (const m of made) {
        const text = applyEdits(f.text, m.edits);
        const lineStart = f.starts[line - 1];
        const delta = m.edits.reduce((sum, e) => sum + e.text.length - (e.end - e.start), 0);
        const lineEnd = (line < f.starts.length ? f.starts[line] : f.text.length) + delta;
        const mutatedLine = text.slice(lineStart, lineEnd).replace(/\r?\n$/, '');
        mutants.push({
          id: '',
          anchor: a.id,
          file: a.file,
          line,
          operator: m.operator,
          detail: m.detail,
          kind: law ? 'law' : language === 'json' ? 'data' : 'js',
          text,
          lineText: original,
          mutatedLine,
          marked: base !== null && base === mutatedLine,
        });
      }
    }
  }
  mutants.forEach((m, i) => {
    m.id = 'm' + (i + 1);
  });
  return { mutants, none };
}
