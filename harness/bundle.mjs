#!/usr/bin/env node
// The bundle, T5 pin 1 (docs/dispatch-t5-replay-corpus.md). One file,
// `<name>.bundle.json`, that reproduces a run in one command:
//
//   bundle   the format, 1
//   name     what it is; note, why it was written
//   commit   the engine's commit; binary, the SHA-256 of the solver binary
//            that wrote it (on Linux, the pinned digest in fixtures/solver.sha256)
//   run      'product' (the product scene's act over `world`, `quanta` long),
//            'play' (a fixture case: `seed`, `steps`, `driven`, `world`), or
//            'log' (a tick replaying the admitted-input `log` from `seed` in
//            `world` under `law`, with `retired` verbs)
//   seed, world, log   the seed, the world file's contents, the admitted inputs
//   tick     the save tick; hashes, the T1 trace hashes from the load (tick 0)
//            to it, one per quantum
//   image    optional: the solver's linear memory at the save tick, sparse.
//            `pages` is a bitmap of its 512 pages of 64 KiB, bit p of byte
//            p >> 3 set when page p is not all zero; `data` those pages in
//            order, base64; `digest` the FNV digest (imageDigest) of the whole
//            32 MiB, so a restore is checked against the image it came from;
//            `worldId` the solver's world id inside it
//   failure  optional: the test that wrote it and its first-difference block
//
// The tick's own state (memory, minds, actions in flight, lifted and carried
// sets, body records) is rebuilt by replay, never stored, so a bundle cannot
// carry a tick that replay would not produce. `replay <bundle>` runs it
// (packages/tick/bin/replay.js); replayBundle below is that command.
//
// As a command, `node harness/bundle.mjs --from-trace <file.trace> [--name n]`
// writes a bundle of the product scene carrying that trace's hashes, so a
// trace from another engine or host replays here to its first differing tick.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { binaryDigest, imageDigest } from '../solver/dist/solver.mjs';
import { PRODUCT_STEPS } from './product-run.mjs';
import { productInit } from './product-scene.mjs';
import { replayTo } from './replay-to.mjs';
import { endLine } from './trace-line.mjs';

export const FORMAT = 1;
export const PAGE = 65536;
export const PAGES = 512;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {import('./replay-to.mjs').ReplaySpec} ReplaySpec
 * @typedef {import('./replay-to.mjs').LogEntry} LogEntry
 * @typedef {import('./replay-to.mjs').Run} Run
 * @typedef {{ worldId: number, digest: string, pages: string, data: string }} SparseImage
 * @typedef {{ test: string, block: string }} Failure
 * @typedef {{
 *   bundle: number, name: string, note: string, commit: string, binary: string,
 *   run: 'product' | 'play' | 'log', seed: number, world: any, log: LogEntry[],
 *   law?: 'product' | 'reference', retired?: boolean, driven?: string[], steps?: number, quanta?: number,
 *   tick: number, hashes: string[], image: SparseImage | null, failure: Failure | null
 * }} Bundle
 * @typedef {{ bytes: Uint8Array, worldId: number }} DenseImage
 */

// ---------------------------------------------------------------------------
// The sparse image.

/**
 * @param {Uint8Array} bytes the whole linear memory, 512 pages
 * @param {number} worldId
 * @returns {SparseImage}
 */
export function sparseImage(bytes, worldId) {
  if (bytes.length !== PAGES * PAGE) {
    throw new Error('an image is ' + PAGES + ' pages of 64 KiB, ' + PAGES * PAGE + ' bytes; this one is ' + bytes.length);
  }
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  const bitmap = new Uint8Array(PAGES / 8);
  /** @type {Uint8Array[]} */
  const kept = [];
  for (let p = 0; p < PAGES; p = p + 1) {
    const from = p * (PAGE / 4);
    const to = from + PAGE / 4;
    let zero = true;
    for (let w = from; w < to; w = w + 1) {
      if (words[w] !== 0) {
        zero = false;
        break;
      }
    }
    if (!zero) {
      bitmap[p >> 3] = bitmap[p >> 3] | (1 << (p & 7));
      kept.push(bytes.subarray(p * PAGE, (p + 1) * PAGE));
    }
  }
  return {
    worldId,
    digest: imageDigest(bytes),
    pages: Buffer.from(bitmap).toString('base64'),
    data: Buffer.concat(kept).toString('base64'),
  };
}

/**
 * The pages the bitmap marks.
 * @param {SparseImage} sparse
 */
