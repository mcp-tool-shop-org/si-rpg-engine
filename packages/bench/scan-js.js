// A token scan of a JavaScript module, enough to name what a changed line
// belongs to (T7b pin 1). It is not a parser, and what it reports is
// approximate, as the dispatch says of the top-level rule:
//   - tokens, with comments kept apart, strings, template literals, regular
//     expressions told from division by the token before them, and numbers;
//   - functions: declarations and expressions, arrows, and methods of object
//     literals and classes, each with its name, its span, its body, the
//     functions around it, and the identifiers it names itself (not those of
//     a function inside it);
//   - top-level statements, each with the identifiers it declares, and
//     whether it is an import or an export;
//   - executable lines: a line holding a token of a function's body that is
//     more than a bracket or a separator, or a top-level token outside any
//     function, so a comment, a blank, or a parameter's name is not one.
// Offsets are indices into the string as read, which are the offsets V8's
// coverage reports, since it reads the same text. Lines are 1-based.
//
// No imports: the orchestrator and the tests both read it.

const KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends',
  'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'return', 'super', 'switch', 'this', 'throw',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'await', 'null', 'true', 'false', 'of', 'static', 'get', 'set', 'async',
]);

/** Keywords after which a slash starts a regular expression. */
const BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/** A call-like head that a block follows without making a method. */
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return', 'typeof', 'await', 'yield', 'new', 'do', 'else', 'in', 'of', 'delete', 'void', 'throw', 'case']);

/** Tokens that do not make a line executable on their own. */
const STRUCTURAL = new Set(['{', '}', '(', ')', '[', ']', ';', ',', 'else', 'try', 'finally', 'do']);

/**
 * @typedef {{ type: 'ident' | 'punct' | 'string' | 'template' | 'regex' | 'number', value: string, start: number, end: number, line: number }} Token
 * @typedef {{ start: number, end: number, line: number, endLine: number }} Comment
 * @typedef {{
 *   name: string, qualified: string, start: number, end: number, line: number, endLine: number,
 *   bodyStart: number, bodyEnd: number, probe: number, parent: number, names: Set<string>, arrow: boolean
 * }} JsFunction
 * @typedef {{ start: number, end: number, line: number, endLine: number, kind: 'import' | 'export' | 'declaration' | 'statement', declares: string[], isFunction: boolean }} TopStatement
 * @typedef {{ text: string, lineStarts: number[], tokens: Token[], comments: Comment[], functions: JsFunction[], statements: TopStatement[], executable: Set<number> }} JsScan
 */

/**
 * The offset each line starts at, 1-based line n at index n - 1.
 * @param {string} text
 * @returns {number[]}
 */
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i = i + 1) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * The 1-based line of an offset.
 * @param {number[]} starts
 * @param {number} offset
 */
export function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo + 1;
}

/**
 * @param {string} c
 */
function identStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$' || c > '\x7f';
}

/**
 * @param {string} c
 */
function identPart(c) {
  return identStart(c) || (c >= '0' && c <= '9');
}

const PUNCTS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];

/**
 * Tokens and comments of a module.
 * @param {string} text
 * @returns {{ tokens: Token[], comments: Comment[] }}
 */
