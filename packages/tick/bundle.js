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
//            to it, one per quantum. A failure bundle may be saved one past
//            its run's last frame, which is how it records that the run
//            stopped there: its last hash is `-`, no frame, or `NAN`, the
//            trace's mark for a step that threw, and its replay reports the
//            difference at that tick
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
// restored and rerun instead, so a restore is exercised on every binary. A
// run that throws partway is a difference at that tick, `first difference at
// tick N: the run threw: <message>`. readBundle refuses a bundle that lacks
// what its run kind needs (bundleProblem), naming the field.

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
 * Why a value is not a bundle a replay can run, or null. Each run kind is
 * checked for what its replay reads, so a malformed bundle is refused with the
 * field instead of run into a hang (a play bundle with no `steps` never ends)
 * or a crash. A play or product run's length may be one short of the save
 * tick, no more: a failure bundle is saved one past the frame its run
 * stopped on, and its replay reports the length difference there (issue #66).
 * @param {any} b
 * @returns {string | null}
 */
export function bundleProblem(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    return 'a bundle is an object';
  }
  if (b.bundle !== FORMAT) {
    return 'format ' + b.bundle + ', not ' + FORMAT;
  }
  for (const key of ['name', 'binary', 'commit']) {
    if (typeof b[key] !== 'string') {
      return key + ' is a string';
    }
  }
  if (b.note !== undefined && typeof b.note !== 'string') {
    return 'note is a string';
  }
  if (b.run !== 'product' && b.run !== 'play' && b.run !== 'log') {
    return 'run is product, play, or log';
  }
  if (!b.world || typeof b.world !== 'object' || !Array.isArray(b.world.bodies) || !Array.isArray(b.world.colliders)) {
    return 'the world has bodies and colliders';
  }
  if (!Array.isArray(b.log)) {
    return 'log is an array';
  }
  if (!Number.isInteger(b.tick) || b.tick < 0) {
    return 'the save tick is a whole number';
  }
  if (!Array.isArray(b.hashes) || b.hashes.length !== b.tick + 1 || !b.hashes.every((/** @type {unknown} */ h) => typeof h === 'string')) {
    return 'the hashes run from the load to the save tick, ' + (b.tick + 1) + ' of them';
  }
  if (b.run === 'play') {
    if (!Number.isInteger(b.steps) || b.steps < b.tick - 1) {
      return 'a play bundle has whole-number steps, at least ' + (b.tick - 1) + ', its save tick less one';
    }
    if (!Array.isArray(b.driven) || !b.driven.every((/** @type {unknown} */ id) => typeof id === 'string')) {
      return 'a play bundle has a driven array of body ids';
    }
  }
  if (b.run === 'product' && (!Number.isInteger(b.quanta) || b.quanta < b.tick - 1)) {
    return 'a product bundle has whole-number quanta, at least ' + (b.tick - 1) + ', its save tick less one';
  }
  if (b.run !== 'product' && (typeof b.seed !== 'number' || !Number.isFinite(b.seed))) {
    return 'a ' + b.run + ' bundle has a seed';
  }
  if (b.run === 'log') {
    if (b.law !== undefined && b.law !== 'product' && b.law !== 'reference') {
      return 'a log bundle\'s law is product or reference';
    }
    if (b.retired !== undefined && typeof b.retired !== 'boolean') {
      return 'a log bundle\'s retired is true or false';
    }
    let last = 0;
    for (let i = 0; i < b.log.length; i = i + 1) {
      const entry = b.log[i];
      if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.tick) || entry.tick < last || typeof entry.hash !== 'string' || !entry.proposal || typeof entry.proposal !== 'object') {
        return 'log entry ' + i + ' has a tick no earlier than the entry before, a hash, and a proposal';
      }
      last = entry.tick;
    }
  }
  if (b.image !== null) {
    const image = b.image;
    if (!image || typeof image !== 'object' || typeof image.worldId !== 'number' || typeof image.digest !== 'string' || typeof image.pages !== 'string' || typeof image.data !== 'string') {
      return 'the image is null, or a world id, a digest, a page bitmap, and page data';
    }
  }
  if (b.failure !== null && b.failure !== undefined && (typeof b.failure !== 'object' || typeof b.failure.test !== 'string' || typeof b.failure.block !== 'string')) {
    return 'a failure is a test and a block';
  }
  return null;
}

/**
 * Reads and checks a bundle; throws `not a bundle: <path>: <why>` naming what
 * is wrong. The replay command prints that and exits 2.
 * @param {string} path
 * @returns {Bundle}
 */
