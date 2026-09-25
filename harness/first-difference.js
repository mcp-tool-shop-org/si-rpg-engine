#!/usr/bin/env node
// Two traces in, the first difference out. Prints `identical`, or one block:
// the first differing tick, then the first differing body and field with both
// values as hex and decimal; or `snapshot` with both lengths and digests when
// the bodies agree; or `mind` when a mind differs; or `hash` when only the
// hash differs; or `length` when one trace ends first. Exit 0 identical,
// 1 different, 2 on a malformed or truncated trace. Both files are read a
// chunk at a time, one line from each. The format is in
// packages/tick/trace-line.js; the comparison is packages/tick/difference.js,
// which the replay command shares, so both print the same block.

import { closeSync, openSync, readSync } from 'node:fs';
import { basename } from 'node:path';
import { Malformed, compareTraces } from '../packages/tick/difference.js';
import { guard } from '../packages/tool/guard.js';

guard('first-difference <a.trace> <b.trace>');

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
  const found = compareTraces(ra.next, rb.next, files[0], files[1], left, right);
  process.stdout.write(found);
  process.exit(found === 'identical\n' ? 0 : 1);
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
