// The law's reach (T7b pin 3): the coverage build's counters mapped to lines
// through llvm-profdata and llvm-cov export, from the llvm-tools component of
// the pinned toolchain, as the knowledge base's answer on law coverage
// measured them.
//
// The counters live in the module's linear memory, in the data segment the
// linker names __llvm_prf_cnts; each function's record in __llvm_prf_data
// names its counters, and __llvm_prf_names holds the functions' names. The
// bench reads all three from the .wasm once per build, and writes a copy of
// the module with the names in a custom section, where llvm-cov looks for
// them. Per window it writes llvm-profdata's text format for the functions
// whose counters are not all zero (a function with no record reads as zero,
// which is what its counters say), merges it, and exports the lines of the
// files it asks about. The export's segments give each line's count by
// llvm-cov's own rule (lineStats below), and each function's entry region its
// count.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

/**
 * @typedef {{ addr: number, size: number, at: number }} Segment
 * @typedef {{ nameRef: bigint, hash: bigint, first: number, count: number, name: string }} Record
 * @typedef {{
 *   wasm: string, named: string, dir: string,
 *   counters: { addr: number, size: number },
 *   records: Record[], digest: string
 * }} CoverageInfo
 * @typedef {Array<[number, number, number, boolean, boolean, boolean]>} Segments
 */

/**
 * @param {Uint8Array} bytes
 * @param {{ at: number }} p
 */
function uleb(bytes, p) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    b = bytes[p.at];
    p.at = p.at + 1;
    result = result + (b & 0x7f) * 2 ** shift;
    shift = shift + 7;
  } while (b & 0x80);
  return result;
}

/**
 * @param {Uint8Array} bytes
 * @param {{ at: number }} p
 */
function sleb32(bytes, p) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    b = bytes[p.at];
    p.at = p.at + 1;
    result = result | ((b & 0x7f) << shift);
    shift = shift + 7;
  } while (b & 0x80);
  if (shift < 32 && (b & 0x40)) {
    result = result | (-1 << shift);
  }
  return result;
}

/**
 * The data segments of a module that the name section names: their memory
 * address, size, and offset in the file.
 * @param {Uint8Array} bytes
 * @returns {Map<string, Segment>}
 */
export function namedSegments(bytes) {
  const p = { at: 8 };
  /** @type {Array<{ id: number, start: number, end: number, name: string | null }>} */
  const sections = [];
  while (p.at < bytes.length) {
    const id = bytes[p.at];
    p.at = p.at + 1;
    const size = uleb(bytes, p);
    const start = p.at;
    let name = null;
    if (id === 0) {
      const n = uleb(bytes, p);
      name = new TextDecoder().decode(bytes.subarray(p.at, p.at + n));
      p.at = p.at + n;
    }
    sections.push({ id, start: p.at, end: start + size, name });
    p.at = start + size;
  }
  const data = sections.find((s) => s.id === 11);
  const names = sections.find((s) => s.name === 'name');
  if (!data || !names) {
    throw new Error('the module has no data section or no name section');
  }
  p.at = data.start;
  const count = uleb(bytes, p);
  /** @type {Array<{ addr: number, size: number, at: number }>} */
  const segments = [];
  for (let i = 0; i < count; i = i + 1) {
    const flag = uleb(bytes, p);
    let addr = -1;
    if (flag === 0 || flag === 2) {
      if (flag === 2) {
        uleb(bytes, p);
      }
      const op = bytes[p.at];
      p.at = p.at + 1;
      if (op !== 0x41) {
        throw new Error('a data segment\'s offset is not an i32.const');
      }
      addr = sleb32(bytes, p);
      p.at = p.at + 1;
    }
    const size = uleb(bytes, p);
    segments.push({ addr, size, at: p.at });
    p.at = p.at + size;
  }
  /** @type {Map<string, Segment>} */
  const out = new Map();
  p.at = names.start;
  while (p.at < names.end) {
    const sub = bytes[p.at];
    p.at = p.at + 1;
    const size = uleb(bytes, p);
    const start = p.at;
    if (sub === 9) {
      const n = uleb(bytes, p);
      for (let i = 0; i < n; i = i + 1) {
        const index = uleb(bytes, p);
        const len = uleb(bytes, p);
        const name = new TextDecoder().decode(bytes.subarray(p.at, p.at + len));
        p.at = p.at + len;
        if (segments[index]) {
          out.set(name, segments[index]);
        }
      }
    }
    p.at = start + size;
  }
  return out;
}

