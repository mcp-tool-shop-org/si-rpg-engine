// A token scan of the law's Rust (T7b pin 1), enough to name what a changed
// line in solver/src/ belongs to. Like scan-js.js it is not a parser:
//   - tokens, with comments (nested block comments too) kept apart, strings,
//     raw strings, byte strings, character literals told from lifetimes, and
//     numbers with their suffixes;
//   - `fn` items with bodies, each named by the impl, trait, or module around
//     it (`Stride::move_shape`), with the span from its first qualifier
//     (`pub`, `extern "C"`, `unsafe`) to its closing brace, which is where the
//     coverage build's function region starts, and the identifiers it names;
//   - top-level items outside any fn: a `const` or `static` with its name, and
//     the other items (a struct, a use, an impl's header) with theirs;
//   - the lines a fn's body holds tokens on, beyond brackets and separators.
// Which of those lines the law executes is the coverage build's to say, from
// its mapping (pin 3); these lines are only the scan's first reading.
//
// No imports: the orchestrator and the tests both read it.

import { lineOf, lineStarts } from './scan-js.js';

/**
 * @typedef {{ type: 'ident' | 'punct' | 'string' | 'char' | 'lifetime' | 'number', value: string, start: number, end: number, line: number }} RustToken
 * @typedef {{ name: string, qualified: string, start: number, end: number, line: number, endLine: number, bodyStart: number, names: Set<string>, parent: number }} RustFn
 * @typedef {{ kind: string, names: string[], public: boolean, start: number, end: number, line: number, endLine: number }} RustItem
 * @typedef {{ text: string, lineStarts: number[], tokens: RustToken[], comments: Array<{ start: number, end: number, line: number, endLine: number }>, functions: RustFn[], items: RustItem[], bodyLines: Set<number> }} RustScan
 */

const QUALIFIERS = new Set(['pub', 'const', 'async', 'unsafe', 'extern', 'default']);
const STRUCTURAL = new Set(['{', '}', '(', ')', '[', ']', ';', ',']);
const RUST_KEYWORDS = new Set(['as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in',
  'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true',
  'type', 'unsafe', 'use', 'where', 'while', 'dyn', 'async', 'await']);

/**
 * @param {string} c
 */
function identStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c > '\x7f';
}

/**
 * @param {string} c
 */
function identPart(c) {
  return identStart(c) || (c >= '0' && c <= '9');
}

const PUNCTS = ['<<=', '>>=', '...', '..=', '::', '->', '=>', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '^=', '&=', '|=', '<<', '>>', '..'];

/**
 * Tokens and comments of a Rust file.
 * @param {string} text
 */