export function tokenize(text) {
  const starts = lineStarts(text);
  /** @type {Token[]} */
  const tokens = [];
  /** @type {Comment[]} */
  const comments = [];
  let i = 0;
  const n = text.length;
  /** @param {Token['type']} type @param {number} s @param {number} e */
  const push = (type, s, e) => {
    tokens.push({ type, value: text.slice(s, e), start: s, end: e, line: lineOf(starts, s) });
  };
  const regexAllowed = () => {
    const prev = tokens[tokens.length - 1];
    if (!prev) {
      return true;
    }
    if (prev.type === 'punct') {
      return prev.value !== ')' && prev.value !== ']' && prev.value !== '}';
    }
    if (prev.type === 'ident') {
      return BEFORE_REGEX.has(prev.value);
    }
    return false;
  };
  /**
   * The end of a template literal starting at the backtick at `s`.
   * @param {number} s
   */
  const templateEnd = (s) => {
    let j = s + 1;
    while (j < n) {
      const c = text[j];
      if (c === '\\') {
        j = j + 2;
        continue;
      }
      if (c === '`') {
        return j + 1;
      }
      if (c === '$' && text[j + 1] === '{') {
        j = skipBraces(j + 1);
        continue;
      }
      j = j + 1;
    }
    return n;
  };
  /**
   * The offset after the brace that closes the one at `s`, skipping strings,
   * templates, and comments inside.
   * @param {number} s
   */
  const skipBraces = (s) => {
    let depth = 0;
    let j = s;
    while (j < n) {
      const c = text[j];
      if (c === '"' || c === "'") {
        j = stringEnd(j);
        continue;
      }
      if (c === '`') {
        j = templateEnd(j);
        continue;
      }
      if (c === '/' && text[j + 1] === '/') {
        while (j < n && text[j] !== '\n') {
          j = j + 1;
        }
        continue;
      }
      if (c === '/' && text[j + 1] === '*') {
        const close = text.indexOf('*/', j + 2);
        j = close < 0 ? n : close + 2;
        continue;
      }
      if (c === '{') {
        depth = depth + 1;
      } else if (c === '}') {
        depth = depth - 1;
        if (depth === 0) {
          return j + 1;
        }
      }
      j = j + 1;
    }
    return n;
  };
  /** @param {number} s */
  const stringEnd = (s) => {
    const q = text[s];
    let j = s + 1;
    while (j < n) {
      const c = text[j];
      if (c === '\\') {
        j = j + 2;
        continue;
      }
      if (c === q || c === '\n') {
        return j + 1;
      }
      j = j + 1;
    }
    return n;
  };
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c.charCodeAt(0) === 0xfeff) {
      i = i + 1;
      continue;
    }
    if (c === '#' && i === 0 && text[1] === '!') {
      const e = text.indexOf('\n');
      const end = e < 0 ? n : e;
      comments.push({ start: 0, end, line: 1, endLine: 1 });
      i = end;
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
      const close = text.indexOf('*/', i + 2);
      const e = close < 0 ? n : close + 2;
      comments.push({ start: i, end: e, line: lineOf(starts, i), endLine: lineOf(starts, e - 1) });
      i = e;
      continue;
    }
    if (c === '"' || c === "'") {
      const e = stringEnd(i);
      push('string', i, e);
      i = e;
      continue;
    }
    if (c === '`') {
      const e = templateEnd(i);
      push('template', i, e);
      i = e;
      continue;
    }
    if (c >= '0' && c <= '9' || (c === '.' && text[i + 1] >= '0' && text[i + 1] <= '9')) {
      let e = i;
      if (c === '0' && /[xXoObB]/.test(text[i + 1] || '')) {
        e = i + 2;
        while (e < n && /[0-9a-fA-F_]/.test(text[e])) {
          e = e + 1;
        }
      } else {
        while (e < n && /[0-9_]/.test(text[e])) {
          e = e + 1;
        }
        if (text[e] === '.') {
          e = e + 1;
          while (e < n && /[0-9_]/.test(text[e])) {
            e = e + 1;
          }
        }
        if (text[e] === 'e' || text[e] === 'E') {
          let f = e + 1;
          if (text[f] === '+' || text[f] === '-') {
            f = f + 1;
          }
          if (text[f] >= '0' && text[f] <= '9') {
            e = f;
            while (e < n && /[0-9_]/.test(text[e])) {
              e = e + 1;
            }
          }
        }
      }
      if (text[e] === 'n') {
        e = e + 1;
      }
      push('number', i, e);
      i = e;
      continue;
    }
    if (identStart(c)) {
      let e = i + 1;
      while (e < n && identPart(text[e])) {
        e = e + 1;
      }
      push('ident', i, e);
      i = e;
      continue;
    }
    if (c === '/' && regexAllowed()) {
      let e = i + 1;
      let inClass = false;
      while (e < n && text[e] !== '\n') {
        const d = text[e];
        if (d === '\\') {
          e = e + 2;
          continue;
        }
        if (d === '[') {
          inClass = true;
        } else if (d === ']') {
          inClass = false;
        } else if (d === '/' && !inClass) {
          e = e + 1;
          break;
        }
        e = e + 1;
      }
      while (e < n && identPart(text[e])) {
        e = e + 1;
      }
      push('regex', i, e);
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
  return { tokens, comments };
}