export function readBundle(path) {
  /** @type {unknown} */
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error('not a bundle: ' + path + ': ' + /** @type {Error} */ (error).message);
  }
  const why = bundleProblem(value);
  if (why !== null) {
    throw new Error('not a bundle: ' + path + ': ' + why);
  }
  return /** @type {Bundle} */ (value);
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
 * The block for a run that ended before the frame at `tick`, which the bundle
 * has a hash for. The replay prints it; the corpus writes it for two runs that
 * stopped there, so the bundle it saves replays to the same block (#66).
 * @param {number} tick
 */
export function endedBlock(tick) {
  return 'first difference at tick ' + tick + '\nlength\n' + pair('bundle', 'replay', 'continues', 'ends after ' + tick + ' lines');
}

/**
 * The block for a run that threw producing the frame at `tick`: after a law
 * change a step can throw (a NaN it cannot hash) where it used to run, and
 * that is a difference at that tick, not a crash of the replay.
 * @param {number} tick
 * @param {unknown} error
 */
export function runThrew(tick, error) {
  const message = error instanceof Error ? error.message : String(error);
  return 'first difference at tick ' + tick + ': the run threw: ' + message + '\n';
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
 * fresh image of the first replay at the save tick. A run that throws, in
 * either replay or the rerun, is a difference at the tick it threw producing
 * (runThrew), never a crash. `imageFrom` takes the fresh image at another
 * tick; the tests use it to plant a fresh image that must not rerun the same.
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
  /**
   * The run threw producing the frame at `tick`: a difference there, not a crash.
   * @param {'hashes' | 'rerun'} stage
   * @param {number} tick
   * @param {unknown} error
   * @returns {BundleDifferent}
   */
  const threw = (stage, tick, error) => ({ status: 'different', stage, skipped, block: runThrew(tick, error) });
  const t0 = performance.now();
  /** @type {Run} */
  let run;
  /** @type {string[]} */
  const lines = [];
  try {
    run = replayTo(spec, 0);
    lines.push(run.line());
  } catch (error) {
    return threw('hashes', 0, error);
  }
  for (let t = 0; ; t = t + 1) {
    if (run.hash !== bundle.hashes[t]) {
      return { status: 'different', stage: 'hashes', skipped, block: 'first difference at tick ' + t + '\nhash\n' + pair('bundle', 'replay', bundle.hashes[t], run.hash) };
    }
    if (t === bundle.tick) {
      break;
    }
    try {
      if (!run.advance()) {
        return { status: 'different', stage: 'hashes', skipped, block: endedBlock(t + 1) };
      }
      lines.push(run.line());
    } catch (error) {
      return threw('hashes', t + 1, error);
    }
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
  /** @returns {string | null} why the image could not be taken, or null */
  const takeFresh = () => {
    const i0 = performance.now();
    try {
      fresh = run.world.save();
    } catch (error) {
      return /** @type {Error} */ (error).message;
    }
    ms.image = performance.now() - i0;
    return null;
  };
  if (freshAt === bundle.tick) {
    const refused = takeFresh();
    if (refused !== null) {
      return { status: 'refused', skipped, reason: refused };
    }
  }
  const whole = lines.slice();
  for (;;) {
    // The tick before the step: a session may count the quantum it threw on.
    const before = run.tick;
    try {
      if (!run.advance()) {
        break;
      }
      whole.push(run.line());
    } catch (error) {
      return threw('rerun', before + 1, error);
    }
    if (run.tick === freshAt) {
      const refused = takeFresh();
      if (refused !== null) {
        return { status: 'refused', skipped, reason: refused };
      }
    }
  }
  const end = run.tick;
  if (!stored) {
    const taken = /** @type {ReturnType<Run['world']['save']> | null} */ (fresh);
    if (!taken || !taken.image) {
      return { status: 'refused', skipped, reason: 'no fresh image at tick ' + freshAt + ': the run ends at ' + end + ' or has no solver' };
    }
    chosen = { worldId: taken.worldId, image: taken.image };
  }
  if (!chosen) {
    return { status: 'refused', skipped, reason: 'no image' };
  }
  // A second replay to the save tick, the image restored into it. The body
  // records and the lifted and carried sets are the replay's; only the
  // solver's memory comes from the image.
  /** @type {Run} */
  let again;
  try {
    again = replayTo(spec, 0);
  } catch (error) {
    return threw('rerun', 0, error);
  }
  while (again.tick < bundle.tick) {
    const before = again.tick;
    try {
      if (!again.advance()) {
        return { status: 'different', stage: 'rerun', skipped, block: endedBlock(before + 1) };
      }
    } catch (error) {
      return threw('rerun', before + 1, error);
    }
  }
  const s0 = performance.now();
  try {
    const records = again.world.save();
    again.world.restore({ ...records, worldId: chosen.worldId, image: chosen.image });
  } catch (error) {
    return { status: 'refused', skipped, reason: /** @type {Error} */ (error).message };
  }
  ms.restore = performance.now() - s0;
  const r0 = performance.now();
  const restored = lines.slice(0, bundle.tick);
  restored.push(again.line());
  for (;;) {
    const before = again.tick;
    try {
      if (!again.advance()) {
        break;
      }
      restored.push(again.line());
    } catch (error) {
      return threw('rerun', before + 1, error);
    }
  }
  ms.rerun = performance.now() - r0;
  if (restored.length !== whole.length || restored.some((line, i) => line !== whole[i])) {
    return { status: 'different', stage: 'rerun', skipped, block: traceDifference(whole, restored) };
  }
  return { status: 'ok', skipped, image: stored ? 'stored' : 'fresh', tick: bundle.tick, end, pages: stored ? sparsePages(bundle.image) : nonZeroPages(chosen.image.bytes).length, ms };
}
