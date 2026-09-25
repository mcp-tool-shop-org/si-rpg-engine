#!/usr/bin/env node
// The corpus, T5 pin 4 (docs/dispatch-t5-replay-corpus.md). What the weekly
// job, .github/workflows/corpus.yml, runs:
//
//   node harness/corpus.mjs [--quanta N] [--points N] [--only text] [--summary file.md] [--title file]
//   node harness/corpus.mjs --write <dir>
//
// It replays, against this build and with the T1 trace hashes:
//   1. every bundle in fixtures/corpus/, with an image restored and rerun: its
//      stored image when this binary recorded it, else a fresh one taken at
//      its save tick (the hashes are the law's; the image is one binary's
//      bytes); the run reports how many stored images were used and skipped;
//   2. every behaviour fixture case and every log in fixtures/ that replays,
//      each as a bundle whose hashes are the fixture's recorded frames, and
//      the four 2D captures, which must still be refused;
//   3. the product scene for 100,000 quanta (--quanta), twice, with the solver
//      imaged at ten ticks (--points) chosen from its events, each just before
//      one, and each image restored into a fresh replay and rerun to the end
//      against the traced run, a difference printed as the T1 block.
// It prints the wall time of each, the replay cost per quantum, the sparse
// image sizes, and the restore times. A failure writes a bundle into
// $SI_RPG_BUNDLES (harness/bundle.mjs) and exits 1; --summary and --title
// write the issue the job opens, titled with the first failing bundle and
// its first-difference block.
//
// `--write <dir>` writes the corpus's own bundles, CORPUS below, from this
// build: the fresh-corpus artifact of every job run. A slice that moves only
// the binary keeps them, since their hashes are the law's and the replay takes
// a fresh image where the stored one is another binary's; a slice that changes
// the law, or fixes a bundled defect, commits the rewritten ones from there.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PAGE, bundleFrom, bundleText, denseImage, readBundle, replayBundle, sparseImage, sparsePages, writeBundle } from '../packages/tick/bundle.js';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { validateScene } from '../packages/tick/scene.js';
import { binaryDigest } from '../solver/dist/solver.mjs';
import { bundleDir, makeBundle, traceDifference } from './bundle.mjs';
import { asleep, contacts } from './events.mjs';
import { replayTo } from './replay-to.mjs';
import { play } from './solver-scene.mjs';
import { playVerbs } from './verbs-scene.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @typedef {import('../packages/tick/bundle.js').Bundle} Bundle
 * @typedef {import('./replay-to.mjs').ReplaySpec} ReplaySpec
 * @typedef {{ name: string, kind: string, status: 'ok' | 'different' | 'refused' | 'error', ms: number, detail: string, block?: string, bundle?: string, image?: 'used' | 'skipped' | 'unreached' }} Result
 */

// ---------------------------------------------------------------------------
// The corpus's own bundles (pin 6). Each replays green today: the engine
// reproduces the defect exactly. They are here so the slice that fixes one is
// measured against the same run, and rewrites the bundle when it does.

/** The product walker: a 0.25 box driven at 0.4 units per second. */
const WALKER = { id: 'walker', x: 10, y: 0.26, z: 0, vx: 0.4, vy: 0, vz: 0, hx: 0.25, hy: 0.25, hz: 0.25 };
/** The product scene's floor. */
const FLOOR = { id: 'floor', minX: 4, maxX: 80, minY: -1, maxY: 0, minZ: -2, maxZ: 6 };
const STRIDE = 0.4 / 64;