/**
 * The index of the token that closes the bracket at index `open`.
 * @param {Token[]} tokens
 * @param {number} open
 */
function matching(tokens, open) {
  const pairs = /** @type {Record<string, string>} */ ({ '(': ')', '[': ']', '{': '}' });
  const want = pairs[tokens[open].value];
  let depth = 0;
  for (let j = open; j < tokens.length; j = j + 1) {
    const v = tokens[j].type === 'punct' ? tokens[j].value : '';
    if (v === '(' || v === '[' || v === '{') {
      depth = depth + 1;
    } else if (v === ')' || v === ']' || v === '}') {
      depth = depth - 1;
      if (depth === 0) {
        return v === want ? j : -1;
      }
    }
  }
  return -1;
}

/**
 * The index of the token that opens the bracket closed at index `close`.
 * @param {Token[]} tokens
 * @param {number} close
 */
function opening(tokens, close) {
  let depth = 0;
  for (let j = close; j >= 0; j = j - 1) {
    const v = tokens[j].type === 'punct' ? tokens[j].value : '';
    if (v === ')' || v === ']' || v === '}') {
      depth = depth + 1;
    } else if (v === '(' || v === '[' || v === '{') {
      depth = depth - 1;
      if (depth === 0) {
        return j;
      }
    }
  }
  return -1;
}

/**
 * @param {Token | undefined} token
 * @param {string} value
 */
function is(token, value) {
  return Boolean(token) && /** @type {Token} */ (token).type === 'punct' && /** @type {Token} */ (token).value === value;
}

/**
 * @param {Token | undefined} token
 * @param {string} [value]
 */
function isIdent(token, value) {
  return Boolean(token) && /** @type {Token} */ (token).type === 'ident' && (value === undefined || /** @type {Token} */ (token).value === value);
}

/**
 * The name a function expression or arrow takes from where it is written:
 * `name = ...`, `name: ...`, or none.
 * @param {Token[]} tokens
 * @param {number} at the index of the function's first token
 */
function assignedName(tokens, at) {
  const before = tokens[at - 1];
  const name = tokens[at - 2];
  if ((is(before, '=') || is(before, ':')) && isIdent(name) && !KEYWORDS.has(name.value)) {
    return name.value;
  }
  return '';
}

/**
 * Scans a module.
 * @param {string} text
 * @returns {JsScan}
 */
