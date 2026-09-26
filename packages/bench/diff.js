// The line diff the bench reads a change with (T7b pin 1). Two texts are
// split into lines, a line's trailing carriage return dropped so a checkout's
// line endings never read as a change, and compared by Myers' O(ND) algorithm
// (Myers 1986, "An O(ND) Difference Algorithm and Its Variations") over the
// part between their common prefix and suffix. A hunk is a run of lines that
// differ: its base and head ranges, each [start, end) in 0-based line
// indices. A hunk with an empty head range is a deletion, one with an empty
// base range an insertion, and one with both a replacement. When the part
// that differs is too large for the trace the algorithm keeps, it is one
// replacement hunk, which names every line in it as changed: coarser, never
// wrong about which lines changed.
//
// No imports: the orchestrator and the tests both read it.

/** The most cells of trace the diff keeps before it calls the middle one hunk. */
const TRACE_CAP = 4000000;

/**
 * A text's lines, each without its line ending. A final line ending does not
 * start another line.
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (text === '') {
    return [];
  }
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * @typedef {{ base: [number, number], head: [number, number] }} Hunk
 */

/**
 * The hunks between two lists of lines, in order.
 * @param {ReadonlyArray<string>} a the base's lines
 * @param {ReadonlyArray<string>} b the head's lines
 * @returns {Hunk[]}
 */
export function diffLines(a, b) {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) {
    lo = lo + 1;
  }
  let hiA = a.length;
  let hiB = b.length;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) {
    hiA = hiA - 1;
    hiB = hiB - 1;
  }
  if (lo === hiA && lo === hiB) {
    return [];
  }
  const n = hiA - lo;
  const m = hiB - lo;
  if (n === 0 || m === 0 || (n + m) * (n + m) > TRACE_CAP) {
    return [{ base: [lo, hiA], head: [lo, hiB] }];
  }
  const edits = myers(a, b, lo, hiA, lo, hiB);
  return hunksOf(edits, lo, lo);
}

/**
 * Myers' greedy forward algorithm with its trace kept, then backtracked into
 * the list of edit steps: 'e' for a line both keep, 'd' for a base line
 * deleted, 'i' for a head line inserted.
 * @param {ReadonlyArray<string>} a
 * @param {ReadonlyArray<string>} b
 * @param {number} a0
 * @param {number} a1
 * @param {number} b0
 * @param {number} b1
 * @returns {string[]}
 */
function myers(a, b, a0, a1, b0, b1) {
  const n = a1 - a0;
  const m = b1 - b0;
  const max = n + m;
  const offset = max;
  let v = new Int32Array(2 * max + 2);
  /** @type {Int32Array[]} */
  const trace = [];
  let found = -1;
  for (let d = 0; d <= max; d = d + 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k = k + 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
        x = x + 1;
        y = y + 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) {
      break;
    }
  }
  /** @type {string[]} */
  const steps = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d = d - 1) {
    const prev = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = prev[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      steps.push('e');
      x = x - 1;
      y = y - 1;
    }
    if (x === prevX) {
      steps.push('i');
      y = y - 1;
    } else {
      steps.push('d');
      x = x - 1;
    }
  }
  while (x > 0 && y > 0) {
    steps.push('e');
    x = x - 1;
    y = y - 1;
  }
  return steps.reverse();
}

/**
 * Runs of deletions and insertions between kept lines, as hunks.
 * @param {string[]} steps
 * @param {number} a0
 * @param {number} b0
 * @returns {Hunk[]}
 */
function hunksOf(steps, a0, b0) {
  /** @type {Hunk[]} */
  const hunks = [];
  let ia = a0;
  let ib = b0;
  let i = 0;
  while (i < steps.length) {
    if (steps[i] === 'e') {
      ia = ia + 1;
      ib = ib + 1;
      i = i + 1;
      continue;
    }
    const sa = ia;
    const sb = ib;
    while (i < steps.length && steps[i] !== 'e') {
      if (steps[i] === 'd') {
        ia = ia + 1;
      } else {
        ib = ib + 1;
      }
      i = i + 1;
    }
    hunks.push({ base: [sa, ia], head: [sb, ib] });
  }
  return hunks;
}