export function sparsePages(sparse) {
  const bitmap = Buffer.from(sparse.pages, 'base64');
  let count = 0;
  for (let p = 0; p < PAGES; p = p + 1) {
    if (bitmap[p >> 3] & (1 << (p & 7))) {
      count = count + 1;
    }
  }
  return count;
}

/**
 * The whole 32 MiB back from its sparse form. Throws when the bitmap, the page
 * count, or the digest over the whole image does not match.
 * @param {SparseImage} sparse
 * @returns {Uint8Array}
 */
export function denseImage(sparse) {
  if (!sparse || typeof sparse.pages !== 'string' || typeof sparse.data !== 'string' || typeof sparse.digest !== 'string' || typeof sparse.worldId !== 'number') {
    throw new Error('the image is not a sparse image');
  }
  const bitmap = Buffer.from(sparse.pages, 'base64');
  if (bitmap.length !== PAGES / 8) {
    throw new Error('the page bitmap is ' + bitmap.length + ' bytes, not ' + PAGES / 8);
  }
  const data = Buffer.from(sparse.data, 'base64');
  const count = sparsePages(sparse);
  if (data.length !== count * PAGE) {
    throw new Error('the bitmap marks ' + count + ' pages and the data holds ' + data.length / PAGE);
  }
  const bytes = new Uint8Array(PAGES * PAGE);
  let at = 0;
  for (let p = 0; p < PAGES; p = p + 1) {
    if (bitmap[p >> 3] & (1 << (p & 7))) {
      bytes.set(data.subarray(at, at + PAGE), p * PAGE);
      at = at + PAGE;
    }
  }
  const digest = imageDigest(bytes);
  if (digest !== sparse.digest) {
    throw new Error('the sparse image restores to digest ' + digest + ', not its own ' + sparse.digest);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Specs and bundles.

/**
 * @param {Bundle} bundle
 * @returns {ReplaySpec}
 */
export function specOf(bundle) {
  if (bundle.run === 'product') {
    return { scene: 'product', world: bundle.world, quanta: bundle.quanta };
  }
  if (bundle.run === 'play') {
    return { seed: bundle.seed, steps: /** @type {number} */ (bundle.steps), driven: bundle.driven || [], world: bundle.world };
  }
  return { seed: bundle.seed, world: bundle.world, log: bundle.log, law: bundle.law, retired: bundle.retired };
}

/** @type {string | null} */
let committed = null;

/** The engine's commit: HEAD of this checkout, else $GITHUB_SHA, else unknown. */
function commit() {
  if (committed === null) {
    const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    committed = git.status === 0 && /^[0-9a-f]{40}$/.test(git.stdout.trim()) ? git.stdout.trim() : process.env.GITHUB_SHA || 'unknown';
  }
  return committed;
}

/**
 * Replays the spec from its load to `tick` (the run's end when omitted) and
 * writes down what a bundle holds. `image: true` images the solver there;
 * an image passed in is stored instead (a failing restore's own image);
 * `hashes` replaces the replayed chain with a recorded one (another run's
 * trace), which is how a bundle carries a failure replay can show.
 * @param {ReplaySpec} spec
 * @param {{ name: string, note?: string, tick?: number, image?: boolean | DenseImage, hashes?: string[], failure?: Failure }} options
 * @returns {Bundle}
 */
export function makeBundle(spec, options) {
  const run = replayTo(spec, 0);
  const hashes = [run.hash];
  const until = typeof options.tick === 'number' ? options.tick : Infinity;
  while (run.tick < until) {
    if (!run.advance()) {
      if (until === Infinity) {
        break;
      }
      throw new Error('the run ends at ' + run.tick + ', before the save tick ' + until);
    }
    hashes.push(run.hash);
  }
  const tick = run.tick;
  /** @type {SparseImage | null} */
  let image = null;
  if (options.image && typeof options.image === 'object') {
    image = sparseImage(options.image.bytes, options.image.worldId);
  } else if (options.image && run.world.law === 'product') {
    const saved = run.world.save();
    if (saved.image) {
      image = sparseImage(saved.image.bytes, saved.worldId);
    }
  }
  if (options.hashes && options.hashes.length !== tick + 1) {
    throw new Error('a recorded chain of ' + options.hashes.length + ' hashes is not the ' + (tick + 1) + ' from the load to tick ' + tick);
  }
  return bundleFrom(spec, { name: options.name, note: options.note, hashes: options.hashes || hashes, image, failure: options.failure });
}

/**
 * A bundle of a run whose hashes are already recorded (a fixture's frames),
 * without replaying it; the save tick is the last hash's.
 * @param {ReplaySpec} spec
 * @param {{ name: string, note?: string, hashes: string[], image?: SparseImage | null, failure?: Failure }} fields
 * @returns {Bundle}
 */
export function bundleFrom(spec, fields) {
  /** @type {Bundle} */
  const bundle = {
    bundle: FORMAT,
    name: fields.name,
    note: fields.note || '',
    commit: commit(),
    binary: binaryDigest(),
    run: 'scene' in spec ? 'product' : 'log' in spec ? 'log' : 'play',
    seed: 'seed' in spec ? spec.seed : 0,
    world: 'scene' in spec ? (spec.world || productInit()) : spec.world,
    log: 'log' in spec ? spec.log.slice() : [],
    tick: fields.hashes.length - 1,
    hashes: fields.hashes.slice(),
    image: fields.image || null,
    failure: fields.failure || null,
  };
  if ('scene' in spec) {
    bundle.quanta = typeof spec.quanta === 'number' ? spec.quanta : PRODUCT_STEPS;
  } else if ('log' in spec) {
    bundle.law = spec.law || 'product';
    bundle.retired = Boolean(spec.retired);
  } else {
    bundle.steps = spec.steps;
    bundle.driven = spec.driven.slice();
  }
  return bundle;
}

/**
 * A file-system-safe name.
 * @param {string} name
 */
function slug(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'bundle';
}

/** Where failures write bundles: $SI_RPG_BUNDLES, or a directory under the temporary one. */
export function bundleDir() {
  return process.env.SI_RPG_BUNDLES || join(tmpdir(), 'si-rpg-bundles');
}

/**
 * Writes `<name>.bundle.json` into the directory and returns its path. An
 * existing file of that name is kept and the new one numbered.
 * @param {Bundle} bundle
 * @param {string} [dir]
 */
export function writeBundle(bundle, dir) {
  const into = dir || bundleDir();
  mkdirSync(into, { recursive: true });
  const base = slug(bundle.name);
  let path = join(into, base + '.bundle.json');
  for (let n = 2; existsSync(path); n = n + 1) {
    path = join(into, base + '-' + n + '.bundle.json');
  }
  writeFileSync(path, bundleText(bundle));
  return path;
}

/**
 * The file's text: one field per line, the hashes one per line.
 * @param {Bundle} bundle
 */
export function bundleText(bundle) {
  return JSON.stringify(bundle, null, 1) + '\n';
}

/**
 * @param {unknown} value
 * @returns {value is Bundle}
 */
export function isBundle(value) {
  return !!value && typeof value === 'object' && 'bundle' in value;
}

/**
 * Reads and checks a bundle's shape; throws with the field that is wrong.
 * @param {string} path
 * @returns {Bundle}
 */
export function readBundle(path) {
  const b = JSON.parse(readFileSync(path, 'utf8'));
  /** @param {string} why */
  const bad = (why) => new Error('not a bundle: ' + path + ': ' + why);
  if (!isBundle(b) || b.bundle !== FORMAT) {
    throw bad('format ' + (b && b.bundle) + ', not ' + FORMAT);
  }
  if (typeof b.name !== 'string' || typeof b.binary !== 'string' || typeof b.commit !== 'string') {
    throw bad('name, commit, and binary are strings');
  }
  if (b.run !== 'product' && b.run !== 'play' && b.run !== 'log') {
    throw bad('run is product, play, or log');
  }
  if (!b.world || !Array.isArray(b.world.bodies) || !Array.isArray(b.log)) {
    throw bad('a world with bodies and a log array');
  }
  if (!Number.isInteger(b.tick) || b.tick < 0 || !Array.isArray(b.hashes) || b.hashes.length !== b.tick + 1) {
    throw bad('the hashes run from the load to the save tick, ' + (Number(b.tick) + 1) + ' of them');
  }
  return b;
}

// ---------------------------------------------------------------------------
// Comparing.

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
 * The T1 block for two traces given as lines without their end lines:
 * harness/first-difference.js on `whole.trace` and `restored.trace`, the names
 * harness/restore.test.js gives them, so a failure and its bundle's replay
 * print the same block. `identical\n` when they agree.
 * @param {string[]} whole
 * @param {string[]} restored
 */
export function traceDifference(whole, restored) {
  const dir = mkdtempSync(join(tmpdir(), 'si-rpg-bundle-'));
  const left = join(dir, 'whole.trace');
  const right = join(dir, 'restored.trace');
  writeFileSync(left, whole.concat([endLine(whole.length)]).join('\n') + '\n');
  writeFileSync(right, restored.concat([endLine(restored.length)]).join('\n') + '\n');
  const run = spawnSync(process.execPath, [join(root, 'harness', 'first-difference.js'), left, right], { encoding: 'utf8' });
  if (run.status === 2) {
    throw new Error('first-difference: ' + run.stderr);
  }
  return run.stdout;
}

/**
 * @typedef {{ status: 'ok', tick: number, end: number, restored: boolean, ms: { replay: number, decode: number, restore: number, rerun: number }, pages: number | null }} BundleOk
 * @typedef {{ status: 'different', block: string }} BundleDifferent
 * @typedef {{ status: 'refused', reason: string }} BundleRefused
 * @typedef {BundleOk | BundleDifferent | BundleRefused} BundleResult
 */

/**
 * `replay <bundle>`: refuses a bundle from another binary with both digests
 * named; rebuilds the world, replays to the save tick and compares every
 * hash with the bundle's, printing the first that differs as a T1 block; and
 * with an image, restores it at the save tick into a second replay and
 * requires the rerun from there to trace the same as the first replay run
 * on, or prints the T1 block of where it does not.
 * @param {Bundle} bundle
 * @returns {BundleResult}
 */
export function replayBundle(bundle) {
  const here = binaryDigest();
  if (bundle.binary !== here) {
    return { status: 'refused', reason: 'the bundle is from binary ' + bundle.binary + ' and this binary is ' + here + '; its image and hashes are of those exact bytes' };
  }
  const spec = specOf(bundle);
  const started = performance.now();
  const run = replayTo(spec, 0);
  /** @type {string[]} */
  const lines = [run.line()];
  for (let t = 0; ; t = t + 1) {
    if (run.hash !== bundle.hashes[t]) {
      return { status: 'different', block: 'first difference at tick ' + t + '\nhash\n' + pair('bundle', 'replay', bundle.hashes[t], run.hash) };
    }
    if (t === bundle.tick) {
      break;
    }
    if (!run.advance()) {
      return { status: 'different', block: 'first difference at tick ' + (t + 1) + '\nlength\n' + pair('bundle', 'replay', 'continues', 'ends after ' + (t + 1) + ' lines') };
    }
    lines.push(run.line());
  }
  const replayMs = performance.now() - started;
  if (!bundle.image) {
    return { status: 'ok', tick: bundle.tick, end: bundle.tick, restored: false, ms: { replay: replayMs, decode: 0, restore: 0, rerun: 0 }, pages: null };
  }
  const d0 = performance.now();
  /** @type {Uint8Array} */
  let bytes;
  try {
    bytes = denseImage(bundle.image);
  } catch (error) {
    return { status: 'refused', reason: /** @type {Error} */ (error).message };
  }
  const decodeMs = performance.now() - d0;
  // The replayed run on to its end: the trace the restored rerun must match.
  const whole = lines.slice();
  while (run.advance()) {
    whole.push(run.line());
  }
  const end = run.tick;
  // A second replay to the save tick, the image restored into it. The body
  // records and the lifted and carried sets are the replay's; only the
  // solver's memory comes from the bundle.
  const again = replayTo(spec, bundle.tick);
  const saved = again.world.save();
  const s0 = performance.now();
  try {
    again.world.restore({ ...saved, worldId: bundle.image.worldId, image: { binary: bundle.binary, digest: bundle.image.digest, bytes } });
  } catch (error) {
    return { status: 'refused', reason: /** @type {Error} */ (error).message };
  }
  const restoreMs = performance.now() - s0;
  const r0 = performance.now();
  const restored = lines.slice(0, bundle.tick);
  restored.push(again.line());
  while (again.advance()) {
    restored.push(again.line());
  }
  const rerunMs = performance.now() - r0;
  if (restored.length !== whole.length || restored.some((line, i) => line !== whole[i])) {
    return { status: 'different', block: traceDifference(whole, restored) };
  }
  return { status: 'ok', tick: bundle.tick, end, restored: true, ms: { replay: replayMs, decode: decodeMs, restore: restoreMs, rerun: rerunMs }, pages: sparsePages(bundle.image) };
}

// ---------------------------------------------------------------------------
// Every failure writes one (pin 3).

/** @type {Array<{ spec: ReplaySpec, tick?: number }> | null} */
let recording = null;

/**
 * Called by a test's run as it starts: a run of this spec, to `tick` or its
 * end. Nothing happens outside withBundles.
 * @param {ReplaySpec} spec
 * @param {number} [tick]
 */
export function recordRun(spec, tick) {
  if (recording) {
    recording.push({ spec, tick });
  }
}

const MOST = 16;

/**
 * Writes one bundle per run and reports the paths on stderr, one line each.
 * @param {string} test
 * @param {Array<{ spec: ReplaySpec, tick?: number, image?: boolean | DenseImage, hashes?: string[] }>} runs
 * @param {string} block the failure's first-difference block, or its message
 * @param {string} [dir]
 */
export function bundleFailure(test, runs, block, dir) {
  /** @type {string[]} */
  const paths = [];
  for (let i = 0; i < runs.length && i < MOST; i = i + 1) {
    const item = runs[i];
    try {
      const bundle = makeBundle(item.spec, { name: test + (runs.length > 1 ? ' run ' + (i + 1) : ''), tick: item.tick, image: item.image === undefined ? true : item.image, hashes: item.hashes, failure: { test, block } });
      const path = writeBundle(bundle, dir);
      paths.push(path);
      process.stderr.write('bundle: ' + path + '\n');
    } catch (error) {
      process.stderr.write('no bundle for ' + test + ' run ' + (i + 1) + ': ' + /** @type {Error} */ (error).message + '\n');
    }
  }
  return paths;
}

/**
 * Fails unless the two traces agree: the T1 block, one bundle per run
 * (written as bundleFailure writes them), and each path, in the message.
 * @param {string} test
 * @param {string[]} whole the uninterrupted run's lines, without the end line
 * @param {string[]} restored the restored run's, spliced after the whole run's lines before it
 * @param {Array<{ spec: ReplaySpec, tick?: number, image?: boolean | DenseImage, hashes?: string[] }>} runs
 * @param {string} [dir]
 */
export function expectIdentical(test, whole, restored, runs, dir) {
  const block = traceDifference(whole, restored);
  if (block === 'identical\n') {
    return;
  }
  const paths = bundleFailure(test, runs, block, dir);
  assert.fail(test + '\n' + block + paths.map((path) => 'bundle: ' + path + '\n').join(''));
}

/**
 * A test body that, when it throws, writes a bundle of each run it recorded
 * with recordRun, prints each path, adds them to the error, and rethrows.
 * @param {string} name
 * @param {(t: import('node:test').TestContext) => void | Promise<void>} body
 * @returns {(t: import('node:test').TestContext) => Promise<void>}
 */
export function withBundles(name, body) {
  return async (t) => {
    /** @type {Array<{ spec: ReplaySpec, tick?: number }>} */
    const runs = [];
    const outer = recording;
    recording = runs;
    try {
      await body(t);
    } catch (error) {
      recording = outer;
      const message = error instanceof Error ? error.message : String(error);
      const paths = bundleFailure(name, runs, message);
      for (const path of paths) {
        t.diagnostic('bundle: ' + path);
      }
      if (error instanceof Error && paths.length > 0) {
        error.message = error.message + '\n' + paths.map((path) => 'bundle: ' + path).join('\n');
      }
      throw error;
    } finally {
      recording = outer;
    }
  };
}

// ---------------------------------------------------------------------------
// The command.

/**
 * The product scene's hashes read from a T1 trace.
 * @param {string} text
 */
export function traceHashes(text) {
  /** @type {string[]} */
  const hashes = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '' || line.startsWith('end ')) {
      break;
    }
    const tokens = line.split(' ');
    if (Number(tokens[0]) !== hashes.length) {
      throw new Error('the trace skips from tick ' + (hashes.length - 1) + ' to ' + tokens[0]);
    }
    hashes.push(tokens[1]);
  }
  return hashes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const from = args.indexOf('--from-trace');
  if (from < 0 || !args[from + 1] || args.includes('--help')) {
    process.stdout.write('usage: node harness/bundle.mjs --from-trace <file.trace> [--name <name>]\n');
    process.exit(args.includes('--help') ? 0 : 2);
  }
  const at = args.indexOf('--name');
  const file = resolve(args[from + 1]);
  process.chdir(root);
  const hashes = traceHashes(readFileSync(file, 'utf8'));
  const name = at >= 0 && args[at + 1] ? args[at + 1] : 'product-scene from ' + file.replace(/^.*[\\/]/, '');
  // The chain stops where the trace does; a thrown step ends it early.
  const tick = hashes.length - 1;
  const path = writeBundle(makeBundle({ scene: 'product' }, { name, tick, image: false, hashes, note: 'the product scene with the hashes of ' + file }));
  process.stdout.write(path + '\n');
}