export function scanJs(text) {
  const starts = lineStarts(text);
  const { tokens, comments } = tokenize(text);
  /** @type {Array<Omit<JsFunction, 'qualified' | 'parent' | 'names'>>} */
  const found = [];
  for (let i = 0; i < tokens.length; i = i + 1) {
    const t = tokens[i];
    if (isIdent(t, 'function') && !is(tokens[i - 1], '.')) {
      let j = i + 1;
      if (is(tokens[j], '*')) {
        j = j + 1;
      }
      let name = '';
      if (isIdent(tokens[j]) && !is(tokens[j], '(')) {
        name = tokens[j].value;
        j = j + 1;
      }
      if (!is(tokens[j], '(')) {
        continue;
      }
      const close = matching(tokens, j);
      if (close < 0 || !is(tokens[close + 1], '{')) {
        continue;
      }
      const bodyClose = matching(tokens, close + 1);
      if (bodyClose < 0) {
        continue;
      }
      const first = isIdent(tokens[i - 1], 'async') ? i - 1 : i;
      found.push({
        name: name || assignedName(tokens, first),
        start: tokens[first].start,
        end: tokens[bodyClose].end,
        line: tokens[first].line,
        endLine: tokens[bodyClose].line,
        bodyStart: tokens[close + 1].start,
        bodyEnd: tokens[bodyClose].end,
        probe: tokens[close + 1].end,
        arrow: false,
      });
      continue;
    }
    if (is(t, '=>')) {
      let first;
      const prev = tokens[i - 1];
      if (is(prev, ')')) {
        first = opening(tokens, i - 1);
      } else if (isIdent(prev)) {
        first = i - 1;
      } else {
        continue;
      }
      if (first < 0) {
        continue;
      }
      if (isIdent(tokens[first - 1], 'async')) {
        first = first - 1;
      }
      const next = tokens[i + 1];
      if (!next) {
        continue;
      }
      let last;
      let probe;
      let bodyStart;
      if (is(next, '{')) {
        last = matching(tokens, i + 1);
        if (last < 0) {
          continue;
        }
        probe = next.end;
        bodyStart = next.start;
      } else {
        let depth = 0;
        let j = i + 1;
        for (; j < tokens.length; j = j + 1) {
          const v = tokens[j].type === 'punct' ? tokens[j].value : '';
          if (v === '(' || v === '[' || v === '{') {
            depth = depth + 1;
          } else if (v === ')' || v === ']' || v === '}') {
            if (depth === 0) {
              break;
            }
            depth = depth - 1;
          } else if ((v === ',' || v === ';') && depth === 0) {
            break;
          }
        }
        last = j - 1;
        probe = next.start;
        bodyStart = next.start;
      }
      found.push({
        name: assignedName(tokens, first),
        start: tokens[first].start,
        end: tokens[last].end,
        line: tokens[first].line,
        endLine: tokens[last].line,
        bodyStart,
        bodyEnd: tokens[last].end,
        probe,
        arrow: true,
      });
      continue;
    }
    if (isIdent(t) && !NOT_METHODS.has(t.value) && is(tokens[i + 1], '(')) {
      const prev = tokens[i - 1];
      if (is(prev, '.') || isIdent(prev, 'function')) {
        continue;
      }
      const close = matching(tokens, i + 1);
      if (close < 0 || !is(tokens[close + 1], '{')) {
        continue;
      }
      if (!(prev === undefined || is(prev, '{') || is(prev, ',') || is(prev, ';') || is(prev, '}') || is(prev, '*')
        || isIdent(prev, 'get') || isIdent(prev, 'set') || isIdent(prev, 'async') || isIdent(prev, 'static'))) {
        continue;
      }
      const bodyClose = matching(tokens, close + 1);
      if (bodyClose < 0) {
        continue;
      }
      let first = i;
      while (isIdent(tokens[first - 1], 'get') || isIdent(tokens[first - 1], 'set') || isIdent(tokens[first - 1], 'async') || isIdent(tokens[first - 1], 'static') || is(tokens[first - 1], '*')) {
        first = first - 1;
      }
      found.push({
        name: t.value,
        start: tokens[first].start,
        end: tokens[bodyClose].end,
        line: tokens[first].line,
        endLine: tokens[bodyClose].line,
        bodyStart: tokens[close + 1].start,
        bodyEnd: tokens[bodyClose].end,
        probe: tokens[close + 1].end,
        arrow: false,
      });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  /** @type {JsFunction[]} */
  const functions = [];
  /** @type {number[]} */
  const stack = [];
  for (const f of found) {
    while (stack.length > 0 && !(functions[stack[stack.length - 1]].start <= f.start && f.end <= functions[stack[stack.length - 1]].end)) {
      stack.pop();
    }
    const parent = stack.length > 0 ? stack[stack.length - 1] : -1;
    const own = f.name || '(anonymous@' + f.line + ')';
    const qualified = parent >= 0 ? functions[parent].qualified + '/' + own : own;
    functions.push({ ...f, qualified, parent, names: new Set() });
    stack.push(functions.length - 1);
  }
  // Each identifier token belongs to the innermost function around it. A
  // property after a dot is not a binding, and is not counted.
  for (let i = 0; i < tokens.length; i = i + 1) {
    const t = tokens[i];
    if (t.type !== 'ident' || KEYWORDS.has(t.value) || is(tokens[i - 1], '.') || is(tokens[i - 1], '?.')) {
      continue;
    }
    const f = innermost(functions, t.start);
    if (f >= 0) {
      functions[f].names.add(t.value);
    }
  }
  for (const t of tokens) {
    if (t.type === 'template') {
      for (const m of t.value.matchAll(/\$\{([^}]*)\}/g)) {
        for (const id of m[1].matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
          const f = innermost(functions, t.start);
          if (f >= 0 && !KEYWORDS.has(id[0])) {
            functions[f].names.add(id[0]);
          }
        }
      }
    }
  }
  const statements = topStatements(tokens, functions);
  /** @type {Set<number>} */
  const executable = new Set();
  for (const t of tokens) {
    if (t.type === 'punct' && STRUCTURAL.has(t.value)) {
      continue;
    }
    if (t.type === 'ident' && STRUCTURAL.has(t.value)) {
      continue;
    }
    const f = innermost(functions, t.start);
    if (f >= 0) {
      const fn = functions[f];
      if (t.start <= fn.bodyStart && !fn.arrow) {
        continue;
      }
      if (fn.arrow && t.start < fn.bodyStart) {
        continue;
      }
    }
    const endLine = lineOf(starts, Math.max(t.start, t.end - 1));
    for (let line = t.line; line <= endLine; line = line + 1) {
      executable.add(line);
    }
  }
  return { text, lineStarts: starts, tokens, comments, functions, statements, executable };
}

/**
 * The innermost function whose span holds an offset, or -1.
 * @param {JsFunction[]} functions
 * @param {number} offset
 */
export function innermost(functions, offset) {
  let best = -1;
  for (let f = 0; f < functions.length; f = f + 1) {
    const fn = functions[f];
    if (fn.start <= offset && offset < fn.end && (best < 0 || fn.end - fn.start < functions[best].end - functions[best].start)) {
      best = f;
    }
  }
  return best;
}

/**
 * The top-level statements, each with what it declares.
 * @param {Token[]} tokens
 * @param {JsFunction[]} functions
 * @returns {TopStatement[]}
 */
function topStatements(tokens, functions) {
  /** @type {TopStatement[]} */
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const first = i;
    const head = tokens[i];
    const blockEnding = isIdent(head, 'function') || isIdent(head, 'class') || isIdent(head, 'if') || isIdent(head, 'for')
      || isIdent(head, 'while') || isIdent(head, 'try') || isIdent(head, 'switch') || isIdent(head, 'do') || is(head, '{')
      || (isIdent(head, 'async') && isIdent(tokens[i + 1], 'function'))
      || (isIdent(head, 'export') && (isIdent(tokens[i + 1], 'function') || isIdent(tokens[i + 1], 'class') || (isIdent(tokens[i + 1], 'async') && isIdent(tokens[i + 2], 'function'))
        || (isIdent(tokens[i + 1], 'default') && (isIdent(tokens[i + 2], 'function') || isIdent(tokens[i + 2], 'class')))));
    let depth = 0;
    let j = i;
    for (; j < tokens.length; j = j + 1) {
      const v = tokens[j].type === 'punct' ? tokens[j].value : '';
      if (v === '(' || v === '[' || v === '{') {
        depth = depth + 1;
      } else if (v === ')' || v === ']' || v === '}') {
        depth = depth - 1;
        if (depth === 0 && v === '}' && blockEnding) {
          const next = tokens[j + 1];
          if (isIdent(next, 'else') || isIdent(next, 'catch') || isIdent(next, 'finally') || (isIdent(head, 'do') && isIdent(next, 'while'))) {
            continue;
          }
          if (is(next, ';')) {
            j = j + 1;
          }
          break;
        }
      } else if (v === ';' && depth === 0) {
        break;
      }
    }
    const last = Math.min(j, tokens.length - 1);
    const kind = isIdent(head, 'import') ? 'import' : isIdent(head, 'export') ? 'export'
      : (isIdent(head, 'const') || isIdent(head, 'let') || isIdent(head, 'var') || isIdent(head, 'function') || isIdent(head, 'class') || isIdent(head, 'async')) ? 'declaration' : 'statement';
    const declares = declared(tokens, first, last);
    const fnHere = functions.find((f) => f.parent < 0 && f.start >= tokens[first].start && f.end <= tokens[last].end);
    out.push({
      start: tokens[first].start,
      end: tokens[last].end,
      line: tokens[first].line,
      endLine: tokens[last].line,
      kind,
      declares,
      isFunction: Boolean(fnHere) && (isIdent(head, 'function') || (isIdent(head, 'export') && (isIdent(tokens[first + 1], 'function') || isIdent(tokens[first + 1], 'async'))) || isIdent(head, 'async')),
    });
    i = last + 1;
  }
  return out;
}