/**
 * @param {number} n
 */
function ulebBytes(n) {
  /** @type {number[]} */
  const out = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v = Math.floor(v / 128);
    if (v !== 0) {
      b = b | 0x80;
    }
    out.push(b);
  } while (v !== 0);
  return Buffer.from(out);
}

/**
 * Reads a coverage build once: where its counters are, each function's
 * record and name, and a copy of the module with the names where llvm-cov
 * reads them.
 * @param {string} wasm
 * @param {string} dir a directory of the bench's own for the copy and the profiles
 * @returns {CoverageInfo}
 */
export function coverageInfo(wasm, dir) {
  const bytes = new Uint8Array(readFileSync(wasm));
  const segments = namedSegments(bytes);
  const cnts = segments.get('__llvm_prf_cnts');
  const data = segments.get('__llvm_prf_data');
  const names = segments.get('__llvm_prf_names');
  if (!cnts || !data || !names) {
    throw new Error('the coverage build has no __llvm_prf_cnts, __llvm_prf_data, or __llvm_prf_names segment');
  }
  const blob = bytes.subarray(names.at, names.at + names.size);
  /** @type {Map<bigint, string>} */
  const byRef = new Map();
  const p = { at: 0 };
  while (p.at < blob.length) {
    const plain = uleb(blob, p);
    const packed = uleb(blob, p);
    if (plain === 0 && packed === 0) {
      break;
    }
    const text = packed === 0 ? Buffer.from(blob.subarray(p.at, p.at + plain)) : inflateSync(Buffer.from(blob.subarray(p.at, p.at + packed)));
    p.at = p.at + (packed === 0 ? plain : packed);
    for (const name of text.toString('latin1').split('\x01')) {
      byRef.set(createHash('md5').update(Buffer.from(name, 'latin1')).digest().readBigUInt64LE(0), name);
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + data.at, data.size);
  /** @type {Record[]} */
  const records = [];
  for (let o = 0; o + 48 <= data.size; o = o + 48) {
    const nameRef = view.getBigUint64(o, true);
    const hash = view.getBigUint64(o + 8, true);
    const relative = view.getInt32(o + 16, true);
    const count = view.getUint32(o + 32, true);
    const name = byRef.get(nameRef);
    if (name === undefined) {
      throw new Error('a function record names no function: its NameRef is ' + nameRef.toString(16));
    }
    const address = data.addr + o + relative;
    records.push({ nameRef, hash, first: (address - cnts.addr) / 8, count, name });
  }
  mkdirSync(dir, { recursive: true });
  const named = join(dir, 'named.wasm');
  const title = Buffer.from('__llvm_prf_names');
  const payload = Buffer.concat([ulebBytes(title.length), title, Buffer.from(blob)]);
  writeFileSync(named, Buffer.concat([Buffer.from(bytes), Buffer.from([0]), ulebBytes(payload.length), payload]));
  return { wasm, named, dir, counters: { addr: cnts.addr, size: cnts.size }, records, digest: createHash('sha256').update(bytes).digest('hex') };
}

/**
 * llvm-profdata's text profile of a window's counters: every function whose
 * counters are not all zero.
 * @param {CoverageInfo} info
 * @param {{ index: Uint32Array, value: Float64Array }} counters
 */
export function profileText(info, counters) {
  /** @type {Map<number, number>} */
  const values = new Map();
  for (let i = 0; i < counters.index.length; i = i + 1) {
    values.set(counters.index[i], counters.value[i]);
  }
  /** @type {string[]} */
  const parts = [];
  for (const record of info.records) {
    let any = false;
    for (let c = 0; c < record.count; c = c + 1) {
      if (values.has(record.first + c)) {
        any = true;
        break;
      }
    }
    if (!any) {
      continue;
    }
    /** @type {number[]} */
    const list = [];
    for (let c = 0; c < record.count; c = c + 1) {
      list.push(values.get(record.first + c) || 0);
    }
    parts.push(record.name + '\n# Func Hash:\n' + record.hash + '\n# Num Counters:\n' + record.count + '\n# Counter Values:\n' + list.join('\n') + '\n');
  }
  return parts.join('\n');
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string }>}
 */
function run(command, args) {
  return new Promise((done) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    /** @type {Buffer[]} */
    const out = [];
    let err = '';
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => {
      err = err + chunk.toString();
    });
    child.on('close', (status) => done({ status, stdout: Buffer.concat(out).toString('utf8'), stderr: err }));
  });
}

