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
import { PAGE, bundleFrom, bundleText, denseImage, endedBlock, readBundle, replayBundle, sparseImage, sparsePages, writeBundle } from '../packages/tick/bundle.js';
import { pair } from '../packages/tick/difference.js';
import { loadIntentRules } from '../packages/tick/predicates.js';
import { validateScene } from '../packages/tick/scene.js';
import { binaryDigest } from '../solver/dist/solver.mjs';
import { bundleDir, makeBundle, traceDifference } from './bundle.mjs';
import { asleep, contacts } from './events.mjs';
import { replayTo, withRecords } from './replay-to.mjs';
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
    // Named for the verb-boundary rebuild T5 captured it to record, which F1
    // replaced with the switch in place and recaptured it for.
    name: 'product-rebuild-261',
    spec: { scene: 'product' },
    tick: 200,
    note() {
      return 'The product scene, 10000 quanta. Named for the rebuild T5 captured it to record: before F1 the solver rebuilt its world whenever the driven or carried set changed at a verb boundary, '
        + 'dropping the warm-start impulses and waking the sleeping bodies (the Rust knowledge base measured 18 to 20 impulses and 5 bodies with a rebuild counter). '
        + 'Since F1 it switches bodies in place instead, and nothing it does not switch wakes: at trace tick 201 (the climber\'s lift begins, applyProductAct index 200, and it becomes driven), '
        + '261 (the lift ends, index 260, and it is dynamic again with its record velocity: the switch T4 characterized as a rebuild in harness/outcome.test.js, outcome 4) and 401 (the walker picks up the parcel, index 400, which leaves the world). '
        + 'Saved at 200, before the first, with the solver image, so the replay and the rerun from the image cross all three switches.';
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
 * @typedef {import('./replay-to.mjs').Run} Run
 * @typedef {{ tick: number, message: string }} Thrown
 * @typedef {{ hashes: string[], lines: string[] | null, end: number, thrown: Thrown | null, ms: number }} Chain
 */

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The block for a step of the corpus that failed at `tick`, in the replay
 * command's form for a run that threw (packages/tick/bundle.js runThrew).
 * @param {number} tick
 * @param {string} what
 * @param {unknown} error
 */
function failedAt(tick, what, error) {
  return 'first difference at tick ' + tick + ': ' + what + ': ' + messageOf(error) + '\n';
}

/**
 * A bundle for a corpus failure, and its path (T5 pin 3): the run saved at
 * `tick` with the recorded hashes and an image there, or, when a capture
 * cannot reach that tick (the run throws first), the recorded hashes alone.
 * It does not throw; null when not even that could be written.
 * @param {string} name
 * @param {ReplaySpec} spec
 * @param {number} tick
 * @param {string[]} hashes from the load to `tick`
 * @param {string} block
 * @param {import('../packages/tick/bundle.js').DenseImage} [image] the image that failed, when there is one
 * @returns {string | null}
 */
function failureBundle(name, spec, tick, hashes, block, image) {
  const failure = { test: 'corpus', block };
  try {
    return writeBundle(makeBundle(spec, { name, tick, hashes, image: image || true, failure }), bundleDir());
  } catch (first) {
    try {
      const note = 'the run could not be captured to its save tick (' + messageOf(first) + '); the recorded hashes alone';
      return writeBundle(bundleFrom(withRecords(spec), { name, hashes, failure, note }), bundleDir());
    } catch {
      return null;
    }
  }
}

/**
 * The quantum each kind of event first and last happens in a run: new
 * contacts, bodies falling asleep and waking, the lifted set, the carry, zone
 * changes, and goals met. The restore points are chosen from these.
 */
function eventWatch() {
  /** @type {Map<string, { first: number, last: number }>} */
  const events = new Map();
  /** @param {Run} run */
  const state = (run) => {
    const w = run.world;
    return {
      touching: contacts(w),
      sleepers: asleep(w),
      lifted: w.lifted.size,
      carried: w.anyCarried(),
      zones: w.bodies.map((b) => w.zoneIndex(b.id)).join(','),
      met: (w.minds || []).map((m) => m.goals.map((g) => (g.metTick === undefined ? 0 : 1)).join('')).join(','),
    };
  };
  /** @type {ReturnType<typeof state> | null} */
  let was = null;
  return {
    events,
    /** @param {Run} run */
    see(run) {
      const now = state(run);
      if (was) {
        const before = was;
        /** @param {string} kind */
        const saw = (kind) => {
          const known = events.get(kind);
          if (known) {
            known.last = run.tick;
          } else {
            events.set(kind, { first: run.tick, last: run.tick });
          }
        };
        if (now.touching > before.touching) {
          saw('contact');
        }
        if (now.sleepers.some((id) => !before.sleepers.includes(id))) {
          saw('sleep');
        }
        if (before.sleepers.some((id) => !now.sleepers.includes(id))) {
          saw('wake');
        }
        if (now.lifted !== before.lifted) {
          saw('lift');
        }
        if (now.carried !== before.carried) {
          saw('carry');
        }
        if (now.zones !== before.zones) {
          saw('zone');
        }
        if (now.met !== before.met) {
          saw('goal');
        }
      }
      was = now;
    },
  };
}

/**
 * One run of the spec from its load to `quanta`: its hash at every quantum,
 * its trace lines when asked, and where it stopped. A throw is caught with
 * the tick it was producing, so a law that throws partway is a corpus
 * failure with a bundle, not a crash of the job. `plant` nudges the walker
 * after the frame at that tick; the tests use it to plant a run that parts
 * from another.
 * @param {ReplaySpec} spec
 * @param {number} quanta
 * @param {{ lines?: boolean, watch?: ReturnType<typeof eventWatch>, plant?: number }} how
 * @returns {Chain}
 */
function chain(spec, quanta, how) {
  const t0 = performance.now();
  /** @type {string[]} */
  const hashes = [];
  /** @type {string[] | null} */
  const lines = how.lines ? [] : null;
  /** @type {Run} */
  let run;
  /** @param {Run} r */
  const keep = (r) => {
    hashes.push(r.hash);
    if (lines) {
      lines.push(r.line());
    }
    if (how.watch) {
      how.watch.see(r);
    }
  };
  try {
    run = replayTo(spec, 0);
    keep(run);
  } catch (error) {
    return { hashes, lines, end: -1, thrown: { tick: 0, message: messageOf(error) }, ms: performance.now() - t0 };
  }
  while (run.tick < quanta) {
    const before = run.tick;
    if (how.plant === before) {
      const walker = run.world.body('walker');
      if (walker) {
        walker.vx = walker.vx + 1e-3;
      }
    }
    try {
      if (!run.advance()) {
        break;
      }
      keep(run);
    } catch (error) {
      return { hashes, lines, end: before, thrown: { tick: before + 1, message: messageOf(error) }, ms: performance.now() - t0 };
    }
  }
  return { hashes, lines, end: run.tick, thrown: null, ms: performance.now() - t0 };
}

/**
 * Where two runs of one spec part, or where both stop short of `quanta`, as
 * a tick and a block; null when both ran to `quanta` with the same hashes.
 * @param {Chain} untraced
 * @param {Chain} traced
 * @param {number} quanta
 * @returns {{ tick: number, block: string } | null}
 */
function parting(untraced, traced, quanta) {
  const count = Math.max(untraced.hashes.length, traced.hashes.length);
  for (let t = 0; t < count; t = t + 1) {
    const a = untraced.hashes[t];
    const b = traced.hashes[t];
    if (a === b) {
      continue;
    }
    if (a !== undefined && b !== undefined) {
      return { tick: t, block: 'first difference at tick ' + t + '\nhash\n' + pair('untraced', 'traced', a, b) };
    }
    const [label, stopped] = a === undefined ? ['untraced', untraced] : ['traced', traced];
    if (stopped.thrown && stopped.thrown.tick === t) {
      return { tick: t, block: 'first difference at tick ' + t + ': the ' + label + ' run threw: ' + stopped.thrown.message + '\n' };
    }
    return { tick: t, block: 'first difference at tick ' + t + '\nlength\n' + pair('untraced', 'traced', a === undefined ? 'ends after ' + t + ' lines' : 'continues', b === undefined ? 'ends after ' + t + ' lines' : 'continues') };
  }
  if (untraced.thrown) {
    return { tick: untraced.thrown.tick, block: failedAt(untraced.thrown.tick, 'the run threw', untraced.thrown.message) };
  }
  if (untraced.end !== quanta) {
    // Both stopped at the same frame, short of `quanta`, and neither threw.
    // The difference is the next frame, which neither made: the bundle is
    // saved there, one past the run's last frame, so its replay ends where
    // they did and prints this same block (issue #66).
    const tick = untraced.end + 1;
    return { tick, block: endedBlock(tick) };
  }
  return null;
}

/**
 * The hashes a failure bundle records to `tick`: the run's own, then, for a
 * frame the run did not make, `missing`: NAN, the trace's mark for a step that
 * threw, or `-`, no frame, where the run had stopped.
 * @param {string[]} hashes
 * @param {number} tick
 * @param {'NAN' | '-'} missing
 */
function hashesTo(hashes, tick, missing) {
  const out = hashes.slice(0, tick + 1);
  while (out.length < tick + 1) {
    out.push(missing);
  }
  return out;
}

/**
 * @param {number} quanta
 * @param {number} count
 * @param {(line: string) => void} say
 * @param {number} [plantSplit] the tests plant a traced run that parts from the untraced one after this tick
 * @param {number} [plantStop] the tests plant a product scene whose own length is this, so both runs stop there, short of `quanta`
 */
function productLong(quanta, count, say, plantSplit, plantStop) {
  const spec = /** @type {ReplaySpec} */ ({ scene: 'product', quanta: typeof plantStop === 'number' ? plantStop : quanta });
  /** @type {Result[]} */
  const results = [];
  /**
   * A failure of the long run, with its bundle.
   * @param {string} name
   * @param {number} tick
   * @param {string[]} hashes
   * @param {string} block
   * @param {string} detail
   * @param {number} ms
   * @param {import('../packages/tick/bundle.js').DenseImage} [image]
   */
  const fail = (name, tick, hashes, block, detail, ms, image) => {
    const path = failureBundle(name, spec, tick, hashes, block, image);
    /** @type {Result} */
    const result = { name, kind: 'product', status: 'different', ms, detail: detail + (path ? '' : '; no bundle could be written'), block };
    if (path) {
      result.bundle = path;
    }
    results.push(result);
    say('FAIL  ' + name + ': ' + result.detail + '\n' + block + (path ? 'bundle: ' + path : ''));
    return results;
  };

  // Twice from the load: hashing only, and traced with its events.
  const untraced = chain(spec, quanta, {});
  say('product scene: ' + untraced.end + ' quanta replayed in ' + untraced.ms.toFixed(0) + ' ms, ' + ((untraced.ms / Math.max(1, untraced.end)) * 1000).toFixed(1) + ' us per quantum, hashing only');
  const watch = eventWatch();
  const traced = chain(spec, quanta, { lines: true, watch, plant: plantSplit });
  const lines = /** @type {string[]} */ (traced.lines);
  say('product scene: traced ' + traced.end + ' quanta in ' + traced.ms.toFixed(0) + ' ms, ' + ((traced.ms / Math.max(1, traced.end)) * 1000).toFixed(1) + ' us per quantum with the trace and its events');
  const split = parting(untraced, traced, quanta);
  if (split) {
    const missing = untraced.thrown && untraced.thrown.tick === split.tick ? 'NAN' : '-';
    return fail('product scene ' + quanta, split.tick, hashesTo(untraced.hashes, split.tick, missing), split.block, 'the untraced and traced runs part, or stop short of ' + quanta, untraced.ms + traced.ms);
  }
  const end = traced.end;
  const last = traced.hashes[end];
  results.push({ name: 'product scene ' + quanta + ', twice', kind: 'product', status: 'ok', ms: untraced.ms + traced.ms, detail: 'untraced and traced agree at ' + last });

  // Ten points, each just before an event, first the verb boundaries.
  const order = [['lift', 'first'], ['lift', 'last'], ['carry', 'first'], ['contact', 'first'], ['sleep', 'first'], ['wake', 'first'], ['zone', 'first'], ['goal', 'first'], ['contact', 'last'], ['sleep', 'last'], ['wake', 'last'], ['zone', 'last'], ['carry', 'last'], ['goal', 'last']];
  /** @type {Array<{ tick: number, why: string }>} */
  const points = [];
  for (const [kind, which] of order) {
    const e = watch.events.get(kind);
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
  if (points.length === 0) {
    return results;
  }

  // Images at the points from a third run, stored sparse; the third run is
  // held to the traced hashes at every quantum up to the last point.
  const i0 = performance.now();
  const lastPoint = points[points.length - 1].tick;
  /** @type {Map<number, import('../packages/tick/bundle.js').SparseImage>} */
  const images = new Map();
  /** @type {Run} */
  let imaging;
  try {
    imaging = replayTo(spec, 0);
  } catch (error) {
    return fail('product scene imaging run', 0, traced.hashes.slice(0, 1), failedAt(0, 'the run threw', error), 'the third run threw at its load', performance.now() - i0);
  }
  for (;;) {
    const t = imaging.tick;
    const want = traced.hashes[t];
    if (imaging.hash !== want) {
      return fail('product scene imaging run', t, traced.hashes.slice(0, t + 1), 'first difference at tick ' + t + '\nhash\n' + pair('traced', 'imaging', want, imaging.hash), 'the third run differs from the traced run', performance.now() - i0);
    }
    if (points.some((p) => p.tick === t)) {
      try {
        const saved = imaging.world.save();
        if (!saved.image) {
          throw new Error('the product scene has no image');
        }
        images.set(t, sparseImage(saved.image.bytes, saved.worldId));
      } catch (error) {
        return fail('product scene imaging run', t, traced.hashes.slice(0, t + 1), failedAt(t, 'the image was refused', error), 'the third run could not be imaged', performance.now() - i0);
      }
    }
    if (t >= lastPoint) {
      break;
    }
    try {
      if (!imaging.advance()) {
        return fail('product scene imaging run', t, traced.hashes.slice(0, t + 1), 'first difference at tick ' + (t + 1) + '\nlength\n' + pair('traced', 'imaging', 'continues', 'ends after ' + (t + 1) + ' lines'), 'the third run ends early', performance.now() - i0);
      }
    } catch (error) {
      return fail('product scene imaging run', t + 1, hashesTo(traced.hashes, t + 1, 'NAN'), failedAt(t + 1, 'the run threw', error), 'the third run threw', performance.now() - i0);
    }
  }

  const binary = binaryDigest();
  for (const point of points) {
    const name = 'product scene ' + quanta + ' image at ' + point.tick;
    const sparse = /** @type {import('../packages/tick/bundle.js').SparseImage} */ (images.get(point.tick));
    const pointHashes = traced.hashes.slice(0, point.tick + 1);
    const ms = { replay: 0, decode: 0, restore: 0, rerun: 0 };
    /** @type {Uint8Array | null} */
    let bytes = null;
    /** @type {string[]} */
    const rest = [];
    let differs = false;
    // What a throw is, and at which tick, as the restore goes on.
    let what = 'the run threw';
    let at = 0;
    /** @type {Run | null} */
    let again = null;
    try {
      const r0 = performance.now();
      again = replayTo(spec, 0);
      while (again.tick < point.tick) {
        at = again.tick + 1;
        if (!again.advance()) {
          throw new Error('the run ends at ' + again.tick + ', before ' + point.tick);
        }
      }
      ms.replay = performance.now() - r0;
      what = 'the image was refused';
      at = point.tick;
      const d0 = performance.now();
      bytes = denseImage(sparse);
      ms.decode = performance.now() - d0;
      const here = again.world.save();
      const s0 = performance.now();
      again.world.restore({ ...here, worldId: sparse.worldId, image: { binary, digest: sparse.digest, bytes } });
      ms.restore = performance.now() - s0;
      what = 'the run threw';
      const u0 = performance.now();
      differs = again.line() !== lines[point.tick];
      rest.push(again.line());
      for (;;) {
        at = again.tick + 1;
        if (!again.advance()) {
          break;
        }
        const line = again.line();
        rest.push(line);
        if (!differs && line !== lines[again.tick]) {
          differs = true;
        }
      }
      ms.rerun = performance.now() - u0;
    } catch (error) {
      const image = bytes ? { bytes, worldId: sparse.worldId } : undefined;
      fail(name, point.tick, pointHashes, failedAt(at, what, error), point.why + '; the restore did not finish', ms.replay + ms.decode + ms.restore + ms.rerun, image);
      continue;
    }
    const rerunTo = again ? again.tick : 0;
    const pages = sparsePages(sparse);
    const size = Buffer.byteLength(sparse.data) + Buffer.byteLength(sparse.pages);
    const detail = point.why + '; image ' + pages + ' pages, ' + (pages * PAGE) + ' bytes, ' + size + ' as base64; replay ' + ms.replay.toFixed(0) + ' ms, decode ' + ms.decode.toFixed(1) + ' ms, restore ' + ms.restore.toFixed(1) + ' ms, rerun to ' + rerunTo + ' ' + ms.rerun.toFixed(0) + ' ms';
    const total = ms.replay + ms.decode + ms.restore + ms.rerun;
    if (!differs && rerunTo === end) {
      results.push({ name, kind: 'product', status: 'ok', ms: total, detail });
      say('ok    ' + name + ': ' + detail);
      continue;
    }
    const restored = lines.slice(0, point.tick).concat(rest);
    fail(name, point.tick, pointHashes, traceDifference(lines, restored), detail, total, bytes ? { bytes, worldId: sparse.worldId } : undefined);
  }
  return results;
}

// ---------------------------------------------------------------------------
// The job.

/**
 * @param {{ quanta: number, points: number, only: string | null, say: (line: string) => void, plantSplit?: number, plantStop?: number }} options plantSplit: the tests plant a traced product run that parts from the untraced one after this tick; plantStop: a product scene whose own length is this, so both runs stop short of quanta
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
    for (const result of productLong(options.quanta, options.points, say, options.plantSplit, options.plantStop)) {
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