export function tokenizeRust(text) {
  const starts = lineStarts(text);
  /** @type {RustToken[]} */
  const tokens = [];
  /** @type {Array<{ start: number, end: number, line: number, endLine: number }>} */
  const comments = [];
  const n = text.length;
  let i = 0;
  /** @param {RustToken['type']} type @param {number} s @param {number} e */
  const push = (type, s, e) => {
    tokens.push({ type, value: text.slice(s, e), start: s, end: e, line: lineOf(starts, s) });
  };
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c.charCodeAt(0) === 0xfeff) {
      i = i + 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      let e = i;
      while (e < n && text[e] !== '\n') {
        e = e + 1;
      }
      comments.push({ start: i, end: e, line: lineOf(starts, i), endLine: lineOf(starts, Math.max(i, e - 1)) });
      i = e;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      let depth = 0;
      let e = i;
      while (e < n) {
        if (text[e] === '/' && text[e + 1] === '*') {
          depth = depth + 1;
          e = e + 2;
          continue;
        }
        if (text[e] === '*' && text[e + 1] === '/') {
          depth = depth - 1;
          e = e + 2;
          if (depth === 0) {
            break;
          }
          continue;
        }
        e = e + 1;
      }
      comments.push({ start: i, end: e, line: lineOf(starts, i), endLine: lineOf(starts, e - 1) });
      i = e;
      continue;
    }
    // Raw strings: r"..", r#".."#, br"..", and byte strings b"..".
    const raw = /^(b?r)(#*)"/.exec(text.slice(i, i + 64));
    if (raw && (i === 0 || !identPart(text[i - 1]))) {
      const hashes = raw[2];
      const close = text.indexOf('"' + hashes, i + raw[0].length);
      const e = close < 0 ? n : close + 1 + hashes.length;
      push('string', i, e);
      i = e;
      continue;
    }
    if (c === '"' || (c === 'b' && text[i + 1] === '"')) {
      let e = c === 'b' ? i + 2 : i + 1;
      while (e < n) {
        if (text[e] === '\\') {
          e = e + 2;
          continue;
        }
        if (text[e] === '"') {
          e = e + 1;
          break;
        }
        e = e + 1;
      }
      push('string', i, e);
      i = e;
      continue;
    }
    if (c === "'" || (c === 'b' && text[i + 1] === "'")) {
      const s = c === 'b' ? i + 1 : i;
      // A character literal: 'x', '\n', '\u{..}', and b'x'. A lifetime is ' and
      // an identifier with no closing quote after it.
      const esc = /^'(\\(u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'/.exec(text.slice(s, s + 16));
      if (esc) {
        push('char', i, s + esc[0].length);
        i = s + esc[0].length;
        continue;
      }
      if (c === "'" && identStart(text[i + 1] || '')) {
        let e = i + 1;
        while (e < n && identPart(text[e])) {
          e = e + 1;
        }
        push('lifetime', i, e);
        i = e;
        continue;
      }
    }
    if (c >= '0' && c <= '9') {
      let e = i;
      if (c === '0' && /[xob]/.test(text[i + 1] || '')) {
        e = i + 2;
        while (e < n && /[0-9a-fA-F_]/.test(text[e])) {
          e = e + 1;
        }
      } else {
        while (e < n && /[0-9_]/.test(text[e])) {
          e = e + 1;
        }
        if (text[e] === '.' && text[e + 1] !== '.' && !identStart(text[e + 1] || '')) {
          e = e + 1;
          while (e < n && /[0-9_]/.test(text[e])) {
            e = e + 1;
          }
        }
        if ((text[e] === 'e' || text[e] === 'E') && /[0-9+-]/.test(text[e + 1] || '')) {
          e = e + 2;
          while (e < n && /[0-9_]/.test(text[e])) {
            e = e + 1;
          }
        }
      }
      while (e < n && identPart(text[e])) {
        e = e + 1;
      }
      push('number', i, e);
      i = e;
      continue;
    }
    if (identStart(c) || (c === 'r' && text[i + 1] === '#' && identStart(text[i + 2] || ''))) {
      let e = c === 'r' && text[i + 1] === '#' ? i + 2 : i + 1;
      while (e < n && identPart(text[e])) {
        e = e + 1;
      }
      push('ident', i, e);
      i = e;
      continue;
    }
    let matched = c;
    for (const p of PUNCTS) {
      if (text.startsWith(p, i)) {
        matched = p;
        break;
      }
    }
    push('punct', i, i + matched.length);
    i = i + matched.length;
  }
  return { tokens, comments, starts };
}

/**
 * @param {RustToken | undefined} t
 * @param {string} v
 */
function is(t, v) {
  return Boolean(t) && /** @type {RustToken} */ (t).type === 'punct' && /** @type {RustToken} */ (t).value === v;
}

/**
 * @param {RustToken | undefined} t
 * @param {string} [v]
 */
function isIdent(t, v) {
  return Boolean(t) && /** @type {RustToken} */ (t).type === 'ident' && (v === undefined || /** @type {RustToken} */ (t).value === v);
}

/**
 * The index of the token closing the bracket at `open`: ( [ { only.
 * @param {RustToken[]} tokens
 * @param {number} open
 */
function matching(tokens, open) {
  let depth = 0;
  for (let j = open; j < tokens.length; j = j + 1) {
    const v = tokens[j].type === 'punct' ? tokens[j].value : '';
    if (v === '(' || v === '[' || v === '{') {
      depth = depth + 1;
    } else if (v === ')' || v === ']' || v === '}') {
      depth = depth - 1;
      if (depth === 0) {
        return j;
      }
    }
  }
  return -1;
}

/**
 * The first token of the item a keyword belongs to: back over its qualifiers
 * (`pub`, `pub(crate)`, `unsafe`, `extern "C"`, `const`, `async`, `default`).
 * @param {RustToken[]} tokens
 * @param {number} at
 */
function itemStart(tokens, at) {
  let first = at;
  for (;;) {
    const prev = tokens[first - 1];
    if (isIdent(prev) && QUALIFIERS.has(prev.value)) {
      first = first - 1;
      continue;
    }
    if (prev && prev.type === 'string' && isIdent(tokens[first - 2], 'extern')) {
      first = first - 2;
      continue;
    }
    if (is(prev, ')')) {
      // pub(crate), pub(super), pub(in path)
      let open = first - 1;
      let depth = 0;
      for (; open >= 0; open = open - 1) {
        if (is(tokens[open], ')')) {
          depth = depth + 1;
        } else if (is(tokens[open], '(')) {
          depth = depth - 1;
          if (depth === 0) {
            break;
          }
        }
      }
      if (open > 0 && isIdent(tokens[open - 1], 'pub')) {
        first = open - 1;
        continue;
      }
    }
    return first;
  }
}