/** @type {Array<{ name: string, spec: ReplaySpec, tick: number, note: (spec: ReplaySpec) => string }>} */
export const CORPUS = [
  {
    name: 'walker-stall-flat-ground',
    spec: { seed: 0, steps: 640, driven: ['walker'], world: { bodies: [WALKER], colliders: [FLOOR] } },
    tick: 97,
    note(spec) {
      const found = stalls(spec);
      return 'The product walker, a 0.25 box driven at 0.4 units per second (' + STRIDE + ' a quantum), alone on the product floor: on '
        + found.length + ' of its 640 quanta it moves less than half a stride, first at ' + (found.length > 0 ? found[0].tick + ' (' + found[0].dx.toExponential(2) + ')' : 'none')
        + '. The quanta: ' + found.map((s) => s.tick).join(' ') + '. T4 recorded it in the product scene (harness/outcome.test.js, outcome 4). '
        + 'Saved at 97, before the first, with the solver image; the replay and the rerun from the image cross every stall. '
        + 'It replays green because the engine reproduces the stall exactly; the slice that fixes it changes these hashes and rewrites this bundle.';
    },
  },
  {
    name: 'product-rebuild-261',
    spec: { scene: 'product' },
    tick: 200,
    note() {
      return 'The product scene, 10000 quanta. The solver rebuilds its world when the driven set changes at a verb boundary: at trace tick 201 (the climber\'s lift begins, applyProductAct index 200), '
        + '261 (the lift ends and the climber leaves the driven set, index 260: the rebuild T4 characterized in harness/outcome.test.js, outcome 4) and 401 (the walker picks up the parcel, index 400). '
        + 'Each drops the warm-start impulses and wakes the sleeping bodies (the Rust knowledge base measured 18 to 20 impulses and 5 bodies with a rebuild counter). '
        + 'Saved at 200, before the first, with the solver image, so the replay and the rerun from the image cross all three. '
        + 'It records the verb-boundary rebuilds a later slice will remove; that slice changes these hashes and rewrites this bundle.';
    },
  },
];

/**
 * The quanta on which the walker moves less than half a stride.
 * @param {ReplaySpec} spec
 */
function stalls(spec) {
  const run = replayTo(spec, 0);
  /** @type {Array<{ tick: number, dx: number }>} */
  const found = [];
  let x = /** @type {{ x: number }} */ (run.world.body('walker')).x;
  while (run.advance()) {
    const now = /** @type {{ x: number }} */ (run.world.body('walker')).x;
    if (now - x < STRIDE / 2) {
      found.push({ tick: run.tick, dx: now - x });
    }
    x = now;
  }
  return found;
}

/**
 * Writes the corpus's bundles into `dir`, one file each, by name.
 * @param {string} dir
 */
