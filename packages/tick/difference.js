// The first difference between two T1 traces (packages/tick/trace-line.js):
// the first differing tick, then the first differing body and field with both
// values as hex and decimal; or `snapshot` with both lengths and digests when
// the bodies agree; or `mind` when a mind differs; or `hash` when only the
// hash differs; or `length` when one trace ends first. harness/first-difference.js
// is the command over two files; the replay command uses it for a bundle's
// rerun (T5), so both print the same block for the same traces.
//
// No imports: it runs wherever a trace is read.

const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'qx', 'qy', 'qz', 'qw', 'wx', 'wy', 'wz'];
const HEX16 = /^[0-9a-f]{16}$/;

/** A trace that is malformed or truncated. */
export class Malformed extends Error {}

/**
 * @typedef {{ id: string, fields: string[], zone: string, links: string }} TraceBody
 * @typedef {{ body: string, met: string, belief: string }} TraceMind
 * @typedef {{ end: false, tick: number, hash: string, thrown: boolean, bodies: TraceBody[], snap: { len: string, digest: string }, minds: TraceMind[] } | { end: true, lines: number }} TraceLine
 */

/**
 * @param {string} name
 * @param {string | null} text
 * @param {number} expect the tick this line must carry
 * @returns {TraceLine}
 */
export function parse(name, text, expect) {
  /** @param {string} why */
  const bad = (why) => new Malformed(name + ' line ' + (expect + 1) + ': ' + why);
  if (text === null) {
    throw bad('the trace ends without an end line');
  }
  const t = text.split(' ');
  if (t[0] === 'end') {
    if (t.length !== 2 || String(Number(t[1])) !== t[1] || Number(t[1]) !== expect) {
      throw bad('end must count the ' + expect + ' lines before it');
    }
    return { end: true, lines: expect };
  }
  if (String(Number(t[0])) !== t[0] || Number(t[0]) !== expect) {
    throw bad('expected tick ' + expect);
  }
  if (t.length === 2 && t[1] === 'NAN') {
    return { end: false, tick: expect, hash: 'NAN', thrown: true, bodies: [], snap: { len: '-', digest: '-' }, minds: [] };
  }
  if (t.length < 5 || !(HEX16.test(t[1]) || t[1] === 'NAN')) {
    throw bad('expected a hash');
  }
  let i = 2;
  /** @type {TraceBody[]} */
  const bodies = [];
  while (t[i] === 'body') {
    if (i + 17 > t.length) {
      throw bad('a body is cut short');
    }
    const fields = t.slice(i + 2, i + 15);
    if (!fields.every((f) => HEX16.test(f))) {
      throw bad('a field is not sixteen hex digits');
    }
    const zone = t[i + 15];
    if (zone !== '-' && String(Number(zone)) !== zone) {
      throw bad('a zone is not an index');
    }
    bodies.push({ id: t[i + 1], fields, zone, links: t[i + 16] });
    i = i + 17;
  }
  if (t[i] !== 'snap' || i + 3 > t.length) {
    throw bad('expected snap');
  }
  const snap = { len: t[i + 1], digest: t[i + 2] };
  if (!(snap.len === '-' && snap.digest === '-') && !(String(Number(snap.len)) === snap.len && HEX16.test(snap.digest))) {
    throw bad('a snapshot is a length and a digest');
  }
  i = i + 3;
  /** @type {TraceMind[]} */
  const minds = [];
  while (t[i] === 'mind') {
    if (i + 4 > t.length || !/^([01]+|-)$/.test(t[i + 2])) {
      throw bad('a mind is cut short');
    }
    minds.push({ body: t[i + 1], met: t[i + 2], belief: t[i + 3] });
    i = i + 4;
  }
  if (i !== t.length) {
    throw bad('unexpected ' + t[i]);
  }
  return { end: false, tick: expect, hash: t[1], thrown: false, bodies, snap, minds };
}

/**
 * @param {string} h sixteen hex digits, high word first
 */
function decimal(h) {
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, parseInt(h.slice(0, 8), 16));
  view.setUint32(4, parseInt(h.slice(8), 16));
  return String(view.getFloat64(0));
}

/**
 * Two labelled values, one per line, the labels padded to one width.
 * @param {string} left
 * @param {string} right
 * @param {string} a
 * @param {string} b
 */
export function pair(left, right, a, b) {
  const width = Math.max(left.length, right.length);
  return '  ' + left.padEnd(width) + ' ' + a + '\n  ' + right.padEnd(width) + ' ' + b + '\n';
}

