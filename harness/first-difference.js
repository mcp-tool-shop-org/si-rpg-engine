#!/usr/bin/env node
// Two traces in, the first difference out. Prints `identical`, or one block:
// the first differing tick, then the first differing body and field with both
// values as hex and decimal; or `snapshot` with both lengths and digests when
// the bodies agree; or `mind` when a mind differs; or `hash` when only the
// hash differs; or `length` when one trace ends first. Exit 0 identical,
// 1 different, 2 on a malformed or truncated trace. Both files are read a
// chunk at a time, one line from each. The format is in harness/trace-line.mjs.

import { closeSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import { guard } from '../packages/tool/guard.js';

guard('first-difference <a.trace> <b.trace>');

const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'qx', 'qy', 'qz', 'qw', 'wx', 'wy', 'wz'];
const HEX16 = /^[0-9a-f]{16}$/;

class Malformed extends Error {}

/**
 * @param {string} path
 */
function lineReader(path) {
  const fd = openSync(path, 'r');
  const chunk = Buffer.alloc(1 << 16);
  let text = '';
  let done = false;
  return {
    /** @returns {string | null} a line without its ending, or null at the end */
    next() {
      for (;;) {
        const at = text.indexOf('\n');
        if (at >= 0) {
          const line = text.slice(0, at);
          text = text.slice(at + 1);
          return line.endsWith('\r') ? line.slice(0, -1) : line;
        }
        if (done) {
          if (text.length === 0) {
            return null;
          }
          const line = text;
          text = '';
          return line.endsWith('\r') ? line.slice(0, -1) : line;
        }
        const n = readSync(fd, chunk, 0, chunk.length, null);
        if (n === 0) {
          done = true;
          closeSync(fd);
        } else {
          text = text + chunk.toString('latin1', 0, n);
        }
      }
    },
  };
}

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
function parse(name, text, expect) {
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
 * @param {string} left
 * @param {string} right
 * @param {string} a
 * @param {string} b
 */
function pair(left, right, a, b) {
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
function describe(a, b, left, right, tick) {
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

const files = process.argv.slice(2).filter((arg) => arg !== '--debug');
if (files.length !== 2) {
  process.stderr.write('usage: first-difference <a.trace> <b.trace>\n');
  process.exit(2);
}
const left = basename(files[0]);
const right = basename(files[1]) === left ? files[1] : basename(files[1]);

try {
  const ra = lineReader(files[0]);
  const rb = lineReader(files[1]);
  for (let tick = 0; ; tick = tick + 1) {
    const ta = ra.next();
    const tb = rb.next();
    const a = parse(files[0], ta, tick);
    const b = parse(files[1], tb, tick);
    if (ta === tb && a.end) {
      break;
    }
    if (ta !== tb) {
      const block = describe(a, b, left, right, tick);
      if (block !== null) {
        process.stdout.write(block);
        process.exit(1);
      }
    }
    if (a.end || b.end) {
      break;
    }
  }
  process.stdout.write('identical\n');
  process.exit(0);
} catch (error) {
  if (error instanceof Malformed) {
    process.stderr.write('malformed: ' + error.message + '\n');
    process.exit(2);
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    process.stderr.write('malformed: ' + String(/** @type {Error} */ (/** @type {unknown} */ (error)).message) + '\n');
    process.exit(2);
  }
  throw error;
}