export function writeCorpus(dir) {
  mkdirSync(dir, { recursive: true });
  /** @type {string[]} */
  const paths = [];
  for (const item of CORPUS) {
    const bundle = makeBundle(item.spec, { name: item.name, tick: item.tick, image: true, note: item.note(item.spec) });
    const path = join(dir, item.name + '.bundle.json');
    writeFileSync(path, bundleText(bundle));
    paths.push(path);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// The fixtures, as bundles.

/**
 * @param {Array<{ tick: number, hash: string }>} frames
 * @param {string} name
 */
function frameHashes(frames, name) {
  return frames.map((frame, i) => {
    if (frame.tick !== i) {
      throw new Error(name + ' frame ' + i + ' is at tick ' + frame.tick);
    }
    return frame.hash;
  });
}

/**
 * Every behaviour fixture case and log in fixtures/ that replays, as a spec
 * and the hashes the fixture recorded.
 * @returns {Array<{ name: string, spec: import('../packages/tick/runs.js').RunSpec, hashes: string[] }>}
 */
export function fixtureRuns() {
  /** @param {string} file */
  const read = (file) => JSON.parse(readFileSync(join(root, 'fixtures', file), 'utf8'));
  /** @type {Array<{ name: string, spec: import('../packages/tick/runs.js').RunSpec, hashes: string[] }>} */
  const runs = [];
  // behavior-solver predates the frame hash; runCorpus compares its behaviour.
  for (const file of ['behavior-rotation', 'behavior-ramp', 'shape-traversal']) {
    for (const spec of read(file + '.json').cases) {
      const name = file + ' ' + spec.name;
      runs.push({ name, spec: { seed: spec.seed, steps: spec.steps, driven: spec.driven, world: spec.world }, hashes: frameHashes(spec.frames, name) });
    }
  }
  const rules = loadIntentRules().rules;
  for (const spec of read('behavior-verbs.json').cases) {
    const name = 'behavior-verbs ' + spec.name;
    const played = playVerbs(spec, rules);
    if (!played.ok || !played.log) {
      throw new Error(name + ' did not play: ' + played.reason);
    }
    runs.push({ name, spec: { seed: spec.seed, world: spec.world, log: played.log }, hashes: frameHashes(spec.frames, name) });
  }
  const minds = read('behavior-minds.json');
  runs.push({ name: 'behavior-minds', spec: { seed: minds.seed, world: minds.world, log: minds.log }, hashes: frameHashes(minds.frames, 'behavior-minds') });
  const threeD = read('behavior-3d.json');
  runs.push({ name: 'behavior-3d (reference law)', spec: { seed: threeD.seed, world: threeD.world, log: threeD.log, law: 'reference', retired: true }, hashes: frameHashes(threeD.frames, 'behavior-3d') });
  return runs;
}

/** The 2D captures in fixtures/, which the tick refuses at load. */
export const CAPTURES = ['behavior-1c.json', 'legacy-play-log.json', 'push-play-log.json', 'first-scene-played.json'];

// ---------------------------------------------------------------------------
// The product scene, long.

/**
 * @param {number} quanta
 * @param {number} count
 * @param {(line: string) => void} say
 */
function productLong(quanta, count, say) {
  const spec = /** @type {ReplaySpec} */ ({ scene: 'product', quanta });
  /** @type {Result[]} */
  const results = [];
  const p0 = performance.now();
  const plain = replayTo(spec, quanta);
  const plainMs = performance.now() - p0;
  say('product scene: ' + quanta + ' quanta replayed in ' + plainMs.toFixed(0) + ' ms, ' + ((plainMs / quanta) * 1000).toFixed(1) + ' us per quantum, hashing only');

  // The traced run, and its events: the quantum each first and last happens.
  const t0 = performance.now();
  const run = replayTo(spec, 0);
  const lines = [run.line()];
  /** @type {Map<string, { first: number, last: number }>} */
  const events = new Map();
  /** @param {string} kind */
  const saw = (kind) => {
    const known = events.get(kind);
    if (known) {
      known.last = run.tick;
    } else {
      events.set(kind, { first: run.tick, last: run.tick });
    }
  };
  let touching = contacts(run.world);
  let sleepers = asleep(run.world);
  let lifted = run.world.lifted.size;
  let carried = run.world.anyCarried();
  let zones = run.world.bodies.map((b) => run.world.zoneIndex(b.id)).join(',');
  let met = (run.world.minds || []).map((m) => m.goals.map((g) => (g.metTick === undefined ? 0 : 1)).join('')).join(',');
  while (run.advance()) {
    lines.push(run.line());
    const w = run.world;
    const nowTouching = contacts(w);
    const nowAsleep = asleep(w);
    if (nowTouching > touching) {
      saw('contact');
    }
    if (nowAsleep.some((id) => !sleepers.includes(id))) {
      saw('sleep');
    }
    if (sleepers.some((id) => !nowAsleep.includes(id))) {
      saw('wake');
    }
    if (w.lifted.size !== lifted) {
      saw('lift');
    }
    if (w.anyCarried() !== carried) {
      saw('carry');
    }
    const nowZones = w.bodies.map((b) => w.zoneIndex(b.id)).join(',');
    if (nowZones !== zones) {
      saw('zone');
    }
    const nowMet = (w.minds || []).map((m) => m.goals.map((g) => (g.metTick === undefined ? 0 : 1)).join('')).join(',');
    if (nowMet !== met) {
      saw('goal');
    }
    touching = nowTouching;
    sleepers = nowAsleep;
    lifted = w.lifted.size;
    carried = w.anyCarried();
    zones = nowZones;
    met = nowMet;
  }
  const tracedMs = performance.now() - t0;
  const end = run.tick;
  const last = lines[lines.length - 1].split(' ')[1];
  say('product scene: traced ' + end + ' quanta in ' + tracedMs.toFixed(0) + ' ms, ' + ((tracedMs / end) * 1000).toFixed(1) + ' us per quantum with the trace and its events');
  if (end !== quanta || last !== plain.hash) {
    const block = 'first difference at tick ' + Math.min(end, quanta) + '\nhash\n  untraced ' + plain.hash + ' at ' + plain.tick + '\n  traced   ' + last + ' at ' + end + '\n';
    results.push({ name: 'product scene ' + quanta, kind: 'product', status: 'different', ms: plainMs + tracedMs, detail: 'two runs disagree', block });
    return results;
  }
  results.push({ name: 'product scene ' + quanta + ', twice', kind: 'product', status: 'ok', ms: plainMs + tracedMs, detail: 'untraced and traced agree at ' + last });

  // Ten points, each just before an event, first the verb boundaries.
  const order = [['lift', 'first'], ['lift', 'last'], ['carry', 'first'], ['contact', 'first'], ['sleep', 'first'], ['wake', 'first'], ['zone', 'first'], ['goal', 'first'], ['contact', 'last'], ['sleep', 'last'], ['wake', 'last'], ['zone', 'last'], ['carry', 'last'], ['goal', 'last']];
  /** @type {Array<{ tick: number, why: string }>} */
  const points = [];
  for (const [kind, which] of order) {
    const e = events.get(kind);
    if (!e || points.length >= count) {
      continue;
    }
    const at = (which === 'first' ? e.first : e.last) - 1;
    if (at >= 0 && at < end && !points.some((p) => p.tick === at)) {
      points.push({ tick: at, why: 'before the ' + which + ' ' + kind + ' at ' + (at + 1) });
    }
  }
  for (let k = 1; points.length < count && k <= count; k = k + 1) {
    const at = Math.floor((k * end) / (count + 1));
    if (!points.some((p) => p.tick === at)) {
      points.push({ tick: at, why: k + '/' + (count + 1) + ' of the run' });
    }
  }
  points.sort((a, b) => a.tick - b.tick);
  say('product scene: restore points ' + points.map((p) => p.tick + ' (' + p.why + ')').join(', '));

  // Images at the points from a third run, stored sparse.
  const imaging = replayTo(spec, 0);
  /** @type {Map<number, import('../packages/tick/bundle.js').SparseImage>} */
  const images = new Map();
  for (;;) {
    if (points.some((p) => p.tick === imaging.tick)) {
      if (imaging.hash !== lines[imaging.tick].split(' ')[1]) {
        results.push({ name: 'product scene imaging run', kind: 'product', status: 'different', ms: 0, detail: 'the third run differs', block: 'first difference at tick ' + imaging.tick + '\nhash\n  traced  ' + lines[imaging.tick].split(' ')[1] + '\n  imaging ' + imaging.hash + '\n' });
        return results;
      }
      const saved = imaging.world.save();
      if (!saved.image) {
        throw new Error('the product scene has no image');
      }
      images.set(imaging.tick, sparseImage(saved.image.bytes, saved.worldId));
    }
    if (imaging.tick >= end || !imaging.advance()) {
      break;
    }
  }

  const binary = binaryDigest();
  for (const point of points) {
    const sparse = images.get(point.tick);
    if (!sparse) {
      throw new Error('no image at ' + point.tick);
    }
    const name = 'product scene ' + quanta + ' image at ' + point.tick;
    const r0 = performance.now();
    const again = replayTo(spec, point.tick);
    const replayMs = performance.now() - r0;
    const d0 = performance.now();
    const bytes = denseImage(sparse);
    const decodeMs = performance.now() - d0;
    const here = again.world.save();
    const s0 = performance.now();
    again.world.restore({ ...here, worldId: sparse.worldId, image: { binary, digest: sparse.digest, bytes } });
    const restoreMs = performance.now() - s0;
    const u0 = performance.now();
    let differs = again.line() !== lines[point.tick];
    /** @type {string[]} */
    const rest = [again.line()];
    while (again.advance()) {
      const line = again.line();
      rest.push(line);
      if (!differs && line !== lines[again.tick]) {
        differs = true;
      }
    }
    const rerunMs = performance.now() - u0;
    const pages = sparsePages(sparse);
    const size = Buffer.byteLength(sparse.data) + Buffer.byteLength(sparse.pages);
    const detail = point.why + '; image ' + pages + ' pages, ' + (pages * PAGE) + ' bytes, ' + size + ' as base64; replay ' + replayMs.toFixed(0) + ' ms, decode ' + decodeMs.toFixed(1) + ' ms, restore ' + restoreMs.toFixed(1) + ' ms, rerun to ' + again.tick + ' ' + rerunMs.toFixed(0) + ' ms';
    if (!differs && again.tick === end) {
      results.push({ name, kind: 'product', status: 'ok', ms: replayMs + decodeMs + restoreMs + rerunMs, detail });
      say('ok    ' + name + ': ' + detail);
      continue;
    }
    const restored = lines.slice(0, point.tick).concat(rest);
    const block = traceDifference(lines, restored);
    const bundle = makeBundle(spec, { name, tick: point.tick, image: { bytes, worldId: sparse.worldId }, hashes: lines.slice(0, point.tick + 1).map((line) => line.split(' ')[1]), failure: { test: 'corpus', block } });
    const path = writeBundle(bundle, bundleDir());
    results.push({ name, kind: 'product', status: 'different', ms: replayMs + decodeMs + restoreMs + rerunMs, detail, block, bundle: path });
    say('FAIL  ' + name + ': ' + detail + '\n' + block + 'bundle: ' + path);
  }
  return results;
}

// ---------------------------------------------------------------------------
// The job.

/**
 * @param {{ quanta: number, points: number, only: string | null, say: (line: string) => void }} options
 * @returns {Result[]}
 */
export function runCorpus(options) {
  const say = options.say;
  /** @param {string} name */
  const wanted = (name) => options.only === null || name.includes(options.only);
  /** @type {Result[]} */
  const results = [];
  /** @param {Result} result */
  const record = (result) => {
    results.push(result);
    say((result.status === 'ok' ? 'ok    ' : 'FAIL  ') + result.name + ' (' + result.kind + '): ' + result.detail + ', ' + result.ms.toFixed(0) + ' ms'
      + (result.block ? '\n' + result.block : '') + (result.bundle ? 'bundle: ' + result.bundle : ''));
  };

  // 1. The corpus.
  const dir = join(root, 'fixtures', 'corpus');
  const corpus = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.bundle.json')).sort() : [];
  say('fixtures/corpus: ' + (corpus.length === 0 ? 'no bundles' : corpus.join(', ')));
  for (const file of corpus) {
    const path = join(dir, file);
    if (!wanted(file)) {
      continue;
    }
    const t0 = performance.now();
    /** @type {Result} */
    let result;
    try {
      const bundle = readBundle(path);
      const got = replayBundle(bundle);
      const ms = performance.now() - t0;
      const skipped = got.skipped ? got.skipped + '; ' : '';
      if (got.status === 'ok') {
        const image = got.image === 'stored'
          ? ', stored image of ' + got.pages + ' pages restored in ' + got.ms.restore.toFixed(1) + ' ms and rerun to ' + got.end + ' identically'
          : got.image === 'fresh'
            ? ', fresh image of ' + got.pages + ' pages taken at ' + got.tick + ', restored in ' + got.ms.restore.toFixed(1) + ' ms and rerun to ' + got.end + ' identically'
            : ', no image';
        result = { name: bundle.name, kind: 'corpus', status: 'ok', ms, detail: skipped + (got.tick + 1) + ' hashes to tick ' + got.tick + image };
      } else if (got.status === 'different') {
        result = { name: bundle.name, kind: 'corpus', status: 'different', ms, detail: skipped + (got.stage === 'hashes' ? 'the replay differs from its hashes' : 'the rerun from the image differs from the replay'), block: got.block };
      } else {
        result = { name: bundle.name, kind: 'corpus', status: 'refused', ms, detail: skipped + got.reason };
      }
      // A stored image is used when its restore is reached on the binary that
      // recorded it, and skipped on any other.
      if (bundle.image !== null) {
        result.image = got.skipped ? 'skipped' : got.status === 'ok' || (got.status === 'different' && got.stage === 'rerun') ? 'used' : 'unreached';
      }
    } catch (error) {
      result = { name: file, kind: 'corpus', status: 'error', ms: performance.now() - t0, detail: /** @type {Error} */ (error).message };
    }
    if (result.status !== 'ok') {
      mkdirSync(bundleDir(), { recursive: true });
      const copy = join(bundleDir(), file);
      copyFileSync(path, copy);
      result.bundle = copy;
    }
    record(result);
  }

  // 2. The fixtures.
  for (const run of fixtureRuns()) {
    if (!wanted(run.name)) {
      continue;
    }
    const t0 = performance.now();
    const bundle = bundleFrom(run.spec, { name: run.name, hashes: run.hashes, note: 'fixtures/: the frames the fixture recorded' });
    /** @type {Result} */
    let result;
    try {
      const got = replayBundle(bundle);
      const ms = performance.now() - t0;
      result = got.status === 'ok'
        ? { name: run.name, kind: 'fixture', status: 'ok', ms, detail: run.hashes.length + ' frames' }
        : got.status === 'different'
          ? { name: run.name, kind: 'fixture', status: 'different', ms, detail: 'replay differs from the recorded frames', block: got.block }
          : { name: run.name, kind: 'fixture', status: 'refused', ms, detail: got.reason };
    } catch (error) {
      result = { name: run.name, kind: 'fixture', status: 'error', ms: performance.now() - t0, detail: /** @type {Error} */ (error).message };
    }
    if (result.status !== 'ok') {
      result.bundle = writeBundle({ ...bundle, failure: { test: 'corpus', block: result.block || result.detail } }, bundleDir());
    }
    record(result);
  }
  // The E2 solver fixture predates the frame hash: its hashes first differ at
  // tick 0 (harness/solver.test.js records that) and its behaviour numbers
  // are what it holds, so those are what the corpus compares.
  const solverFixture = JSON.parse(readFileSync(join(root, 'fixtures', 'behavior-solver.json'), 'utf8'));
  for (const spec of solverFixture.cases) {
    const name = 'behavior-solver ' + spec.name;
    if (!wanted(name)) {
      continue;
    }
    const t0 = performance.now();
    const played = play(spec);
    const ms = performance.now() - t0;
    const same = JSON.stringify(played.behaviour) === JSON.stringify(spec.behaviour);
    const first = played.frames.findIndex((frame, i) => !spec.frames[i] || frame.hash !== spec.frames[i].hash);
    /** @type {Result} */
    const result = same && first === 0
      ? { name, kind: 'fixture', status: 'ok', ms, detail: 'behaviour numbers match; its frames predate the frame hash and first differ at tick 0, as recorded' }
      : { name, kind: 'fixture', status: 'different', ms, detail: same ? 'its frames now first differ at ' + first + ', not 0' : 'the behaviour numbers moved: ' + JSON.stringify(played.behaviour) + ' against ' + JSON.stringify(spec.behaviour) };
    if (result.status !== 'ok') {
      result.bundle = writeBundle(makeBundle({ seed: spec.seed, steps: spec.steps, driven: spec.driven, world: spec.world }, { name, image: true, failure: { test: 'corpus', block: result.detail } }), bundleDir());
    }
    record(result);
  }
  // The four 2D captures stay, and the loader refuses each body record.
  for (const file of CAPTURES) {
    if (!wanted(file)) {
      continue;
    }
    const t0 = performance.now();
    const saved = JSON.parse(readFileSync(join(root, 'fixtures', file), 'utf8'));
    const bodies = saved.world && Array.isArray(saved.world.bodies)
      ? saved.world.bodies
      : saved.scene
        ? saved.scene.bodies
        : (saved.entries || []).map((/** @type {{ proposal: { kind: string } }} */ entry) => entry.proposal).filter((/** @type {{ kind: string }} */ p) => p.kind === 'body');
    // As packages/tick/tick.test.js loads them: the records in a minimal scene.
    const got = validateScene({
      name: file,
      seed: 1,
      bodies,
      colliders: [{ id: 'floor', minX: -1, maxX: 5, minY: -1, maxY: 0, minZ: -1, maxZ: 1 }],
      zones: [],
      goal: { actor: 'walker', zone: { minX: -1, maxX: 1, minY: -1, maxY: 0, minZ: -1, maxZ: 1 } },
    });
    const ms = performance.now() - t0;
    const reason = got.ok ? 'loaded' : got.reason;
    record(bodies.length > 0 && reason === 'a body record is three-dimensional'
      ? { name: file, kind: 'capture', status: 'ok', ms, detail: 'refused at load, as it should be: ' + reason }
      : { name: file, kind: 'capture', status: 'different', ms, detail: 'a 2D capture must be refused for its body records; the loader said: ' + reason });
  }

  // 3. The product scene, long.
  if (options.quanta > 0 && wanted('product scene')) {
    const t0 = performance.now();
    for (const result of productLong(options.quanta, options.points, say)) {
      results.push(result);
    }
    say('product scene: ' + (performance.now() - t0).toFixed(0) + ' ms in all');
  }
  return results;
}

/**
 * How the corpus's stored images were used: restored on the binary that
 * recorded them, skipped on another (a fresh image restored instead), or not
 * reached because the replay differed first.
 * @param {Result[]} results
 */
export function imageCounts(results) {
  const count = (/** @type {string} */ how) => results.filter((r) => r.image === how).length;
  const used = count('used');
  const skipped = count('skipped');
  const unreached = count('unreached');
  return { used, skipped, unreached, line: 'stored images: ' + used + ' used, ' + skipped + ' skipped (recorded on another binary; a fresh image restored instead)' + (unreached > 0 ? ', ' + unreached + ' not reached' : '') };
}

/**
 * The issue's title and body for a failed run.
 * @param {Result[]} results
 */
export function issueText(results) {
  const failed = results.filter((r) => r.status !== 'ok');
  const first = failed[0];
  const blockLines = first && first.block ? first.block.trim().split('\n') : [];
  const title = 'corpus: ' + (first ? first.name + ': ' + (blockLines.length > 0 ? blockLines.slice(0, 2).join(', ') : first.status + ', ' + first.detail) : 'green');
  const body = [
    failed.length + ' of ' + results.length + ' failed. The first failing bundle is **' + (first ? first.name : '-') + '**. ' + imageCounts(results).line + '.',
    '',
    '```',
    first ? (first.block || first.detail).trim() : '',
    '```',
    '',
    '| | name | kind | ms | detail |',
    '|---|---|---|---|---|',
    ...results.map((r) => '| ' + (r.status === 'ok' ? 'ok' : r.status) + ' | ' + r.name + ' | ' + r.kind + ' | ' + r.ms.toFixed(0) + ' | ' + r.detail.replace(/\|/g, '/').replace(/\n/g, ' ') + ' |'),
    '',
    'Host: node ' + process.version + ', binary ' + binaryDigest() + ', runner image ' + (process.env.ImageOS || '-') + ' ' + (process.env.ImageVersion || '-') + '.',
  ].join('\n');
  return { title: title.slice(0, 250), body };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  /** @param {string} flag */
  const value = (flag) => {
    const at = args.indexOf(flag);
    return at >= 0 && args[at + 1] ? args[at + 1] : null;
  };
  if (args.includes('--help')) {
    process.stdout.write('usage: node harness/corpus.mjs [--quanta N] [--points N] [--only text] [--summary file.md] [--title file] | --write <dir>\n');
    process.exit(0);
  }
  const outside = (/** @type {string | null} */ p) => (p === null ? null : resolve(p));
  const writeDir = outside(value('--write'));
  const summary = outside(value('--summary'));
  const titleFile = outside(value('--title'));
  process.chdir(root);
  if (writeDir) {
    for (const path of writeCorpus(writeDir)) {
      process.stdout.write('wrote ' + path + '\n');
    }
    process.exit(0);
  }
  const started = performance.now();
  process.stdout.write('corpus: node ' + process.version + ', binary ' + binaryDigest() + ', pinned ' + readFileSync(join(root, 'fixtures', 'solver.sha256'), 'utf8').trim() + ', runner image ' + (process.env.ImageOS || '-') + ' ' + (process.env.ImageVersion || '-') + '\n');
  const results = runCorpus({
    quanta: Number(value('--quanta') || 100000),
    points: Number(value('--points') || 10),
    only: value('--only'),
    say: (line) => process.stdout.write(line + '\n'),
  });
  const failed = results.filter((r) => r.status !== 'ok');
  process.stdout.write('corpus: ' + imageCounts(results).line + '\n');
  process.stdout.write('corpus: ' + (results.length - failed.length) + ' of ' + results.length + ' ok in ' + ((performance.now() - started) / 1000).toFixed(1) + ' s\n');
  if (failed.length > 0) {
    const issue = issueText(results);
    if (summary) {
      writeFileSync(summary, issue.body + '\n');
    }
    if (titleFile) {
      writeFileSync(titleFile, issue.title + '\n');
    }
    process.stdout.write(issue.title + '\n');
    process.exit(1);
  }
}