/**
 * The block for two parsed lines that differ, or null when they agree.
 * @param {TraceLine} a
 * @param {TraceLine} b
 * @param {string} left
 * @param {string} right
 * @param {number} tick
 */
export function describe(a, b, left, right, tick) {
  const head = 'first difference at tick ' + tick + '\n';
  if (a.end || b.end) {
    if (a.end && b.end) {
      return null;
    }
    return head + 'length\n' + pair(left, right, a.end ? 'ends after ' + a.lines + ' lines' : 'continues', b.end ? 'ends after ' + b.lines + ' lines' : 'continues');
  }
  if (a.thrown || b.thrown) {
    if (a.thrown && b.thrown) {
      return null;
    }
    return head + 'hash\n' + pair(left, right, a.thrown ? 'NAN (the step threw)' : a.hash, b.thrown ? 'NAN (the step threw)' : b.hash);
  }
  const count = Math.max(a.bodies.length, b.bodies.length);
  for (let n = 0; n < count; n = n + 1) {
    const p = a.bodies[n];
    const q = b.bodies[n];
    if (!p || !q || p.id !== q.id) {
      return head + 'body ' + n + ' id\n' + pair(left, right, p ? p.id : '(none)', q ? q.id : '(none)');
    }
    for (let f = 0; f < FIELDS.length; f = f + 1) {
      if (p.fields[f] !== q.fields[f]) {
        return head + 'body ' + p.id + ' field ' + FIELDS[f] + '\n' + pair(left, right, p.fields[f] + ' ' + decimal(p.fields[f]), q.fields[f] + ' ' + decimal(q.fields[f]));
      }
    }
    if (p.zone !== q.zone) {
      return head + 'body ' + p.id + ' field zone\n' + pair(left, right, p.zone, q.zone);
    }
    if (p.links !== q.links) {
      return head + 'body ' + p.id + ' field links\n' + pair(left, right, p.links, q.links);
    }
  }
  if (a.snap.len !== b.snap.len || a.snap.digest !== b.snap.digest) {
    return head + 'snapshot\n' + pair(left, right, a.snap.len + ' bytes ' + a.snap.digest, b.snap.len + ' bytes ' + b.snap.digest);
  }
  const minds = Math.max(a.minds.length, b.minds.length);
  for (let n = 0; n < minds; n = n + 1) {
    const p = a.minds[n];
    const q = b.minds[n];
    if (!p || !q || p.body !== q.body || p.met !== q.met || p.belief !== q.belief) {
      const name = p ? p.body : q ? q.body : String(n);
      return head + 'mind ' + name + '\n' + pair(left, right, p ? 'met ' + p.met + ' belief ' + p.belief : '(none)', q ? 'met ' + q.met + ' belief ' + q.belief : '(none)');
    }
  }
  if (a.hash !== b.hash) {
    return head + 'hash\n' + pair(left, right, a.hash, b.hash);
  }
  return null;
}

/**
 * Two traces read a line at a time, to the first difference. Returns the
 * block, or `identical\n`; throws Malformed, naming nameA or nameB, when a
 * trace is malformed or ends without its end line.
 * @param {() => string | null} nextA the next line without its ending, null at the end
 * @param {() => string | null} nextB
 * @param {string} nameA
 * @param {string} nameB
 * @param {string} left the label a block gives the first trace
 * @param {string} right
 * @returns {string}
 */
export function compareTraces(nextA, nextB, nameA, nameB, left, right) {
  for (let tick = 0; ; tick = tick + 1) {
    const ta = nextA();
    const tb = nextB();
    const a = parse(nameA, ta, tick);
    const b = parse(nameB, tb, tick);
    if (ta === tb && a.end) {
      break;
    }
    if (ta !== tb) {
      const block = describe(a, b, left, right, tick);
      if (block !== null) {
        return block;
      }
    }
    if (a.end || b.end) {
      break;
    }
  }
  return 'identical\n';
}

/**
 * compareTraces over two arrays of lines, each ending with its end line.
 * @param {ReadonlyArray<string>} a
 * @param {ReadonlyArray<string>} b
 * @param {string} left
 * @param {string} right
 */
export function compareLines(a, b, left, right) {
  let i = 0;
  let j = 0;
  const nextA = () => (i < a.length ? a[i++] : null);
  const nextB = () => (j < b.length ? b[j++] : null);
  return compareTraces(nextA, nextB, left, right, left, right);
}
