// The bundle, T5 pins 1 and 2 (docs/dispatch-t5-replay-corpus.md). One file,
// `<name>.bundle.json`, that reproduces a run in one command:
//
//   bundle   the format, 1
//   name     what it is; note, why it was written
//   commit   the engine's commit; binary, the SHA-256 of the solver binary
//            that recorded it (on Linux, the pinned digest in fixtures/solver.sha256)
//   run      'product' (the product scene's act over `world`, `quanta` long),
//            'play' (a fixture case: `seed`, `steps`, `driven`, `world`), or
//            'log' (a tick replaying the admitted-input `log` from `seed` in
//            `world` under `law`, with `retired` verbs); packages/tick/runs.js
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
// carry a tick that replay would not produce.
//
// replayBundle is `replay <bundle>`. The hashes depend on the law, not on the
// binary's bytes, so a bundle from any binary is replayed and every hash
// compared; a law change is a first-difference block. The stored image is
// bytes of one binary, so it is used only on that binary. On another, it is
// skipped with one line, `image skipped: recorded on <digest>, running
// <digest>`, and a fresh image taken at the save tick on this binary is
// restored and rerun instead, so a restore is exercised on every binary.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaryDigest, imageDigest } from '../../solver/dist/solver.mjs';
import { compareLines, pair } from './difference.js';
import { replayTo } from './runs.js';
import { PRODUCT_STEPS } from './sessions.js';
import { endLine } from './trace-line.js';

export const FORMAT = 1;
export const PAGE = 65536;
export const PAGES = 512;
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * @typedef {import('./runs.js').RunSpec} RunSpec
 * @typedef {import('./runs.js').LogEntry} LogEntry
 * @typedef {import('./runs.js').Run} Run
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
 * The indices of the pages that are not all zero.
 * @param {Uint8Array} bytes
 */
export function nonZeroPages(bytes) {
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  /** @type {number[]} */
  const found = [];
  const count = Math.floor(bytes.length / PAGE);
  for (let p = 0; p < count; p = p + 1) {
    const to = (p + 1) * (PAGE / 4);
    for (let w = p * (PAGE / 4); w < to; w = w + 1) {
      if (words[w] !== 0) {
        found.push(p);
        break;
      }
    }
  }
  return found;
}

/**
 * @param {Uint8Array} bytes the whole linear memory, 512 pages
 * @param {number} worldId
 * @returns {SparseImage}
 */
