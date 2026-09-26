// `bench anchors` (T7b pin 1): the diff between a base and a head, read into
// anchors, the pieces of changed code or data a run can meet. Each anchor has
// an id, a kind, a file, a name, and its changed line ranges in the head's
// text, or in the base's for a deletion; and what the bench needs to measure
// its reach (pin 3). The kinds:
//
//   js          a function in packages/tick/ or packages/frame/ whose text
//               holds a changed line: reached when it ran, V8's count at the
//               first offset of its body;
//   top-level   a changed top-level line there, with the identifiers it
//               declares, the declaration's around it, or an import's or an
//               export's bindings: reached when a function that names one of
//               them ran, in its file, and for an export in the files that
//               import it. Approximate. An import or export line, and one with
//               no identifier, also runs when its module loads;
//   deletion    a deleted line, at the point it left in the head's text: in JS
//               the innermost block V8 counts there, in the law the innermost
//               coverage region; a deleted top-level line takes the identifiers
//               it declared in the base's text, and when the head no longer
//               names them it is removed, its reach not measurable. Approximate;
//   rule        a verb's rule file: reached when the verb is submitted;
//   catalog     predicates/intents/index.json: a line that retires or restores
//               a verb is reached when that verb is submitted, any other line
//               when any intent is;
//   hazard      a hazard scenario: reached when the hazard suite runs it;
//   law         a function in solver/src/ whose text holds a changed line, or a
//               changed top-level item there (a const, a static), reached by
//               the coverage build's regions.
//
// Not aimed, each with its reason, and no proposer aims at them: belief keys,
// role manifests, packages/load/, dependency files, tests, docs, the Atlas map,
// tools, and the rest of the repository outside the tick, the frame, the
// rules, and the law. A changed world or fixture file is reported as a world
// that differs (pin 2), never as an anchor.
//
// Observability (pin 3). Each anchor is marked `observable`, `not observable`,
// or `unknown` by the rule in observability() below, per function.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffLines, splitLines } from './diff.js';
import { innermost, lineOf, scanJs } from './scan-js.js';
import { innermostBlock, innermostFn, scanRust } from './scan-rust.js';
import { listFiles } from './trees.js';

/**
 * @typedef {import('./diff.js').Hunk} Hunk
 * @typedef {'js' | 'top-level' | 'deletion' | 'rule' | 'catalog' | 'hazard' | 'law' | 'law-top-level' | 'law-deletion'} AnchorKind
 * @typedef {'observable' | 'not observable' | 'unknown'} Observable
 * @typedef {{ file: string, offset: number }} JsProbe
 * @typedef {{ file: string, line: number, column: number, block?: { line: number, column: number } | null }} LawPoint
 * @typedef {{
 *   id: string, kind: AnchorKind, file: string, name: string,
 *   lines: Array<[number, number]>, side: 'head' | 'base',
 *   approximate: boolean, observable: Observable, why: string,
 *   changed: number[], executable: number[], noExecutableChange: boolean,
 *   runsAtLoad: boolean, removed: boolean, identifiers: string[],
 *   probes: JsProbe[], lineProbes: Array<{ line: number, probe: JsProbe }>,
 *   lawEntries: LawPoint[], lawLines: Array<{ file: string, line: number }>,
 *   verb: string | null, anyIntent: boolean, hazard: { id: string, file: string } | null,
 *   module: string | null
 * }} Anchor
 * @typedef {{ id: string, file: string, reason: string }} NotAimed
 * @typedef {{ file: string, reason: string }} WorldDiffers
 * @typedef {{ anchors: Anchor[], notAimed: NotAimed[], worlds: WorldDiffers[], changedFiles: string[] }} AnchorSet
 */

/**
 * The offset a deletion left in the head's text: the end of the head's line
 * before the deleted lines, where that line's newline sits; at the head's
 * start for a deletion before its first line; and at the text's end for one
 * after a last line with no newline, which has no line start after it.
 * @param {{ text: string, lineStarts: number[] }} head
 * @param {number} h the head's 0-based line the deleted lines sat before
 */
export function deletionPoint(head, h) {
  if (h === 0) {
    return 0;
  }
  return h < head.lineStarts.length ? head.lineStarts[h] - 1 : head.text.length;
}

/** Why each kind the bench does not aim at is not aimed. */
export const NOT_AIMED = {
  beliefs: 'a belief key: both proposers here propose intents, and T7c\'s roles propose beliefs',
  roles: 'a role manifest: T7c\'s',
  load: 'packages/load/ runs at load or in the sweep, not in a candidate\'s quanta; the sweep runs only on the head and its own tests hold it, and the hazard suite that lives there runs on each tree when a hazard changes (pin 4)',
  dependencies: 'a dependency file: every candidate still runs on every tree, so a difference it causes is still found',
  tests: 'a test',
  docs: 'a doc',
  atlas: 'the Atlas map',
  tools: 'a tool',
  bench: 'the bench itself, which runs no candidate\'s quanta',
  propose: 'the proposer seat, which T7c puts into the bench',
  host: 'a host, which draws committed frames and runs in no candidate',
  build: 'the law\'s build configuration: when solver/ differs each tree builds its own binary, so every candidate still runs on every tree',
  types: 'type declarations, which no process runs',
  ci: 'CI configuration, which no run meets',
  config: 'repository configuration, which no run meets',
};

/**
 * What a path is to the bench.
 * @param {string} path
 * @returns {{ kind: 'js' | 'law' | 'rule' | 'catalog' | 'hazard' | 'hazard-index' | 'world' | 'not-aimed', reason?: string }}
 */