/**
 * The name an impl or a trait block gives the fns inside it: the type after
 * `for`, else the first type after `impl`, without its generic arguments.
 * @param {RustToken[]} tokens
 * @param {number} kw the `impl` or `trait` token
 * @param {number} open the block's `{`
 */
function blockName(tokens, kw, open) {
  let j = kw + 1;
  let depth = 0;
  /** @type {string[]} */
  const parts = [];
  let afterFor = -1;
  for (; j < open; j = j + 1) {
    const t = tokens[j];
    if (is(t, '<')) {
      depth = depth + 1;
    } else if (is(t, '>')) {
      depth = depth - 1;
    } else if (is(t, '>>')) {
      depth = depth - 2;
    } else if (is(t, '->')) {
      continue;
    } else if (depth === 0 && isIdent(t, 'for')) {
      afterFor = parts.length;
    } else if (depth === 0 && isIdent(t, 'where')) {
      break;
    } else if (depth === 0 && isIdent(t) && !RUST_KEYWORDS.has(t.value)) {
      parts.push(t.value);
    }
  }
  if (afterFor >= 0 && parts.length > afterFor) {
    return parts[parts.length - 1];
  }
  return parts.length > 0 ? parts[0] : '_';
}

/**
 * Scans a Rust file.
 * @param {string} text
 * @returns {RustScan}
 */