export function sparseImage(bytes, worldId) {
  if (bytes.length !== PAGES * PAGE) {
    throw new Error('an image is ' + PAGES + ' pages of 64 KiB, ' + PAGES * PAGE + ' bytes; this one is ' + bytes.length);
  }
  const bitmap = new Uint8Array(PAGES / 8);
  /** @type {Uint8Array[]} */
  const kept = [];
  for (const p of nonZeroPages(bytes)) {
    bitmap[p >> 3] = bitmap[p >> 3] | (1 << (p & 7));
    kept.push(bytes.subarray(p * PAGE, (p + 1) * PAGE));
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
// Making, writing, and reading.

/**
 * The run a bundle names.
 * @param {Bundle} bundle
 * @returns {RunSpec}
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
 * @param {RunSpec} spec
 * @param {{ name: string, note?: string, tick?: number, image?: boolean | DenseImage, hashes?: string[], failure?: Failure }} options
 * @returns {Bundle}
 */
export function captureBundle(spec, options) {
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
 * @param {RunSpec} spec
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
    world: spec.world,
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
 * The file's text: one field per line, the hashes one per line.
 * @param {Bundle} bundle
 */
export function bundleText(bundle) {
  return JSON.stringify(bundle, null, 1) + '\n';
}

/**
 * A file-system-safe name.
 * @param {string} name
 */
function slug(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'bundle';
}

/**
 * Writes `<name>.bundle.json` into the directory and returns its path. An
 * existing file of that name is kept and the new one numbered.
 * @param {Bundle} bundle
 * @param {string} dir
 */
export function writeBundle(bundle, dir) {
  mkdirSync(dir, { recursive: true });
  const base = slug(bundle.name);
  let path = join(dir, base + '.bundle.json');
  for (let n = 2; existsSync(path); n = n + 1) {
    path = join(dir, base + '-' + n + '.bundle.json');
  }
  writeFileSync(path, bundleText(bundle));
  return path;
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
// Replaying.

/**
 * The T1 block for two traces given as lines without their end lines,
 * labelled `whole.trace` and `restored.trace` as harness/restore.test.js
 * labels them, so a failing restore and its bundle's replay print the same
 * block. `identical\n` when they agree.
 * @param {string[]} whole
 * @param {string[]} restored
 */
export function traceDifference(whole, restored) {
  return compareLines(whole.concat([endLine(whole.length)]), restored.concat([endLine(restored.length)]), 'whole.trace', 'restored.trace');
}

/**
 * The line `replay` prints when it does not use a bundle's stored image.
 * @param {string} recorded the bundle's binary
 * @param {string} running this binary
 */
export function imageSkipped(recorded, running) {
  return 'image skipped: recorded on ' + recorded + ', running ' + running;
}

/**
 * @typedef {{ replay: number, decode: number, image: number, restore: number, rerun: number }} BundleTimes
 * @typedef {{ status: 'ok', skipped: string | null, image: 'stored' | 'fresh' | 'none', tick: number, end: number, pages: number | null, ms: BundleTimes }} BundleOk
 * @typedef {{ status: 'different', stage: 'hashes' | 'rerun', skipped: string | null, block: string }} BundleDifferent
 * @typedef {{ status: 'refused', skipped: string | null, reason: string }} BundleRefused
 * @typedef {BundleOk | BundleDifferent | BundleRefused} BundleResult
 */

/**
 * `replay <bundle>`. Rebuilds the world and replays to the save tick,
 * comparing every hash with the bundle's, and returns the first that differs
 * as a T1 block: that is what a law change looks like, on any binary. With an
 * image, a second replay to the save tick has an image restored into it and
 * must rerun to the end tracing the same as the first replay run on, or the
 * T1 block of where it does not is returned. The image is the stored one when
 * this binary recorded the bundle; otherwise `skipped` says so, and it is a
 * fresh image of the first replay at the save tick. `imageFrom` takes the
 * fresh image at another tick; the tests use it to plant a fresh image that
 * must not rerun the same.
 * @param {Bundle} bundle
 * @param {{ imageFrom?: number }} [options]
 * @returns {BundleResult}
 */
export function replayBundle(bundle, options) {
  const here = binaryDigest();
  const stored = bundle.image !== null && bundle.binary === here;
  const skipped = bundle.image !== null && !stored ? imageSkipped(bundle.binary, here) : null;
  const spec = specOf(bundle);
  /** @type {BundleTimes} */
  const ms = { replay: 0, decode: 0, image: 0, restore: 0, rerun: 0 };
  const t0 = performance.now();
  const run = replayTo(spec, 0);
  /** @type {string[]} */
  const lines = [run.line()];
  for (let t = 0; ; t = t + 1) {
    if (run.hash !== bundle.hashes[t]) {
      return { status: 'different', stage: 'hashes', skipped, block: 'first difference at tick ' + t + '\nhash\n' + pair('bundle', 'replay', bundle.hashes[t], run.hash) };
    }
    if (t === bundle.tick) {
      break;
    }
    if (!run.advance()) {
      return { status: 'different', stage: 'hashes', skipped, block: 'first difference at tick ' + (t + 1) + '\nlength\n' + pair('bundle', 'replay', 'continues', 'ends after ' + (t + 1) + ' lines') };
    }
    lines.push(run.line());
  }
  ms.replay = performance.now() - t0;
  if (bundle.image === null) {
    return { status: 'ok', skipped, image: 'none', tick: bundle.tick, end: bundle.tick, pages: null, ms };
  }

  /** @type {{ worldId: number, image: { binary: string, digest: string, bytes: Uint8Array } } | null} */
  let chosen = null;
  if (stored) {
    const d0 = performance.now();
    try {
      chosen = { worldId: bundle.image.worldId, image: { binary: here, digest: bundle.image.digest, bytes: denseImage(bundle.image) } };
    } catch (error) {
      return { status: 'refused', skipped, reason: /** @type {Error} */ (error).message };
    }
    ms.decode = performance.now() - d0;
  }
  // The first replay on to its end: the trace the restored rerun must match.
  // Without the stored image, it is imaged on the way, at the save tick.
  const freshAt = stored ? -1 : options && typeof options.imageFrom === 'number' ? options.imageFrom : bundle.tick;
  /** @type {ReturnType<Run['world']['save']> | null} */
  let fresh = null;
  if (freshAt === bundle.tick) {
    const i0 = performance.now();
    fresh = run.world.save();
    ms.image = performance.now() - i0;
  }
  const whole = lines.slice();
  while (run.advance()) {
    whole.push(run.line());
    if (run.tick === freshAt) {
      const i0 = performance.now();
      fresh = run.world.save();
      ms.image = performance.now() - i0;
    }
  }
  const end = run.tick;
  if (!stored) {
    if (!fresh || !fresh.image) {
      return { status: 'refused', skipped, reason: 'no fresh image at tick ' + freshAt + ': the run ends at ' + end + ' or has no solver' };
    }
    chosen = { worldId: fresh.worldId, image: fresh.image };
  }
  if (!chosen) {
    return { status: 'refused', skipped, reason: 'no image' };
  }
  // A second replay to the save tick, the image restored into it. The body
  // records and the lifted and carried sets are the replay's; only the
  // solver's memory comes from the image.
  const again = replayTo(spec, bundle.tick);
  const records = again.world.save();
  const s0 = performance.now();
  try {
    again.world.restore({ ...records, worldId: chosen.worldId, image: chosen.image });
  } catch (error) {
    return { status: 'refused', skipped, reason: /** @type {Error} */ (error).message };
  }
  ms.restore = performance.now() - s0;
  const r0 = performance.now();
  const restored = lines.slice(0, bundle.tick);
  restored.push(again.line());
  while (again.advance()) {
    restored.push(again.line());
  }
  ms.rerun = performance.now() - r0;
  if (restored.length !== whole.length || restored.some((line, i) => line !== whole[i])) {
    return { status: 'different', stage: 'rerun', skipped, block: traceDifference(whole, restored) };
  }
  return { status: 'ok', skipped, image: stored ? 'stored' : 'fresh', tick: bundle.tick, end, pages: stored ? sparsePages(bundle.image) : nonZeroPages(chosen.image.bytes).length, ms };
}