/** How many mappings run at once. */
const POOL = Math.max(2, Math.min(12, cpus().length - 2));
let active = 0;
/** @type {Array<() => void>} */
const queued = [];
let serial = 0;

/**
 * A window's counters mapped to the segments of the files asked about.
 * @param {CoverageInfo} info
 * @param {{ profdata: string, cov: string }} tools
 * @param {{ index: Uint32Array, value: Float64Array }} counters
 * @param {string[]} sources absolute paths of the files to export
 * @returns {Promise<Map<string, Segments>>} by the path as the export names it
 */
export async function mapWindow(info, tools, counters, sources) {
  if (active >= POOL) {
    await new Promise((go) => queued.push(() => go(undefined)));
  }
  active = active + 1;
  serial = serial + 1;
  const base = join(info.dir, 'window-' + process.pid + '-' + serial);
  try {
    writeFileSync(base + '.proftext', profileText(info, counters));
    const merged = await run(tools.profdata, ['merge', '-o', base + '.profdata', base + '.proftext']);
    if (merged.status !== 0) {
      throw new Error('llvm-profdata merge failed: ' + merged.stderr.trim());
    }
    const exported = await run(tools.cov, ['export', '-instr-profile', base + '.profdata', info.named, '-skip-expansions', '-skip-functions', '-sources', ...sources]);
    if (exported.status !== 0) {
      throw new Error('llvm-cov export failed: ' + exported.stderr.trim());
    }
    const json = JSON.parse(exported.stdout);
    /** @type {Map<string, Segments>} */
    const files = new Map();
    for (const file of json.data[0].files) {
      files.set(normalize(file.filename), file.segments);
    }
    return files;
  } finally {
    rmSync(base + '.proftext', { force: true });
    rmSync(base + '.profdata', { force: true });
    active = active - 1;
    const go = queued.shift();
    if (go) {
      go();
    }
  }
}

/**
 * A path as the bench compares them: forward slashes, lower case on Windows.
 * @param {string} path
 */
export function normalize(path) {
  const p = path.replace(/\\/g, '/');
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * Each line's count by llvm-cov's own rule (LineCoverageStats): a line is
 * mapped when a region with a count starts on it, or one that carries a count
 * wraps into it, and it does not start a skipped region; its count is the
 * wrapping region's, raised to the largest count of a region that starts on
 * it. A line that is not mapped is in no region: no executable change.
 * @param {Segments} segments
 * @returns {Map<number, number>} mapped line to count
 */
export function lineStats(segments) {
  /** @type {Map<number, number>} */
  const out = new Map();
  if (segments.length === 0) {
    return out;
  }
  /** @type {Segments[number] | null} */
  let wrapped = null;
  let i = 0;
  const lastLine = segments[segments.length - 1][0];
  for (let line = segments[0][0]; line <= lastLine; line = line + 1) {
    /** @type {Segments} */
    const onLine = [];
    while (i < segments.length && segments[i][0] === line) {
      onLine.push(segments[i]);
      i = i + 1;
    }
    const starts = onLine.filter((s) => !s[5] && s[3] && s[4]).length;
    const skipped = onLine.length > 0 && !onLine[0][3] && onLine[0][4];
    let mapped = !skipped && ((wrapped !== null && wrapped[3]) || starts > 0);
    if (onLine.some((s) => s[4] && s[3])) {
      mapped = true;
    }
    if (mapped) {
      let count = wrapped !== null ? wrapped[2] : 0;
      for (const s of onLine) {
        if (!s[5] && s[3] && s[4]) {
          count = Math.max(count, s[2]);
        }
      }
      out.set(line, count);
    }
    if (onLine.length > 0) {
      wrapped = onLine[onLine.length - 1];
    }
  }
  return out;
}

/**
 * The count of the region that starts exactly at a position, as a function's
 * entry region does, or of the innermost region there when none starts
 * there; null when the position is in no region with a count.
 * @param {Segments} segments
 * @param {number} line
 * @param {number} column
 */
export function countAt(segments, line, column) {
  /** @type {Segments[number] | null} */
  let found = null;
  for (const s of segments) {
    if (s[0] < line || (s[0] === line && s[1] <= column)) {
      found = s;
    } else {
      break;
    }
  }
  if (!found || !found[3]) {
    return null;
  }
  return found[2];
}