export function scanRust(text) {
  const { tokens, comments, starts } = tokenizeRust(text);
  /** @type {RustFn[]} */
  const functions = [];
  /** @type {RustItem[]} */
  const items = [];
  /** @type {Array<{ close: number, name: string | null, fn: number }>} */
  const stack = [];
  for (let i = 0; i < tokens.length; i = i + 1) {
    const t = tokens[i];
    while (stack.length > 0 && stack[stack.length - 1].close < i) {
      stack.pop();
    }
    const insideFn = stack.some((frame) => frame.fn >= 0);
    if (isIdent(t, 'fn') && isIdent(tokens[i + 1])) {
      // The body: the first { at depth 0 after the parameters, unless a ;
      // ends the item first (a trait method's declaration).
      let j = i + 2;
      let depth = 0;
      let body = -1;
      for (; j < tokens.length; j = j + 1) {
        const v = tokens[j].type === 'punct' ? tokens[j].value : '';
        if (v === '(' || v === '[') {
          depth = depth + 1;
        } else if (v === ')' || v === ']') {
          depth = depth - 1;
        } else if (v === '{' && depth === 0) {
          body = j;
          break;
        } else if (v === ';' && depth === 0) {
          break;
        }
      }
      if (body < 0) {
        continue;
      }
      const close = matching(tokens, body);
      if (close < 0) {
        continue;
      }
      const first = itemStart(tokens, i);
      const scope = stack.filter((frame) => frame.name !== null).map((frame) => frame.name);
      const name = tokens[i + 1].value;
      const parentFrame = [...stack].reverse().find((frame) => frame.fn >= 0);
      const qualified = scope.concat([name]).join('::');
      functions.push({
        name,
        qualified,
        start: tokens[first].start,
        end: tokens[close].end,
        line: tokens[first].line,
        endLine: tokens[close].line,
        bodyStart: tokens[body].start,
        names: new Set(),
        parent: parentFrame ? parentFrame.fn : -1,
      });
      stack.push({ close, name: null, fn: functions.length - 1 });
      i = body;
      continue;
    }
    if (!insideFn && (isIdent(t, 'impl') || isIdent(t, 'trait') || isIdent(t, 'mod'))) {
      let j = i + 1;
      for (; j < tokens.length; j = j + 1) {
        if (is(tokens[j], '{') || is(tokens[j], ';')) {
          break;
        }
      }
      if (is(tokens[j], '{')) {
        const close = matching(tokens, j);
        const name = isIdent(t, 'mod') ? (isIdent(tokens[i + 1]) ? tokens[i + 1].value : '_') : blockName(tokens, i, j);
        const first = itemStart(tokens, i);
        items.push({ kind: t.value, names: [name], public: tokens.slice(first, i).some((u) => isIdent(u, 'pub')), start: tokens[first].start, end: tokens[j].end, line: tokens[first].line, endLine: tokens[j].line });
        stack.push({ close, name, fn: -1 });
        i = j;
        continue;
      }
    }
    if (!insideFn && (isIdent(t, 'const') || isIdent(t, 'static')) && !isIdent(tokens[i + 1], 'fn') && !isIdent(tokens[i + 1], 'unsafe') && !isIdent(tokens[i + 1], 'extern')) {
      let j = i + 1;
      if (isIdent(tokens[j], 'mut')) {
        j = j + 1;
      }
      const name = isIdent(tokens[j]) ? tokens[j].value : '_';
      let depth = 0;
      let k = j;
      for (; k < tokens.length; k = k + 1) {
        const v = tokens[k].type === 'punct' ? tokens[k].value : '';
        if (v === '(' || v === '[' || v === '{') {
          depth = depth + 1;
        } else if (v === ')' || v === ']' || v === '}') {
          depth = depth - 1;
        } else if (v === ';' && depth === 0) {
          break;
        }
      }
      const first = itemStart(tokens, i);
      items.push({ kind: t.value, names: [name], public: tokens.slice(first, i).some((u) => isIdent(u, 'pub')), start: tokens[first].start, end: tokens[Math.min(k, tokens.length - 1)].end, line: tokens[first].line, endLine: tokens[Math.min(k, tokens.length - 1)].line });
      i = k;
      continue;
    }
    if (!insideFn && (isIdent(t, 'struct') || isIdent(t, 'enum') || isIdent(t, 'type') || isIdent(t, 'union') || isIdent(t, 'use') || isIdent(t, 'macro_rules'))) {
      let j = i + 1;
      let depth = 0;
      for (; j < tokens.length; j = j + 1) {
        const v = tokens[j].type === 'punct' ? tokens[j].value : '';
        if (v === '(' || v === '[') {
          depth = depth + 1;
        } else if (v === ')' || v === ']') {
          depth = depth - 1;
        } else if (v === '{' && depth === 0) {
          j = matching(tokens, j);
          if (!isIdent(t, 'use')) {
            if (is(tokens[j + 1], ';')) {
              j = j + 1;
            }
            break;
          }
        } else if (v === ';' && depth === 0) {
          break;
        }
      }
      const last = Math.min(j, tokens.length - 1);
      /** @type {string[]} */
      let names = [];
      if (isIdent(t, 'use')) {
        for (let k = i + 1; k <= last; k = k + 1) {
          const u = tokens[k];
          if (isIdent(u) && !RUST_KEYWORDS.has(u.value) && !is(tokens[k + 1], '::')) {
            names.push(u.value);
          }
        }
      } else if (isIdent(tokens[i + 1]) || (isIdent(t, 'macro_rules') && is(tokens[i + 1], '!'))) {
        names = [isIdent(t, 'macro_rules') ? (tokens[i + 2] ? tokens[i + 2].value : '_') : tokens[i + 1].value];
      }
      const first = itemStart(tokens, i);
      items.push({ kind: t.value, names, public: tokens.slice(first, i).some((u) => isIdent(u, 'pub')), start: tokens[first].start, end: tokens[last].end, line: tokens[first].line, endLine: tokens[last].line });
      i = last;
      continue;
    }
  }
  // Each identifier belongs to the innermost fn around it.
  for (let i = 0; i < tokens.length; i = i + 1) {
    const t = tokens[i];
    if (t.type !== 'ident' || is(tokens[i - 1], '.')) {
      continue;
    }
    const f = innermostFn(functions, t.start);
    if (f >= 0) {
      functions[f].names.add(t.value);
    }
  }
  /** @type {Set<number>} */
  const bodyLines = new Set();
  for (const t of tokens) {
    if (t.type === 'punct' && STRUCTURAL.has(t.value)) {
      continue;
    }
    const f = innermostFn(functions, t.start);
    if (f < 0 || t.start <= functions[f].bodyStart) {
      continue;
    }
    bodyLines.add(t.line);
  }
  return { text, lineStarts: starts, tokens, comments, functions, items, bodyLines };
}

/**
 * Where the innermost block around an offset opens: the position just past
 * its `{`, as a line and a 1-based column, or null outside every block.
 * @param {{ tokens: RustToken[], lineStarts: number[] }} scan
 * @param {number} offset
 * @returns {{ line: number, column: number } | null}
 */
export function innermostBlock(scan, offset) {
  /** @type {RustToken[]} */
  const open = [];
  for (const t of scan.tokens) {
    if (t.start >= offset) {
      break;
    }
    if (t.type === 'punct' && t.value === '{') {
      open.push(t);
    } else if (t.type === 'punct' && t.value === '}') {
      open.pop();
    }
  }
  const brace = open[open.length - 1];
  if (!brace) {
    return null;
  }
  return { line: brace.line, column: brace.end - scan.lineStarts[brace.line - 1] + 1 };
}

/**
 * The innermost fn whose span holds an offset, or -1.
 * @param {RustFn[]} functions
 * @param {number} offset
 */
export function innermostFn(functions, offset) {
  let best = -1;
  for (let f = 0; f < functions.length; f = f + 1) {
    const fn = functions[f];
    if (fn.start <= offset && offset < fn.end && (best < 0 || fn.end - fn.start < functions[best].end - functions[best].start)) {
      best = f;
    }
  }
  return best;
}