/**
 * The names a top-level statement binds: an import's local names, an
 * export's names, a declaration's bound names, a function's or a class's name.
 * @param {Token[]} tokens
 * @param {number} first
 * @param {number} last
 * @returns {string[]}
 */
function declared(tokens, first, last) {
  /** @type {string[]} */
  const names = [];
  let i = first;
  if (isIdent(tokens[i], 'export')) {
    i = i + 1;
    if (isIdent(tokens[i], 'default')) {
      names.push('default');
      i = i + 1;
    }
  }
  const head = tokens[i];
  if (isIdent(head, 'import')) {
    // import X, { a as b, c } from '...'; import * as ns from '...';
    for (let j = i + 1; j <= last; j = j + 1) {
      const t = tokens[j];
      if (isIdent(t, 'from')) {
        break;
      }
      if (isIdent(t) && !KEYWORDS.has(t.value) && t.value !== 'as' && !isIdent(tokens[j + 1], 'as')) {
        names.push(t.value);
      }
    }
    return names;
  }
  if (is(head, '{')) {
    // export { a, b as c } [from '...']
    for (let j = i + 1; j <= last; j = j + 1) {
      const t = tokens[j];
      if (is(t, '}')) {
        break;
      }
      if (isIdent(t) && t.value !== 'as') {
        names.push(t.value);
      }
    }
    return names;
  }
  if (is(head, '*')) {
    return names;
  }
  if (isIdent(head, 'async')) {
    i = i + 1;
  }
  if (isIdent(tokens[i], 'function') || isIdent(tokens[i], 'class')) {
    let j = i + 1;
    if (is(tokens[j], '*')) {
      j = j + 1;
    }
    if (isIdent(tokens[j])) {
      names.push(tokens[j].value);
    }
    return names;
  }
  if (isIdent(tokens[i], 'const') || isIdent(tokens[i], 'let') || isIdent(tokens[i], 'var')) {
    let j = i + 1;
    while (j <= last) {
      const t = tokens[j];
      if (is(t, '{') || is(t, '[')) {
        const close = matching(tokens, j);
        for (let k = j + 1; k < close; k = k + 1) {
          const u = tokens[k];
          if (!isIdent(u) || KEYWORDS.has(u.value)) {
            continue;
          }
          const next = tokens[k + 1];
          const prev = tokens[k - 1];
          if (is(next, ':') && !is(prev, ':')) {
            continue;
          }
          if (is(prev, '.')) {
            continue;
          }
          names.push(u.value);
        }
        j = close + 1;
      } else if (isIdent(t)) {
        names.push(t.value);
        j = j + 1;
      } else {
        j = j + 1;
      }
      // Skip the initializer to the next declarator.
      let depth = 0;
      while (j <= last) {
        const v = tokens[j].type === 'punct' ? tokens[j].value : '';
        if (v === '(' || v === '[' || v === '{') {
          depth = depth + 1;
        } else if (v === ')' || v === ']' || v === '}') {
          depth = depth - 1;
        } else if (v === ',' && depth === 0) {
          j = j + 1;
          break;
        } else if (v === ';' && depth === 0) {
          j = last + 1;
          break;
        }
        j = j + 1;
      }
    }
  }
  return names;
}