export function classify(path) {
  if (/\.test\.(m?js)$/.test(path) || path.startsWith('harness/') || /^solver\/.*\.test\.js$/.test(path)) {
    return { kind: 'not-aimed', reason: NOT_AIMED.tests };
  }
  if (/^packages\/(tick|frame)\/.*\.m?js$/.test(path)) {
    return { kind: 'js' };
  }
  if (/^packages\/(tick|frame)\/.*\.d\.ts$/.test(path)) {
    return { kind: 'not-aimed', reason: NOT_AIMED.types };
  }
  if (path === 'predicates/intents/index.json') {
    return { kind: 'catalog' };
  }
  if (/^predicates\/intents\/[^/]+\.json$/.test(path)) {
    return { kind: 'rule' };
  }
  if (path === 'predicates/hazards/index.json') {
    return { kind: 'hazard-index' };
  }
  if (/^predicates\/hazards\/[^/]+\.json$/.test(path)) {
    return { kind: 'hazard' };
  }
  if (path.startsWith('predicates/beliefs/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.beliefs };
  }
  if (path.startsWith('predicates/roles/') || path.startsWith('fixtures/roles/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.roles };
  }
  if (/^solver\/src\/.*\.rs$/.test(path)) {
    return { kind: 'law' };
  }
  if (path === 'solver/Cargo.toml' || path === 'solver/Cargo.lock' || path === 'package.json' || path === 'package-lock.json') {
    return { kind: 'not-aimed', reason: NOT_AIMED.dependencies };
  }
  if (path.startsWith('packages/load/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.load };
  }
  if (path.startsWith('fixtures/') || path.startsWith('worlds/')) {
    return { kind: 'world' };
  }
  if (path.startsWith('atlas/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.atlas };
  }
  if (path.startsWith('tools/') || path.startsWith('packages/tool/') || path === 'solver/lint.mjs') {
    return { kind: 'not-aimed', reason: NOT_AIMED.tools };
  }
  if (path.startsWith('packages/bench/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.bench };
  }
  if (path.startsWith('packages/propose/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.propose };
  }
  if (path.startsWith('packages/host/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.host };
  }
  if (path.startsWith('solver/')) {
    return { kind: 'not-aimed', reason: /\.md$|NOTICE|LICENSE/.test(path) ? NOT_AIMED.docs : NOT_AIMED.build };
  }
  if (path.startsWith('.github/')) {
    return { kind: 'not-aimed', reason: NOT_AIMED.ci };
  }
  if (path.startsWith('docs/') || path.startsWith('site/') || /\.md$/.test(path) || /^LICENSE/.test(path)) {
    return { kind: 'not-aimed', reason: NOT_AIMED.docs };
  }
  return { kind: 'not-aimed', reason: NOT_AIMED.config };
}

// ---------------------------------------------------------------------------
// Observability.

/** Body and pose fields: an assignment to one writes what the trace and the hash read. */
const POSE = new Set(['x', 'y', 'z', 'vx', 'vy', 'vz', 'qx', 'qy', 'qz', 'qw', 'wx', 'wy', 'wz', 'solverMode', 'metTick']);
/**
 * Calls that write hashed state: the hasher, the solver and the world's
 * geometry, the minds' beliefs and goals, a frame's commit, and a scheduled
 * action. A function that makes any of them is observable.
 */
const HASHED_CALLS = new Set(['u32', 'float', 'text', 'bytes', 'resume', 'step', 'carry', 'release', 'restore', 'stepSolver', 'loadSolver', 'stepBodies',
  'restoreSparse', 'restoreImage', 'hold', 'admitMindBelief', 'admitBeliefWrite', 'mixMinds', 'mixQuantum', 'mixSnapshot', 'mixLoad', 'observeMinds',
  'installMinds', 'restoreMinds', 'commitFrame', 'solverModes', 'pinCarried', 'applyAction', 'writeInputs', 'readBodies', 'solver_step', 'solver_load', 'advance']);
/** State the tick hashes or schedules, written by a set, an add, a delete, a clear, or an assignment. */
const HASHED_STATE = new Set(['actions', 'lifted', 'carrying', 'carriedBy', 'bodies', 'tick', 'pending', 'current', 'productId', 'held', 'cached', 'h0', 'h1', 'hasher']);
/**
 * What the dispatch names as unread by the trace and the hash: an episode's
 * text, the log's bookkeeping, a host, and the freshness window and budget
 * ticks the role gate keeps.
 */
const UNHASHED_CALLS = new Set(['recordEpisode', 'draw', 'show', 'emit', 'attach', 'remember', 'rememberMinds', 'record']);
const UNHASHED_STATE = new Set(['episodes', 'inputLog', 'hosts', 'frames', 'admissions']);

/**
 * The checker's functions: every function of the intent predicate, and the
 * world's queries it and the hash read. Each one's value decides an admission,
 * which decides the run, or is mixed into the hash, so each is observable.
 */
const CHECKER = new Map([
  ['packages/tick/predicates.js', null],
  ['packages/tick/world.js', new Set(['segmentHitsBox', 'localOf', 'segmentHits', 'overlaps', 'orientedOverlap', 'supportAt', 'colliderSupport',
    'heightfieldSupport', 'zoneOf', 'zoneIndex', 'sleeping', 'holds', 'body', 'linkIndex', 'anyCarried', 'carryingOf', 'carriedByOf'])],
  ['packages/tick/beliefs.js', new Set(['beliefRefusal'])],
]);

/** Words that look like calls to the scan and are not. */
const NOT_CALLS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'function', 'await', 'yield', 'void', 'delete', 'in', 'of', 'do', 'else', 'super']);
/** Calls that compute and write nothing. */
const PURE = new Set(['String', 'Number', 'Boolean', 'Math', 'Array', 'Object', 'JSON', 'Error', 'Set', 'Map', 'abs', 'sqrt', 'floor', 'ceil', 'min', 'max', 'hypot', 'isInteger', 'isArray', 'isFinite', 'isNaN', 'keys', 'values', 'entries', 'from', 'slice', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'includes', 'indexOf', 'join', 'concat', 'toFixed', 'has', 'get']);

/**
 * The rule for the mark (pin 3), over a function's own tokens, not those of
 * a function inside it:
 *   - observable: it is one of the checker's functions (CHECKER); it writes a
 *     body's pose or velocity, a goal's met tick, or a solver mode; calls one
 *     of HASHED_CALLS; writes HASHED_STATE; or returns a checker's verdict
 *     (`ok:` or `admitted:`), which decides an admission, and an admission
 *     decides the run;
 *   - not observable: none of those, and it writes at least one of the
 *     unhashed sinks (an episode's text, the log's bookkeeping, a host, the
 *     window), or a refusal's reason, and nothing else outside itself;
 *   - unknown: anything else, a function that only computes and returns a
 *     value among them, since the rule does not follow where the value goes.
 * Belief text reaches the hash only through a belief's admission, which is
 * one of HASHED_CALLS. A use goal is met by an episode's text (minds.js), and
 * the rule does not follow that read: it says not observable of a function
 * that writes only an episode's text, which a world with a use goal can see.
 * @param {import('./scan-js.js').JsScan} scan
 * @param {number} index the function
 * @param {string} [file] the file it is in
 * @returns {{ mark: Observable, why: string }}
 */
export function observability(scan, index, file) {
  const fn = scan.functions[index];
  const checker = file ? CHECKER.get(file) : undefined;
  if (checker === null || (checker && checker.has(fn.name))) {
    return { mark: 'observable', why: 'a function of the checker: its value decides an admission, or the hash reads it' };
  }
  const own = scan.tokens.filter((t) => t.start >= fn.bodyStart && t.end <= fn.end && innermost(scan.functions, t.start) === index);
  /** @type {Set<string>} */
  const locals = new Set();
  for (let i = 0; i < own.length; i = i + 1) {
    const t = own[i];
    if (t.type === 'ident' && (t.value === 'const' || t.value === 'let' || t.value === 'var') && own[i + 1] && own[i + 1].type === 'ident') {
      locals.add(own[i + 1].value);
    }
  }
  const tokenIndex = new Map(scan.tokens.map((t, i) => [t.start, i]));
  const hashed = [];
  const unhashed = [];
  const other = [];
  for (let k = 0; k < own.length; k = k + 1) {
    const t = own[k];
    const i = /** @type {number} */ (tokenIndex.get(t.start));
    const prev = scan.tokens[i - 1];
    const next = scan.tokens[i + 1];
    if (t.type !== 'ident') {
      continue;
    }
    const assigned = next && next.type === 'punct' && ['=', '+=', '-=', '*=', '/=', '++', '--'].includes(next.value);
    const called = next && next.type === 'punct' && next.value === '(';
    const dotted = prev && prev.type === 'punct' && (prev.value === '.' || prev.value === '?.');
    if (dotted && assigned && POSE.has(t.value)) {
      hashed.push(t.value + ' =');
      continue;
    }
    if (called && HASHED_CALLS.has(t.value)) {
      hashed.push(t.value + '()');
      continue;
    }
    if (called && UNHASHED_CALLS.has(t.value)) {
      unhashed.push(t.value + '()');
      continue;
    }
    if (called && dotted && ['set', 'add', 'delete', 'clear', 'push', 'splice', 'shift', 'pop'].includes(t.value)) {
      const owner = scan.tokens[i - 2];
      if (owner && owner.type === 'ident' && HASHED_STATE.has(owner.value)) {
        hashed.push(owner.value + '.' + t.value + '()');
      } else if (owner && owner.type === 'ident' && UNHASHED_STATE.has(owner.value)) {
        unhashed.push(owner.value + '.' + t.value + '()');
      } else if (owner && owner.type === 'ident' && !locals.has(owner.value)) {
        other.push(owner.value + '.' + t.value + '()');
      }
      continue;
    }
    if (!dotted && assigned) {
      if (HASHED_STATE.has(t.value)) {
        hashed.push(t.value + ' =');
      } else if (UNHASHED_STATE.has(t.value)) {
        unhashed.push(t.value + ' =');
      } else if (!locals.has(t.value)) {
        other.push(t.value + ' =');
      }
      continue;
    }
    if ((t.value === 'ok' || t.value === 'admitted') && next && next.type === 'punct' && next.value === ':') {
      hashed.push('a verdict (' + t.value + ':)');
      continue;
    }
    if (t.value === 'reason' && next && next.type === 'punct' && next.value === ':') {
      unhashed.push('a refusal reason');
      continue;
    }
    if (called && !locals.has(t.value) && !NOT_CALLS.has(t.value) && !PURE.has(t.value)) {
      other.push(t.value + '()');
    }
  }
  if (hashed.length > 0) {
    return { mark: 'observable', why: 'it writes hashed state: ' + Array.from(new Set(hashed)).slice(0, 4).join(', ') };
  }
  if (unhashed.length > 0 && other.length === 0) {
    return { mark: 'not observable', why: 'it writes only what the trace and the hash do not read: ' + Array.from(new Set(unhashed)).slice(0, 4).join(', ') };
  }
  return { mark: 'unknown', why: other.length > 0 ? 'the rule cannot classify what it writes or calls: ' + Array.from(new Set(other)).slice(0, 4).join(', ') : 'it writes nothing the rule names; where its value goes is not followed' };
}

// ---------------------------------------------------------------------------
// Reading the diff.

/**
 * Consecutive line numbers as ranges.
 * @param {number[]} lines sorted
 * @returns {Array<[number, number]>}
 */
export function ranges(lines) {
  /** @type {Array<[number, number]>} */
  const out = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (last && last[1] + 1 === line) {
      last[1] = line;
    } else {
      out.push([line, line]);
    }
  }
  return out;
}

/**
 * @param {string} tree
 * @param {string} path
 */
function readText(tree, path) {
  try {
    return readFileSync(join(tree, path), 'utf8');
  } catch {
    return null;
  }
}

/**
 * The first token on a 1-based line of a scan, or null.
 * @param {{ tokens: Array<{ start: number, line: number, type: string, value: string }> }} scan
 * @param {number} line
 */
function firstTokenOn(scan, line) {
  let lo = 0;
  let hi = scan.tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scan.tokens[mid].line < line) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const t = scan.tokens[lo];
  return t && t.line === line ? { token: t, index: lo } : null;
}

/**
 * The offset of the first character of a line that is not blank, or the
 * line's start.
 * @param {string} text
 * @param {number[]} starts
 * @param {number} line
 */
function lineFirst(text, starts, line) {
  let at = starts[line - 1];
  const end = line < starts.length ? starts[line] : text.length;
  while (at < end && /\s/.test(text[at])) {
    at = at + 1;
  }
  return at < end ? at : starts[line - 1];
}

/**
 * The function a changed JS line belongs to: the innermost one around its
 * first token, or around a comment on it; a function that starts on the line
 * after only `export`, `default`, or `async` holds it too.
 * @param {import('./scan-js.js').JsScan} scan
 * @param {number} line
 */
function jsFunctionOf(scan, line) {
  const first = firstTokenOn(scan, line);
  if (first) {
    let f = innermost(scan.functions, first.token.start);
    if (f < 0) {
      // `export function f(` or `async function f(`: the line is f's.
      const starting = scan.functions.findIndex((fn) => fn.parent < 0 && fn.line === line);
      if (starting >= 0) {
        const before = scan.tokens.filter((t) => t.line === line && t.start < scan.functions[starting].start);
        if (before.every((t) => t.type === 'ident' && ['export', 'default', 'async'].includes(t.value))) {
          f = starting;
        }
      }
    }
    return f;
  }
  return innermost(scan.functions, lineFirst(scan.text, scan.lineStarts, line));
}

/**
 * The probe for a changed executable JS line: its first token that is not a
 * bracket or a separator.
 * @param {import('./scan-js.js').JsScan} scan
 * @param {number} line
 */
function lineProbe(scan, line) {
  const first = firstTokenOn(scan, line);
  if (!first) {
    return lineFirst(scan.text, scan.lineStarts, line);
  }
  for (let i = first.index; i < scan.tokens.length && scan.tokens[i].line === line; i = i + 1) {
    const t = scan.tokens[i];
    if (!(t.type === 'punct' && ['{', '}', '(', ')', '[', ']', ';', ','].includes(t.value))) {
      return t.start;
    }
  }
  return first.token.start;
}

/**
 * The files that import a module's binding, with the local name each gives
 * it. Only relative imports among the tree's JavaScript are read.
 * @param {Map<string, import('./scan-js.js').JsScan>} scans every JS file of the head, by path
 * @param {string} file
 * @param {string} name
 * @returns {Array<{ file: string, local: string }>}
 */
function importersOf(scans, file, name) {
  /** @type {Array<{ file: string, local: string }>} */
  const out = [];
  for (const [path, scan] of scans) {
    if (path === file) {
      continue;
    }
    for (const statement of scan.statements) {
      if (statement.kind !== 'import') {
        continue;
      }
      const text = scan.text.slice(statement.start, statement.end);
      const from = /from\s+['"]([^'"]+)['"]/.exec(text);
      if (!from || !from[1].startsWith('.')) {
        continue;
      }
      const dir = path.split('/').slice(0, -1);
      for (const part of from[1].split('/')) {
        if (part === '..') {
          dir.pop();
        } else if (part !== '.') {
          dir.push(part);
        }
      }
      if (dir.join('/') !== file) {
        continue;
      }
      const braces = /\{([^}]*)\}/.exec(text);
      if (!braces) {
        continue;
      }
      for (const item of braces[1].split(',')) {
        const parts = item.trim().split(/\s+as\s+/);
        if (parts[0] === name) {
          out.push({ file: path, local: (parts[1] || parts[0]).trim() });
        }
      }
    }
  }
  return out;
}

/**
 * The reach probes of a top-level anchor: the body of every function that
 * names one of its identifiers in its file, and, for a name the module
 * exports, in the files that import it.
 * @param {Map<string, import('./scan-js.js').JsScan>} scans
 * @param {string} file
 * @param {string[]} identifiers
 * @param {boolean} exported
 * @returns {JsProbe[]}
 */
function namingProbes(scans, file, identifiers, exported) {
  /** @type {JsProbe[]} */
  const probes = [];
  const scan = scans.get(file);
  if (!scan) {
    return probes;
  }
  for (const fn of scan.functions) {
    if (identifiers.some((id) => fn.names.has(id))) {
      probes.push({ file, offset: fn.probe });
    }
  }
  for (const id of identifiers) {
    const exportsIt = exported || scan.statements.some((s) => s.kind === 'export' && s.declares.includes(id));
    if (!exportsIt) {
      continue;
    }
    for (const importer of importersOf(scans, file, id)) {
      const other = /** @type {import('./scan-js.js').JsScan} */ (scans.get(importer.file));
      for (const fn of other.functions) {
        if (fn.names.has(importer.local)) {
          probes.push({ file: importer.file, offset: fn.probe });
        }
      }
    }
  }
  return probes;
}

/**
 * Whether a text names an identifier as a whole token.
 * @param {{ tokens: Array<{ type: string, value: string }> }} scan
 * @param {string} name
 */
function names(scan, name) {
  return scan.tokens.some((t) => t.type === 'ident' && t.value === name);
}

/**
 * A fresh anchor with every field at its empty value.
 * @param {AnchorKind} kind
 * @param {string} file
 * @param {string} name
 * @returns {Anchor}
 */
function anchor(kind, file, name) {
  return {
    id: '', kind, file, name, lines: [], side: 'head', approximate: false, observable: 'unknown', why: '',
    changed: [], executable: [], noExecutableChange: false, runsAtLoad: false, removed: false, identifiers: [],
    probes: [], lineProbes: [], lawEntries: [], lawLines: [], verb: null, anyIntent: false, hazard: null, module: null,
  };
}

/**
 * The JS anchors of one changed file.
 * @param {string} file
 * @param {string | null} baseText
 * @param {string} headText
 * @param {Map<string, import('./scan-js.js').JsScan>} scans the head's JS, by path
 * @returns {Anchor[]}
 */
function jsAnchors(file, baseText, headText, scans) {
  const head = /** @type {import('./scan-js.js').JsScan} */ (scans.get(file));
  const base = baseText === null ? null : scanJs(baseText);
  const hunks = diffLines(splitLines(baseText || ''), splitLines(headText));
  /** @type {Map<string, Anchor>} */
  const byKey = new Map();
  /** @type {Anchor[]} */
  const out = [];
  for (const hunk of hunks) {
    for (let l = hunk.head[0] + 1; l <= hunk.head[1]; l = l + 1) {
      const f = jsFunctionOf(head, l);
      if (f >= 0) {
        const fn = head.functions[f];
        const key = 'fn ' + f;
        let a = byKey.get(key);
        if (!a) {
          a = anchor('js', file, fn.qualified);
          a.probes = [{ file, offset: fn.probe }];
          a.module = file;
          const mark = observability(head, f, file);
          a.observable = mark.mark;
          a.why = mark.why;
          byKey.set(key, a);
          out.push(a);
        }
        a.changed.push(l);
        if (head.executable.has(l)) {
          a.executable.push(l);
          a.lineProbes.push({ line: l, probe: { file, offset: lineProbe(head, l) } });
        }
        continue;
      }
      // A top-level line: the statement around it, or none (a comment or a
      // blank between statements).
      const offset = lineFirst(head.text, head.lineStarts, l);
      const statement = head.statements.findIndex((s) => s.start <= offset && offset < s.end && s.line <= l && l <= s.endLine);
      const key = statement >= 0 ? 'top ' + statement : 'line ' + l;
      let a = byKey.get(key);
      if (!a) {
        const s = statement >= 0 ? head.statements[statement] : null;
        const identifiers = s ? s.declares : [];
        a = anchor('top-level', file, s ? (identifiers.length > 0 ? identifiers.join(', ') : '(no identifier) line ' + s.line) : '(no identifier) line ' + l);
        a.approximate = true;
        a.identifiers = identifiers;
        a.module = file;
        a.runsAtLoad = !s || s.kind === 'import' || s.kind === 'export' || identifiers.length === 0;
        a.probes = namingProbes(scans, file, identifiers, Boolean(s && s.kind === 'export'));
        const marks = a.probes.map((p) => {
          const scan = /** @type {import('./scan-js.js').JsScan} */ (scans.get(p.file));
          return observability(scan, scan.functions.findIndex((fn) => fn.probe === p.offset), p.file).mark;
        });
        a.observable = marks.includes('observable') ? 'observable' : marks.length > 0 && marks.every((m) => m === 'not observable') ? 'not observable' : 'unknown';
        a.why = a.probes.length > 0 ? 'the functions that name ' + identifiers.join(', ') : 'no function names it';
        byKey.set(key, a);
        out.push(a);
      }
      a.changed.push(l);
      if (head.executable.has(l)) {
        a.executable.push(l);
      }
    }
    if (hunk.head[0] === hunk.head[1]) {
      // A deletion: the point it left is the end of the head's line before it.
      const h = hunk.head[0];
      const point = deletionPoint(head, h);
      const a = anchor('deletion', file, 'deleted ' + (hunk.base[0] + 1) + '-' + hunk.base[1] + ' of the base');
      a.side = 'base';
      a.approximate = true;
      a.module = file;
      a.lines = [[hunk.base[0] + 1, hunk.base[1]]];
      const f = innermost(head.functions, point);
      if (f >= 0) {
        a.name = head.functions[f].qualified + ' (' + a.name + ')';
        a.probes = [{ file, offset: point }];
        const mark = observability(head, f, file);
        a.observable = mark.mark;
        a.why = mark.why;
      } else if (base) {
        // A deleted top-level line takes the identifiers it declared.
        const from = base.lineStarts[hunk.base[0]];
        const to = hunk.base[1] < base.lineStarts.length ? base.lineStarts[hunk.base[1]] : base.text.length;
        const declared = Array.from(new Set(base.statements.filter((s) => s.start < to && s.end > from).flatMap((s) => s.declares)));
        a.identifiers = declared;
        const still = declared.filter((id) => names(head, id));
        if (declared.length > 0 && still.length === 0) {
          a.removed = true;
          a.why = 'removed; reach not measurable';
        } else if (declared.length > 0) {
          a.probes = namingProbes(scans, file, still, false);
          a.why = 'the functions that name ' + still.join(', ');
        } else {
          a.runsAtLoad = true;
          a.why = 'a deleted top-level line with no identifier';
        }
      }
      out.push(a);
    }
  }
  for (const a of out) {
    if (a.kind !== 'deletion') {
      a.lines = ranges(a.changed);
      a.noExecutableChange = a.executable.length === 0;
    }
    a.id = a.kind + ':' + a.file + ':' + (a.kind === 'deletion' ? a.lines[0].join('-') + ':' + a.name : a.name + ':' + a.lines[0][0]);
  }
  return out;
}

/**
 * The law's anchors of one changed file. The coverage build's mapping says
 * later which of their lines are executable (pin 3); here a line is marked by
 * the scan.
 * @param {string} file
 * @param {string | null} baseText
 * @param {string} headText
 * @param {Map<string, import('./scan-rust.js').RustScan>} rust the head's law, by path
 * @returns {Anchor[]}
 */
function lawAnchors(file, baseText, headText, rust) {
  const head = /** @type {import('./scan-rust.js').RustScan} */ (rust.get(file));
  const base = baseText === null ? null : scanRust(baseText);
  const hunks = diffLines(splitLines(baseText || ''), splitLines(headText));
  /** @type {Map<string, Anchor>} */
  const byKey = new Map();
  /** @type {Anchor[]} */
  const out = [];
  /**
   * The entry point of each fn that names one of the identifiers, in this
   * file, and in the law's other files when the item is public.
   * @param {string[]} identifiers
   * @param {boolean} pub
   */
  const naming = (identifiers, pub) => {
    /** @type {LawPoint[]} */
    const points = [];
    for (const [path, scan] of rust) {
      if (path !== file && !pub) {
        continue;
      }
      for (const fn of scan.functions) {
        if (identifiers.some((id) => fn.names.has(id))) {
          points.push({ file: path, line: fn.line, column: fn.start - scan.lineStarts[fn.line - 1] + 1 });
        }
      }
    }
    return points;
  };
  for (const hunk of hunks) {
    for (let l = hunk.head[0] + 1; l <= hunk.head[1]; l = l + 1) {
      const first = firstTokenOn(head, l);
      const offset = first ? first.token.start : lineFirst(head.text, head.lineStarts, l);
      let f = innermostFn(head.functions, offset);
      if (f < 0) {
        // A comment or an attribute before a fn is the fn's.
        const comment = !first || (first.token.type === 'punct' && first.token.value === '#');
        if (comment) {
          const next = head.functions.filter((fn) => fn.start > offset).sort((a, b) => a.start - b.start)[0];
          const between = next ? head.tokens.filter((t) => t.start > offset && t.start < next.start && !(t.line === l)) : [];
          if (next && between.every((t) => t.type === 'punct' || t.type === 'ident' || t.type === 'string') && next.line - l <= 8
            && !head.items.some((item) => item.start > offset && item.start < next.start && item.kind !== 'impl' && item.kind !== 'mod' && item.kind !== 'trait')) {
            f = head.functions.indexOf(next);
          }
        }
      }
      if (f >= 0) {
        const fn = head.functions[f];
        const key = 'fn ' + f;
        let a = byKey.get(key);
        if (!a) {
          a = anchor('law', file, fn.qualified);
          a.lawEntries = [{ file, line: fn.line, column: fn.start - head.lineStarts[fn.line - 1] + 1 }];
          a.observable = fn.qualified.startsWith('tests::') ? 'not observable' : 'unknown';
          a.why = fn.qualified.startsWith('tests::') ? 'a native test, which the law\'s binary does not hold' : 'the law: the rule does not follow what a Rust function writes';
          byKey.set(key, a);
          out.push(a);
        }
        a.changed.push(l);
        a.lawLines.push({ file, line: l });
        if (head.bodyLines.has(l)) {
          a.executable.push(l);
        }
        continue;
      }
      const item = head.items.find((it) => it.start <= offset && offset < it.end && it.kind !== 'impl' && it.kind !== 'mod' && it.kind !== 'trait')
        || head.items.filter((it) => it.start > offset && it.kind !== 'impl' && it.kind !== 'mod' && it.kind !== 'trait').sort((a, b) => a.start - b.start)[0];
      const key = item ? 'item ' + head.items.indexOf(item) : 'line ' + l;
      let a = byKey.get(key);
      if (!a) {
        const identifiers = item ? item.names : [];
        a = anchor('law-top-level', file, identifiers.length > 0 ? identifiers.join(', ') : '(no identifier) line ' + l);
        a.approximate = true;
        a.identifiers = identifiers;
        a.lawEntries = naming(identifiers, Boolean(item && item.public));
        a.why = a.lawEntries.length > 0 ? 'the functions that name ' + identifiers.join(', ') : 'no function names it';
        a.observable = 'unknown';
        byKey.set(key, a);
        out.push(a);
      }
      a.changed.push(l);
      a.lawLines.push({ file, line: l });
      if (item && (item.kind === 'const' || item.kind === 'static') && head.tokens.some((t) => t.line === l && t.type !== 'punct')) {
        a.executable.push(l);
      }
    }
    if (hunk.head[0] === hunk.head[1]) {
      const h = hunk.head[0];
      const point = deletionPoint(head, h);
      const pointLine = lineOf(head.lineStarts, point);
      const a = anchor('law-deletion', file, 'deleted ' + (hunk.base[0] + 1) + '-' + hunk.base[1] + ' of the base');
      a.side = 'base';
      a.approximate = true;
      a.lines = [[hunk.base[0] + 1, hunk.base[1]]];
      const f = innermostFn(head.functions, point);
      if (f >= 0) {
        a.name = head.functions[f].qualified + ' (' + a.name + ')';
        a.lawEntries = [{ file, line: pointLine, column: point - head.lineStarts[pointLine - 1] + 1, block: innermostBlock(head, point) }];
        a.why = 'the innermost coverage region at the point';
      } else if (base) {
        const from = base.lineStarts[hunk.base[0]];
        const to = hunk.base[1] < base.lineStarts.length ? base.lineStarts[hunk.base[1]] : base.text.length;
        // The items it declared, and the functions that began in it: a whole
        // fn deleted takes its name, as a deleted JS function does.
        const declared = Array.from(new Set(base.items.filter((it) => it.start < to && it.end > from && it.kind !== 'impl' && it.kind !== 'mod').flatMap((it) => it.names)
          .concat(base.functions.filter((fn) => fn.start >= from && fn.start < to).map((fn) => fn.name))));
        a.identifiers = declared;
        const still = declared.filter((id) => names(head, id));
        if (declared.length > 0 && still.length === 0) {
          a.removed = true;
          a.why = 'removed; reach not measurable';
        } else {
          a.lawEntries = naming(still, true);
          a.why = still.length > 0 ? 'the functions that name ' + still.join(', ') : 'a deleted line with no identifier';
        }
      }
      out.push(a);
    }
  }
  for (const a of out) {
    if (a.kind !== 'law-deletion') {
      a.lines = ranges(a.changed);
      a.noExecutableChange = a.executable.length === 0;
    }
    a.id = a.kind + ':' + a.file + ':' + (a.kind === 'law-deletion' ? a.lines[0].join('-') + ':' + a.name : a.name + ':' + a.lines[0][0]);
  }
  return out;
}

/**
 * @param {string | null} text
 */
function parseJson(text) {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The anchors between two trees, and what the bench does not aim at.
 * @param {string} baseTree
 * @param {string} headTree
 * @param {{ baseFiles?: string[], headFiles?: string[] }} [lists]
 * @returns {AnchorSet}
 */
export function readAnchors(baseTree, headTree, lists) {
  const baseFiles = (lists && lists.baseFiles) || listFiles(baseTree);
  const headFiles = (lists && lists.headFiles) || listFiles(headTree);
  const all = Array.from(new Set(baseFiles.concat(headFiles))).sort();
  const inBase = new Set(baseFiles);
  const inHead = new Set(headFiles);
  /** @type {string[]} */
  const changed = [];
  for (const path of all) {
    if (!inBase.has(path) || !inHead.has(path)) {
      changed.push(path);
      continue;
    }
    const a = readFileSync(join(baseTree, path));
    const b = readFileSync(join(headTree, path));
    if (!a.equals(b)) {
      // A line ending alone is not a change.
      if (a.toString('utf8').replace(/\r\n/g, '\n') !== b.toString('utf8').replace(/\r\n/g, '\n')) {
        changed.push(path);
      }
    }
  }
  /** @type {Map<string, import('./scan-js.js').JsScan>} */
  const scans = new Map();
  for (const path of headFiles) {
    if (/^packages\/[^/]+\/.*\.m?js$/.test(path) && !/\.test\.m?js$/.test(path) && !path.startsWith('packages/bench/')) {
      const text = readText(headTree, path);
      if (text !== null) {
        scans.set(path, scanJs(text));
      }
    }
  }
  /** @type {Map<string, import('./scan-rust.js').RustScan>} */
  const rust = new Map();
  for (const path of headFiles) {
    if (/^solver\/src\/.*\.rs$/.test(path)) {
      const text = readText(headTree, path);
      if (text !== null) {
        rust.set(path, scanRust(text));
      }
    }
  }
  /** @type {Anchor[]} */
  const anchors = [];
  /** @type {NotAimed[]} */
  const notAimed = [];
  /** @type {WorldDiffers[]} */
  const worlds = [];
  for (const path of changed) {
    const kind = classify(path);
    const baseText = inBase.has(path) ? readText(baseTree, path) : null;
    const headText = inHead.has(path) ? readText(headTree, path) : null;
    if (kind.kind === 'not-aimed') {
      notAimed.push({ id: 'not-aimed:' + path, file: path, reason: /** @type {string} */ (kind.reason) });
      continue;
    }
    if (kind.kind === 'world') {
      worlds.push({ file: path, reason: 'world differs, not run' + (headText === null ? ': the head has no such file' : baseText === null ? ': the base has no such file' : '') });
      continue;
    }
    if (kind.kind === 'js') {
      if (headText === null) {
        const a = anchor('deletion', path, 'the module is gone');
        a.side = 'base';
        a.removed = true;
        a.approximate = true;
        a.lines = [[1, splitLines(baseText || '').length]];
        a.why = 'removed; reach not measurable';
        a.id = 'deletion:' + path + ':module';
        anchors.push(a);
        continue;
      }
      anchors.push(...jsAnchors(path, baseText, headText, scans));
      continue;
    }
    if (kind.kind === 'law') {
      if (headText === null) {
        const a = anchor('law-deletion', path, 'the file is gone');
        a.side = 'base';
        a.removed = true;
        a.approximate = true;
        a.lines = [[1, splitLines(baseText || '').length]];
        a.why = 'removed; reach not measurable';
        a.id = 'law-deletion:' + path + ':file';
        anchors.push(a);
        continue;
      }
      anchors.push(...lawAnchors(path, baseText, headText, rust));
      continue;
    }
    const hunks = diffLines(splitLines(baseText || ''), splitLines(headText || ''));
    /** @type {number[]} */
    const lines = [];
    for (const hunk of hunks) {
      for (let l = hunk.head[0] + 1; l <= hunk.head[1]; l = l + 1) {
        lines.push(l);
      }
    }
    const headJson = parseJson(headText);
    const baseJson = parseJson(baseText);
    if (kind.kind === 'rule') {
      const verb = (headJson && headJson.verb) || (baseJson && baseJson.verb) || path;
      const a = anchor('rule', path, verb);
      a.verb = verb;
      a.changed = lines;
      a.lines = ranges(lines);
      a.executable = lines.filter((l) => /:\s*[^\s]/.test(splitLines(headText || '')[l - 1] || ''));
      a.noExecutableChange = a.executable.length === 0;
      a.observable = 'observable';
      a.why = 'a rule decides an admission';
      a.id = 'rule:' + path + ':' + verb;
      if (lines.length === 0) {
        a.lines = [[1, 1]];
      }
      anchors.push(a);
      continue;
    }
    if (kind.kind === 'catalog') {
      const headRetired = new Set(headJson && Array.isArray(headJson.retired) ? headJson.retired : []);
      const baseRetired = new Set(baseJson && Array.isArray(baseJson.retired) ? baseJson.retired : []);
      const flipped = Array.from(new Set([...headRetired, ...baseRetired])).filter((verb) => headRetired.has(verb) !== baseRetired.has(verb)).sort();
      const headLines = splitLines(headText || '');
      /** @type {number[]} */
      const general = [];
      /** @type {Map<string, number[]>} */
      const perVerb = new Map();
      for (const l of lines) {
        const text = headLines[l - 1] || '';
        const verb = flipped.find((v) => text.includes('"' + v + '"'));
        if (verb) {
          perVerb.set(verb, (perVerb.get(verb) || []).concat([l]));
        } else {
          general.push(l);
        }
      }
      for (const verb of flipped) {
        const a = anchor('catalog', path, (headRetired.has(verb) ? 'retire ' : 'restore ') + verb);
        a.verb = verb;
        a.changed = perVerb.get(verb) || [];
        a.lines = a.changed.length > 0 ? ranges(a.changed) : ranges(general.length > 0 ? general : [1]);
        a.executable = a.changed.slice();
        a.observable = 'observable';
        a.why = 'the catalog\'s retired verbs decide an admission';
        a.id = 'catalog:' + path + ':' + a.name;
        anchors.push(a);
      }
      const rest = general.filter((l) => !flipped.some((v) => (headLines[l - 1] || '').includes('"' + v + '"')));
      if (rest.length > 0 && (flipped.length === 0 || rest.some((l) => /\S/.test(headLines[l - 1] || '') && !/^\s*[\]\[,{}]*\s*$/.test(headLines[l - 1] || '')))) {
        const a = anchor('catalog', path, 'the intent catalog');
        a.anyIntent = true;
        a.changed = rest;
        a.lines = ranges(rest);
        a.executable = rest.slice();
        a.observable = 'observable';
        a.why = 'every submission looks its verb up in the catalog';
        a.id = 'catalog:' + path + ':catalog';
        anchors.push(a);
      }
      if (flipped.length === 0 && rest.length === 0 && lines.length > 0) {
        const a = anchor('catalog', path, 'the intent catalog');
        a.anyIntent = true;
        a.changed = lines;
        a.lines = ranges(lines);
        a.observable = 'observable';
        a.why = 'every submission looks its verb up in the catalog';
        a.id = 'catalog:' + path + ':catalog';
        anchors.push(a);
      }
      continue;
    }
    if (kind.kind === 'hazard') {
      const id = (headJson && headJson.id) || (baseJson && baseJson.id) || path;
      const a = anchor('hazard', path, id);
      a.hazard = { id, file: path };
      a.changed = lines;
      a.lines = ranges(lines.length > 0 ? lines : [1]);
      a.executable = lines.slice();
      a.observable = 'observable';
      a.why = 'the hazard suite\'s verdicts are compared between the trees (pin 4)';
      a.id = 'hazard:' + path + ':' + id;
      anchors.push(a);
      continue;
    }
    if (kind.kind === 'hazard-index') {
      const headLines = splitLines(headText || '');
      /** @type {Set<string>} */
      const files = new Set();
      for (const l of lines) {
        const m = /"file"\s*:\s*"([^"]+)"|"([^"]+\.json)"/.exec(headLines[l - 1] || '');
        if (m) {
          files.add(m[1] || m[2]);
        }
      }
      if (files.size === 0) {
        const a = anchor('hazard', path, 'the hazard index');
        a.hazard = { id: '*', file: path };
        a.changed = lines;
        a.lines = ranges(lines.length > 0 ? lines : [1]);
        a.observable = 'observable';
        a.why = 'the hazard suite\'s verdicts are compared between the trees (pin 4)';
        a.id = 'hazard:' + path + ':index';
        anchors.push(a);
      }
      for (const scenario of files) {
        const scenarioText = readText(headTree, 'predicates/hazards/' + scenario) || readText(baseTree, 'predicates/hazards/' + scenario);
        const parsed = parseJson(scenarioText);
        const id = parsed && parsed.id ? parsed.id : scenario;
        const a = anchor('hazard', path, id + ' (index)');
        a.hazard = { id, file: 'predicates/hazards/' + scenario };
        a.changed = lines.filter((l) => (headLines[l - 1] || '').includes(scenario));
        a.lines = ranges(a.changed.length > 0 ? a.changed : lines);
        a.executable = a.changed.slice();
        a.observable = 'observable';
        a.why = 'the hazard suite\'s verdicts are compared between the trees (pin 4)';
        a.id = 'hazard:' + path + ':' + scenario;
        anchors.push(a);
      }
    }
  }
  anchors.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.lines[0][0] - b.lines[0][0] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  const seen = new Map();
  for (const a of anchors) {
    const n = seen.get(a.id) || 0;
    seen.set(a.id, n + 1);
    if (n > 0) {
      a.id = a.id + '#' + (n + 1);
    }
  }
  return { anchors, notAimed, worlds, changedFiles: changed };
}

/**
 * The anchors as `bench anchors` prints them: without the probes' offsets.
 * @param {AnchorSet} set
 */
export function anchorsView(set) {
  return {
    anchors: set.anchors.map((a) => ({
      id: a.id, kind: a.kind, file: a.file, name: a.name, lines: a.lines, side: a.side, approximate: a.approximate,
      observable: a.observable, why: a.why, executable: a.executable, noExecutableChange: a.noExecutableChange,
      runsAtLoad: a.runsAtLoad, removed: a.removed, identifiers: a.identifiers, verb: a.verb, hazard: a.hazard,
    })),
    notAimed: set.notAimed.map((n) => ({ id: n.id, reason: n.reason })),
    worlds: set.worlds,
  };
}
